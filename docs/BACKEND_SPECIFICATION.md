> **Estado Pollar — 2026-09-12:** integración de cuotas implementada para Stellar testnet y HSK 133: intenciones autenticadas, verificación del pago, conciliación SQL idempotente y anclaje HSK con recuperación. Migración aplicada y verificada en Supabase; falta validar una cuota real de testnet. La transferencia libre no liquida cuotas. Las referencias posteriores a Ethereum/Mainnet, webhooks de liquidación o widgets antiguos son diseño histórico. [Contrato vigente y activación paso a paso](POLLAR_INSTALLMENTS.md).

# ESPECIFICACIÓN TÉCNICA DEL BACKEND & ARQUITECTURA POR CAPAS — LIBRETA

**Proyecto:** LIBRETA — Microcrédito Verificable & Portabilidad de Reputación Financiera  
**Hackathon:** ETH Bolivia Buildathon 2026 (Cochabamba)  
**Tracks:** Bolivia Hackathon | HSK Chain Track | Bounties: Pollar & Unlock Protocol  

---

## 1. VISIÓN GENERAL DE LA ARQUITECTURA POR CAPAS

LIBRETA desacopla completamente el almacenamiento de datos privados de la capa de consenso inmutable.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                       CAPA 1: PRESENTACIÓN (PWA)                          │
│   • Modo Cobrador (Offline con IndexedDB)                                 │
│   • Portal Prestatario (Progreso de cuotas & Libreta Passport)            │
│   • Pasarela Pollar (@pollar/react para pagos USDC mainnet)               │
│   • Portal Token-Gated Unlock Protocol (@unlock-protocol/paywall)         │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ REST API / WebSockets
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              CAPA 2: BACKEND GATEWAY & MIDDLEWARE (NODE / TS)             │
│   • Controladores REST y Handlers de Webhook (Pollar)                     │
│   • Motor de Atestación Criptográfica (keccak256 y hashing de recibos)    │
│   • Orquestador Multi-Cadena (Bridge entre Unlock Protocol y HSK Chain)   │
│   • Motor de Cálculo LRI (Libreta Reliability Index determinístico)       │
└───────────────────────┬───────────────────────────┬───────────────────────┘
                        │                           │
          ┌─────────────▼─────────────┐ ┌───────────▼───────────────────────┐
          │   CAPA 3: PERSISTENCIA    │ │ CAPA 4: PROTOCOLOS & SMART CONTR. │
          │   (SUPABASE POSTGRESQL)   │ │                                   │
          ├───────────────────────────┤ ├───────────────────────────────────┤
          │ • Tablas: loans, profiles,│ │ A. HSK Chain:                     │
          │   installments, sync_queue│ │    Contrato LibretaRegistry.sol   │
          │ • Row Level Security (RLS)│ │ B. Unlock Protocol (Base/Polygon):│
          │ • Cifrado AES-256 en      │ │    Contrato PublicLock (Auditor)  │
          │   reposo para datos PII   │ │ C. Pollar Engine:                 │
          │ • Cola de sincronización  │ │    Liquidación 1 USDC Mainnet     │
          └───────────────────────────┘ └───────────────────────────────────┘
```

---

## 2. HISTORIAS DE USUARIO DETALLADAS (BACKEND)

### [US-01] Emisión y Anclaje de Microcrédito
* **Como:** Prestamista registrado,
* **Quiero:** Dar de alta un nuevo crédito para un prestatario ingresando capital, cuotas y frecuencia,
* **Para:** Generar el plan de pagos y anclar su identificador en HSK Chain sin exponer datos personales.
* **Criterios de Aceptación:**
  - El backend genera un `loanId = keccak256(uuid + timestamp)`.
  - Los datos personales del cliente se cifran y almacenan en Supabase.
  - Se invoca la función `registerLoan(loanId, loanHash, borrowerWallet, totalInstallments)` en el contrato `LibretaRegistry.sol` en HSK Chain.
  - El sistema devuelve el identificador y el código QR de la libreta física/digital.
* **Endpoint:** `POST /api/loans`

---

### [US-02] Cobro en Efectivo con Doble Atestación y Modo Offline
* **Como:** Cobrador en ruta callejera,
* **Quiero:** Registrar el cobro de una cuota en efectivo y obtener la validación inmediata del prestatario,
* **Para:** Garantizar un recibo incontrovertible que proteja a ambas partes aún sin conexión a internet.
* **Criterios de Aceptación:**
  - El cobrador escanea el QR de la libreta del cliente.
  - El prestatario autoriza la cuota mediante código de un solo uso (OTP) o firma biométrica/PIN en la PWA.
  - Si no hay internet, la transacción se almacena en el `IndexedDB` local con firma criptográfica mutua.
  - Al recuperar conexión, el endpoint `POST /api/sync/batch` valida la autenticidad, guarda en base de datos y envía la transacción `confirmPayment` a HSK Chain.
* **Endpoint:** `POST /api/installments/:id/collect-cash` & `POST /api/sync/batch`

---

### [US-03] Liquidación Digital Directa con Pollar en Mainnet
* **Como:** Prestatario con saldo digital,
* **Quiero:** Pagar mi cuota en USDC mediante el botón de Pollar,
* **Para:** Liquidar mi obligación de forma inmediata y automática sin usar efectivo.
* **Criterios de Aceptación:**
  - La PWA inicializa el checkout con `@pollar/react` por 1 USDC hacia la wallet del prestamista.
  - Una vez confirmada la transacción en mainnet, Pollar envía un webhook firmado con HMAC-SHA256 a `POST /api/webhooks/pollar`.
  - El backend valida la firma del webhook, marca la cuota como pagada (`payment_method = 'POLLAR_USDC'`) y ejecuta `confirmPayment` en HSK Chain guardando el hash de la transacción de Pollar como evidencia cruzada.
* **Endpoint:** `POST /api/webhooks/pollar`

---

### [US-04] Consulta Pública y Resumen de Reputación (Libreta Passport)
* **Como:** Usuario prestatario o tercero interesado,
* **Quiero:** Consultar el enlace público `libreta.app/p/:slug`,
* **Para:** Visualizar métricas objetivas de cumplimiento (LRI, cuotas pagadas, puntualidad) sin revelar detalles privados.
* **Criterios de Aceptación:**
  - `GET /api/passports/:slug/summary` devuelve datos agregados no identificables:
    - Cantidad de créditos finalizados.
    - Total de cuotas pagadas puntuales vs atrasadas.
    - Índice LRI calculado.
  - No requiere autenticación previa ni expone direcciones completas o cédulas.
* **Endpoint:** `GET /api/passports/:slug/summary`

---

### [US-05] Desbloqueo Token-Gated del Expediente Forense (Unlock Protocol)
* **Como:** Oficial de crédito o analista de riesgos de una entidad bancaria/fintech,
* **Quiero:** Conectar mi billetera y verificar mi membresía de Unlock Protocol,
* **Para:** Desbloquear y descargar el expediente completo de auditoría (listado de hashes en HSK, fechas de cada pago y contratos).
* **Criterios de Aceptación:**
  - Si el solicitante no posee una Key válida en el contrato `PublicLock` de Unlock, el backend responde con código HTTP `402 Payment Required` y el metadata para abrir el Paywall de Unlock.
  - Si la billetera posee una Key activa (`hasValidKey == true`), el endpoint devuelve el array de `PaymentProof` obtenido directamente del contrato `LibretaRegistry.sol` en HSK Chain y el certificado W3C Verifiable Credential.
* **Endpoint:** `GET /api/passports/:slug/audit-dossier`

---

## 3. ESQUEMA DE BASE DE DATOS (SUPABASE POSTGRESQL)

```sql
-- Habilitar extensión UUID y pgcrypto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Perfiles de usuario
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('BORROWER', 'COLLECTOR', 'LENDER', 'AUDITOR')),
    wallet_address VARCHAR(42) UNIQUE,
    alias_name VARCHAR(100) NOT NULL,
    encrypted_phone TEXT,
    passport_slug VARCHAR(32) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Préstamos
CREATE TABLE public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hsk_loan_id VARCHAR(66) UNIQUE NOT NULL, -- bytes32 hex en HSK Chain
    lender_id UUID NOT NULL REFERENCES public.profiles(id),
    borrower_id UUID NOT NULL REFERENCES public.profiles(id),
    capital NUMERIC(14,2) NOT NULL CHECK (capital > 0),
    currency VARCHAR(5) DEFAULT 'BOB' NOT NULL,
    total_installments INT NOT NULL CHECK (total_installments > 0),
    installment_amount NUMERIC(14,2) NOT NULL CHECK (installment_amount > 0),
    frequency VARCHAR(20) DEFAULT 'WEEKLY' CHECK (frequency IN ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'DEFAULTED')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ
);

-- 3. Cuotas
CREATE TABLE public.installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    installment_number INT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_date TIMESTAMPTZ,
    status VARCHAR(35) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PENDING_BORROWER_CONFIRMATION', 'PAID', 'OVERDUE')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'POLLAR_USDC')),
    pollar_tx_hash VARCHAR(66),
    receipt_hash VARCHAR(66),
    hsk_sync_status VARCHAR(20) DEFAULT 'PENDING' CHECK (hsk_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
    UNIQUE(loan_id, installment_number)
);

-- Políticas de Seguridad RLS
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los prestamistas y prestatarios ven sus propios creditos"
ON public.loans FOR SELECT
USING (auth.uid() IN (SELECT auth_user_id FROM public.profiles WHERE id = lender_id OR id = borrower_id));
```

---

## 4. FORMULACIÓN DEL ÍNDICE LRI (LIBRETA RELIABILITY INDEX)

El índice se calcula de manera determinística en el backend y se expone sin modificaciones:

$$\text{LRI} = \left( 0.50 \times P_{\text{puntual}} + 0.30 \times C_{\text{completitud}} + 0.20 \times D_{\text{devolución}} \right) \times 100$$

Donde:
* $P_{\text{puntual}} = \frac{\text{Cuotas Pagadas sin Retraso}}{\text{Total de Cuotas Pagadas}}$
* $C_{\text{completitud}} = \min\left(1.0, \frac{\text{Créditos Exitosamente Concluidos}}{3}\right)$
* $D_{\text{devolución}} = \frac{\text{Capital Histórico Devuelto}}{\text{Capital Histórico Financiado}}$

---

## 5. INTEGRACIÓN Y ARBITRAJE ENTRE PROTOCOLOS

| Protocolo / Componente | Red | Función Técnica | Verificación de Entrega |
| :--- | :--- | :--- | :--- |
| **HSK Chain** | HSK Chain (L2 / EVM) | Registro inmutable de créditos y confirmaciones de cuota mediante `LibretaRegistry.sol`. | Eventos emitidos en el explorador de bloques HSK. |
| **Pollar Engine** | Red EVM Mainnet | Procesamiento de cuota digital (1 USDC) con widget no custodial de pago. | TX Hash en Mainnet generado durante la demo. |
| **Unlock Protocol** | Red EVM (Base / Polygon) | Control de acceso token-gated al informe técnico de auditoría para entidades bancarias. | Contrato PublicLock desplegado y validado vía API. |
| **Supabase** | Cloud / PostgreSQL | Almacenamiento seguro de datos off-chain cifrados y backend para sincronización offline. | Endpoints REST protegidos por RLS. |

## Actualización de conexión y eliminación de datos simulados — 2026-09-12

El panel y Cuotas Pollar usan una sesión Auth validada por `/api/auth/me`, caché por usuario y consultas compartidas a `/api/pollar/settlements`. Ya no hay accesos demo, métricas fijas, LRI 98, OTP aleatorio ni direcciones generadas descartando sus claves. El formulario de crédito compatible usa borrowerId, borrowerWalletAddress, capital, installmentAmount, totalInstallments, startDate, currency USDC, frequency WEEKLY y settlementNetwork stellar:testnet.

La clave administrativa del backend debe ser service_role o sb_secret_; una clave anon en SUPABASE_SERVICE_ROLE_KEY provoca un error de configuración explícito. La clave correcta fue verificada con lecturas reales. No se ampliaron permisos públicos para ocultar el error.

Las respuestas de cuotas incluyen hsk_verification (VERIFIED / NOT_FOUND / UNAVAILABLE) y hsk_verified por comprobante, consultados en HSK testnet y almacenados en caché hasta 30 segundos. El crédito BOB existente no aparece en el contrato actual: se conserva como registro sin respaldo HSK verificado. La conciliación Pollar exige un crédito USDC configurado en Stellar testnet.

Unlock exige firma EIP-191 vigente (mensaje `LIBRETA Unlock Audit Access: <timestamp UNIX en segundos>`, máximo 300 segundos), red configurada y membresía on-chain. El dossier requiere x-viewer-address, x-viewer-signature y x-viewer-timestamp; respeta la publicación del pasaporte y devuelve un informe sin firma, no una VC ficticia. LRI sin historial devuelve cero/INSUFFICIENT, no un puntaje favorable inventado. El panel de pasaporte y cobrador offline sigue pendiente; no debe anunciarse como función concluida.

Consulta la guía actual en `hacka_Libreta_FRONT/docs/GUIA_PRUEBAS_FRONTEND_ACTUAL.md`. La prueba de pago completa con dos usuarios todavía requiere ejecución; compilar y leer la base no demuestran por sí solos un pago exitoso.

## Unificación de pantallas Pollar + HSK + Unlock

La navegación principal usa un único flujo: **Registrar crédito** (solo prestamista, POST /api/loans con cuotas USDC y registro HSK), **Pagar cuotas** (intenciones Pollar y conciliación existente), **Créditos y comprobantes** (misma consulta autenticada /api/pollar/settlements con evidencias Stellar y HSK) y **Auditoría Unlock** (componentes de membresía, checkout y expediente del equipo conservados).

Los formularios manuales RegisterLoanForm/ConfirmPaymentForm se conservan como código técnico, pero ya no se exponen en HomePage ni se requieren para pagar. El proveedor Pollar y el componente de pago se mantienen montados al navegar para preservar hash, intento y recuperación. Transferencia libre queda en una sección secundaria explícitamente ajena a las cuotas. Registrar exige configurar previamente la wallet de cobro; al concluir lleva al historial del mismo crédito. Se alinearon VITE_UNLOCK_LOCK_ADDRESS y VITE_UNLOCK_NETWORK con la dirección pública y red del backend. Se corrigió la inyección opcional de dependencias de prueba de UnlockVerifierService para permitir el arranque de Nest. Se aplicó la migración existente 20260912_audit_logs.sql en Supabase: tablas de auditoría con RLS y acceso exclusivo del backend, más su RPC de conteos. Los contratos y las claves secretas se conservaron.

Prueba manual: iniciar como prestamista, configurar wallet y registrar; comprobar cuotas en Créditos y comprobantes; iniciar como prestatario, Pagar cuotas, confirmar una sola transferencia; alternar a historial y verificar enlaces Stellar/HSK; recuperar el mismo hash sin volver a pagar. Abrir Auditoría Unlock y verificar el estado sin Key; adquirir o verificar una Key mediante el flujo existente del equipo. La membresía restringe la vista de auditoría de la aplicación; los datos de una blockchain pública siguen siendo públicos.

## Interés total y calendario de cuotas

Registrar crédito permite porcentajes rápidos 0/5/10/15/20 o uno personalizado (hasta dos decimales), y frecuencia DAILY, WEEKLY o MONTHLY. El porcentaje se aplica una sola vez al capital; no es tasa mensual ni anual. POST /api/loans recibe interestRate numérico y calcula las cuotas en el servidor. Se conserva installmentAmount para clientes anteriores que no envían interestRate. Con interestRate presente, el servidor calcula los importes sin confiar en installmentAmount.

El cálculo usa centavos y redondeo del interés al centavo más cercano (mitades hacia arriba). Distribuye los centavos sobrantes entre las primeras cuotas; la suma del principal y del total queda exacta. installment_amount representa la primera cuota; installments.amount es el importe definitivo de cada pago. public.loans.interest_rate almacena el porcentaje; los créditos anteriores conservan NULL y no se recalculan. La validación técnica admite 0–1000%, capital hasta 999999999.99 y 1–52 cuotas, sin cuotas con principal inferior a un centavo.

startDate es el primer vencimiento YYYY-MM-DD. Diario avanza un día, semanal siete días; mensual conserva el día original y lo limita al último día del mes cuando corresponda (31 enero → 28/29 febrero → 31 marzo). Fechas calculadas en UTC para evitar desfases horarios. El formulario muestra total, interés, fechas e importes antes de registrar; el historial muestra porcentaje y frecuencia. Pollar cobra el importe guardado de la cuota y la conciliación/anclaje HSK existentes siguen vigentes.

Ejemplo de prueba: 100 USDC, 10% total, 10 cuotas semanales = 110 USDC, 11 USDC por cuota. Probar también 100 USDC, 12.5%, 7 cuotas: primera cuota 16.08 y seis de 16.07; total 112.50. Aplicar supabase/migrations/20260913001551_loan_interest_rate.sql antes de iniciar el backend actualizado.

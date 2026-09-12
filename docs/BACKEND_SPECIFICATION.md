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

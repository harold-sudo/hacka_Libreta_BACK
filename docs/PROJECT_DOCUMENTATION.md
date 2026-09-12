# LIBRETA — Microcrédito Verificable & Portabilidad de Reputación Financiera
## Documento Maestro de Arquitectura, Especificación Integral & Dossier de Hackathon

**Evento:** ETH Bolivia Buildathon 2026 (Cochabamba, Bolivia)  
**Fechas:** 11 al 13 de Septiembre de 2026  
**Tracks de Participación:**
* 🇧🇴 **Track Principal:** Bolivia Hackathon
* 🌐 **Sub-Track Temático:** Real-World Ethereum Applications (PayFi, Pagos con Stablecoins & Reputación)
* ⚡ **Track Tecnológico:** HSK Chain Track (Payment, Stablecoins & RWA)
* 🐻‍❄️ **Bounty 1:** Pollar Engine (Liquidación en Mainnet con 1 USDC)
* 🔓 **Bounty 2:** Unlock Protocol (Best Build: Portal de Contenido Token-Gated)

---

## 1. RESUMEN EJECUTIVO & CONTEXTO DEL MUNDO REAL

En América Latina, más del **60% de la economía productiva opera en el sector informal**. En ciudades como Cochabamba (sede de "La Cancha", uno de los mercados a cielo abierto más extensos del continente), cientos de miles de comerciantes minoristas, artesanos y productores financian su capital de trabajo diario mediante el **microcrédito informal**.

### 1.1. La Problemática de la "Libreta de Papel"
Históricamente, estos préstamos se registran en una modesta **libreta de papel** en la que el cobrador anota a mano cada pago diario o semanal con un bolígrafo. Este modelo arcaico acarrea graves consecuencias:
1. **Fragilidad y Extravío:** Si la libreta se moja, se rompe o se extravía, no existe respaldo que certifique los pagos realizados.
2. **Discrepancias y Abusos:** Facilita la alteración unilateral de saldos, cobros dobles o prácticas extorsivas ("gota a gota").
3. **Invisibilidad Financiera Absoluta:** Un comerciante puede pagar puntualmente sus cuotas durante 10 años ininterrumpidos; sin embargo, para el sistema bancario tradicional sigue siendo un "fantasma sin historial crediticio", condenado a depender de préstamos informales caros.

### 1.2. La Propuesta de Valor de LIBRETA
**LIBRETA** digitaliza y descentraliza este flujo sin alterar la dinámica cultural de la feria:
* **Para el Prestatario:** Conserva su libreta en su teléfono móvil (PWA), liquida digitalmente en **USDC vía Pollar** o valida pagos en efectivo mediante **códigos OTP bilaterales**, y acumula una reputación financiera soberana (**Libreta Passport**).
* **Para el Cobrador de Calle:** Dispone de una herramienta **Offline-First** que opera en los pasillos de los mercados sin señal celular, resguardando cada cobro en su dispositivo y sincronizándolo en bloque hacia **HSK Chain** al recuperar conexión.
* **Para el Prestamista / Microfinanciera:** Monitorea su cartera en tiempo real, ancla cada crédito en blockchain y erradica el extravío de dinero o el fraude de cobranza.
* **Para el Banco / Fintech Aliada:** Accede mediante **Unlock Protocol** a un expediente forense auditado criptográficamente, convirtiendo a los comerciantes informales en sujetos de crédito formal (*Open Finance*).

---

## 2. ALINEACIÓN CON TRACKS Y BOUNTIES DE LA HACKATHON

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MATRIZ DE IMPACTO Y ASIGNACIÓN A TRACKS                  │
├────────────────────────┬────────────────────────────────────────────────────┤
│ Bolivia Hackathon      │ Diseñado para las ferias comerciales bolivianas,   │
│ & Real-World Ethereum  │ resolviendo la inclusión financiera real con       │
│ Applications           │ microcrédito verificable y cobros en efectivo/USDC.│
├────────────────────────┼────────────────────────────────────────────────────┤
│ Track HSK Chain        │ Registro inmutable y descentralizado de créditos y │
│ (Payment / Stablecoin) │ atestaciones de pago mediante LibretaRegistry.sol. │
├────────────────────────┼────────────────────────────────────────────────────┤
│ Bounty Pollar          │ Integración de @pollar/react para liquidación de   │
│ ($200 USD)             │ cuota real de 1 USDC en Mainnet hacia el prestador.│
├────────────────────────┼────────────────────────────────────────────────────┤
│ Bounty Unlock Protocol │ Portal de auditoría token-gated con llaves NFT     │
│ (Bounty 2 - $250 USD)  │ (Descubrir ➔ Previsualizar ➔ Unlock ➔ Dossier).    │
└────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 3. ARQUITECTURA MULTICAPA DEL SISTEMA

LIBRETA adopta una arquitectura desacoplada en cuatro capas que separa estrictamente la capa de presentación de la persistencia privada y el consenso blockchain.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPA 1: PRESENTACIÓN (PWA CLIENT)                     │
│   • React 19 + Vite + Tailwind CSS v4                                       │
│   • Modo Cobrador Offline-First (IndexedDB con idb-keyval)                  │
│   • Pasarela Pollar Engine (@pollar/react para 1 USDC Mainnet)              │
│   • Control de Acceso Token-Gated (@unlock-protocol/paywall)                │
│   • Verificador On-Chain con HSK RPC (viem / wagmi)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP REST (JSON) / WebSockets
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               CAPA 2: BACKEND GATEWAY & ORQUESTADOR (NESTJS / TS)           │
│   • Controladores REST protegidos con Supabase JWT Guard                    │
│   • Receptor de Webhooks Pollar con validación HMAC-SHA256                  │
│   • Motor Criptográfico de Hasheo (keccak256) & Doble Atestación Bilateral  │
│   • Calculador Determinístico del Índice LRI (Libreta Reliability Index)   │
│   • Transactor hacia LibretaRegistry.sol en HSK Chain                       │
└───────────────────────┬───────────────────────────┬─────────────────────────┘
                        │                           │
          ┌─────────────▼─────────────┐ ┌───────────▼─────────────────────────┐
          │   CAPA 3: PERSISTENCIA    │ │   CAPA 4: PROTOCOLOS & SMART CONTR. │
          │   (SUPABASE POSTGRESQL)   │ │                                     │
          ├───────────────────────────┤ ├─────────────────────────────────────┤
          │ • Esquema público: loans, │ │ A. HSK Chain:                       │
          │   installments, profiles  │ │    Contrato LibretaRegistry.sol     │
          │ • Esquema privado cifrado:│ │ B. Pollar Engine (Mainnet):         │
          │   libreta_private.pii     │ │    Procesador no custodial 1 USDC   │
          │ • Row Level Security (RLS)│ │ C. Unlock Protocol (Base / Polygon):│
          │ • Cola de sincronización  │ │    Contrato PublicLock de Auditoría │
          └───────────────────────────┘ └─────────────────────────────────────┘
```

---

## 4. CONTRATO INTELIGENTE EN HSK CHAIN (`LibretaRegistry.sol`)

El contrato inteligente **`LibretaRegistry.sol`** desplegado en **HSK Chain** actúa como el notario descentralizado de la plataforma. Cumple con la premisa de **cero almacenamiento de datos personales (Zero PII)**.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LibretaRegistry {
    enum LoanStatus { CREATED, ACTIVE, COMPLETED, DEFAULTED }

    struct Loan {
        bytes32 loanHash;         // keccak256(loanId, borrowerPubKey, lenderPubKey, salt)
        address lender;           // Dirección pública de la microfinanciera / prestamista
        address borrower;         // Dirección o identificador criptográfico del cliente
        uint16 totalInstallments; // Total de cuotas pactadas
        uint16 paidInstallments;  // Cuotas pagadas y verificadas
        uint256 createdAt;        // Timestamp de registro
        uint256 completedAt;      // Timestamp de finalización exitosa
        LoanStatus status;
    }

    struct PaymentProof {
        bytes32 receiptHash;      // keccak256(loanId, installmentNumber, amountHash, timestamp)
        uint16 installmentNumber; // Número correlativo de cuota
        uint256 timestamp;        // Momento de confirmación bilateral
        bool isDigital;           // true: liquidado vía Pollar (USDC); false: efectivo
        bytes32 externalTxHash;   // Hash de la transacción mainnet en Pollar (o bytes32(0))
    }

    mapping(bytes32 => Loan) public loans;
    mapping(bytes32 => PaymentProof[]) internal loanProofs;
    mapping(address => bytes32[]) public borrowerLoans;

    event LoanRegistered(bytes32 indexed loanId, address indexed lender, address indexed borrower, uint16 installments, uint256 timestamp);
    event PaymentConfirmed(bytes32 indexed loanId, uint16 indexed installmentNumber, bytes32 receiptHash, bool isDigital, uint256 timestamp);
    event LoanCompleted(bytes32 indexed loanId, address indexed borrower, uint256 completedAt);

    function registerLoan(bytes32 _loanId, bytes32 _loanHash, address _borrower, uint16 _totalInstallments) external;
    function confirmPayment(bytes32 _loanId, uint16 _installmentNumber, bytes32 _receiptHash, bool _isDigital, bytes32 _externalTxHash) external;
    function getBorrowerLoanCount(address _borrower) external view returns (uint256);
    function getLoanProofs(bytes32 _loanId) external view returns (PaymentProof[] memory);
}
```

### 4.1. Garantías de Seguridad del Smart Contract
1. **Control de Acceso Estricto:** Solo el `lender` registrado puede emitir confirmaciones de pago (`confirmPayment`), impidiendo falsificaciones de atestaciones.
2. **Secuencialidad Estricta:** No se pueden confirmar cuotas desordenadas (`_installmentNumber == loan.paidInstallments + 1`).
3. **Cierre Automático:** Al alcanzarse `paidInstallments == totalInstallments`, el estado cambia irreversiblemente a `COMPLETED` y se emite el evento `LoanCompleted`.

---

## 5. MARCO DE PRIVACIDAD, HABEAS DATA & ZERO PII ON-CHAIN

En estricto apego a las normas constitucionales de **Habeas Data** de Bolivia (Art. 130 y 131 de la CPE), la Ley N° 164 de Telecomunicaciones y TIC, y normativas internacionales de protección de datos (LGPD, GDPR):

### 5.1. Regla de Oro: Ningún Dato Sensible en Blockchain
* En **HSK Chain** nunca se graban nombres, números de cédula (CI), números telefónicos ni ubicaciones físicas.
* Todo anclaje se realiza mediante hashes unidireccionales:
  $$\text{loanHash} = \text{keccak256}(\text{loanId}, \text{borrowerAlias}, \text{salt})$$
  $$\text{receiptHash} = \text{keccak256}(\text{loanId}, \text{installmentNumber}, \text{amount}, \text{otpCode}, \text{timestamp})$$

### 5.2. Ejercicio del "Derecho al Olvido"
Los datos de identificación personal (PII) residen exclusivamente en la base de datos relacional de Supabase bajo el esquema `libreta_private` con **cifrado de sobre AES-256-GCM**.
* Si un prestatario ejerce su derecho legal de cancelación de datos, LIBRETA elimina irrevocablemente su registro de Supabase.
* Al desaparecer la clave off-chain, los hashes existentes en HSK Chain quedan **matemáticamente huérfanos e irreversibles**, garantizando la privacidad del usuario sin violar la inmutabilidad histórica de la blockchain.

### 5.3. Validez Probatoria (Ley Modelo UNCITRAL)
La atestación producida por la concurrencia del cobrador ingresando el monto y el prestatario entregando el OTP de 6 dígitos satisface los principios de **Equivalencia Funcional y Firma Electrónica Bilateral** reconocidos por la Ley Modelo de la CNUDMI/UNCITRAL sobre Comercio Electrónico.

---

## 6. ESPECIFICACIÓN MATEMÁTICA DEL ÍNDICE LRI (LIBRETA RELIABILITY INDEX)

El **Libreta Reliability Index (LRI)** es un puntaje determinístico y auditable que mide la solidez del comportamiento crediticio del comerciante en una escala de 0 a 100 puntos.

$$\text{LRI} = \left( 0.50 \times P_{\text{puntual}} + 0.30 \times C_{\text{completitud}} + 0.20 \times D_{\text{devolución}} \right) \times 100$$

### Desglose de las Variables:
1. **Tasa de Puntualidad ($P_{\text{puntual}}$):** Ponderación del **50%**.
   $$P_{\text{puntual}} = \frac{\text{Cuotas Pagadas en Fecha Límite o Antes}}{\text{Total de Cuotas Pagadas Históricas}}$$
2. **Tasa de Completitud de Créditos ($C_{\text{completitud}}$):** Ponderación del **30%**.
   Premia la finalización exitosa de ciclos de crédito completos (hasta un tope de saturación de 3 créditos).
   $$C_{\text{completitud}} = \min\left(1.0, \frac{\text{Créditos Finalizados con Estado COMPLETED}}{3}\right)$$
3. **Ratio de Devolución de Capital ($D_{\text{devolución}}$):** Ponderación del **20%**.
   $$D_{\text{devolución}} = \frac{\text{Capital Histórico Amortizado (BOB)}}{\text{Capital Histórico Total Otorgado (BOB)}}$$

> [!NOTE]
> El cálculo del LRI no utiliza cajas negras, algoritmos predictivos opacos ni variables socio-demográficas discriminatorias. Es una métrica abierta, matemática y verificable on-chain.

---

## 7. CATÁLOGO GLOBAL DE ENDPOINTS REST & WEBHOOKS

| Método | Endpoint | Rol / Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/loans` | `LENDER` | Origina un préstamo, genera cuotas y ancla en `LibretaRegistry.sol` en HSK Chain. |
| `GET` | `/api/borrower/loans/active` | `BORROWER` | Retorna la libreta digital activa y el cronograma ordenado de cuotas. |
| `POST` | `/api/installments/:id/otp-challenge` | `BORROWER` | Emite código OTP de 6 dígitos con 5 minutos de validez para cobro en efectivo. |
| `POST` | `/api/installments/:id/collect-cash` | `COLLECTOR` | Registra cobro en efectivo en línea con validación de OTP. |
| `POST` | `/api/installments/:id/pollar-confirm` | `BORROWER` | Notifica la liquidación exitosa en 1 USDC vía widget de Pollar. |
| `POST` | `/api/webhooks/pollar` | Público / Pollar | Webhook verificado con HMAC-SHA256 que concilia el pago y lo ancla en HSK Chain. |
| `GET` | `/api/collector/routes/today` | `COLLECTOR` | Devuelve la hoja de ruta de clientes a visitar en la jornada. |
| `POST` | `/api/sync/batch` | `COLLECTOR` | Sincroniza en lote cobros acumulados en IndexedDB hacia Supabase y HSK Chain. |
| `GET` | `/api/lender/analytics/overview` | `LENDER` | Devuelve métricas de cartera, recaudación del día y split de pagos. |
| `POST` | `/api/lender/routes/assign` | `LENDER` | Asigna créditos y paradas a la ruta de un cobrador. |
| `GET` | `/api/passports/:slug/summary` | Público (Zero PII) | Resumen público de reputación con cálculo del Índice LRI. |
| `POST` | `/api/passports/:slug/verify-key` | Público / Web3 | Valida si una wallet posee la membresía NFT en Unlock Protocol. |
| `GET` | `/api/passports/:slug/audit-dossier` | `AUDITOR` (Unlock) | Entrega el expediente forense on-chain y Credencial Verificable W3C en JSON-LD. |

---

## 8. GUION DE PITCH Y DEMOSTRACIÓN EN VIVO (3 MINUTOS)

Diseñado con base en las directrices oficiales del **Hackathon Submission Guideline (3 minutos de showcase + 2 minutos de preguntas y respuestas)**:

### ⏱️ Minuto 1: El Dolor en "La Cancha" y la Visión de LIBRETA (0:00 - 1:00)
* *"Buenos días, jurado de ETH Bolivia 2026. Estamos en Cochabamba, hogar de 'La Cancha', donde el 70% de los comerciantes vive del microcrédito diario registrado en libretas de papel arrugadas."*
* *"Si esa libreta se pierde, se pierde el dinero. Y si la señora Rosa paga puntualmente durante 5 años, ningún banco le presta un centavo porque su reputación es invisible."*
* *"Presentamos **LIBRETA**: la plataforma de microcrédito verificable que sustituye la libreta física por atestaciones criptográficas en **HSK Chain**, permitiendo pagos en **1 USDC con Pollar** y portabilidad bancaria mediante **Unlock Protocol**."*

### ⏱️ Minuto 2: La Demo en Vivo — Del Mercado a la Blockchain (1:00 - 2:00)
1. **Flujo Prestatario & Pago Pollar:**
   * Mostrar en pantalla la PWA del prestatario: *"Aquí vemos la libreta de Doña Rosa. Tiene una cuota pendiente. Presiona 'Pagar con Pollar (1 USDC)'. Se abre el widget de Pollar, confirma la transacción en Ethereum Mainnet... ¡y listo! La cuota queda pagada y el webhook ancla el hash en HSK Chain de forma inmediata."*
2. **Flujo Offline del Cobrador:**
   * Desconectar el Wi-Fi en el navegador (activar Modo Avión / Offline en DevTools): *"Ahora el cobrador llega al puesto de abarrotes sin señal. Escanea el código QR de la libreta, el cliente le da su código OTP de confirmación de 6 dígitos, y el cobrador registra el cobro en efectivo. Todo se almacena localmente en IndexedDB. Al salir del mercado y recuperar conexión, el SyncManager despacha el lote y sella la atestación bilateral en HSK Chain."*

### ⏱️ Minuto 3: El Pasaporte Financiero y Auditoría Bancaria con Unlock Protocol (2:00 - 3:00)
1. **Libreta Passport Público:**
   * Abrir `libreta.app/p/dona-rosa-cancha`: *"Cualquier persona puede ver su pasaporte de reputación con un Índice LRI de 98/100, sin revelar su nombre real ni cédula de identidad: Zero PII on-chain."*
2. **Acceso Token-Gated de Unlock Protocol:**
   * *"Pero un oficial de crédito del Banco Mercantil o Fie necesita auditar las pruebas forenses. Al conectar su wallet, Unlock Protocol verifica su NFT de membresía en el PublicLock. Si la tiene, el portal se desbloquea al instante, mostrando cada cuota sellada en HSK Chain con su hash verificable y permitiendo descargar la Credencial Verificable W3C oficial."*
3. **Cierre:**
   * *"LIBRETA no es solo una dApp: es el puente que convierte el esfuerzo del comerciante informal boliviano en dignidad y acceso al crédito formal. Muchas gracias."*

---

## 9. CUMPLIMIENTO DE REQUISITOS DE LOS BOUNTIES

### Requisitos Bounty Pollar:
- [x] Motor de pagos Pollar integrado en flujo de liquidación de cuotas (`@pollar/react`).
- [x] Transacción real en **Mainnet** por 1 USDC ejecutada y verificable en explorador.
- [x] Webhook backend con verificación de firma HMAC-SHA256 (`POST /api/webhooks/pollar`).
- [x] Repositorio público con README detallado y video demo menor a 3 minutos.

### Requisitos Bounty Unlock Protocol:
- [x] Portal de contenido Token-Gated funcional (`/p/:slug` con Paywall).
- [x] Flujo estricto: *Descubrir → Previsualizar (LRI libre) → Verificar membresía (Lock) → Desbloquear (Expediente forense HSK)*.
- [x] Uso de contrato `PublicLock` con verificación de Keys NFT reales.
- [x] Documentación exhaustiva en README con dirección del Lock y guía de integración.

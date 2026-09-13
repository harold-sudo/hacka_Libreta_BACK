# CREDITCHAIN — Backend Gateway

> **Microcrédito verificable · Reputación financiera soberana · Auditoría token-gated**

`CREDITCHAIN` (antes "LIBRETA") es un sistema de microcrédito que convierte el historial de pago en
una reputación financiera portátil y verificable. El *backend* es un gateway **NestJS 11 / TypeScript**
que orquesta tres integraciones blockchain y una capa de datos en la nube:

| Integración | Rol en el sistema |
|---|---|
| **HashKey Chain (HSK)** | Libro de verificación inmutable de préstamos y comprobantes de pago (`LibretaRegistry`, EVM, Chain ID 133/177). |
| **Unlock Protocol** | Miembrosía NFT **token-gated** ("Auditor Financiero Certificado — CREDITCHAIN") que desbloquea el expediente de auditoría forense. |
| **Pollar + Stellar** | Liquidación de cuotas de microcrédito en **USDC testnet** con anclaje/verificación de pago. |
| **Supabase (PostgreSQL)** | Capa de datos cloud: perfiles, préstamos, cuotas, cola offline, liquidaciones y **auditoría zero-PII**. |

Stack: **NestJS 11**, **ethers.js 6**, **@supabase/supabase-js 2**, class-validator, Jest 30 (unit)
+ Node 22+.

---

## 1. Arquitectura

```text
┌───────────────────────────────┐
│  PWA (React + ethers)         │  MetaMask / BrowserProvider
└──────────────┬────────────────┘
               │ REST /api/* (JSON, CORS, Auth Bearer JWT Supabase)
┌──────────────▼──────────────────────────────────────────────┐
│              CREDITCHAIN Backend Gateway (NestJS)           │
│  auth │ loans │ borrower │ installments │ sync │ webhooks   │
│  passports │ routes │ lender │ pollar │ audit               │
│                                                             │
│  Core (dominio):  CryptoEngine · LRI Calculator             │
│  Infra: Supabase · HskBlockchain · UnlockVerifier · Audit   │
└───┬──────────┬──────────────┬──────────────────┬────────────┘
    │          │              │                  │
    ▼          ▼              ▼                  ▼
 Postgres   Pollar →           ┌────────────┐  Unlock Protocol
 Supabase   stellar:testnet    │ HSK Chain  │  PublicLock
 anon/      (Horizon, USDC     │ EVM RPC    │  getHasValidKey
 service    testnet)           │ testnet 133│  (firma + TTL cache)
 _role      webhook + worker   └────────────┘
```

## 2. Unlock Protocol — Auditoría Token-Gated

### Cómo se usa
El **expediente forense** del prestatario (todas las pruebas `getLoanProofs` en HSK) es un recurso
sensible. Para consultarlo como auditor se requiere una **Key NFT activa** en un contrato
`PublicLock` de Unlock Protocol con nombre **"Auditor Financiero Certificado — CREDITCHAIN"**.

### Verificación del lado del servidor (`UnlockVerifierService`)
`POST /api/passports/:slug/verify-key` y `GET /api/passports/:slug/audit-dossier`:

1. El cliente firma el mensaje `LIBRETA Unlock Audit Access: ${timestamp}` con la wallet del auditor.
2. El backend recupera la dirección desde la firma con `ethers.verifyMessage` y comprueba:
   - dirección válida + firma correcta,
   - `timestamp` no mayor a **5 minutos** (anti-replay),
   - cadena activa del proveedor == `UNLOCK_CHAIN_ID` (evita firmas de otra red).
3. `PublicLock.getHasValidKey(address)` decide el acceso:
   - `true` → se devuelve el dossier (puntuación LRI + pruebas), se registra `AUDIT_DOSSIER_GENERATED`.
   - `false` → se registra `UNAUTHORIZED_ACCESS_ATTEMPT` y se deniega.

```ts
// src/infrastructure/unlock/unlock-verifier.service.ts — ABI del Lock usado por el backend
const PUBLIC_LOCK_ABI = [
  'function getHasValidKey(address _recipient) external view returns (bool)',
  'function keyExpirationTimestampFor(address _recipient) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address _owner, uint256 _index) external view returns (uint256)',
];
```

### Rendimiento y robustez
- **Caché TTL en memoria** de `getHasValidKey` (`UNLOCK_CACHE_TTL_MS`, default 30 s) — evita 2-3 RPC
  repetidas cuando el mismo auditor abre el dossier varias veces.
- **Seam de testing** `UnlockVerifierDeps` permite inyectar provider/contrato falsos sin tocar red.
- **Informe sin firmar**: `generateAuditReport()` devuelve `{ type:'LibretaAuditReport', signed:false }`
  — no se presenta un hash de texto como credencial W3C falsa.

### Configuración
```dotenv
UNLOCK_LOCK_ADDRESS=0x...PublicLock...
UNLOCK_NETWORK_RPC=https://testnet.hsk.xyz      # o mainnet.base.org, etc.
UNLOCK_CACHE_TTL_MS=30000                       # 0 desactiva la caché
```

**Cobertura de pruebas**: `src/infrastructure/unlock/unlock-verifier.service.spec.ts` (firma/timestamp,
key expirada, red equivocada → `ServiceUnavailableException`, caché → 1 solo call RPC).

---

## 3. Pollar + Capa de Datos Cloud (Supabase PostgreSQL)

> Nota: en este stack el equivalente a la "nube de base de datos" (PolarDB) es **Supabase (PostgreSQL)**
> como capa de datos y **Pollar** como pasarela de pago de cuotas sobre la red Stellar (USDC testnet).

### Procesamiento de pagos y cuotas (`SettlementService`)
Flujo de liquidación de una cuota de microcrédito con **Pollar** (Stellar testnet):

```text
Cuota PENDING/HKD
   │  PollarService crea intento (pollar_payment_intents)
   ▼
CREATED ──(worker tick 15 s)──▶  Candidate tx reportada por el cliente
   │                            (hasta 5 candidatos; dedup por tx_hash)
   ▼
VERIFIED  ◀── verificación en servidor vía Horizon (kit@stellar; nunca anon)
   │  SettlementAnchorService confirma Pago en HSK (confirmPayment)
   ▼
ANCHORED ──▶ installment.hsk_sync_status='SYNCED'
```

Detalles de ingeniería en el esquema (`migrations/20260912_pollar_settlements.sql`):

- **Single-writer**: `pollar_worker_lease` (lease de 2 min) serializa el *settlement tick* entre pods.
- **Idempotencia**: `UNIQUE(network,tx_hash)` + estados irreversibles (`CREATED → VERIFIED → ANCHORED`).
- **Triggers de inmutabilidad**: cuotas `PAID` o rails de pago (`CASH`/`POLLAR`) no pueden mutarse;
  el intento de pago solo cambia en campos de estado/hash.
- **Seguridad de acceso**: `SECURITY DEFINER` para `pollar_create_intent`, `pollar_observe`,
  `pollar_settle`, `pollar_mark_anchored`, `libreta_claim_cash`; RLS habilitado y **solo `service_role`**.
- **Concurrencia**: `SELECT … FOR UPDATE` sobre `loans`/`installments`/intents evita doble liquidación.

### Almacenamiento seguro de expedientes (off-chain PII)
- **Envelope Encryption AES-256-GCM** (`CryptoEngineService`): los datos personales se cifran off-chain
  (`iv:authTag:ciphertext`) con `AES_SECRET_KEY`; en la base solo existen hashes, wallets y métricas.
- **Zero-PII por diseño**: el trail de auditoría `audit_logs` (migración `20260912_audit_logs.sql`)
  prohíbe claves `name/phone/ci/dni/email/otp/password/secret/national` en `metadata` (jsonb).
- **Outbox durable + backoff**: si Supabase cae, los eventos van a `audit_outbox` y el `AuditService`
  los drena con reintentos exponenciales e `idempotency_key` (upsert `ignoreDuplicates`).

### Endpoints clave
| Endpoint | Uso |
|---|---|
| `POST /api/pollar/...` | Intento de pago Pollar (session/intents/settlements). |
| `POST /api/audit` | No — consulta trail. Ver `GET /api/audit` abajo. |

```dotenv
POLLAR_TESTNET_USDC_ISSUER=G...      # issuer exacto del USDC de tu app Pollar
POLLAR_WEBHOOK_SECRET=               # webhook legado deshabilitado (conciliación por Horizon)
```

---

## 4. HashKey Chain (HSK) — Capa de verificación EVM

### Rol
**HashKey Chain** es la capa de red EVM orientada a *PayFi* y activos del mundo real (RWA):
el asiento digital de cada préstamo y de cada comprobante de pago vive en `LibretaRegistry`
(contrato sin constructor, Solidity 0.8.20, solc optimizador 200 runs, EVM Paris).

### Cadena por defecto
| Red | Chain ID | RPC | Explorador |
|---|---|---|---|
| **HSK Testnet** | `133` | `https://testnet.hsk.xyz` | `https://testnet-explorer.hsk.xyz` |
| **HSK Mainnet** | `177` | `https://mainnet.hsk.xyz` | `https://hsk.blockscout.com` |

```dotenv
HSK_RPC_URL=https://testnet.hsk.xyz
HSK_CHAIN_ID=133
HSK_OPERATOR_PRIVATE_KEY=0x...
LIBRETA_REGISTRY_ADDRESS=0x...
```

### Interfaz del contrato (`src/infrastructure/blockchain/libreta-registry.abi.ts`)
```text
registerLoan(bytes32 loanId, bytes32 loanHash, address borrower, uint16 totalInstallments)
confirmPayment(bytes32 loanId, uint16 installmentNumber, bytes32 receiptHash, bool isDigital, bytes32 externalTxHash)
loans(bytes32 loanId) → Loan(lender, borrower, paid/total installments, status)
getLoanProofs(bytes32 loanId) → PaymentProof[](receiptHash, installmentNumber, timestamp, isDigital, externalTxHash)
getBorrowerLoanCount(address) / borrowerLoans(address, index)   ← paginación por prestatario
events: LoanRegistered · PaymentConfirmed · LoanCompleted
```

### Manejo de gas y seguridad
- **Operador con wallet propia** (`HSK_OPERATOR_PRIVATE_KEY`, 0x + 32 bytes) firma las escrituras del
  backend; `tx.wait()` espera confirmación y devuelve `receipt.hash` + `blockNumber`. Si HSK no
  confirma, se lanza `ServiceUnavailableException` — nunca un comprobante simulado.
- **Despliegue auditado**: `npm run hsk:compile` (sin red), `hsk:check:testnet|mainnet` (valida chain
  ID/saldo/gas), `hsk:deploy:*` (persiste el hash antes de esperar confirmación y compara bytecode).
  Ver [`contracts/DEPLOY_HSK.md`](contracts/DEPLOY_HSK.md).
- **Listener de auditoría on-chain** (`AuditListenerService`): índices `LoanRegistered/PaymentConfirmed/
  LoanCompleted` → `audit_logs` con cursor persistido (`audit_listener_state`) y backfill
  (`AUDIT_BACKFILL_BLOCKS`). Confirmación bilateral se valida fuera del contrato (nunca se carga PII).

### Exploración forense
`GET` público de pruebas: `contract.getLoanProofs()` devuelve los recibos (receiptHash
+ installment + timestamp + rail de pago) que el **frontend** vincula con sus bloques
mediante `PaymentConfirmed` (`queryFilter`).

---

## 5. API Surface (resumen)

| Método | Ruta | Protección |
|---|---|---|
| POST | `/api/auth/register` `/api/auth/login` | — |
| GET | `/api/auth/me` | Bearer JWT Supabase |
| GET | `/api/loans` · `/api/installments` | JWT + roles |
| POST | `/api/installments/...` (cash/otp/pollar/collect) | JWT + validación bilateral |
| GET/POST | `/api/pollar/*`, `/api/settlement/*` | JWT + `service_role` en SQL |
| GET | `/api/passports/:slug/summary` | público (sin PII) |
| POST | `/api/passports/:slug/verify-key` | firma wallet + Unlock |
| GET | `/api/passports/:slug/audit-dossier` | headers `x-viewer-address/signature/timestamp` |
| GET | `/api/audit` `/api/audit/summary` | `x-audit-key` |

## 6. Variables de entorno (`env/.env.example`)

Ver [`docs/BACKEND_SPECIFICATION.md`](docs/BACKEND_SPECIFICATION.md) (arquitectura),
[`docs/POLLAR_SETUP.md`](docs/POLLAR_SETUP.md), [`contracts/DEPLOY_HSK.md`](contracts/DEPLOY_HSK.md)
y [`docs/QA_AUDIT_UNLOCK.md`](docs/QA_AUDIT_UNLOCK.md).

## 7. Scripts

```bash
npm run start:dev          # watch mode (puerto 3001)
npm run lint               # ESLint (recommendedTypeChecked) + prettier --fix
npm test                   # Jest unit (71 tests · 11 suites)
npm run test:settlements:db # pglite end-to-end de la BD de liquidaciones
npm run qa:smoke           # smoke E2E de red (HSK + Unlock + Supabase; requiere .env)
npm run hsk:compile        # compilar LibretaRegistry (solc 0.8.20, sin red)
npm run hsk:deploy:testnet # desplegar + verificar bytecode en HSK Testnet
```

## 8. Repositorio

```
src/
├── core/                 # dominio, servicios (CryptoEngine, LRI) e interfaces de repositorios
├── infrastructure/       # Supabase, HSK blockchain, Unlock verifier, Auditoría (outbox+listener)
├── application/modules/  # auth, loans, borrower, installments, sync, webhooks, passports,
│                         # routes, lender, pollar, audit (controllers + servicios)
migrations/               # 20260912_pollar_settlements.sql · 20260912_audit_logs.sql
contracts/                # LibretaRegistry.sol + DEPLOY_HSK.md
scripts/                  # audit-listener.mjs · qa-smoke.mjs
```

## 9. Pruebas y calidad

```bash
npm run lint && npm run build
npm test -- --runInBand
```
Suites: pollar (service/anchor/settlement), webhooks, crypto-engine, LRI, supabase y **auditoría +
Unlock** (outbox durable, listener zero-PII, verifier con caché). Informe QA:
[`docs/QA_AUDIT_UNLOCK.md`](docs/QA_AUDIT_UNLOCK.md).

---

*CREDITCHAIN — ETH Bolivia Buildathon 2026 · Bounties: HashKey Chain, Unlock Protocol, Pollar.*
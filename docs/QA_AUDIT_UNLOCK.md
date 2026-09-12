# QA — Auditoría Zero-PII y Acceso Unlock Protocol

Fecha: 2026-09-12 · Stack: NestJS + Supabase + ethers v6 (backend), React/Vite (frontend)

## Resumen

Se auditaron y probaron los dos flujos críticos del hackatón:

1. **Auditoría Zero-PII** — `audit_logs` + `audit_outbox` (durable) + `AuditListenerService` (on-chain).
2. **Acceso al dossier** — `UnlockVerifierService` (PublicLock) + frontend (checkout modal, dossiers).

Verificación final: **71 tests pasan (11 suites)**, ESLint backend limpio, build Nest OK,
oxlint frontend 0/0, `tsc -b && vite build` OK.

## Archivos de test entregados

| Archivo | Cubre |
| --- | --- |
| `src/infrastructure/audit/audit.service.spec.ts` | Outbox durable, 3 retries directos, idempotency_key autogenerada, flush + delete, backoff (`attempts`/`next_attempt_at`), guard de concurrencia |
| `src/infrastructure/audit/audit-listener.service.spec.ts` | Mapping on-chain → `audit_logs` (LoanRegistered/PaymentConfirmed/LoanCompleted), lowercase, Zero-PII en metadata, cursor `lastSyncedBlock`, eventos desconocidos ignorados |
| `src/infrastructure/unlock/unlock-verifier.service.spec.ts` | Firma/timeout 5 min, wallet equivocada, key expirada/ausente, red equivocada (503), caché TTL (1 sola llamada RPC), `generateAuditReport` sin firma |
| `scripts/qa-smoke.mjs` (npm: `qa:smoke`) | Smoke E2E de red: LibretaRegistry (HSK), PublicLock (Unlock), Supabase (migración + cursor + escaneo Zero-PII de las últimas filas). SKIP si falta config en `.env` |

## Correcciones aplicadas durante el QA

### Backend
- **Unlock RPC en cada verifyKey** → caché en memoria TTL `UNLOCK_CACHE_TTL_MS` (default 30000, `0` la desactiva) en `UnlockVerifierService`. Un usuario con `verifyKey`+`getAuditDossier` ahora golpea RPC 1 vez en vez de 2-3.
- **`countByEventType` volcaba toda la tabla a JS** → función SQL `SECURITY DEFINER` `libreta_audit_counts()` (solo `service_role`) y el repositorio usa `.rpc()`.
- **Dossier denegado no se auditaba** → `PassportsService.getAuditDossier` registra `UNAUTHORIZED_ACCESS_ATTEMPT` cuando Unlock deniega.
- Seam de test `UnlockVerifierDeps` (default `{}`) en el constructor para inyectar provider/contrato falsos sin romper el DI de Nest.

### Frontend
- **`postMessage` sin verificar origen** → `UnlockCheckoutModal` solo acepta mensajes de `https://app.unlock-protocol.com`.
- **RPC sin timeout** → `FetchRequest` con timeout 10 s en `unlockContract.ts` (Unlock) y `contract.ts` (HSK). La UI falla rápido en vez de colgarse.

## Casos de borde a probar manualmente

- Key de Unlock **expirada** a mitad de sesión → re-verificación con caché expirada → `hasValidKey=false`.
- Firma firmada en otra red / wallet no propietaria → 401, sin datos del borrower.
- Supabase caído durante un `record()` → evento va al `audit_outbox` y se drena con backoff (finalmente consistente).
- Evento on-chain repetido (reorg/backfill) → idempotencia por `idempotency_key` (upsert `ignoreDuplicates`).
- Scanner de Zero-PII: prohibir claves `name/phone/ci/dni/email/otp/password/secret/national` en `audit_logs.metadata`.

## Recomendaciones de optimización (próximos pasos)

1. **Paginación** en `GET /api/audit`: ya existe `limit/offset`; exponer en el endpoint + `count` desde `libreta_audit_counts` en vez de `SELECT count(*)`.
2. **Backfill de réplica**: `AUDIT_BACKFILL_BLOCKS` pequeño por defecto; para migrar historial, subir el valor y correr el listener una vez (los eventos ya están en HSK).
3. **`useBorrowerForensic` (frontend)**: loop N+1 (`borrowerLoans` → `loans` + `getLoanProofs`). Cambiar a una sola consulta de préstamos con proofs incluidos (o paginación).
4. **Chunk grande** de Vite (~794 kB index): `dynamic import()` por ruta (checkout/pollar) para mejorar TTI.
5. **Caché del verifier**: para multi-instancia, moverla a Redis cuando haya más de un pod.
6. **`staleTime` de React Query** ya configurado (30 s) para `useBorrowerForensic`/`usePurchaseUnlockKey` — mantener.

## Cómo ejecutar

```bash
# Backend
cd hacka_Libreta_BACK
npm test -- --runInBand      # unit (71 tests)
npm run lint && npm run build
npm run qa:smoke             # E2E real: requiere .env con credenciales

# Frontend
cd hacka_Libreta_FRONT
npm run lint                 # oxlint
npm run build                # tsc -b && vite build
```
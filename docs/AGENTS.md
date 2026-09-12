# AGENTS.MD — Guía Operativa para Agentes de Inteligencia Artificial & Desarrolladores

Bienvenido al repositorio de **LIBRETA** (ETH Bolivia Buildathon 2026). Este archivo instruye a los agentes de software y programadores sobre la arquitectura, convenciones y restricciones críticas del sistema.

---

## 1. PRINCIPIOS INQUEBRANTABLES DEL PROYECTO

1. **Zero PII On-Chain (Privacidad Estricta):**
   - **NUNCA** envíes nombres personales, números de cédula (CI/DNI), teléfonos, coordenadas geográficas o datos sensibles a contratos inteligentes (HSK Chain o EVM).
   - On-chain solo se registran identificadores `bytes32` generados con `keccak256` y timestamps UNIX.
   - Toda información sensible off-chain debe residir en el esquema protegido `libreta_private` de Supabase bajo cifrado AES-256-GCM.

2. **No Intermediación Financiera ni Custodia de Fondos:**
   - La plataforma es un software neutral de atestación probatoria bajo la Ley Modelo UNCITRAL.
   - El sistema no custodia depósitos ni administra saldos fiduciarios. Los pagos en efectivo son directos entre partes, y los pagos digitales en USDC viajan de wallet a wallet de forma descentralizada mediante contratos inteligentes (Pollar).

3. **Arquitectura Offline-First (Modo Cobrador):**
   - Todo flujo del cobrador (`/collector`) debe asumir que la conexión a internet puede caer en cualquier momento.
   - La persistencia transaccional se realiza en IndexedDB (`offline_sync_store`). Al recuperar conexión, el despacho al backend se ejecuta de forma idempotente mediante lotes (`POST /api/sync/batch`).

---

## 2. MAPA DE ARCHIVOS CLAVE DE DOCUMENTACIÓN

Cualquier cambio arquitectónico o nueva funcionalidad debe mantenerse en estricta sincronía con los siguientes documentos:

* [`PROJECT_DOCUMENTATION.md`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/PROJECT_DOCUMENTATION.md): Documento maestro del proyecto, formulación matemática del LRI, cumplimiento de tracks y guion de demo.
* [`hacka_Libreta_FRONT/docs/USER_STORIES_FRONTEND.md`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_FRONT/docs/USER_STORIES_FRONTEND.md): Contratos de datos exactos (DTOs) y especificaciones Gherkin que el backend debe implementar.
* [`hacka_Libreta_FRONT/docs/FRONTEND_SPECIFICATION.md`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_FRONT/docs/FRONTEND_SPECIFICATION.md): Arquitectura de componentes, Zustand, TanStack Query y SDKs de Pollar y Unlock.
* [`hacka_Libreta_BACK/docs/BACKEND_SPECIFICATION.md`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_BACK/docs/BACKEND_SPECIFICATION.md): Estructura por capas de NestJS y orquestación con HSK Chain.
* [`hacka_Libreta_BACK/docs/TERMS_AND_REGULATION.md`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_BACK/docs/TERMS_AND_REGULATION.md): Marco regulatorio latinoamericano, Habeas Data y cláusulas anti-usura.
* [`Supabase.sql`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/Supabase.sql): Esquema DDL de PostgreSQL con RLS habilitado.
* [`hacka_Libreta_BACK/contracts/LibretaRegistry.sol`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_BACK/contracts/LibretaRegistry.sol): Contrato inteligente en Solidity ^0.8.20.

---

## 3. CONVENCIONES DE CÓDIGO Y COMMITS

### Frontend (`hacka_Libreta_FRONT`)
- **Framework:** React 19 + Vite + TypeScript + Tailwind CSS v4.
- **Peticiones HTTP:** Exclusivamente a través de `src/lib/httpClient.ts` (Fetch API envuelto con manejo unificado de errores y cabeceras de autorización).
- **Consultas al Servidor:** TanStack Query (`useQuery`, `useMutation`).
- **Formularios:** React Hook Form + validadores Zod.
- **Antes de compilar:** Ejecutar `npm run lint` y `npm run build`.

### Backend (`hacka_Libreta_BACK`)
- **Framework:** NestJS + TypeScript.
- **Validación DTO:** `class-validator` y `class-transformer`.
- **Persistencia:** Supabase Client con Service Role o Row Level Security.
- **Webhooks:** Toda ruta de webhook externa (ej. Pollar) debe verificar la firma HMAC antes de procesar el payload.

# 📒 LIBRETA — Microcrédito Verificable & Portabilidad de Reputación Financiera

[![ETH Bolivia Buildathon](https://img.shields.io/badge/ETH%20Bolivia-Buildathon%202026-blue.svg)](https://eag-global-buildathon.devfolio.co/)
[![Track](https://img.shields.io/badge/Track-Bolivia%20Hackathon%20%7C%20HSK%20Chain-purple.svg)]()
[![Bounty Pollar](https://img.shields.io/badge/Bounty-Pollar%201%20USDC%20Mainnet-06B6D4.svg)](https://pollar.xyz)
[![Bounty Unlock Protocol](https://img.shields.io/badge/Bounty-Unlock%20Token--Gated-F59E0B.svg)](https://unlock-protocol.com)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%20%7C%20PWA-61DAFB.svg)]()
[![Backend](https://img.shields.io/badge/Backend-NestJS%20%7C%20Supabase%20Postgres-E0234E.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

> **Sustituyendo la libreta de papel de los mercados informales por atestaciones criptográficas soberanas, liquidaciones en USDC y portabilidad de reputación crediticia hacia el sistema bancario formal.**

---

## 📌 Resumen del Proyecto (Pitch de 300 palabras)

En América Latina y especialmente en Bolivia (en ferias como "La Cancha" de Cochabamba), más del 60% de la economía productiva depende del **microcrédito informal**. Diariamente, miles de comerciantes minoristas financian su mercadería mediante préstamos anotados a mano en **libretas de papel**. Si la libreta se extravía, no hay respaldo legal ni comprobante; y a pesar de pagar con honradez durante años, el sistema financiero tradicional sigue considerándolos "fantasmas sin historial crediticio".

**LIBRETA** transforma esta realidad mediante una plataforma integral descentralizada:
1. **Doble Atestación Bilateral:** Sustituye el apunte a mano por recibos electrónicos sellados mediante códigos de un solo uso (OTP) entre cobrador y prestatario.
2. **PWA Offline-First:** Los cobradores registran pagos sin conexión en mercados cerrados utilizando IndexedDB y sincronizan en bloque hacia la blockchain al recuperar señal.
3. **Anclaje en HSK Chain:** Cada microcrédito y cuota abonada se registra de forma inmutable en el contrato `LibretaRegistry.sol`, garantizando **Zero PII On-Chain** (respeto total a Habeas Data y el Derecho al Olvido).
4. **Liquidación en 1 USDC con Pollar:** Los prestatarios pueden liquidar cuotas al instante en Ethereum Mainnet mediante la pasarela descentralizada de Pollar.
5. **Portabilidad de Reputación con Unlock Protocol:** Mediante el **Libreta Passport**, el comerciante es dueño de su calificación LRI (Libreta Reliability Index). Las entidades bancarias y microfinancieras pueden auditar el expediente forense on-chain desbloqueándolo mediante llaves NFT de Unlock Protocol (*Open Finance*).

---

## 🧭 Estructura del Repositorio

```
Hacka2026/
├── PROJECT_DOCUMENTATION.md      # Documento Maestro de Arquitectura, Criptografía y Pitch
├── Supabase.sql                  # Esquema DDL de PostgreSQL con RLS y cifrado PII
├── AGENTS.md                     # Guía de estándares para agentes y desarrolladores
│
├── hacka_Libreta_FRONT/          # Progressive Web Application (PWA)
│   ├── docs/
│   │   ├── FRONTEND_SPECIFICATION.md  # Arquitectura técnica detallada de la PWA
│   │   └── USER_STORIES_FRONTEND.md   # Historias de usuario y contratos API Backend
│   ├── src/                      # Código fuente React 19 + Vite + Tailwind CSS
│   └── package.json
│
└── hacka_Libreta_BACK/           # Backend Gateway & Smart Contracts
    ├── contracts/
    │   └── LibretaRegistry.sol   # Contrato de registro en HSK Chain
    ├── docs/
    │   ├── BACKEND_SPECIFICATION.md   # Arquitectura por capas del servidor
    │   └── TERMS_AND_REGULATION.md    # Marco legal (Habeas Data, UNCITRAL, No usura)
    ├── src/                      # API REST NestJS
    └── package.json
```

---

## 🏆 Participación en Tracks y Bounties

### 1. Track HSK Chain: Notaría Descentralizada de Microcrédito
* **Contrato Inteligente:** [`LibretaRegistry.sol`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_BACK/contracts/LibretaRegistry.sol)
* **Funcionalidad:** Anclaje de créditos (`registerLoan`) y atestaciones de pago (`confirmPayment`) con marcas temporales y hashes criptográficos de comprobantes (`receiptHash`).
* **Privacidad:** Cero almacenamiento de nombres, teléfonos o identificadores personales on-chain (**Zero PII**).

### 2. Bounty Pollar: Liquidación Directa en Mainnet (1 USDC)
* **Integración Frontend:** SDK `@pollar/react` en el flujo de cuotas del prestatario.
* **Integración Backend:** Webhook `POST /api/webhooks/pollar` con verificación de firma **HMAC-SHA256**.
* **Ejecución en Mainnet:** Transacción real de 1 USDC hacia la billetera del prestamista con conciliación cruzada en HSK Chain.

### 3. Bounty Unlock Protocol: Portal de Auditoría Token-Gated
* **Integración Frontend:** SDK `@unlock-protocol/paywall` para verificación de membresía y compra de llaves NFT en el contrato `PublicLock`.
* **Experiencia de Usuario:**
  1. *Descubrir:* Enlace público `libreta.app/p/:slug`.
  2. *Previsualizar:* Resumen de reputación LRI abierto (Zero PII).
  3. *Verificar Membresía:* Detección de Key NFT en la wallet del auditor.
  4. *Desbloquear:* Acceso completo al expediente forense on-chain y descarga de **Credencial Verificable W3C**.

---

## 🚀 Puesta en Marcha Local (Quickstart)

### Requisitos Previos
* Node.js v20+ y npm
* Cuenta en Supabase (o PostgreSQL local)
* Wallet Web3 (MetaMask, Rabby o Coinbase Wallet)

### 1. Configuración de la Base de Datos
1. Crear un proyecto nuevo en [Supabase](https://supabase.com).
2. Abrir el **SQL Editor** y ejecutar el contenido de [`Supabase.sql`](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/Supabase.sql).

### 2. Levantar el Backend (NestJS)
```bash
cd hacka_Libreta_BACK
npm install
npm run start:dev
```
*El servidor iniciará en `http://localhost:3000`.*

### 3. Levantar el Frontend (PWA en React 19)
```bash
cd hacka_Libreta_FRONT
npm install
cp .env.example .env
# Configurar VITE_API_URL, VITE_POLLAR_APP_ID y VITE_UNLOCK_LOCK_ADDRESS
npm run dev
```
*La aplicación cliente estará disponible en `http://localhost:5173`.*

---

## 📚 Documentación Técnica Detallada

* 📖 [**Documento Maestro del Proyecto (PROJECT_DOCUMENTATION.md)**](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/PROJECT_DOCUMENTATION.md) — Whitepaper técnico, modelo matemático LRI, marco legal y guion de pitch de 3 minutos.
* 📋 [**Historias de Usuario del Frontend y Contratos API Backend (USER_STORIES_FRONTEND.md)**](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_FRONT/docs/USER_STORIES_FRONTEND.md) — Requerimientos exhaustivos para la construcción integral de controladores y servicios backend.
* 💻 [**Especificación Técnica de la PWA (FRONTEND_SPECIFICATION.md)**](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_FRONT/docs/FRONTEND_SPECIFICATION.md) — Arquitectura de componentes, IndexedDB offline-first y manual de integración de SDKs.
* ⚖️ [**Marco Legal y Términos de Regulación (TERMS_AND_REGULATION.md)**](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_BACK/docs/TERMS_AND_REGULATION.md) — Cumplimiento de Habeas Data, Ley Modelo UNCITRAL y prevención de usura.
* 🗄️ [**Especificación del Backend Gateway (BACKEND_SPECIFICATION.md)**](file:///c:/Users/Mateo/Documents/Mateo%20Tareas/Hacka2026/hacka_Libreta_BACK/docs/BACKEND_SPECIFICATION.md) — Arquitectura de microservicios y sincronización en HSK Chain.

---

## 👥 Equipo LIBRETA (ETH Bolivia Buildathon 2026)
* Desarrollado con pasión e impacto social en **Cochabamba, Bolivia** para democratizar el crédito productivo en América Latina.

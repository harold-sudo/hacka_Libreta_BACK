> **Implementación técnica de pruebas:** la conciliación Pollar usa transferencias USDC entre wallets Stellar testnet y ancla únicamente hashes en HSK testnet. LIBRETA no recibe los fondos. Esta implementación no acredita por sí sola validez jurídica, cumplimiento normativo ni habilitación de mainnet. [Detalle vigente](POLLAR_INSTALLMENTS.md).

# MARCO LEGAL, REGULATORIO Y TÉRMINOS DE SERVICIO — LIBRETA

**Versión:** 1.0.0  
**Ámbito de Aplicación:** América Latina y el Caribe (LATAM) & Auditoría Financiera Internacional  
**Protocolo:** LIBRETA — Microcrédito Verificable & Portabilidad de Reputación Financiera  

---

## 1. NATURALEZA JURÍDICA: PROTOCOLO TECNOLÓGICO Y SOFTWARE NEUTRAL

### 1.1. Inexistencia de Intermediación Financiera y Captación
LIBRETA es una plataforma de software y un protocolo descentralizado de atestación criptográfica. 
* **NO es un banco, cooperativa de ahorro y crédito, entidad financiera ni institución de fondos de pago electrónico (IFPE).**
* **NO capta recursos, depósitos ni ahorros del público.**
* **NO realiza intermediación financiera.** En ningún momento LIBRETA toma posesión, custodia, almacena o administra fondos fiduciarios o activos digitales pertenecientes a prestatarios, cobradores o prestamistas.
* **Canalización de pagos:**
  * **Efectivo:** Los pagos en moneda de curso legal se realizan de manera física y directa entre las partes contratantes.
  * **Digital (Pollar / USDC):** Los pagos digitales se ejecutan de manera descentralizada, no custodial y *peer-to-peer* (P2P) a través de contratos inteligentes en blockchain hacia las direcciones de billetera designadas directamente por el prestamista.

### 1.2. Tipificación del Negocio Subyacente: Contrato de Mutuo Civil
Los créditos gestionados a través de LIBRETA corresponden a **contratos privados de mutuo civil o mercantil entre particulares**, amparados bajo la libertad contractual y los códigos civiles vigentes en cada país de la región (e.g., Código Civil de Bolivia Art. 895 y ss.; Código Civil Federal de México Art. 2384 y ss.; Código Civil de Colombia Art. 2221 y ss.; Código Civil y Comercial de la Nación Argentina Art. 1525 y ss.). LIBRETA funge exclusivamente como el medio tecnológico de registro, contabilidad y certificación de cumplimiento bilateral.

---

## 2. CLÁUSULA ESTRICTA DE PREVENCIÓN Y LÍMITE CONTRA LA USURA

### 2.1. Exclusión de Responsabilidad sobre Tasas de Interés
LIBRETA no determina, sugiere, impone ni cobra tasas de interés, recargos ni penalizaciones financieras sobre los créditos pactados entre los usuarios. 

### 2.2. Obligación Expresa de Cumplimiento Legal de los Prestamistas
Todo prestamista, asociación, gremio o institución que utilice LIBRETA declara bajo juramento y se compromete a:
1. **Ajustar sus tasas de interés nominales y efectivas a los topes máximos legales** establecidos por la autoridad monetaria o financiera de su país de operación (tasa de usura / tasa de interés legal máxima).
2. **Abstenerse de emplear mecanismos de cobro extorsivos**, esquemas coercitivos o modalidades ilícitas conocidas como "gota a gota".
3. **Indemnidad:** El prestamista mantendrá indemne a LIBRETA, sus desarrolladores, mantenedores de código y colaboradores ante cualquier investigación, sanción o litigio derivado de la fijación de tasas ilegales o prácticas de cobranza indebidas.

---

## 3. POLÍTICA DE PRIVACIDAD, HABEAS DATA Y PROTOCOLO "ZERO PII ON-CHAIN"

Para garantizar el cumplimiento con las normativas de protección de datos personales de América Latina (LGPD de Brasil, Ley 1581 de Colombia, Ley Federal de Protección de Datos Personales de México, Ley 25.326 de Argentina) y las garantías constitucionales de *Habeas Data*:

### 3.1. Prohibición Absoluta de Información de Identificación Personal (PII) en Blockchain
Ningún contrato inteligente desplegado por LIBRETA (incluyendo HSK Chain o redes EVM) almacenará datos sensibles o de identificación directa.
* **Queda estrictamente prohibido registrar on-chain:**
  * Nombres completos, firmas manuscritas digitalizadas o apodos identificables.
  * Números de Cédula de Identidad (CI), Documento Nacional de Identidad (DNI), CURP, RFC, CPF o pasaportes.
  * Números telefónicos, direcciones residenciales o ubicaciones satelitales (GPS).
  * Fotografías o datos biométricos.
* **Información almacenada en Blockchain (HSK Chain):**
  Únicamente se anclan hashes criptográficos unidireccionales generados mediante algoritmos matemáticos estándar:
  $$\text{loanHash} = \text{keccak256}(\text{loanId}, \text{salt}, \text{timestamp})$$
  $$\text{receiptHash} = \text{keccak256}(\text{loanId}, \text{installmentNumber}, \text{amount}, \text{salt})$$
  Estos hashes no contienen datos legibles y no pueden invertirse para reconstruir la información original.

### 3.2. Ejercicio del Derecho de Cancelación y "Derecho al Olvido"
Los datos operativos personales residen exclusivamente en servidores de almacenamiento relacional off-chain (Supabase) bajo cifrado en reposo (AES-256).
* Si un prestatario solicita la cancelación o supresión de sus datos personales, LIBRETA eliminará irrevocablemente los registros off-chain de sus bases de datos.
* Al eliminarse la clave off-chain, los hashes existentes en la blockchain quedan matemáticamente **huérfanos y desvinculados para siempre**. No constituyen un registro personal accesible por terceros, garantizando la inviolabilidad del derecho al olvido sin alterar la integridad matemática del libro mayor descentralizado.

---

## 4. VALIDEZ PROBATORIA DEL RECIBO DE DOBLE CONFIRMACIÓN

### 4.1. Adopción de la Ley Modelo UNCITRAL sobre Comercio Electrónico
El mecanismo de doble confirmación de cuotas de LIBRETA se rige por los principios internacionales de **Equivalencia Funcional y Neutralidad Tecnológica** consagrados en la *Ley Modelo de la CNUDMI/UNCITRAL sobre Firmas Electrónicas*, ratificada en las legislaciones locales:
* **Bolivia:** Ley N° 164 (Ley General de Telecomunicaciones, Tecnologías de Información y Comunicación) y DS 1793.
* **Colombia:** Ley 527 de 1999 sobre Comercio Electrónico y Mensajes de Datos.
* **México:** Código de Comercio, Artículos 89 al 114 (De los Mensajes de Datos y Firma Electrónica).
* **Perú:** Ley N° 27269 (Ley de Firmas y Certificados Digitales).
* **Chile:** Ley N° 19.799 sobre Documentos Electrónicos, Firma Electrónica y Servicios de Certificación.

### 4.2. Efecto Probatorio Vinculante
La atestación producida cuando:
1. El cobrador/prestamista emite el registro digital de cuota, y
2. El prestatario valida mediante token seguro (OTP), PIN o firma en la PWA,
constituye un **Reconocimiento Bilateral de Pago y Principio de Prueba por Escrito Inalterable**. Tiene superioridad técnica sobre los recibos talonarios físicos unilaterales al contar con sellado de tiempo sincrónico e inmutabilidad distribuida.

---

## 5. NATURALEZA DEL ÍNDICE LRI (LIBRETA RELIABILITY INDEX)

1. **Inexistencia de Evaluación Crediticia Oficial (Credit Score):** El LRI no es un score comercial emitido por una agencia de información crediticia o buró regulado.
2. **Índice Puramente Aritmético e Histórico:** El LRI es un indicador determinístico que refleja exclusivamente tres variables objetivas y matemáticas:
   * Porcentaje de cuotas pagadas a tiempo vs. con retraso.
   * Cantidad total de créditos concluidos sin incumplimiento.
   * Proporción del capital financiado que ha sido devuelto.
3. **No Utilización de Cajas Negras ni Modelos Predictivos Discriminatorios:** El cálculo no utiliza variables psicométricas, raciales, demográficas ni algoritmos opacos de inteligencia artificial. Cualquier entidad receptora puede auditar la fórmula abierta y verificar los hechos directamente.
4. **Decisión Crediticia Soberana de Terceros:** Cualquier banco o entidad financiera que consulte el *Libreta Passport* evaluará la información bajo su propia política de riesgo y marcos de *Alternative Credit Underwriting / Open Finance*.

---

## 6. CONTROL Y ACCESO TOKEN-GATED (UNLOCK PROTOCOL)

* **Propiedad de los Datos:** El prestatario es el propietario exclusivo y soberano de su expediente de cumplimiento.
* **Monetización y Licencia de Acceso:** Mediante la integración de **Unlock Protocol**, el acceso al dossier de auditoría detallado requiere la posesión de una llave digital (Key NFT / Access Pass). 
* **Finalidad:** Garantizar que únicamente entidades financieras, auditores autorizados o el propio prestatario puedan consultar el desglose pormenorizado de las pruebas, protegiendo al prestatario contra revisiones no autorizadas de su información comercial.

## Actualización de conexión y eliminación de datos simulados — 2026-09-12

El panel y Cuotas Pollar usan una sesión Auth validada por `/api/auth/me`, caché por usuario y consultas compartidas a `/api/pollar/settlements`. Ya no hay accesos demo, métricas fijas, LRI 98, OTP aleatorio ni direcciones generadas descartando sus claves. El formulario de crédito compatible usa borrowerId, borrowerWalletAddress, capital, installmentAmount, totalInstallments, startDate, currency USDC, frequency WEEKLY y settlementNetwork stellar:testnet.

La clave administrativa del backend debe ser service_role o sb_secret_; una clave anon en SUPABASE_SERVICE_ROLE_KEY provoca un error de configuración explícito. La clave correcta fue verificada con lecturas reales. No se ampliaron permisos públicos para ocultar el error.

Las respuestas de cuotas incluyen hsk_verification (VERIFIED / NOT_FOUND / UNAVAILABLE) y hsk_verified por comprobante, consultados en HSK testnet y almacenados en caché hasta 30 segundos. El crédito BOB existente no aparece en el contrato actual: se conserva como registro sin respaldo HSK verificado. La conciliación Pollar exige un crédito USDC configurado en Stellar testnet.

Unlock exige firma EIP-191 vigente (mensaje `LIBRETA Unlock Audit Access: <timestamp UNIX en segundos>`, máximo 300 segundos), red configurada y membresía on-chain. El dossier requiere x-viewer-address, x-viewer-signature y x-viewer-timestamp; respeta la publicación del pasaporte y devuelve un informe sin firma, no una VC ficticia. LRI sin historial devuelve cero/INSUFFICIENT, no un puntaje favorable inventado. El panel de pasaporte y cobrador offline sigue pendiente; no debe anunciarse como función concluida.

Consulta la guía actual en `hacka_Libreta_FRONT/docs/GUIA_PRUEBAS_FRONTEND_ACTUAL.md`. La prueba de pago completa con dos usuarios todavía requiere ejecución; compilar y leer la base no demuestran por sí solos un pago exitoso.

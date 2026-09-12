# Cuotas Pollar y comprobantes HSK — testnet

Implementación del 12 de septiembre de 2026. Migración aplicada y verificada el 12 de septiembre de 2026 en el proyecto libreta_private (znajylvosomdzibikqym). Se verificaron 4 tablas con RLS, 6 funciones exclusivas del backend y 2 triggers. Una prueba SQL con ROLLBACK confirmó idempotencia, rechazo de reutilización de transacciones y exclusión de cobro en efectivo. La base sigue con cero perfiles, créditos y cuotas. Falta la prueba integrada con dos usuarios reales, Pollar y HSK.

## Activación paso a paso

1. **Completado en este proyecto:** la migración ya está aplicada. Continúa desde el paso 3. Para otro despliegue, abre **Supabase → tu proyecto → SQL Editor → New query**.
2. Copia el contenido completo de `hacka_Libreta_BACK/migrations/20260912_pollar_settlements.sql` y pulsa **Run**. Es aditiva y se puede repetir; no borra registros. Para una base nueva, el `Supabase.sql` de la raíz ya incluye esta migración. No ejecutes todo el esquema base sobre una base existente.
3. En el backend, confirma estas variables de entorno: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HSK_RPC_URL`, `HSK_OPERATOR_PRIVATE_KEY`, `LIBRETA_REGISTRY_ADDRESS` y `POLLAR_TESTNET_USDC_ISSUER`. Conserva las claves secretas solo en el backend. HSK debe responder con chain ID **133** y el operador necesita gas de prueba.
4. Reinicia el backend con `npm run start:dev` y el frontend con `npm run dev`, cada uno desde su carpeta. Abre el panel **Pollar → Cuotas de mi libreta**.
5. Crea una cuenta de LIBRETA para el **prestatario**. Si Supabase pide confirmar el correo, confírmalo y luego inicia sesión. Elige rol **Prestatario** y pega su dirección HSK `0x…`. Guarda el ID de perfil que aparece en pantalla. La dirección HSK es distinta de la dirección Stellar `G…` de Pollar.
6. En otro navegador o después de cerrar ambas sesiones, crea la cuenta del **prestamista**, con rol **Prestamista** y una dirección HSK distinta. Conecta su wallet Pollar en testnet y pulsa **Usar mi wallet conectada para cobrar**.
7. Como prestamista, abre **Crear crédito de prueba en HSK y Supabase**. Pega el ID de perfil y la dirección HSK del prestatario. Para la primera prueba usa capital **1 USDC**, **1 cuota**, importe **1 USDC** y un primer vencimiento. Pulsa **Registrar crédito de prueba** y espera la respuesta. Los créditos registrados solo desde el panel HSK no aparecen automáticamente en Supabase: crea el crédito desde este formulario.
8. Entra con la cuenta de LIBRETA del prestatario y conecta **su propia wallet Pollar**. Necesita al menos 1 USDC de prueba y suficiente XLM disponible para la operación, o un patrocinio funcional. Comprueba que origen y destinatario sean distintos.
9. Pulsa **Preparar pago** en la cuota. Revisa el importe y la wallet de destino. Pulsa **Confirmar y pagar esta cuota** una sola vez.
10. Espera **Cuota pagada · comprobante HSK confirmado**. Puedes abrir el pago en Stellar, copiar el hash del comprobante y abrir la transacción HSK cuando esté disponible. La vista consulta al servidor cada 5 segundos. La verificación y el anclaje continúan en el backend aunque cierres la página, siempre que el hash haya sido reportado.

Supabase Auth identifica el perfil y autoriza las cuotas; el inicio de sesión Google/wallet de Pollar firma transferencias. Son dos sesiones distintas. Al recargar la página vuelve a iniciar sesión en LIBRETA; no se guarda su token en localStorage.

## Qué hacer ante una interrupción

- Si Pollar devuelve un hash pero la respuesta del backend falla, usa **Verificar sin volver a pagar** con ese hash (64 caracteres, sin `0x`). El navegador conserva el hash y el identificador de la intención; el servidor conserva los hashes que ya recibió.
- Si el envío tiene resultado incierto y no muestra hash, revisa **Historial Pollar**, recupera el hash y verifícalo. La aplicación bloquea otro envío desde ese intento local. No interpretes un timeout como un pago rechazado.
- Si aparece **Cuota pagada · comprobante HSK pendiente**, el dinero ya se verificó. El servidor reintenta el anclaje; revisa conexión, gas del operador y contrato si persiste. No vuelvas a transferir.
- Si se rechaza explícitamente por `TX_INSUFFICIENT_FEE`, corrige XLM/patrocinio y usa el botón que habilita un nuevo intento. Los reintentos de conciliación y de HSK jamás llaman a `sendPayment`.
- Una intención fija para siempre origen, destino, moneda e importe. Cambiar la wallet de cobro del prestamista solo afecta intenciones nuevas. No existe cancelación automática ni cambio a efectivo después de reservar una cuota para Pollar; evita que un pago tardío compita con un cobro por otra vía.
- Las cuotas deben pagarse en orden. La cuota anterior debe estar pagada y anclada antes de preparar la siguiente.

## Contrato HTTP vigente

Respuestas exitosas: `{ "success": true, "data": ... }`. Las rutas de cuotas y de creación de crédito requieren `Authorization: Bearer <Supabase access token>`. No aceptan tokens de desarrollo ni roles enviados como cabeceras.

| Método y ruta | Datos / resultado |
| --- | --- |
| POST `/api/pollar/session/register` | `{email,password}`; alta en Supabase Auth |
| POST `/api/pollar/session/login` | `{email,password}` → `{accessToken,expiresAt}` |
| POST `/api/pollar/session/profile` | `{role:"BORROWER"\|"LENDER",walletAddress:"0x…"}` → ID de perfil |
| GET `/api/pollar/settlements` | `{profile,loans,intents,receivingAddress}` limitado al usuario |
| POST `/api/pollar/settlements/receiving-wallet` | `{address:"G…"}`; solo prestamista |
| POST `/api/loans` | DTO de crédito existente + `currency:"USDC",settlementNetwork:"stellar:testnet"` |
| POST `/api/pollar/settlements/installments/:id/intent` | `{address:"G…"}` del origen; devuelve la intención existente o crea una |
| POST `/api/pollar/settlements/intents/:id/confirm` | `{transactionHash:"64 hex sin 0x"}`; registra candidato y verifica |

Una intención contiene `id`, `installment_id`, `loan_id`, `borrower_id`, `lender_id`, `hsk_loan_id`, `installment_number`, `network`, `sender`, `recipient`, `amount`, `issuer`, `min_ledger`, `hsk_chain_id`, `hsk_contract`, `status`, `tx_hash`, `receipt_hash`, `paid_at`, `hsk_tx_hash` y estado de reintento. `amount` puede llegar como string o número decimal. El cliente no determina el importe ni el destinatario de una cuota.

## Conciliación, privacidad y persistencia

El backend fija una intención por cuota, toma el ledger más reciente al crearla y comprueba en Horizon testnet una operación `payment` exitosa posterior a ese ledger, con origen, destino, importe exacto, USDC e issuer esperados. No se usa un memo con datos del usuario. La asociación es la intención autenticada más la transacción reportada; no prueba que la transferencia se haya originado exclusivamente en Pollar. No se importan transferencias históricas ni se asignan automáticamente transferencias libres.

`pollar_observe` persiste el candidato antes de consultar Stellar. `pollar_settle` bloquea crédito/cuota/intención en una transacción SQL, impide reutilizar `(network,tx_hash)` y actualiza la cuota a `PAID`, método `POLLAR_USDC`, HSK `PENDING`. La última cuota pagada completa el crédito en Supabase. Las filas reservadas y los comprobantes son inmutables. La reserva de efectivo se hace antes de llamar a HSK tanto en el flujo en línea como en el despacho offline existente.

El worker del backend revisa la cola cada 15 segundos, con una concesión SQL exclusiva y reintentos de 60 segundos. Procesa como máximo un candidato y un anclaje por ciclo. No requiere mantener abierto el navegador. HSK confirma únicamente el comprobante exacto para la siguiente cuota del crédito. La recuperación consulta un bloque con al menos dos confirmaciones y compara la prueba antes de reenviar; si ya existe, solo completa el estado en Supabase. No genera éxitos simulados ante fallas del RPC.

`receipt_hash = keccak256(UTF8(JSON.stringify(["libreta:installment:v1", intent.id, hsk_loan_id, installment_number, network, sender, recipient, String(amount), issuer, txHash])))`. `externalTxHash = keccak256(UTF8("stellar:testnet:" + txHash))`. Estos hashes se envían a `confirmPayment`; no se envían nombres, documentos, correos, teléfonos ni contenido del comprobante. El contrato desplegado conserva su ABI. Su campo `lender` representa al operador que registró el crédito, por lo que el alta debe hacerse mediante este backend.

Las nuevas tablas tienen RLS y acceso exclusivo por `service_role`; las funciones de conciliación no son ejecutables por `anon` ni `authenticated`. La autenticación y autorización del perfil ocurren en el backend. La plataforma no recibe los USDC: el destino de la transferencia es la wallet configurada por el prestamista. El anclaje es una atestación técnica, no confirma cumplimiento regulatorio o validez de un contrato privado.

## Criterios de aceptación y límites de la entrega

- Repetir `confirm` con la misma intención/transacción conserva una sola cuota pagada y un único comprobante lógico.
- Usar ese hash para otra cuota produce conflicto y deja esa otra cuota sin pagar.
- Un importe, issuer, dirección o ledger incorrecto no paga la cuota.
- La caída de HSK deja `PAID/PENDING`; al recuperarse pasa a `PAID/SYNCED` sin transferir otra vez.
- La cuota reservada para Pollar rechaza el cobro en efectivo, incluido el lote offline.
- Al completar todas las cuotas el crédito queda `COMPLETED` en Supabase; el anclaje final completa su registro en HSK.
- La transferencia libre sigue disponible y no liquida cuotas. El webhook legado continúa deshabilitado para liquidación (firma HMAC requerida). No se inventa un contrato de webhook del proveedor.
- Esta entrega es para Stellar testnet/HSK testnet. No habilita mainnet ni conversión de deudas BOB a USDC.
- Las pruebas automatizadas cubren verificación, conciliación, SQL y recuperación HSK; no sustituyen la prueba integrada con las cuentas del usuario y su despliegue.

Validación local: backend `npm test -- --runInBand`, `npm run test:settlements:db`, `npm run build`; frontend `npm run lint` y `npm run build`.

## Registro de activación

La migración se ejecutó desde el SQL Editor autorizado del proyecto. Se fijó además el search_path de pollar_protect_intent, reflejado en el SQL local. No se enviaron transacciones Stellar ni HSK durante la prueba SQL; todos los registros ficticios se revirtieron. El historial de snippets del editor conserva el SQL aplicado; no se agregó una entrada manual a supabase_migrations.

Asesor de seguridad tras la activación: 0 errores y 3 advertencias preexistentes (search_path de public.set_updated_at y dos avisos de permisos de public.rls_auto_enable). La advertencia nueva de pollar_protect_intent fue corregida. No se modificaron las funciones preexistentes ajenas a la conciliación.

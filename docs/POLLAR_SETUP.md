> La transferencia de prueba ya fue confirmada por el usuario. Para vincular pagos a cuotas utiliza la nueva [guía de cuotas y anclaje HSK](POLLAR_INSTALLMENTS.md). Los apartados que indican conciliación pendiente describen el estado anterior.

# Pollar en LIBRETA: configuración de testnet

Estado al 12 de septiembre de 2026: SDK oficial `@pollar/react` y `@pollar/core` 0.11.3 integrados en el panel, con verificación de pagos en NestJS. La aplicación LIBRETA ya está creada en Pollar y tiene una clave publicable de testnet. Falta completar su configuración y ejecutar una transacción con sus wallets. No se ha ejecutado un pago en mainnet.

## 1. Configurar Pollar desde la pantalla que tienes abierta

Esta guía parte de tu captura de **Get started**, con la aplicación **LIBRETA** seleccionada y **1 of 5 completed**. Los nombres en negrita corresponden a opciones visibles en esa captura. Las pantallas que se abren después no están en la imagen: allí describimos qué configurar, sin inventar nombres de botones.

### Paso 1. Comprobar aplicación y red

1. Mira la esquina superior izquierda: debe decir **LIBRETA**.
2. Mira arriba a la derecha: **TestNet** debe estar seleccionado, como en tu captura.
3. Déjalo en TestNet durante toda esta prueba.

**Sobre “habilitar Stellar”:** la instrucción anterior era demasiado genérica. En tu pantalla no aparece un botón con ese nombre. El apartado **Fund app wallet** ya habla de **XLM (Stellar base reserve)**: eso indica que el asistente está preparando una wallet de Stellar. Desde esta pantalla, continúa con el fondeo y las trustlines. No necesitas buscar un botón “Enable Stellar” para seguir estos pasos. Si una pantalla posterior ofrece elegir una cadena, selecciona **Stellar**.

### Paso 2. Permitir que tu frontend se conecte

1. En la tarjeta central, haz clic en **Configure allowed domains**. Está debajo de **Configure API keys**.
2. En la configuración que se abra, localiza la lista de dominios u orígenes permitidos.
3. Añade el origen local del frontend:

   ```text
   http://localhost:5173
   ```

4. Guarda los cambios con el control de guardado de esa pantalla.
5. Cuando inicies Vite, comprueba la dirección que muestra la terminal. Si usa otro puerto, por ejemplo `5174`, añade `http://localhost:5174` a la lista. La dirección debe coincidir con la que abres en el navegador.
6. Vuelve a **Get started** y comprueba si este paso aparece completado.

**Resultado esperado:** Pollar permite que la aplicación que abres en localhost solicite la conexión de wallets. No pegues aquí la dirección del backend (`localhost:3001`) como sustituto del frontend.

### Paso 3. Preparar la wallet de la aplicación en Stellar

1. Desde **Get started**, haz clic en **Fund app wallet**.
2. Confirma que el encabezado continúa en **TestNet**.
3. En la pantalla que se abra, busca la wallet de la aplicación y las opciones de fondeo de prueba en **XLM**.
4. Si existe una opción de faucet o fondeo de testnet, úsala siguiendo sus indicaciones. No sabemos el nombre exacto de ese botón a partir de tu captura.
5. Si solo ves una dirección, un QR o una solicitud de depósito, comparte esa pantalla antes de continuar: necesitamos ver qué mecanismo de testnet ofrece tu app.
6. Comprueba que el saldo de XLM de la wallet de la aplicación ya es mayor que cero.

**Qué significa:** XLM es la moneda de Stellar que cubre reservas y comisiones. Tu asistente indica que crear wallets de usuario requiere reservas en XLM. Fondear esta wallet no equivale a cargar USDC en la wallet del usuario que hará el pago.

### Paso 4. Habilitar la recepción de USDC: trustlines

1. Vuelve a **Get started**.
2. Haz clic en **Enable trustlines**, visible debajo de **Fund app wallet**. Si no lo ves completo, baja dentro del panel central usando la barra de desplazamiento de la derecha.
3. Una **trustline** es el permiso de una wallet Stellar para mantener un token concreto, como USDC.
4. En la pantalla que se abra, busca los activos/tokens disponibles. Si permite elegir red o cadena, elige **TestNet / Stellar**.
5. Si aparece **USDC**, abre sus detalles y selecciona o habilita ese activo con el control que muestre la pantalla.
6. Localiza el dato **Issuer** o **Asset issuer** de ese USDC. Es la cuenta que emite el token y normalmente empieza por `G`.
7. Copia el issuer **completo**, no una versión abreviada con `…`. No copies tu propia wallet ni la wallet de la aplicación: necesitamos el emisor del token USDC.
8. Guarda la configuración si la pantalla ofrece guardar.
9. Si USDC no aparece, te pide añadir un activo manualmente, o no encuentras el issuer, comparte una captura de esa pantalla. No elijas una moneda solo porque tiene el mismo símbolo.

**Resultado esperado:** USDC de testnet queda seleccionado en la configuración de activos/trustlines y tienes su issuer completo para el backend. Configurar el activo en el dashboard no prueba que todas las wallets existentes ya tengan la trustline: eso se comprueba al preparar origen y destino.

### Paso 5. Probar el acceso desde LIBRETA (sin la sección Authentication)

**Corrección basada en tu captura:** `Integrations → Authentication` muestra **Coming soon**. Esa sección del dashboard todavía no se puede configurar. No tienes que completar ese panel para intentar el login que ya incluye el SDK; tampoco podemos asegurar qué métodos permite tu app hasta consultar su configuración.

1. Sal de esa sección. Mantén **TestNet** seleccionado.
2. Completa el **paso 6** de abajo: copia la clave publicable completa de tu aplicación testnet.
3. Abre `hacka_Libreta_FRONT/.env.local`. Si no existe, crea ese archivo dentro de la carpeta del frontend.
4. Conserva las variables existentes y añade o actualiza estas dos líneas, sustituyendo el texto de ejemplo por la clave real:

   ```dotenv
   VITE_API_URL=http://localhost:3001
   VITE_POLLAR_PUBLISHABLE_KEY=PEGA_AQUI_TU_CLAVE_PUBLICABLE_COMPLETA
   ```

5. Confirma que agregaste el origen local en **Configure allowed domains** (paso 2).
6. Abre una terminal en la carpeta del frontend y ejecuta:

   ```powershell
   npm run dev
   ```

7. Si ya estaba iniciado, detenlo con `Ctrl+C` y vuelve a ejecutar `npm run dev` para cargar la clave nueva.
8. Abre la dirección que indique Vite, normalmente `http://localhost:5173`. Esta es **tu aplicación LIBRETA**, no el dashboard de Pollar.
9. En LIBRETA, pulsa **Pagar con Pollar**.
10. Pulsa **Conectar wallet Pollar**.
11. Espera a que el SDK cargue los métodos de acceso permitidos para tu app. Si aparece correo/email, puedes usarlo y completar el código recibido. Si aparece Google, sigue su ventana de acceso. Si aparece Freighter y ya tienes esa wallet, puedes usarla en testnet.
12. Al completar el acceso, busca la dirección de origen `G...` en el panel. El pago permanece bloqueado hasta que la sesión esté verificada y el backend tenga el issuer configurado.

**Si no funciona:**

- Si LIBRETA sigue mostrando instrucciones para configurar la clave, revisa el nombre exacto del archivo `.env.local`, la variable y el reinicio de Vite.
- Si el modal no puede cargar las opciones, revisa la clave publicable completa, la conexión y el origen permitido. Usa la opción de reintentar que aparezca.
- Si no aparece ningún método, o Pollar rechaza uno por política, abre **Auth Policy**, que sí aparece en el menú de tu captura, y comparte lo que muestra. No asumimos cuáles son sus controles ni modificamos políticas a ciegas.
- No hace falta instalar otro proveedor como Auth0/Privy solo por ver “Coming soon”. Primero prueba el acceso integrado del SDK.
- Si el proveedor impide el acceso incluso con clave y origen correctos, hará falta revisar la configuración de esa app o pedir soporte a Pollar. El botón local no salta las políticas del servidor.

El SDK oficial documenta correo OTP, Google, GitHub y adaptadores Stellar. Los métodos realmente disponibles se obtienen de la configuración remota: [SDK de Pollar](https://github.com/pollar-xyz/pollar). Esta ruta usa el botón ya implementado en LIBRETA; no requiere cambiar código para abrir el modal.

### Si Google devuelve APPLICATION_HAS_NO_REDIRECT_URIS

Este error significa que Pollar no tiene URLs de retorno OAuth registradas para tu aplicación. Permitir un dominio y registrar una URL de retorno son configuraciones diferentes; Google necesita también la segunda.

1. En el dashboard selecciona **LIBRETA** y **TestNet**.
2. Abre la configuración de la aplicación y localiza **Redirect URIs**, **Redirect URLs** o el campo equivalente para URLs de retorno. La captura disponible no muestra dónde está ese campo; no corresponde al panel `Integrations → Authentication` que muestra Coming soon.
3. Añade el origen exacto donde abres el frontend. Si estás en `http://localhost:5173`, registra:

   ```text
   http://localhost:5173
   ```

4. Guarda el cambio en la aplicación de Pollar.
5. Mantén ese origen también en la lista de dominios/orígenes permitidos.
6. Cierra la ventana anterior de Google, recarga LIBRETA y vuelve a intentar el acceso.

Verificado en el SDK instalado 0.11.3: al no configurar `oauthRedirectUri`, el SDK envía `window.location.origin` como `redirect_uri`. Por tanto, no añadas `/auth/callback`, una barra final o el puerto del backend por suposición. Si abres el frontend con otro puerto, dominio, HTTPS o `127.0.0.1`, registra exactamente ese origen. El valor enviado también se puede comprobar en el parámetro `redirect_uri` de la URL de la ventana OAuth; comparte solo ese valor si necesitas ayuda, no la URL completa con parámetros de sesión.

No se requiere cambiar el código de LIBRETA ni reiniciar Vite para un cambio guardado únicamente en el dashboard. Si no encuentras un campo de retorno, comparte la pantalla de configuración general o Auth Policy para localizarlo. No añadas opciones al azar ni crees credenciales Google por este error: primero completa la lista de retorno de la aplicación Pollar.

### Paso 6. Copiar la clave publicable completa

1. Vuelve a **Get started** y abre **Configure API keys**. Ese paso ya aparece completado en tu captura.
2. Localiza la clave **publishable** de **testnet**.
3. Usa la opción de copiar para obtener su valor completo. El texto corto que muestra el resumen de Get started puede ser solo una vista abreviada.
4. Guárdala en `VITE_POLLAR_PUBLISHABLE_KEY` siguiendo el paso 2 de esta guía.

Nunca uses la clave **secret** en el frontend. Para este flujo no necesitamos una clave secreta de Pollar.

### Antes de continuar

Debes tener estos dos datos:

| Dato | De dónde sale | Dónde se pega |
|---|---|---|
| Clave publicable completa de testnet | Configure API keys | `VITE_POLLAR_PUBLISHABLE_KEY` del frontend |
| Issuer completo del USDC de testnet | Detalles del activo en Enable trustlines | `POLLAR_TESTNET_USDC_ISSUER` del backend |

La captura no muestra el quinto elemento del asistente. No asumimos cuál es ni que todo el asistente esté completo al terminar estos pasos. Si aparece otro requisito, revísalo antes de probar el acceso.

Referencia de los botones: captura del dashboard LIBRETA proporcionada por el usuario. Contexto del SDK y del fondeo: [repositorio oficial de Pollar](https://github.com/pollar-xyz/pollar) y [ejemplo oficial](https://github.com/pollar-xyz/pollar-docs/blob/main/docs/getting-started/example-app.md).

## 2. Configurar frontend y backend

En `hacka_Libreta_FRONT/.env.local`, conserva tus variables HSK y añade:

```dotenv
VITE_API_URL=http://localhost:3001
VITE_POLLAR_PUBLISHABLE_KEY=<clave-publicable-de-tu-app-testnet>
```

En `hacka_Libreta_BACK/.env`, conserva Supabase/HSK y añade:

```dotenv
POLLAR_TESTNET_USDC_ISSUER=<issuer-G-del-USDC-testnet-habilitado-en-Pollar>
```

No hacen falta claves secretas de Pollar para este flujo: el SDK gestiona la sesión y el usuario firma; NestJS consulta evidencia pública en Stellar. Esta implementación fija testnet tanto en el proveedor como en el verificador. `VITE_POLLAR_APP_ID`, `VITE_POLLAR_CHAIN_ID` y `POLLAR_MAINNET_CHAIN_ID` pertenecían al diseño EVM anterior y no se utilizan.

Ejecuta en terminales separadas, desde cada repositorio:

```powershell
# Backend (requiere su configuración Supabase/HSK existente)
npm run start:dev
```

```powershell
# Frontend
npm run dev
```

Reinicia ambos procesos cuando cambies sus variables de entorno.

## 3. Preparar las wallets y probar

1. Prepara dos wallets Stellar de **testnet**: origen y destinatario. No uses fondos reales.
2. Ambas cuentas deben existir en testnet y tener una trustline al mismo issuer USDC configurado. Fondea la cuenta de origen con USDC de prueba usando las opciones de testnet disponibles para tu aplicación/wallet. El fondeo de XLM solo cubre reservas/comisiones; no equivale a tener USDC.
3. Si usas wallets creadas por Pollar, completa su activación/fondeo en el dashboard; el flujo de esta integración no simula aprobaciones KYC ni expone un endpoint público de activación.
4. En LIBRETA abre **Pagar con Pollar**, conecta la wallet de origen y escribe destino e importe (por defecto 1 USDC de prueba).
5. Confirma el envío. El SDK `sendPayment` construye, firma y envía la transacción Stellar a través de Pollar.
6. El backend consulta Horizon testnet y comprueba éxito de la transacción, operación `payment`, hash, origen, destino, importe exacto y código/issuer de USDC. Los importes se comparan con enteros de siete decimales, sin redondeo de coma flotante.
7. Si el resultado sigue pendiente o falla internet, pulsa **Verificar sin volver a pagar**. El envío no se reintenta automáticamente. No cierres ni cambies de pestaña durante la firma.
8. Si recargas, copia el hash del historial de Pollar, introduce los mismos destino e importe y usa la verificación. Conserva el hash incluso si la verificación falla.

## Contrato HTTP implementado

`GET /api/pollar/config` devuelve el envelope habitual `{ success: true, data: { network: 'testnet', assetCode: 'USDC', assetIssuer, configured } }`.

`POST /api/pollar/verify` recibe:

```json
{
  "transactionHash": "<64 caracteres hex sin 0x>",
  "sender": "<wallet Stellar G...>",
  "recipient": "<wallet Stellar G...>",
  "amount": "1"
}
```

Devuelve `{ success: true, data: { status: 'PENDING', transactionHash } }` si Horizon aún no conoce el hash, o `status: 'VERIFIED'` junto con `network`, `transactionHash`, `confirmedAt`, `receiptHash`, `explorerUrl` y `settlesInstallment: false`. Los campos adicionales solo aparecen para evidencia verificada. Un hash inexistente puede permanecer pendiente indefinidamente; no se considera pagado.

Estos endpoints son públicos y de consulta: no escriben en Supabase, no transfieren fondos ni envían datos a HSK. El comprobante es `keccak256('libreta:pollar:stellar:testnet:' + hash)` y su repetición devuelve el mismo identificador. La evidencia de Stellar prueba la transferencia, no demuestra por sí sola que un proveedor particular la originó; conserva también el flujo/historial de Pollar para la demo.

## Límite actual: conciliación de cuotas

Este pago testnet **no cancela una cuota, no ancla un recibo en HSK y no acredita el requisito mainnet del bounty**. El formulario existente de HSK es una atestación manual del prestamista y no ejecuta pagos Pollar.

El antiguo `POST /api/installments/:id/pollar-confirm` queda deshabilitado con 503, porque aceptaba un hash EVM del cliente sin comprobar la transferencia. El antiguo webhook requiere firma HMAC-SHA256 sobre los bytes originales, rechaza firmas ausentes/incorrectas con 401 y devuelve 503 aun con firma válida hasta integrar un contrato de eventos oficial. No hay secreto HMAC por defecto.

Para conciliar cuotas de verdad falta modelar la red Stellar, vincular las wallets al prestatario/prestamista autenticados, fijar importe/moneda en una intención de pago del servidor, persistir y consumir esa intención de forma atómica e idempotente y coordinar el anclaje HSK con reintentos. La tabla existente usa `pollar_chain_id` EVM y hashes `0x...`; no se inventa un chain ID para Stellar ni se guardan pagos testnet en esos campos. El SQL y el contrato Solidity no necesitan una migración para este flujo de prueba.

Antes de mainnet se requiere una implementación explícita de esa conciliación, configuración aprobada por Pollar y prueba del equipo. No basta con cambiar una variable de red.

## Comprobaciones

Frontend: `npm run lint` y `npm run build`.
Backend: `npm test -- --runInBand` y `npm run build`.
Las pruebas nuevas simulan Horizon y cubren éxito, transacción fallida, hash pendiente, error de red, importe inválido, origen/destino/activo incorrectos y protección del webhook. No sustituyen un pago real con la aplicación del equipo.

## Diagnóstico: TX_INSUFFICIENT_FEE / tx_insufficient_balance

Un HTTP 422 solo indica que Pollar rechazó el envío. Para conocer la causa, revisa `code`, `message` y `resultCode` de la respuesta. Los mensajes `Tokens refreshed`, `Session stored` o `Session cleared` describen el ciclo de sesión y no son por sí mismos fallos del pago.

`tx_insufficient_balance` significa que la comisión dejaría a la cuenta pagadora por debajo de la reserva. Compara la dirección `address` del Payload con **Origen** en LIBRETA. El SDK 0.11.3 envía desde la wallet de su sesión activa, y la interfaz ahora muestra esa misma wallet. El enlace **Ver saldo de esta wallet en Stellar testnet** permite inspeccionar la cuenta correcta.

La wallet de la aplicación puede patrocinar la creación y las trustlines de usuarios sin que esas wallets tengan XLM propios. Patrocinar reservas no implica automáticamente patrocinar cada comisión de envío. Tener 10.000 XLM en la cuenta de la aplicación no demuestra que la cuenta del usuario pueda pagar su comisión.

Si la cuenta que envía tiene cero XLM, obtén XLM de prueba para **esa dirección** en [Stellar Lab](https://lab.stellar.org/account/fund), con Testnet seleccionado. Si ya tiene saldo disponible suficiente y el error persiste, identifica la cuenta pagadora con la configuración/logs de Pollar antes de añadir más fondos.

La UI conserva el código del error, no reintenta automáticamente el pago y no trata un resultado `error` como exitoso aunque venga acompañado de un hash. Si existe hash, se conserva para verificar e investigar sin volver a enviar. No se registran tokens de sesión en este diagnóstico.

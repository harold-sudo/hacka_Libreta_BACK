# Desplegar LibretaRegistry en HSK

Desde `hacka_Libreta_BACK`, con Node 22 y dependencias instaladas:

```powershell
npm run hsk:compile
npm run hsk:check:testnet
npm run hsk:deploy:testnet

# Para Mainnet (Chain ID 177):
npm run hsk:check:mainnet
npm run hsk:deploy:mainnet
```

`compile` no usa claves ni red. Produce ABI, bytecode y entrada Standard JSON
para verificar el código fuente en el explorador, en `build/contracts/`.
Compila con solc 0.8.20, optimizador de 200 runs y EVM Paris.
El contrato no tiene argumentos de constructor.

Antes de `check`, configura localmente `.env` (ignorado por Git):

```dotenv
HSK_RPC_URL=https://testnet.hsk.xyz
HSK_CHAIN_ID=133
HSK_OPERATOR_PRIVATE_KEY=<clave privada de una wallet propia>
LIBRETA_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
```

No uses la clave pública de ejemplo ni compartas claves o semillas por chat.
Si prefieres firmar con MetaMask, importa `LibretaRegistry.sol` en Remix,
selecciona Solidity 0.8.20, optimizador 200, EVM Paris y usa Injected Provider
con la red elegida. Después copia la dirección confirmada al `.env`.

`check` valida chain ID, saldo, gas y ausencia de un contrato ya configurado;
no envía transacciones. `deploy` envía una transacción real y guarda su hash
en `deployments/` antes de esperar confirmación. Si se interrumpe, consulta ese
hash en el explorador antes de reintentar para evitar despliegues duplicados.
La estimación de gas no garantiza el costo total final de la red.

Al confirmar, el script compara el bytecode en la red con el compilado y muestra
`LIBRETA_REGISTRY_ADDRESS` para actualizar localmente y reiniciar el backend.
La publicación/verificación del código fuente en el explorador es un paso separado.

Para mainnet usa `HSK_CHAIN_ID=177`, `HSK_RPC_URL=https://mainnet.hsk.xyz`
y sustituye `testnet` por `mainnet` en los comandos. Necesita HSK real.

Redes oficiales: https://docs.hskchain.net/docs/Build-on-HashKey-Chain/network-info
Faucet de testnet: https://faucet.hsk.xyz

## Límites del contrato actual

El contrato guarda direcciones, cuotas y estados además de hashes/timestamps;
esto difiere de la restricción literal de AGENTS.md. No registra datos al desplegar.
No cargar datos reales sin resolver esa diferencia. La confirmación bilateral
se valida fuera del contrato: on-chain solo se exige la firma del prestamista.
Además, el backend actual genera recibos simulados si falla el anclaje: validar
siempre las transacciones en el explorador durante la demo.

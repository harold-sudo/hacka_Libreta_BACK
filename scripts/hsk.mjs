import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import solc from 'solc';
import { ContractFactory, FetchRequest, JsonRpcProvider, Wallet, formatEther, keccak256, isAddress } from 'ethers';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] || 'compile';
const networks = {
  testnet: { id: 133, rpc: 'https://testnet.hsk.xyz', explorer: 'https://testnet-explorer.hsk.xyz' },
  mainnet: { id: 177, rpc: 'https://mainnet.hsk.xyz', explorer: 'https://hashkey.blockscout.com' },
};
let provider;
try {
  if (!['compile', 'check', 'deploy'].includes(mode)) throw new Error('Usa compile, check o deploy seguido de testnet/mainnet.');
  const source = readFileSync(resolve(root, 'contracts/LibretaRegistry.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'LibretaRegistry.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  for (const error of output.errors || []) console.error(error.formattedMessage);
  if (output.errors?.some((error) => error.severity === 'error')) throw new Error('Falló la compilación.');
  const contract = output.contracts['LibretaRegistry.sol'].LibretaRegistry;
  const artifact = {
    compiler: solc.version(),
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
  };
  mkdirSync(resolve(root, 'build/contracts'), { recursive: true });
  writeFileSync(resolve(root, 'build/contracts/LibretaRegistry.json'), JSON.stringify(artifact, null, 2));
  writeFileSync(resolve(root, 'build/contracts/standard-input.json'), JSON.stringify(input, null, 2));
  console.log(`LibretaRegistry compilado: ${artifact.compiler}; EVM paris; optimizer 200.`);
  if (mode !== 'compile') {
    const network = networks[process.argv[3]];
    if (!network) throw new Error('Indica explícitamente testnet o mainnet.');
    try { loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (Number(process.env.HSK_CHAIN_ID) !== network.id) throw new Error(`Configura HSK_CHAIN_ID=${network.id} en .env para la red seleccionada.`);
    const key = process.env.HSK_OPERATOR_PRIVATE_KEY || '';
    if (key.replace(/^0x/, '').toLowerCase() === '0123456789abcdef'.repeat(4)) throw new Error('HSK_OPERATOR_PRIVATE_KEY es una clave pública de ejemplo. Reemplázala localmente por una wallet propia; nunca la compartas en el chat.');
    let wallet;
    try { wallet = new Wallet(key); } catch { throw new Error('Configura una HSK_OPERATOR_PRIVATE_KEY válida en el .env local.'); }
    const request = new FetchRequest(process.env.HSK_RPC_URL || network.rpc);
    request.timeout = 15000;
    provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
    const actualChainId = Number(BigInt(await provider.send('eth_chainId', [])));
    if (actualChainId !== network.id) throw new Error(`RPC en red ${actualChainId}; se esperaba ${network.id}.`);
    wallet = wallet.connect(provider);
    const configured = process.env.LIBRETA_REGISTRY_ADDRESS;
    if (isAddress(configured || '') && await provider.getCode(configured) !== '0x') throw new Error('LIBRETA_REGISTRY_ADDRESS ya contiene un contrato. Revisa ese despliegue antes de crear otro.');
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const tx = await factory.getDeployTransaction();
    const gas = await provider.estimateGas({ ...tx, from: wallet.address });
    const gasLimit = gas * 120n / 100n;
    const fees = await provider.getFeeData();
    const gasPrice = fees.gasPrice;
    if (!gasPrice) throw new Error('RPC no proporcionó precio de gas.');
    const balance = await provider.getBalance(wallet.address);
    console.log(JSON.stringify({ network: process.argv[3], chainId: actualChainId, deployer: wallet.address, balanceHSK: formatEther(balance), gasLimit: gasLimit.toString(), estimatedGasCostHSK: formatEther(gasLimit * gasPrice) }, null, 2));
    if (balance < gasLimit * gasPrice) throw new Error('Saldo insuficiente para el gas estimado. Financia esta wallet con HSK de la red elegida.');
    if (mode === 'deploy') {
      // Save the transaction hash immediately; never retry an uncertain broadcast automatically.
      mkdirSync(resolve(root, 'deployments'), { recursive: true });
      const recordPath = resolve(root, `deployments/${network.id}-${Date.now()}.json`);
      writeFileSync(recordPath, JSON.stringify({ chainId: actualChainId, deployer: wallet.address, status: 'prepared' }, null, 2), { flag: 'wx' });
      const deployed = await factory.deploy({ gasLimit, gasPrice });
      const transaction = deployed.deploymentTransaction();
      const address = await deployed.getAddress();
      const record = { chainId: actualChainId, address, transactionHash: transaction.hash, deployer: wallet.address, compiler: artifact.compiler, status: 'pending' };
      writeFileSync(recordPath, JSON.stringify(record, null, 2));
      console.log(`Transacción enviada: ${network.explorer}/tx/${transaction.hash}`);
      const receipt = await transaction.wait(1, 120000);
      if (!receipt || receipt.status !== 1) throw new Error('Despliegue no confirmado; consulta el hash guardado antes de reintentar.');
      const code = await provider.getCode(address, receipt.blockNumber);
      if (keccak256(code) !== keccak256(artifact.deployedBytecode)) throw new Error('El bytecode desplegado no coincide con el compilado.');
      writeFileSync(recordPath, JSON.stringify({ ...record, status: 'confirmed', blockNumber: receipt.blockNumber, runtimeCodeHash: keccak256(code) }, null, 2));
      console.log(`Contrato verificado por bytecode: ${network.explorer}/address/${address}`);
      console.log(`Configura en el .env local: LIBRETA_REGISTRY_ADDRESS=${address}`);
    }
  }
} catch (error) {
  // Avoid printing RPC URLs, request bodies or signing material from provider errors.
  console.error(error.code ? `Operación fallida (${error.code}). Revisa red, saldo y cualquier hash guardado en deployments/.` : error.message);
  process.exitCode = 1;
} finally {
  provider?.destroy();
}

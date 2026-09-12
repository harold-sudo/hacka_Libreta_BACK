/**
 * Audit listener STANDALONE (sin NestJS): escucha eventos de LibretaRegistry
 * en HSK y los guarda en audit_logs de Supabase con cursor persistente.
 *
 *   node scripts/audit-listener.mjs
 *
 * Depende de .env (HSK_RPC_URL, LIBRETA_REGISTRY_ADDRESS, SUPABASE_*).
 * Requiere aplicar migrations/20260912_audit_logs.sql.
 *
 * La escritura es idempotente (idempotency_key -> upsert ignoreDuplicates) y
 * cuenta con reintentos con backoff para eventos on-chain críticos.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { Contract, JsonRpcProvider, ZeroAddress } from 'ethers';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  loadEnvFile(resolve(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const EVENTS = {
  LoanRegistered: {
    eventType: 'LOAN_REGISTERED',
    fromArgs: (a) => ({
      loan_id: a.loanId.toLowerCase(),
      actor_address: a.lender.toLowerCase(),
      metadata: {
        borrowerWallet: a.borrower.toLowerCase(),
        installments: Number(a.installments),
        blockTimestamp: Number(a.timestamp),
      },
    }),
  },
  PaymentConfirmed: {
    eventType: 'PAYMENT_CONFIRMED',
    fromArgs: (a) => ({
      loan_id: a.loanId.toLowerCase(),
      actor_address: null,
      metadata: {
        installmentNumber: Number(a.installmentNumber),
        receiptHash: a.receiptHash.toLowerCase(),
        isDigital: Boolean(a.isDigital),
        blockTimestamp: Number(a.timestamp),
      },
    }),
  },
  LoanCompleted: {
    eventType: 'LOAN_COMPLETED',
    fromArgs: (a) => ({
      loan_id: a.loanId.toLowerCase(),
      actor_address: a.borrower.toLowerCase(),
      metadata: { blockTimestamp: Number(a.completedAt) },
    }),
  },
};
const EVENT_NAMES = Object.keys(EVENTS);
const WRITER = 'script-listener';
const STATE_TABLE = 'audit_listener_state';
const LOGS_TABLE = 'audit_logs';

const rpcUrl = process.env.HSK_RPC_URL || 'https://testnet.hsk.xyz';
const chainId = Number(process.env.HSK_CHAIN_ID) || 133;
const contractAddress = process.env.LIBRETA_REGISTRY_ADDRESS || ZeroAddress;
const backfillBlocks = Number(process.env.AUDIT_BACKFILL_BLOCKS) || 1000;
const pollMs = Number(process.env.AUDIT_POLL_MS) || 8000;
if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
  throw new Error('LIBRETA_REGISTRY_ADDRESS no válido en .env');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY requerido (service_role).');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function persistLog(log, name) {
  const spec = EVENTS[name];
  const base = spec.fromArgs(log.args);
  const data = {
    ...base,
    tx_hash: log.transactionHash.toLowerCase(),
    block_number: Number(log.blockNumber),
    chain_id: chainId,
    idempotency_key: `onchain:${log.transactionHash.toLowerCase()}:${log.index}:${name.toLowerCase()}`,
  };

  // Reintentos con backoff: un evento on-chain nunca debe perderse.
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { error } = await supabase
      .from(LOGS_TABLE)
      .upsert(data, { onConflict: 'idempotency_key', ignoreDuplicates: true });
    if (!error) return;
    lastError = error;
    console.warn(`  [${name}] reintento ${attempt} falló: ${error.message}`);
    await sleep(Math.min(500 * 2 ** attempt, 10_000));
  }
  console.error(`  [${name}] evento NO persistido: ${lastError?.message}`);
}

async function readCursor() {
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .select('block_number')
    .eq('writer', WRITER)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.warn(`No se pudo leer cursor: ${error.message}`);
  }
  return data ? Number(data.block_number) : null;
}

async function saveCursor(blockNumber) {
  const { error } = await supabase.from(STATE_TABLE).upsert(
    {
      writer: WRITER,
      contract_address: contractAddress.toLowerCase(),
      chain_id: chainId,
      block_number: blockNumber,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'writer' },
  );
  if (error) console.warn(`No se pudo guardar cursor: ${error.message}`);
}

const provider = new JsonRpcProvider(rpcUrl, undefined, {
  pollingInterval: Math.max(2000, pollMs),
});
const contract = new Contract(contractAddress, EVENT_NAMES, provider);

let cursor = 0;
let running = true;

async function processRange(from, to) {
  if (from > to) return;
  for (const name of EVENT_NAMES) {
    const logs = await contract.queryFilter(name, from, to);
    for (const log of logs) {
      await persistLog(log, name);
    }
    if (logs.length) console.log(`  ${name}: ${logs.length} evento(s)`);
  }
}

async function loop() {
  while (running) {
    try {
      const latest = await provider.getBlockNumber();
      if (cursor === 0) {
        const persisted = (await readCursor()) ?? Math.max(0, latest - backfillBlocks);
        cursor = persisted;
        console.log(`Cursor inicial: ${cursor}`);
      }
      if (cursor < latest) {
        await processRange(cursor + 1, latest);
        cursor = latest;
        await saveCursor(cursor);
        console.log(`Sincronizado hasta bloque ${cursor}`);
      }
    } catch (error) {
      console.error(`Ciclo fallido (se reintentará): ${error.message}`);
    }
    await sleep(pollMs);
  }
}

process.on('SIGINT', () => {
  console.log('\nDeteniendo listener...');
  running = false;
  provider.destroy();
  process.exit(0);
});

try {
  await loop();
} catch (error) {
  console.error(`Listener interrumpido: ${error.message}`);
  await saveCursor(cursor);
  process.exitCode = 1;
} finally {
  provider.destroy();
}
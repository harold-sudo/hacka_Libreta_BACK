/**
 * QA SMOKE — integridad de auditoría (zero-PII + listener) y Lock Unlock.
 *
 *   node scripts/qa-smoke.mjs
 *
 * Camina por tres secciones y reporta PASS / FAIL / SKIP:
 *   1) HSK Chain: LibretaRegistry desplegado y legible.
 *   2) Unlock Protocol: PublicLock desplegado y getHasValidKey legible.
 *   3) Supabase: migración aplicada, cursor del listener y escaneo zero-PII
 *      de los últimos audit_logs.
 *
 * Las secciones sin configuración en .env se omiten (SKIP); si configuraste
 * TODO, es una comprobación E2E real. Exit code 0 = todo OK (o skipeado).
 * Los casos de firma/key/expirado quedan cubiertos por los tests unitarios
 * de Jest en src/infrastructure (archivos *.spec.ts) sin necesidad de red.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { Contract, FetchRequest, JsonRpcProvider, ZeroHash, ZeroAddress } from 'ethers';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  loadEnvFile(resolve(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const stats = { pass: 0, fail: 0, skip: 0 };
const failures = [];

function check(name, ok, detail = '') {
  if (ok === null) {
    stats.skip += 1;
    console.log(`  SKIP  ${name}`);
    return;
  }
  if (ok) {
    stats.pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    stats.fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const isAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

function providerFor(rpcUrl) {
  const request = new FetchRequest(rpcUrl);
  request.timeout = 8000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
}

// ---------------------------------------------------------------------------
console.log('\n[1] HSK Chain · LibretaRegistry');
const registry = process.env.LIBRETA_REGISTRY_ADDRESS || '';
const hskRpc = process.env.HSK_RPC_URL || 'https://testnet.hsk.xyz';
if (!isAddr(registry)) {
  check('LibretaRegistry configurado', null, 'sin LIBRETA_REGISTRY_ADDRESS');
} else {
  const provider = providerFor(hskRpc);
  try {
    const latest = await provider.getBlockNumber();
    check(`RPC HSK accesible (bloque ${latest})`, latest > 0, hskRpc);
    const code = await provider.getCode(registry);
    check('Código de contrato desplegado', code !== '0x', registry);
    if (code !== '0x') {
      const contract = new Contract(registry, LIBRETA_ABI, provider);
      const proofs = await contract.getLoanProofs(ZeroHash);
      check('getLoanProofs legible (ABI correcto)', Array.isArray(proofs));
    }
  } catch (error) {
    check('Bloque HSK + contrato', false, error.message);
  } finally {
    provider.destroy();
  }
}

// ---------------------------------------------------------------------------
console.log('\n[2] Unlock Protocol · PublicLock');
const lock = process.env.UNLOCK_LOCK_ADDRESS || '';
const unlockRpc = process.env.UNLOCK_NETWORK_RPC || 'https://mainnet.base.org';
if (!isAddr(lock)) {
  check('PublicLock configurado', null, 'sin UNLOCK_LOCK_ADDRESS');
} else {
  const provider = providerFor(unlockRpc);
  try {
    const code = await provider.getCode(lock);
    check('Código del Lock desplegado', code !== '0x', lock);
    if (code !== '0x' && code !== '0x0') {
      const contract = new Contract(lock, UNLOCK_LOCK_ABI, provider);
      const result = await contract.getHasValidKey(ZeroAddress);
      check(
        'getHasValidKey legible y booleano',
        typeof result === 'boolean',
        `devuelve ${typeof result}`,
      );
    }
  } catch (error) {
    check('Bloque Unlock + Lock', false, error.message);
  } finally {
    provider.destroy();
  }
}

// ---------------------------------------------------------------------------
console.log('\n[3] Supabase · Auditoría zero-PII');
const sbUrl = process.env.SUPABASE_URL || '';
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SENSITIVE_RE = /(name|phone|ci|dni|email|otp|password|secret|national)/i;

if (!sbUrl || !sbKey) {
  check('Supabase configurado', null, 'sin SUPABASE_URL/SERVICE_ROLE_KEY');
} else {
  const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  try {
    for (const table of ['audit_logs', 'audit_outbox', 'audit_listener_state']) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      check(`Migración aplicada: ${table}`, !error, error?.message ?? '');
    }

    const { data: cursor } = await supabase
      .from('audit_listener_state')
      .select('*');
    if (Array.isArray(cursor)) {
      const writers = cursor.map((r) => `${r.writer}@${r.block_number}`).join(', ') || 'ninguno';
      check('Cursor del listener presente', cursor.length > 0, writers);
    } else {
      check('Cursor del listener presente', false);
    }

    // Zero-PII: revisar las últimas filas y que metadata no contenga claves
    // de datos personales en claro.
    const { data: logs, error: logsErr } = await supabase
      .from('audit_logs')
      .select('id,event_type,metadata,loan_id,actor_address')
      .order('created_at', { ascending: false })
      .limit(50);
    if (logsErr) {
      check('Audit_logs legible', false, logsErr.message);
    } else {
      check('Audit_logs legible', Array.isArray(logs));
      if (Array.isArray(logs)) {
        if (logs.length === 0) {
          check('Escaneo zero-PII en logs', null, 'tabla vacía');
        } else {
          const contaminated = logs.flatMap((row, idx) => {
            const meta = row.metadata ?? {};
            const keys = Object.keys(meta);
            const hits = keys.filter((k) => SENSITIVE_RE.test(k));
            const badValues = JSON.stringify(meta).match(/(name|phone|dni|email|otp|password|secret)/gi) ?? [];
            return hits.map((k) => `log#${idx} metadata.${k}`).concat(badValues.map((v) => `log#${idx} valor "${v}"`));
          });
          const sample = `${logs.length} filas (${logs.map((l) => l.event_type).join(',')})`;
          check('Escaneo zero-PII en logs', contaminated.length === 0, contaminated[0] || sample);
          if (logs.length > 0 && failures.length === 0) console.log(`  INFO  ${sample}`);
        }
      }
    }

    const { data: agg, error: aggErr } = await supabase.rpc('libreta_audit_counts');
    check(
      'RPC libreta_audit_counts disponible',
      !aggErr && Array.isArray(agg),
      aggErr?.message ?? '',
    );
  } catch (error) {
    check('Sección Supabase', false, error.message);
  }
}

// ---------------------------------------------------------------------------
console.log(
  `\nRESULTADO: ${stats.pass} PASS · ${stats.fail} FAIL · ${stats.skip} SKIP`,
);
if (failures.length > 0) {
  console.log('Fallos:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}

const LIBRETA_ABI = [
  'function getLoanProofs(bytes32 _loanId) external view returns (tuple(bytes32 receiptHash, uint16 installmentNumber, uint256 timestamp, bool isDigital, bytes32 externalTxHash)[])',
  'function loans(bytes32 _loanId) external view returns (bytes32 loanHash, address lender, address borrower, uint16 totalInstallments, uint16 paidInstallments, uint256 createdAt, uint256 completedAt, uint8 status)',
];

const UNLOCK_LOCK_ABI = [
  'function getHasValidKey(address _recipient) external view returns (bool)',
  'function keyExpirationTimestampFor(address _recipient) external view returns (uint256)',
];
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { AuditListenerService } from './audit-listener.service';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from './audit.service';
import { Contract } from 'ethers';

type Msg = Record<string, unknown>;

function makeConfig(): ConfigService {
  return {
    get: (key: string) =>
      ({
        LIBRETA_REGISTRY_ADDRESS: '0xaa',
        HSK_CHAIN_ID: '133',
        HSK_RPC_URL: 'https://testnet.hsk.xyz',
        AUDIT_LISTENER_ENABLED: 'false',
        AUDIT_BACKFILL_BLOCKS: '10',
      })[key],
  } as unknown as ConfigService;
}

function makeService() {
  const record = jest.fn().mockResolvedValue(undefined);
  const listener = new AuditListenerService(
    makeConfig(),
    { getAdminClient: jest.fn() } as unknown as SupabaseService,
    { record } as unknown as AuditService,
  );
  return {
    listener,
    record,
    svc: listener as unknown as {
      processEvent: (n: string, e: Msg) => Promise<void>;
    },
  };
}

const SENSITIVE_RE = /(name|phone|ci|dni|email|otp|password|secret|national)/i;

function assertZeroPii(metadata: Msg) {
  const flatten: string[] = [];
  const walk = (v: unknown, path = '') => {
    if (v && typeof v === 'object') {
      Object.entries(v as Record<string, unknown>).forEach(([k, val]) =>
        walk(val, `${path}.${k}`),
      );
    } else if (
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      typeof v === 'bigint'
    ) {
      flatten.push(`${path}=${String(v)}`);
    }
  };
  walk(metadata);
  Object.keys(metadata).forEach((k) => {
    expect(k).not.toMatch(SENSITIVE_RE);
  });
  // Los valores numéricos/hashes tampoco pueden coincidir con plantillas PII.
  flatten.forEach((f) => {
    expect(f).not.toMatch(/(name|phone|dni|email|otp)/i);
  });
}

describe('AuditListenerService.processEvent (mapping on-chain → audit_logs)', () => {
  it('procesa el log dentro del payload real de suscripción ethers v6', async () => {
    const { listener, record } = makeService();
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    const contract = {
      on: (name: string, callback: (...args: unknown[]) => void) => {
        callbacks.set(name, callback);
      },
    } as unknown as Contract;
    const live = listener as unknown as {
      attachListeners: (contract: Contract) => void;
      handleQueue: Promise<void>;
    };
    live.attachListeners(contract);
    callbacks.get('PaymentConfirmed')?.({
      log: {
        args: {
          loanId: '0xCC',
          installmentNumber: 3n,
          receiptHash: '0xDD',
          isDigital: true,
          timestamp: 1700000002n,
        },
        blockNumber: 102,
        transactionHash: '0xtx3',
        index: 2,
      },
    });
    await live.handleQueue;
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAYMENT_CONFIRMED',
        txHash: '0xtx3',
        blockNumber: 102,
        idempotencyKey: 'onchain:0xtx3:2:payment_confirmed',
      }),
    );
  });

  it('mapea LoanRegistered con actor=lender, metadata sin PII y key idempotente', async () => {
    const { svc, record } = makeService();
    await svc.processEvent('LoanRegistered', {
      args: {
        loanId: '0xAA',
        lender: '0xBEEF',
        borrower: '0xF00D',
        installments: 5n,
        timestamp: 1700000000n,
      },
      blockNumber: 100,
      transactionHash: '0xtx1',
      index: 0,
    });

    expect(record).toHaveBeenCalledTimes(1);
    const e = record.mock.calls[0][0];
    expect(e.eventType).toBe('LOAN_REGISTERED');
    expect(e.loanId).toBe('0xaa');
    expect(e.actorAddress).toBe('0xbeef');
    expect(e.chainId).toBe(133);
    expect(e.txHash).toBe('0xtx1');
    expect(e.idempotencyKey).toBe('onchain:0xtx1:0:loan_registered');
    expect(e.metadata).toMatchObject({
      installments: 5,
      borrowerWallet: '0xf00d',
    });
    assertZeroPii(e.metadata);
  });

  it('mapea LoanCompleted con actor=borrower', async () => {
    const { svc, record } = makeService();
    await svc.processEvent('LoanCompleted', {
      args: { loanId: '0xBB', borrower: '0xABCD', completedAt: 1700000001n },
      blockNumber: 101,
      transactionHash: '0xtx2',
      index: 1,
    });

    const e = record.mock.calls[0][0];
    expect(e.eventType).toBe('LOAN_COMPLETED');
    expect(e.actorAddress).toBe('0xabcd');
    expect(e.loanId).toBe('0xbb');
    expect(e.idempotencyKey).toBe('onchain:0xtx2:1:loan_completed');
    assertZeroPii(e.metadata);
  });

  it('mapea PaymentConfirmed sin actor (solo tx_info) y con receiptHash lowercase', async () => {
    const { svc, record } = makeService();
    await svc.processEvent('PaymentConfirmed', {
      args: {
        loanId: '0xCC',
        installmentNumber: 3n,
        receiptHash: '0xDD',
        isDigital: false,
        timestamp: 1700000002n,
      },
      blockNumber: 102,
      transactionHash: '0xtx3',
      index: 2,
    });

    const e = record.mock.calls[0][0];
    expect(e.eventType).toBe('PAYMENT_CONFIRMED');
    expect(e.actorAddress).toBeNull();
    expect(e.metadata).toMatchObject({
      installmentNumber: 3,
      receiptHash: '0xdd',
      isDigital: false,
    });
    expect(e.idempotencyKey).toBe('onchain:0xtx3:2:payment_confirmed');
    assertZeroPii(e.metadata);
  });

  it('ignora eventos desconocidos sin escribir registros', async () => {
    const { svc, record } = makeService();
    await svc.processEvent('UnknownThing', {
      args: {},
      blockNumber: 103,
      transactionHash: '0xtx4',
      index: 0,
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('actualiza el cursor al último bloque procesado', async () => {
    const { listener, svc } = makeService();
    await svc.processEvent('LoanCompleted', {
      args: { loanId: '0xBB', borrower: '0xABCD', completedAt: 1700000003n },
      blockNumber: 999,
      transactionHash: '0xtx5',
      index: 3,
    });
    expect(
      (listener as unknown as { lastSyncedBlock: number }).lastSyncedBlock,
    ).toBe(999);
  });
});

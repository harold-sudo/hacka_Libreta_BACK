jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { AuditService } from './audit.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { IAuditLogRepository } from '../../core/interfaces/audit-log-repository.interface';

jest.setTimeout(30_000);

type OutboxRow = {
  id: string;
  event_type: string;
  loan_id: string | null;
  actor_address: string | null;
  metadata: Record<string, unknown> | null;
  tx_hash: string | null;
  block_number: number | null;
  chain_id: number | null;
  idempotency_key: string;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
};

function makeSupabaseMock(
  outboxRead: { data: OutboxRow[] | null; error: Error | null } | null,
) {
  const inserted: unknown[] = [];
  const updates: unknown[] = [];
  const deletes: unknown[] = [];

  const from = jest.fn().mockImplementation((table: string) => {
    if (table !== 'audit_outbox') {
      throw new Error(`tabla inesperada: ${table}`);
    }
    return {
      select: jest.fn().mockReturnValue({
        lt: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn(() =>
              Promise.resolve(outboxRead ?? { data: null, error: null }),
            ),
          }),
        }),
      }),
      insert: jest.fn((row: unknown) => {
        inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      }),
      update: jest.fn((set: unknown) => ({
        eq: jest.fn(() => {
          updates.push({ set });
          return Promise.resolve({ data: null, error: null });
        }),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => {
          deletes.push('deleted');
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    };
  });

  return {
    inserted,
    updates,
    deletes,
    getAdminClient: () => ({ from }),
  };
}

describe('AuditService', () => {
  it('registra el evento directo normalizando direcciones en lowercase', async () => {
    const supabase = makeSupabaseMock(null) as unknown as SupabaseService;
    const record = jest
      .fn()
      .mockResolvedValue({ event_type: 'LOAN_REGISTERED' });
    const service = new AuditService(supabase, {
      record,
    } as unknown as IAuditLogRepository);

    await service.record({
      eventType: 'LOAN_REGISTERED',
      loanId:
        '0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
      actorAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      txHash: '0x1234',
      metadata: { installments: 4 },
      idempotencyKey: 'onchain:0x1234:0:loan_registered',
    });

    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0][0];
    expect(entry.event_type).toBe('LOAN_REGISTERED');
    expect(entry.loan_id).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    );
    expect(entry.actor_address).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(entry.metadata).toEqual({ installments: 4 });
    expect(supabase).toBeDefined();
  });

  it('encola al outbox durable si la escritura directa falla (3 reintentos)', async () => {
    const supabase = makeSupabaseMock(null) as unknown as SupabaseService;
    const record = jest.fn().mockRejectedValue(new Error('supabase down'));
    const service = new AuditService(supabase, {
      record,
    } as unknown as IAuditLogRepository);

    await service.record({
      eventType: 'PAYMENT_CONFIRMED',
      loanId: '0xbfe0',
      actorAddress: '0x0000000000000000000000000000000000000001',
      metadata: { installmentNumber: 2 },
      idempotencyKey: 'k-1',
    });

    expect(record).toHaveBeenCalledTimes(3);
    const client = supabase as unknown as ReturnType<typeof makeSupabaseMock>;
    expect(client.inserted).toHaveLength(1);
    const outbox = client.inserted[0] as Record<string, unknown>;
    expect(outbox.idempotency_key).toBe('k-1');
  });

  it('genera idempotency_key aleatorio si no vino del llamador y hay fallo directo', async () => {
    const supabase = makeSupabaseMock(null) as unknown as SupabaseService;
    const record = jest.fn().mockRejectedValue(new Error('supabase down'));
    const service = new AuditService(supabase, {
      record,
    } as unknown as IAuditLogRepository);

    await service.record({
      eventType: 'AUDIT_DOSSIER_GENERATED',
      actorAddress: '0x0000000000000000000000000000000000000001',
    });

    const key = (supabase as unknown as ReturnType<typeof makeSupabaseMock>)
      .inserted[0] as { idempotency_key: string };
    expect(typeof key.idempotency_key).toBe('string');
    expect(key.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no escribe nada si no hay filas pendientes en el outbox', async () => {
    const supabase = makeSupabaseMock({ data: [], error: null });
    const record = jest.fn().mockResolvedValue({});
    const service = new AuditService(
      supabase as unknown as SupabaseService,
      {
        record,
      } as unknown as IAuditLogRepository,
    );

    await service.flushOutbox();

    expect(record).not.toHaveBeenCalled();
  });

  it('drena filas exitosas y las borra del outbox', async () => {
    const row = {
      id: 'row-1',
      event_type: 'LOAN_REGISTERED',
      loan_id: '0xab',
      actor_address: '0xcd',
      metadata: { installments: 3 },
      tx_hash: '0xef',
      block_number: 42,
      chain_id: 133,
      idempotency_key: 'k-outbox',
      attempts: 0,
      next_attempt_at: new Date(0).toISOString(),
      last_error: null,
      created_at: new Date(0).toISOString(),
    } as OutboxRow;
    const supabase = makeSupabaseMock({ data: [row], error: null });
    const record = jest.fn().mockResolvedValue({});
    const service = new AuditService(
      supabase as unknown as SupabaseService,
      {
        record,
      } as unknown as IAuditLogRepository,
    );

    await service.flushOutbox();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      idempotency_key: 'k-outbox',
    });
    const client = supabase;
    expect(client.deletes).toHaveLength(1);
  });

  it('reintenta filas fallidas con backoff (incrementa attempts)', async () => {
    const row = {
      id: 'row-fail',
      event_type: 'PAYMENT_CONFIRMED',
      loan_id: null,
      actor_address: null,
      metadata: {},
      tx_hash: null,
      block_number: null,
      chain_id: 133,
      idempotency_key: 'k-fail',
      attempts: 2,
      next_attempt_at: new Date(0).toISOString(),
      last_error: null,
      created_at: new Date(0).toISOString(),
    } as OutboxRow;
    const supabase = makeSupabaseMock({ data: [row], error: null });
    const record = jest.fn().mockRejectedValue(new Error('boom'));
    const service = new AuditService(
      supabase as unknown as SupabaseService,
      {
        record,
      } as unknown as IAuditLogRepository,
    );

    await service.flushOutbox();

    const client = supabase;
    expect(client.deletes).toHaveLength(0);
    expect(client.updates).toHaveLength(1);
    const update = client.updates[0] as {
      set: { attempts: number; next_attempt_at: string; last_error: string };
    };
    expect(update.set.attempts).toBe(3);
    expect(new Date(update.set.next_attempt_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(update.set.last_error).toBe('boom');
  });

  it('evita drenar dos veces en paralelo (guarda de concurrencia)', async () => {
    const supabase = makeSupabaseMock({ data: [], error: null });
    const service = new AuditService(
      supabase as unknown as SupabaseService,
      {
        record: jest.fn(),
      } as unknown as IAuditLogRepository,
    );

    // Simula un flush ya en ejecución
    (service as unknown as { flushing: boolean }).flushing = true;
    await service.flushOutbox();

    const client = supabase;
    expect(client.getAdminClient().from).not.toHaveBeenCalled();
  });
});

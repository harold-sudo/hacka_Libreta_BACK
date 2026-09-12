import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AuditEventType,
  AuditLogEntry,
} from '../../core/domain/audit-log.entity';
import type { IAuditLogRepository } from '../../core/interfaces/audit-log-repository.interface';
import { SupabaseService } from '../supabase/supabase.service';

interface AuditOutboxRow {
  id: string;
  event_type: AuditEventType;
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
}

export interface AuditRecordInput {
  eventType: AuditEventType;
  loanId?: string | null;
  actorAddress?: string | null;
  metadata?: Record<string, unknown>;
  txHash?: string | null;
  blockNumber?: number | null;
  chainId?: number | null;
  idempotencyKey?: string;
}

const FLUSH_INTERVAL_MS = 30_000;
const OUTBOX_BATCH = 50;

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject('IAuditLogRepository')
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      void this.flushOutbox();
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref?.();
    void this.flushOutbox();
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  /**
   * Registra un evento de auditoría. Intenta la escritura directa con
   * reintentos; si Supabase está caído, el evento se persiste en el outbox
   * durable para ser drenado con backoff sin perder datos.
   */
  async record(input: AuditRecordInput): Promise<void> {
    const entry: Partial<AuditLogEntry> = {
      event_type: input.eventType,
      loan_id: input.loanId?.toLowerCase() ?? null,
      actor_address: input.actorAddress?.toLowerCase() ?? null,
      metadata: input.metadata ?? undefined,
      tx_hash: input.txHash?.toLowerCase() ?? null,
      block_number: input.blockNumber ?? null,
      chain_id: input.chainId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    };

    try {
      await this.writeDirectWithRetry(entry);
    } catch (error) {
      this.logger.warn(
        `Audit direct write failed (${(error as Error).message}); enqueuing to durable outbox`,
      );
      await this.enqueueOutbox(entry);
    }
  }

  /**
   * Drena los eventos pendientes del outbox aplicando backoff exponencial por
   * fila. Idempotente: se apoya en idempotency_key (upsert ignoreDuplicates).
   */
  async flushOutbox(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const client = this.supabaseService.getAdminClient();
      const { data, error } = await client
        .from('audit_outbox')
        .select('*')
        .lt('next_attempt_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(OUTBOX_BATCH);

      if (error) throw new Error(`outbox read: ${error.message}`);
      if (!data || data.length === 0) return;

      for (const row of data as unknown as AuditOutboxRow[]) {
        try {
          await this.auditLogRepository.record({
            event_type: row.event_type,
            loan_id: row.loan_id,
            actor_address: row.actor_address,
            metadata: row.metadata ?? undefined,
            tx_hash: row.tx_hash,
            block_number: row.block_number,
            chain_id: row.chain_id,
            idempotency_key: row.idempotency_key,
          });
          await client.from('audit_outbox').delete().eq('id', row.id);
        } catch (err) {
          const nextAttempt = row.attempts + 1;
          await client
            .from('audit_outbox')
            .update({
              attempts: nextAttempt,
              next_attempt_at: new Date(
                Date.now() + this.backoffMs(nextAttempt),
              ).toISOString(),
              last_error: (err as Error).message,
            })
            .eq('id', row.id);
        }
      }
    } catch (error) {
      this.logger.error(
        `Audit outbox flush failed: ${(error as Error).message}`,
      );
    } finally {
      this.flushing = false;
    }
  }

  private async writeDirectWithRetry(
    entry: Partial<AuditLogEntry>,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.auditLogRepository.record(entry);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(500 * attempt, 2000)),
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async enqueueOutbox(entry: Partial<AuditLogEntry>): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .from('audit_outbox')
      .insert({
        event_type: entry.event_type,
        loan_id: entry.loan_id,
        actor_address: entry.actor_address,
        metadata: entry.metadata ?? {},
        tx_hash: entry.tx_hash,
        block_number: entry.block_number,
        chain_id: entry.chain_id,
        idempotency_key: entry.idempotency_key ?? randomUUID(),
      });

    if (error) {
      this.logger.error(
        `Audit outbox insert failed (message lost): ${error.message}`,
      );
    }
  }

  private backoffMs(attempt: number): number {
    const seconds = Math.min(5 * 3 ** (attempt - 1), 300);
    return seconds * 1000;
  }
}

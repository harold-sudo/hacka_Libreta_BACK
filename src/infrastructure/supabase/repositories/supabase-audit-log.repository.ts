import { Injectable, Logger } from '@nestjs/common';
import {
  IAuditLogRepository,
  AuditLogPage,
  AuditLogWhere,
} from '../../../core/interfaces/audit-log-repository.interface';
import { AuditLogEntry } from '../../../core/domain/audit-log.entity';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class SupabaseAuditLogRepository implements IAuditLogRepository {
  private readonly logger = new Logger(SupabaseAuditLogRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async record(entry: Partial<AuditLogEntry>): Promise<AuditLogEntry> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('audit_logs')
      .upsert(entry, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select();

    if (error) {
      this.logger.error(`Error storing audit log: ${error.message}`);
      throw new Error(error.message);
    }
    // Con ignoreDuplicates, un conflicto de idempotency_key no devuelve filas:
    // el evento ya estaba registrado, así que se considera éxito.
    if (data && data.length > 0) {
      return data[0] as AuditLogEntry;
    }
    return entry as AuditLogEntry;
  }

  async query(
    where: AuditLogWhere,
    paging: { limit: number; offset: number },
  ): Promise<AuditLogPage> {
    const { limit, offset } = paging;
    let query = this.supabaseService
      .getAdminClient()
      .from('audit_logs')
      .select('*', { count: 'exact' });
    if (where.eventType) query = query.eq('event_type', where.eventType);
    if (where.loanId) query = query.eq('loan_id', where.loanId);
    if (where.actor) query = query.eq('actor_address', where.actor);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Error querying audit logs: ${error.message}`);
      return { data: [], total: 0, limit, offset };
    }
    return {
      data: (data as AuditLogEntry[]) ?? [],
      total: count ?? 0,
      limit,
      offset,
    };
  }

  async countByEventType(): Promise<{ event_type: string; count: number }[]> {
    // Agregado en SQL para no traer la tabla completa y contar en JS.
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('libreta_audit_counts');

    if (error || !Array.isArray(data)) {
      this.logger.error(
        `Error counting audit logs: ${error?.message ?? 'rpc returned no array'}`,
      );
      return [];
    }
    return data as { event_type: string; count: number }[];
  }
}

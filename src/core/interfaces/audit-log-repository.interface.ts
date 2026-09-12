import { AuditLogEntry } from '../domain/audit-log.entity';

export interface AuditLogWhere {
  eventType?: string;
  loanId?: string;
  actor?: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface IAuditLogRepository {
  record(entry: Partial<AuditLogEntry>): Promise<AuditLogEntry>;
  query(
    where: AuditLogWhere,
    paging: { limit: number; offset: number },
  ): Promise<AuditLogPage>;
  countByEventType(): Promise<{ event_type: string; count: number }[]>;
}

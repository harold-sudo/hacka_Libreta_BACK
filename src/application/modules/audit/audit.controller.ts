import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { SupabaseAuditLogRepository } from '../../../infrastructure/supabase/repositories/supabase-audit-log.repository';
import { AuditKeyGuard } from './audit-key.guard';
import { QueryAuditDto } from './dto/query-audit.dto';

@Controller('api/audit')
@UseGuards(AuditKeyGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly auditLogRepository: SupabaseAuditLogRepository,
  ) {}

  @Get()
  async query(@Query() query: QueryAuditDto) {
    return this.auditLogRepository.query(
      {
        eventType: query.eventType,
        loanId: query.loanId,
        actor: query.actor,
      },
      { limit: query.limit ?? 50, offset: query.offset ?? 0 },
    );
  }

  @Get('summary')
  async summary() {
    const breakdown = await this.auditLogRepository.countByEventType();
    const total = breakdown.reduce((acc, row) => acc + row.count, 0);
    return { total, breakdown };
  }
}

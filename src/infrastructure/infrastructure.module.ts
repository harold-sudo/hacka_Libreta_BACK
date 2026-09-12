import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseService } from './supabase/supabase.service';
import { SupabaseProfileRepository } from './supabase/repositories/supabase-profile.repository';
import { SupabaseLoanRepository } from './supabase/repositories/supabase-loan.repository';
import { SupabaseInstallmentRepository } from './supabase/repositories/supabase-installment.repository';
import { SupabaseRouteRepository } from './supabase/repositories/supabase-route.repository';
import { SupabaseSyncQueueRepository } from './supabase/repositories/supabase-sync-queue.repository';
import { SupabaseAuditLogRepository } from './supabase/repositories/supabase-audit-log.repository';
import { HskBlockchainService } from './blockchain/hsk-blockchain.service';
import { UnlockVerifierService } from './unlock/unlock-verifier.service';
import { AuditService } from './audit/audit.service';
import { AuditListenerService } from './audit/audit-listener.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SupabaseService,
    SupabaseProfileRepository,
    SupabaseLoanRepository,
    SupabaseInstallmentRepository,
    SupabaseRouteRepository,
    SupabaseSyncQueueRepository,
    SupabaseAuditLogRepository,
    HskBlockchainService,
    UnlockVerifierService,
    AuditService,
    AuditListenerService,
    // Dependency Inversion Tokens
    { provide: 'IProfileRepository', useClass: SupabaseProfileRepository },
    { provide: 'ILoanRepository', useClass: SupabaseLoanRepository },
    {
      provide: 'IInstallmentRepository',
      useClass: SupabaseInstallmentRepository,
    },
    { provide: 'IRouteRepository', useClass: SupabaseRouteRepository },
    { provide: 'ISyncQueueRepository', useClass: SupabaseSyncQueueRepository },
    { provide: 'IAuditLogRepository', useClass: SupabaseAuditLogRepository },
    { provide: 'IBlockchainService', useClass: HskBlockchainService },
    { provide: 'IUnlockVerifierService', useClass: UnlockVerifierService },
  ],
  exports: [
    SupabaseService,
    SupabaseProfileRepository,
    SupabaseLoanRepository,
    SupabaseInstallmentRepository,
    SupabaseRouteRepository,
    SupabaseSyncQueueRepository,
    SupabaseAuditLogRepository,
    HskBlockchainService,
    UnlockVerifierService,
    AuditService,
    'IProfileRepository',
    'ILoanRepository',
    'IInstallmentRepository',
    'IRouteRepository',
    'ISyncQueueRepository',
    'IAuditLogRepository',
    'IBlockchainService',
    'IUnlockVerifierService',
  ],
})
export class InfrastructureModule {}

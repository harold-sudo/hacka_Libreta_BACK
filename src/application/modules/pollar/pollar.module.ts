import { Module } from '@nestjs/common';
import { PollarController } from './pollar.controller';
import { PollarService } from './pollar.service';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { SettlementRepository } from './settlement.repository';
import { SettlementAnchorService } from './settlement-anchor.service';
import { PollarSessionController } from './session.controller';

@Module({
  controllers: [
    PollarController,
    SettlementController,
    PollarSessionController,
  ],
  providers: [
    PollarService,
    SettlementRepository,
    SettlementAnchorService,
    SettlementService,
  ],
})
export class PollarModule {}

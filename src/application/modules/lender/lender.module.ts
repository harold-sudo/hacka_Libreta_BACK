import { Module } from '@nestjs/common';
import { LenderController } from './lender.controller';
import { LenderService } from './lender.service';

@Module({
  controllers: [LenderController],
  providers: [LenderService],
  exports: [LenderService],
})
export class LenderModule {}

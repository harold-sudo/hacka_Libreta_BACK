import { Module } from '@nestjs/common';
import { CollectorController } from './collector.controller';
import { LenderRoutesController } from './lender-routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [CollectorController, LenderRoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}

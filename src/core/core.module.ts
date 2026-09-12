import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LriCalculatorService } from './services/lri-calculator.service';
import { CryptoEngineService } from './services/crypto-engine.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LriCalculatorService, CryptoEngineService],
  exports: [LriCalculatorService, CryptoEngineService],
})
export class CoreModule {}

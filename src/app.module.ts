import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { LoansModule } from './application/modules/loans/loans.module';
import { BorrowerModule } from './application/modules/borrower/borrower.module';
import { InstallmentsModule } from './application/modules/installments/installments.module';
import { SyncModule } from './application/modules/sync/sync.module';
import { WebhooksModule } from './application/modules/webhooks/webhooks.module';
import { PassportsModule } from './application/modules/passports/passports.module';
import { RoutesModule } from './application/modules/routes/routes.module';
import { LenderModule } from './application/modules/lender/lender.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PollarModule } from './application/modules/pollar/pollar.module';
import { AuthModule } from './application/modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CoreModule,
    AuthModule,
    PollarModule,
    InfrastructureModule,
    LoansModule,
    BorrowerModule,
    InstallmentsModule,
    SyncModule,
    WebhooksModule,
    PassportsModule,
    RoutesModule,
    LenderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

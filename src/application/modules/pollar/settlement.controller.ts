import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SettlementService } from './settlement.service';
import type { AuthRequest } from './settlement.types';

class WalletDto {
  @IsString() @Matches(/^G[A-Z2-7]{55}$/) address: string;
}
class ReportDto {
  @IsString() @Matches(/^[a-fA-F0-9]{64}$/) transactionHash: string;
}

@Controller('api/pollar/settlements')
@UseGuards(SupabaseAuthGuard)
export class SettlementController {
  constructor(private readonly service: SettlementService) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.service.list(req.user.id);
  }
  @Post('receiving-wallet') receiving(
    @Req() req: AuthRequest,
    @Body() dto: WalletDto,
  ) {
    return this.service.receivingWallet(req.user.id, dto.address);
  }
  @Post('installments/:id/intent') create(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WalletDto,
  ) {
    return this.service.create(req.user.id, id, dto.address);
  }
  @Post('intents/:id/confirm') report(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportDto,
  ) {
    return this.service.report(req.user.id, id, dto.transactionHash);
  }
}

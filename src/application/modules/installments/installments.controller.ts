import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InstallmentsService } from './installments.service';
import { OtpChallengeDto } from './dto/otp-challenge.dto';
import { CollectCashDto } from './dto/collect-cash.dto';
import { PollarConfirmDto } from './dto/pollar-confirm.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/installments')
export class InstallmentsController {
  constructor(private readonly installmentsService: InstallmentsService) {}

  @Post(':id/otp-challenge')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async generateOtpChallenge(
    @Param('id') installmentId: string,
    @Body() _dto: OtpChallengeDto,
  ) {
    return this.installmentsService.generateOtpChallenge(installmentId);
  }

  @Post(':id/collect-cash')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async collectCash(
    @Param('id') installmentId: string,
    @Body() dto: CollectCashDto,
  ) {
    return this.installmentsService.collectCash(installmentId, dto);
  }

  @Post(':id/pollar-confirm')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmPollar(
    @Param('id') installmentId: string,
    @Body() dto: PollarConfirmDto,
  ) {
    return this.installmentsService.confirmPollarPayment(installmentId, dto);
  }
}

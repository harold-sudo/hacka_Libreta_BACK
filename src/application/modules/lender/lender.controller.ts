import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { LenderService } from './lender.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/lender')
export class LenderController {
  constructor(private readonly lenderService: LenderService) {}

  @Get('analytics/overview')
  @UseGuards(SupabaseAuthGuard)
  async getOverview(@Req() req: any) {
    const lenderId = req.user?.id || '00000000-0000-0000-0000-000000000001';
    return this.lenderService.getAnalyticsOverview(lenderId);
  }
}

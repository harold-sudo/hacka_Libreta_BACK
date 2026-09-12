import type { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import {
  Controller,
  Inject,
  ForbiddenException,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LenderService } from './lender.service';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/lender')
export class LenderController {
  constructor(
    private readonly lenderService: LenderService,
    @Inject('IProfileRepository') private readonly profiles: IProfileRepository,
  ) {}
  private async profileId(authId: string) {
    const profile = await this.profiles.findByAuthUserId(authId);
    if (!profile || profile.role !== 'LENDER')
      throw new ForbiddenException('Perfil no autorizado');
    return profile.id;
  }

  @Get('analytics/overview')
  @UseGuards(SupabaseAuthGuard)
  async getOverview(@Req() req: any) {
    const lenderId = await this.profileId(req.user.id);
    return this.lenderService.getAnalyticsOverview(lenderId);
  }
}

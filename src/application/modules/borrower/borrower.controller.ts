import type { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import { Controller, Inject, ForbiddenException, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { BorrowerService } from './borrower.service';
import { UpdatePassportDto } from './dto/update-passport.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/borrower')
export class BorrowerController {
  constructor(private readonly borrowerService: BorrowerService,
    @Inject('IProfileRepository') private readonly profiles: IProfileRepository) {}
  private async profileId(authId: string) {
    const profile = await this.profiles.findByAuthUserId(authId);
    if (!profile || profile.role !== 'BORROWER') throw new ForbiddenException('Perfil no autorizado');
    return profile.id;
  }

  @Get('loans/active')
  @UseGuards(SupabaseAuthGuard)
  async getActiveLoan(@Req() req: any) {
    const borrowerId = await this.profileId(req.user.id);
    return this.borrowerService.getActiveLoan(borrowerId);
  }

  @Get('passport')
  @UseGuards(SupabaseAuthGuard)
  async getPassport(@Req() req: any) {
    const borrowerId = await this.profileId(req.user.id);
    return this.borrowerService.getPassport(borrowerId);
  }

  @Patch('passport')
  @UseGuards(SupabaseAuthGuard)
  async updatePassport(@Req() req: any, @Body() dto: UpdatePassportDto) {
    const borrowerId = await this.profileId(req.user.id);
    return this.borrowerService.updatePassport(borrowerId, dto);
  }
}

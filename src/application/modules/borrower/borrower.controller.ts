import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { BorrowerService } from './borrower.service';
import { UpdatePassportDto } from './dto/update-passport.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/borrower')
export class BorrowerController {
  constructor(private readonly borrowerService: BorrowerService) {}

  @Get('loans/active')
  @UseGuards(SupabaseAuthGuard)
  async getActiveLoan(@Req() req: any) {
    const borrowerId = req.user?.id || '00000000-0000-0000-0000-000000000002';
    return this.borrowerService.getActiveLoan(borrowerId);
  }

  @Get('passport')
  @UseGuards(SupabaseAuthGuard)
  async getPassport(@Req() req: any) {
    const borrowerId = req.user?.id || '00000000-0000-0000-0000-000000000002';
    return this.borrowerService.getPassport(borrowerId);
  }

  @Patch('passport')
  @UseGuards(SupabaseAuthGuard)
  async updatePassport(@Req() req: any, @Body() dto: UpdatePassportDto) {
    const borrowerId = req.user?.id || '00000000-0000-0000-0000-000000000002';
    return this.borrowerService.updatePassport(borrowerId, dto);
  }
}

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

@Controller('api/loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createLoan(@Req() req: any, @Body() dto: CreateLoanDto) {
    const lenderId = req.user.id;
    return this.loansService.createLoan(lenderId, dto);
  }
}

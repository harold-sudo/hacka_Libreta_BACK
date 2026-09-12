import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { PollarService } from './pollar.service';

export class VerifyPollarDto {
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  transactionHash: string;

  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  sender: string;

  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  recipient: string;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,7})?$/)
  amount: string;
}

// Public, read-only verification of public testnet evidence. Never settles a loan.
@Controller('api/pollar')
export class PollarController {
  constructor(private readonly pollar: PollarService) {}

  @Get('config')
  config() {
    return this.pollar.config();
  }

  @Post('verify')
  verify(@Body() dto: VerifyPollarDto) {
    return this.pollar.verify(dto);
  }
}

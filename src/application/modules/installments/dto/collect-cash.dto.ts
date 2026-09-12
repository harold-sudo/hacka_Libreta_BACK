import {
  IsString,
  IsNumber,
  IsPositive,
  Length,
  IsOptional,
} from 'class-validator';

export class CollectCashDto {
  @IsString()
  @Length(6, 6, {
    message: 'El código OTP debe contener exactamente 6 dígitos',
  })
  borrowerOtp: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

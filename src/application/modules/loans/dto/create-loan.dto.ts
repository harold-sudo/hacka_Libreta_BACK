import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsDateString,
  Matches,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export class CreateLoanDto {
  @IsOptional()
  @IsIn(['stellar:testnet'])
  settlementNetwork?: 'stellar:testnet';
  @IsUUID()
  borrowerId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(999999999.99)
  @IsPositive()
  capital: number;

  @IsIn(['BOB', 'USDC'])
  currency: 'BOB' | 'USDC';

  @IsInt()
  @Min(1)
  @Max(52)
  totalInstallments: number;

  @ValidateIf(
    (dto: CreateLoanDto) =>
      dto.interestRate == null || dto.installmentAmount !== undefined,
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(999999999.99)
  @IsPositive()
  installmentAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  interestRate?: number;

  @IsIn(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'borrowerWalletAddress debe ser una dirección Ethereum válida',
  })
  borrowerWalletAddress: string;
}

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

  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(999999999.99)
  @IsPositive()
  installmentAmount: number;

  @IsIn(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

  @IsDateString()
  startDate: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'borrowerWalletAddress debe ser una dirección Ethereum válida',
  })
  borrowerWalletAddress: string;
}

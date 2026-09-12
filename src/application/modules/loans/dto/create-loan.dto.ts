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
} from 'class-validator';

export class CreateLoanDto {
  @IsUUID()
  borrowerId: string;

  @IsNumber()
  @IsPositive()
  capital: number;

  @IsIn(['BOB', 'USDC'])
  currency: 'BOB' | 'USDC';

  @IsInt()
  @Min(1)
  @Max(52)
  totalInstallments: number;

  @IsNumber()
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

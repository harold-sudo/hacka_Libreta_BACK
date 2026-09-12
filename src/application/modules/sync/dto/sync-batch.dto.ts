import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  IsDateString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OfflinePaymentItemDto {
  @IsUUID()
  clientTxId: string;

  @IsUUID()
  loanId: string;

  @IsUUID()
  installmentId: string;

  @IsNumber()
  installmentNumber: number;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @Length(6, 6)
  borrowerOtp: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message: 'receiptHash debe ser un hash keccak256 válido',
  })
  receiptHash: string;

  @IsDateString()
  collectedAt: string;
}

export class SyncBatchDto {
  @IsUUID()
  batchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfflinePaymentItemDto)
  payments: OfflinePaymentItemDto[];
}

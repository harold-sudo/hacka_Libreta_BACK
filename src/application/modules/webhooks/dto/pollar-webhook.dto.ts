import {
  IsString,
  IsNumber,
  IsObject,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PollarWebhookMetadataDto {
  @IsString()
  loanId: string;

  @IsString()
  installmentId: string;

  @IsNumber()
  installmentNumber: number;
}

export class PollarWebhookDto {
  @IsString()
  event: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message: 'transactionHash debe ser un hash de 64 caracteres hex',
  })
  transactionHash: string;

  @IsNumber()
  chainId: number;

  @IsString()
  amount: string;

  @IsString()
  currency: string;

  @IsString()
  recipient: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PollarWebhookMetadataDto)
  metadata: PollarWebhookMetadataDto;
}

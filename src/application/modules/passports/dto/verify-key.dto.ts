import { IsString, Matches, IsOptional, IsNumber } from 'class-validator';

export class VerifyKeyDto {
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'viewerAddress debe ser una dirección Ethereum válida (0x...)',
  })
  viewerAddress: string;

  @IsString()
  @IsOptional()
  signature?: string;

  @IsNumber()
  @IsOptional()
  timestamp?: number;
}

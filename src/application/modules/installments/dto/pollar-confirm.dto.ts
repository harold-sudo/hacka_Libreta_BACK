import { IsString, IsNumber, Matches } from 'class-validator';

export class PollarConfirmDto {
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message:
      'pollarTxHash debe ser un hash de transacción EVM de 64 caracteres hex',
  })
  pollarTxHash: string;

  @IsNumber()
  pollarChainId: number;
}

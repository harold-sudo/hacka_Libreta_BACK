import { IsNumber, IsOptional } from 'class-validator';

export class OtpChallengeDto {
  @IsNumber()
  @IsOptional()
  clientTimestamp?: number;
}

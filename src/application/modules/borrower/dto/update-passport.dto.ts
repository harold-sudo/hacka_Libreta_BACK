import {
  IsString,
  IsBoolean,
  Matches,
  Length,
  IsOptional,
} from 'class-validator';

export class UpdatePassportDto {
  @IsString()
  @Length(4, 32)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'passportSlug solo puede contener letras minúsculas, números y guiones',
  })
  passportSlug: string;

  @IsBoolean()
  @IsOptional()
  passportEnabled?: boolean;
}

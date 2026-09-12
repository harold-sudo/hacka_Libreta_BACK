import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  password: string;

  @IsIn(['BORROWER', 'LENDER'], {
    message: 'El rol debe ser BORROWER o LENDER',
  })
  role: 'BORROWER' | 'LENDER';

  @IsString()
  @MinLength(2, { message: 'El nombre o alias debe tener al menos 2 caracteres' })
  @MaxLength(100)
  aliasName: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'La dirección de billetera debe ser una dirección hexadecimal 0x de 40 caracteres',
  })
  walletAddress: string;

  @IsOptional()
  @IsString()
  marketOrCity?: string;

  @IsOptional()
  @IsString()
  passportSlug?: string;
}

import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { createClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { SettlementRepository } from './settlement.repository';
import type { AuthRequest } from './settlement.types';

class CredentialsDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}
class ProfileDto {
  @IsIn(['BORROWER', 'LENDER']) role: 'BORROWER' | 'LENDER';
  @IsString() @Matches(/^0x[0-9a-fA-F]{40}$/) walletAddress: string;
}

@Controller('api/pollar/session')
export class PollarSessionController {
  constructor(private readonly repo: SettlementRepository) {}
  private client() {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  @Post('login') async login(@Body() dto: CredentialsDto) {
    const { data, error } = await this.client().auth.signInWithPassword(dto);
    if (error || !data.session)
      throw new UnauthorizedException(
        'No se pudo iniciar sesión. Revisa tus credenciales y confirma el correo.',
      );
    return {
      accessToken: data.session.access_token,
      expiresAt: data.session.expires_at,
    };
  }
  @Post('register') async register(@Body() dto: CredentialsDto) {
    const { error } = await this.client().auth.signUp(dto);
    if (error)
      throw new ForbiddenException(
        'No se pudo registrar la cuenta. Revisa los requisitos de Supabase Auth.',
      );
    return {
      message:
        'Revisa tu correo si Supabase requiere confirmación y luego inicia sesión.',
    };
  }
  @Post('profile')
  @UseGuards(SupabaseAuthGuard)
  async profile(@Req() req: AuthRequest, @Body() dto: ProfileDto) {
    const { data: existing, error: readError } = await this.repo.db
      .from('profiles')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();
    if (readError)
      throw new ForbiddenException('No se pudo consultar el perfil');
    if (existing) return existing;
    const { data, error } = await this.repo.db
      .from('profiles')
      .insert({
        auth_user_id: req.user.id,
        role: dto.role,
        alias_name: `libreta-${req.user.id.slice(0, 8)}`,
        wallet_address: dto.walletAddress.toLowerCase(),
      })
      .select('id')
      .single();
    if (error)
      throw new ForbiddenException(
        'No se pudo crear el perfil. La wallet HSK debe ser única.',
      );
    return data;
  }
}

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async register(dto: RegisterDto) {
    const client = this.supabaseService.createAuthClient();
    const admin = this.supabaseService.getAdminClient();

    // Call stored procedure to create confirmed user + profile without email rate limits
    const { error: regError } = await admin.rpc(
      'register_libreta_user',
      {
        p_email: dto.email.toLowerCase().trim(),
        p_password: dto.password,
        p_role: dto.role,
        p_alias_name: dto.aliasName.trim(),
        p_wallet_address: dto.walletAddress.toLowerCase().trim(),
        p_passport_slug: dto.passportSlug || null,
      },
    );

    if (regError) {
      this.logger.error(`Error in register_libreta_user: ${regError.message}`);
      throw new BadRequestException(
        regError.message.includes('ya está registrado')
          ? 'Este correo electrónico ya se encuentra registrado. Inicia sesión.'
          : `No se pudo registrar la cuenta: ${regError.message}`,
      );
    }

    // Immediately sign in to produce a fresh, valid Supabase JWT session
    const { data: authData, error: authError } =
      await client.auth.signInWithPassword({
        email: dto.email.toLowerCase().trim(),
        password: dto.password,
      });

    if (authError || !authData.session) {
      this.logger.warn(`Registered but auto-login failed: ${authError?.message}`);
      return {
        success: true,
        accessToken: null,
        message: 'Cuenta creada exitosamente. Por favor ingresa con tus credenciales.',
      };
    }

    return {
      success: true,
      accessToken: authData.session.access_token,
      expiresAt: authData.session.expires_at,
      user: (await this.getProfile(authData.user.id, authData.user.email || '')).user,
    };
  }

  async login(dto: LoginDto) {
    const client = this.supabaseService.createAuthClient();
    const admin = this.supabaseService.getAdminClient();

    const { data: authData, error: authError } =
      await client.auth.signInWithPassword({
        email: dto.email.toLowerCase().trim(),
        password: dto.password,
      });

    if (authError || !authData.session) {
      this.logger.warn(`Login failed for ${dto.email}: ${authError?.message}`);
      throw new UnauthorizedException(
        'Credenciales incorrectas. Verifica tu correo y contraseña.',
      );
    }

    // Retrieve profile
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();

    if (profileError || !profile) throw new UnauthorizedException('Tu cuenta no tiene un perfil CREDITCHAIN válido. Completa o revisa el registro.');

    return {
      success: true,
      accessToken: authData.session.access_token,
      expiresAt: authData.session.expires_at,
      user: {
        id: authData.user.id,
        profileId: profile?.id,
        email: authData.user.email,
        role: profile.role,
        aliasName: profile.alias_name,
        walletAddress: profile?.wallet_address,
        passportSlug: profile?.passport_slug,
        passportEnabled: profile.passport_enabled === true,
      },
    };
  }

  async getProfile(authUserId: string, email: string) {
    const admin = this.supabaseService.getAdminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error || !profile) {
      throw new UnauthorizedException('Perfil no encontrado para este usuario');
    }

    return {
      success: true,
      user: { id:authUserId,profileId:profile.id,email,role:profile.role,aliasName:profile.alias_name,walletAddress:profile.wallet_address,passportSlug:profile.passport_slug,passportEnabled:profile.passport_enabled },
    };
  }
}

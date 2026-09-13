import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient;
  private serviceClient: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ||
      'https://znajylvosomdzibikqym.supabase.co';
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || '';
    assertServerKey(serviceRoleKey, anonKey);

    this.client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    this.serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    this.logger.log(`Supabase Client initialized with URL: ${supabaseUrl}`);
  }

  createAuthClient(): SupabaseClient {
    return createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getAdminClient(): SupabaseClient {
    return this.serviceClient;
  }
}

export function assertServerKey(rawKey: string, anonKey: string): void {
  // Tolerancia a copy-paste: espacios/saltos de línea/commillas alrededor.
  const key = (rawKey ?? '')
    .trim()
    .replace(/^(["'])/, '')
    .replace(/(["'])$/, '');
  let role: string | undefined;
  try {
    const parts = key.split('.');
    role =
      parts.length === 3
        ? JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role
        : undefined;
  } catch {
    /* Las llaves nuevas no son JWT (sb_secret_...) ni sb_publishable_... */
  }

  const isNewSecretKey = key.startsWith('sb_secret_');
  const isLegacyServiceRole = role === 'service_role';
  const isLowPrivilege = role === 'anon' || key.startsWith('sb_publishable_');

  if (key && key !== anonKey && (isNewSecretKey || isLegacyServiceRole)) {
    return;
  }

  const reason = !key
    ? 'la variable está vacía'
    : key === anonKey
      ? 'es la MÍSMA clave pública (anon) de SUPABASE_ANON_KEY'
      : isLowPrivilege
        ? 'es una clave de cliente (anon legacy o sb_publishable_), NO de servidor'
        : 'no es un JWT legacy service_role (eyJ...) ni una sb_secret_... nueva. Copia la llave exacta desde Project Settings > API Keys';

  throw new Error(
    `SUPABASE_SERVICE_ROLE_KEY debe contener una clave secreta de servidor (service_role o sb_secret_), no la clave pública anon. Causa detectada: ${reason}.`,
  );
}

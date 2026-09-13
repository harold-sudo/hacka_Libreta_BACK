import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient;
  private serviceClient: SupabaseClient;
  private readonly supabaseUrl: string;
  private readonly anonKey: string;

  constructor(private readonly configService: ConfigService) {
    const required = (name: string): string => {
      const value = normalizeConfigValue(this.configService.get<string>(name));
      if (!value) {
        throw new Error(
          `Falta la variable de entorno ${name} o está vacía. Configúrala en Environment del servicio backend de Render (o en .env local) y vuelve a desplegar.`,
        );
      }
      return value;
    };
    const supabaseUrl = required('SUPABASE_URL');
    const anonKey = required('SUPABASE_ANON_KEY');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    assertServerKey(serviceRoleKey, anonKey);
    this.supabaseUrl = supabaseUrl;
    this.anonKey = anonKey;

    this.client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    this.serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    this.logger.log(`Supabase Client initialized with URL: ${supabaseUrl}`);
  }

  createAuthClient(): SupabaseClient {
    return createClient(this.supabaseUrl, this.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getAdminClient(): SupabaseClient {
    return this.serviceClient;
  }
}

function normalizeConfigValue(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();
}

export function assertServerKey(rawKey: string, anonKey: string): void {
  const key = normalizeConfigValue(rawKey);
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

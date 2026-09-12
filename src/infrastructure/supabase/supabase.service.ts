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
    return createClient(this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getAdminClient(): SupabaseClient {
    return this.serviceClient;
  }
}

export function assertServerKey(key: string, anonKey: string): void {
  let role: string | undefined;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* Modern keys are not JWTs. */ }
  if (!key || key === anonKey || (!key.startsWith('sb_secret_') && role !== 'service_role')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY debe contener una clave secreta de servidor (service_role o sb_secret_), no la clave pública anon. Corrige el .env del backend.');
  }
}

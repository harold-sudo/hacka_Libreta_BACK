import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../../infrastructure/supabase/supabase.service';
import type { PaymentIntent } from './settlement.types';

@Injectable()
export class SettlementRepository {
  constructor(private readonly supabase: SupabaseService) {}
  get db() {
    return this.supabase.getAdminClient();
  }
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) {
      if (error.code === 'P0001' || error.code === '23505')
        throw new ConflictException(
          error.code === '23505' ? 'Este pago ya fue utilizado' : error.message,
        );
      throw new ServiceUnavailableException(
        `No se pudo persistir la conciliación (${error.code}). Comprueba la migración de Pollar.`,
      );
    }
    return data as T;
  }
  async intent(id: string): Promise<PaymentIntent | null> {
    const { data, error } = await this.db
      .from('pollar_payment_intents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error)
      throw new ServiceUnavailableException(
        'No se pudo consultar la intención',
      );
    return data as PaymentIntent | null;
  }
  async candidates() {
    const { data, error } = await this.db
      .from('pollar_payment_candidates')
      .select('intent_id,tx_hash')
      .eq('status', 'PENDING')
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at')
      .limit(1);
    if (error)
      throw new ServiceUnavailableException('No se pudo leer la cola Pollar');
    return data as { intent_id: string; tx_hash: string }[];
  }
  async deferCandidate(id: string, hash: string) {
    const { error } = await this.db
      .from('pollar_payment_candidates')
      .update({ next_attempt_at: new Date(Date.now() + 60_000).toISOString() })
      .eq('intent_id', id)
      .eq('tx_hash', hash);
    if (error)
      throw new ServiceUnavailableException(
        'No se pudo programar la verificación',
      );
  }
  async reject(id: string, hash: string) {
    const { error } = await this.db
      .from('pollar_payment_candidates')
      .update({ status: 'REJECTED', error_code: 'PAYMENT_MISMATCH' })
      .eq('intent_id', id)
      .eq('tx_hash', hash)
      .eq('status', 'PENDING');
    if (error)
      throw new ServiceUnavailableException('No se pudo registrar el rechazo');
  }
  async anchors() {
    const { data, error } = await this.db
      .from('pollar_payment_intents')
      .select('*')
      .eq('status', 'VERIFIED')
      .lte('next_attempt_at', new Date().toISOString())
      .order('installment_number')
      .limit(10);
    if (error)
      throw new ServiceUnavailableException('No se pudo leer la cola HSK');
    return data as PaymentIntent[];
  }
  async anchorFailed(id: string) {
    const { error } = await this.db
      .from('pollar_payment_intents')
      .update({
        anchor_error: 'HSK_PENDING_RETRY',
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq('id', id)
      .eq('status', 'VERIFIED');
    if (error)
      throw new ServiceUnavailableException(
        'No se pudo registrar el reintento HSK',
      );
  }
}

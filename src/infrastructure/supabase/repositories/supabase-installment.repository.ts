import { Injectable, Logger } from '@nestjs/common';
import { IInstallmentRepository } from '../../../core/interfaces/installment-repository.interface';
import { Installment } from '../../../core/domain/installment.entity';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class SupabaseInstallmentRepository implements IInstallmentRepository {
  private readonly logger = new Logger(SupabaseInstallmentRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}
  async claimCash(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .rpc('libreta_claim_cash', { p_installment: id });
    if (error)
      throw new Error(
        'Cuota reservada para Pollar, pagada o migración pendiente',
      );
  }

  async findById(id: string): Promise<Installment | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('installments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error finding installment by id: ${error.message}`);
      return null;
    }
    return data as Installment | null;
  }

  async findByLoanId(loanId: string): Promise<Installment[]> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('installments')
      .select('*')
      .eq('loan_id', loanId)
      .order('installment_number', { ascending: true });

    if (error) {
      this.logger.error(
        `Error finding installments by loanId: ${error.message}`,
      );
      return [];
    }
    return (data || []) as Installment[];
  }

  async findByLoanIdAndNumber(
    loanId: string,
    installmentNumber: number,
  ): Promise<Installment | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('installments')
      .select('*')
      .eq('loan_id', loanId)
      .eq('installment_number', installmentNumber)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Error finding installment by number: ${error.message}`,
      );
      return null;
    }
    return data as Installment | null;
  }

  async createInstallments(
    installments: Partial<Installment>[],
  ): Promise<Installment[]> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('installments')
      .insert(installments)
      .select();

    if (error) {
      this.logger.error(`Error creating installments: ${error.message}`);
      throw new Error(error.message);
    }
    return (data || []) as Installment[];
  }

  async updateInstallment(
    id: string,
    updates: Partial<Installment>,
  ): Promise<Installment> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('installments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error updating installment: ${error.message}`);
      throw new Error(error.message);
    }
    return data as Installment;
  }

  async findByPollarTxHash(
    chainId: number,
    txHash: string,
  ): Promise<Installment | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('installments')
      .select('*')
      .eq('pollar_chain_id', chainId)
      .eq('pollar_tx_hash', txHash)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Error finding installment by pollar tx: ${error.message}`,
      );
      return null;
    }
    return data as Installment | null;
  }
}

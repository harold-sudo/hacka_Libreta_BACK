import { Injectable, Logger } from '@nestjs/common';
import { ILoanRepository } from '../../../core/interfaces/loan-repository.interface';
import { Loan } from '../../../core/domain/loan.entity';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class SupabaseLoanRepository implements ILoanRepository {
  private readonly logger = new Logger(SupabaseLoanRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(id: string): Promise<Loan | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error finding loan by id: ${error.message}`);
      return null;
    }
    return data as Loan | null;
  }

  async findByHskLoanId(hskLoanId: string): Promise<Loan | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .select('*')
      .eq('hsk_loan_id', hskLoanId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error finding loan by hskLoanId: ${error.message}`);
      return null;
    }
    return data as Loan | null;
  }

  async findActiveByBorrowerId(borrowerId: string): Promise<Loan | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .select('*')
      .eq('borrower_id', borrowerId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Error finding active loan for borrower: ${error.message}`,
      );
      return null;
    }
    return data as Loan | null;
  }

  async findByLenderId(lenderId: string): Promise<Loan[]> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .select('*')
      .eq('lender_id', lenderId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Error finding loans by lenderId: ${error.message}`);
      return [];
    }
    return (data || []) as Loan[];
  }

  async findByBorrowerId(borrowerId: string): Promise<Loan[]> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .select('*')
      .eq('borrower_id', borrowerId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Error finding loans by borrowerId: ${error.message}`);
      return [];
    }
    return (data || []) as Loan[];
  }

  async createLoan(loan: Partial<Loan>): Promise<Loan> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .insert(loan)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error creating loan: ${error.message}`);
      throw new Error(error.message);
    }
    return data as Loan;
  }

  async updateLoan(id: string, updates: Partial<Loan>): Promise<Loan> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('loans')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error updating loan: ${error.message}`);
      throw new Error(error.message);
    }
    return data as Loan;
  }
}

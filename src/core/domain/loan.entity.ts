export type LoanStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
export type LoanFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type LoanCurrency = 'BOB' | 'USDC';

export interface Loan {
  id: string;
  hsk_loan_id: string;
  loan_hash: string;
  lender_id: string;
  borrower_id: string;
  capital: number;
  currency: LoanCurrency;
  total_installments: number;
  installment_amount: number;
  frequency: LoanFrequency;
  status: LoanStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export type InstallmentStatus =
  'PENDING' | 'PENDING_BORROWER_CONFIRMATION' | 'PAID' | 'OVERDUE';
export type PaymentMethod = 'CASH' | 'POLLAR_USDC';
export type HskSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface Installment {
  id: string;
  loan_id: string;
  installment_number: number;
  amount: number;
  principal_amount?: number;
  due_date: string;
  paid_date?: string | null;
  status: InstallmentStatus;
  payment_method?: PaymentMethod | null;
  pollar_chain_id?: number | null;
  pollar_tx_hash?: string | null;
  receipt_hash?: string | null;
  hsk_sync_status: HskSyncStatus;
  created_at: string;
  updated_at: string;
}

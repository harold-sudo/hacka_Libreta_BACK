export type SyncQueueStatus = 'PENDING' | 'PROCESSED' | 'REJECTED';

export interface SyncQueueItem {
  id: string;
  client_tx_id: string;
  collector_id: string;
  loan_id: string;
  installment_number: number;
  amount: number;
  borrower_otp: string;
  receipt_hash: string;
  status: SyncQueueStatus;
  processed_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

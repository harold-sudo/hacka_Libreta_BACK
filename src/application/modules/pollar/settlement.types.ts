export interface PaymentIntent {
  id: string;
  installment_id: string;
  loan_id: string;
  borrower_id: string;
  lender_id: string;
  hsk_loan_id: string;
  installment_number: number;
  network: 'stellar:testnet';
  sender: string;
  recipient: string;
  amount: number | string;
  issuer: string;
  min_ledger: number;
  hsk_chain_id: number;
  hsk_contract: string;
  status: 'CREATED' | 'VERIFIED' | 'ANCHORED';
  tx_hash: string | null;
  receipt_hash: string | null;
  paid_at: string | null;
  hsk_tx_hash: string | null;
  anchor_error: string | null;
}
export interface AuthRequest {
  user: { id: string };
}

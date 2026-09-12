export type AuditEventType =
  | 'LOAN_REGISTERED'
  | 'LOAN_COMPLETED'
  | 'PAYMENT_CONFIRMED'
  | 'DIGITAL_PAYMENT_ATTEMPT'
  | 'AUDIT_DOSSIER_GENERATED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'
  | 'OTHER';

// Zero PII policy: metadata only holds hashes, wallet addresses or numeric
// values. Never store names, ID numbers, phone numbers or plaintext secrets.
export interface AuditLogEntry {
  id?: number;
  event_type: AuditEventType;
  loan_id?: string | null;
  actor_address?: string | null;
  metadata?: Record<string, unknown>;
  tx_hash?: string | null;
  block_number?: number | null;
  chain_id?: number | null;
  idempotency_key?: string | null;
  created_at?: string;
}

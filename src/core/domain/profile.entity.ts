export type UserRole = 'BORROWER' | 'COLLECTOR' | 'LENDER' | 'AUDITOR';

export interface Profile {
  id: string;
  auth_user_id?: string | null;
  role: UserRole;
  alias_name: string;
  wallet_address?: string | null;
  passport_slug?: string | null;
  passport_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfilePii {
  profile_id: string;
  name_ciphertext: string;
  phone_ciphertext?: string | null;
  national_id_ciphertext?: string | null;
  key_version: string;
  updated_at: string;
}

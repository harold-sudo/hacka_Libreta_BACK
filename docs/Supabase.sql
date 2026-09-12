-- ==============================================================================
-- PROYECTO: LIBRETA — Microcrédito Verificable & Portabilidad de Reputación Financiera
-- HACKATHON: ETH Bolivia Buildathon 2026 (Cochabamba)
-- TRACKS: Bolivia Hackathon | Real-World Ethereum Applications | HSK Chain Track
-- BOUNTIES: Pollar (1 USDC Mainnet) & Unlock Protocol (Token-Gated Content Portal)
-- ==============================================================================
-- Ejecutar en el SQL Editor de Supabase como rol postgres.
-- Provisto por Supabase: auth.users, auth.uid(), anon, authenticated, service_role.
-- ==============================================================================

BEGIN;

-- 1. Habilitación de extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Esquema privado para datos PII (Protección Habeas Data y Derecho al Olvido)
CREATE SCHEMA IF NOT EXISTS libreta_private;
REVOKE ALL ON SCHEMA libreta_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA libreta_private TO authenticated, service_role;

-- 3. Tabla pública de perfiles de usuario (Zero PII - Solo alias y direcciones)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('BORROWER','COLLECTOR','LENDER','AUDITOR')),
  alias_name varchar(100) NOT NULL CHECK (length(trim(alias_name)) > 0),
  wallet_address text UNIQUE CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  passport_slug varchar(32) UNIQUE CHECK (passport_slug ~ '^[a-z0-9-]{4,32}$'),
  passport_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Tabla de datos sensibles cifrados off-chain (AES-256-GCM Envelope Encryption)
-- Si el prestatario ejerce su Derecho al Olvido, este registro se elimina y los
-- hashes on-chain en HSK Chain quedan matemáticamente desvinculados para siempre.
CREATE TABLE IF NOT EXISTS libreta_private.profile_pii (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  name_ciphertext text NOT NULL,
  phone_ciphertext text,
  national_id_ciphertext text,
  key_version text NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Tabla de préstamos (Vinculada al contrato LibretaRegistry.sol en HSK Chain)
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hsk_loan_id text NOT NULL UNIQUE CHECK (hsk_loan_id ~ '^0x[0-9a-fA-F]{64}$'),
  loan_hash text NOT NULL CHECK (loan_hash ~ '^0x[0-9a-fA-F]{64}$'),
  lender_id uuid NOT NULL REFERENCES public.profiles(id),
  borrower_id uuid NOT NULL REFERENCES public.profiles(id),
  capital numeric(18,2) NOT NULL CHECK (capital > 0),
  currency text NOT NULL DEFAULT 'BOB' CHECK (currency IN ('BOB','USDC')),
  total_installments integer NOT NULL CHECK (total_installments BETWEEN 1 AND 65535),
  installment_amount numeric(18,2) NOT NULL CHECK (installment_amount > 0),
  frequency text NOT NULL DEFAULT 'WEEKLY' CHECK (frequency IN ('DAILY','WEEKLY','BIWEEKLY','MONTHLY')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','COMPLETED','DEFAULTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (lender_id <> borrower_id),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  UNIQUE (id, lender_id)
);

CREATE INDEX IF NOT EXISTS loans_lender_idx ON public.loans(lender_id);
CREATE INDEX IF NOT EXISTS loans_borrower_idx ON public.loans(borrower_id);
CREATE INDEX IF NOT EXISTS loans_hsk_id_idx ON public.loans(hsk_loan_id);

-- 6. Tabla de asignación de cobradores a créditos
CREATE TABLE IF NOT EXISTS public.loan_collectors (
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loan_id, collector_id)
);

CREATE INDEX IF NOT EXISTS loan_collectors_collector_idx ON public.loan_collectors(collector_id) WHERE active;

-- 7. Tabla de cuotas (Sincronizadas con HSK Chain y conciliadas con Pollar USDC)
CREATE TABLE IF NOT EXISTS public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number BETWEEN 1 AND 65535),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  principal_amount numeric(18,2) NOT NULL CHECK (principal_amount >= 0 AND principal_amount <= amount),
  due_date date NOT NULL,
  paid_date timestamptz,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PENDING_BORROWER_CONFIRMATION','PAID','OVERDUE')),
  payment_method text CHECK (payment_method IN ('CASH','POLLAR_USDC')),
  pollar_chain_id bigint CHECK (pollar_chain_id > 0),
  pollar_tx_hash text CHECK (pollar_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  receipt_hash text UNIQUE CHECK (receipt_hash ~ '^0x[0-9a-fA-F]{64}$'),
  hsk_sync_status text NOT NULL DEFAULT 'PENDING' CHECK (hsk_sync_status IN ('PENDING','SYNCED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_number),
  UNIQUE (id, loan_id),
  UNIQUE (pollar_chain_id, pollar_tx_hash),
  CHECK ((status = 'PAID') = (paid_date IS NOT NULL)),
  CHECK (status <> 'PAID' OR (payment_method IS NOT NULL AND receipt_hash IS NOT NULL)),
  CHECK ((payment_method = 'POLLAR_USDC' AND pollar_chain_id IS NOT NULL AND pollar_tx_hash IS NOT NULL)
    OR (payment_method IS DISTINCT FROM 'POLLAR_USDC' AND pollar_chain_id IS NULL AND pollar_tx_hash IS NULL)),
  CHECK (hsk_sync_status <> 'SYNCED' OR status = 'PAID')
);

CREATE INDEX IF NOT EXISTS installments_due_idx ON public.installments(due_date) WHERE status <> 'PAID';
CREATE INDEX IF NOT EXISTS installments_loan_idx ON public.installments(loan_id);
CREATE INDEX IF NOT EXISTS installments_receipt_hash_idx ON public.installments(receipt_hash);

-- 8. Rutas de Cobro en Campo (Para cobradores móviles / PWA Offline)
CREATE TABLE IF NOT EXISTS public.collection_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id uuid NOT NULL REFERENCES public.profiles(id),
  collector_id uuid NOT NULL REFERENCES public.profiles(id),
  route_date date NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collector_id, route_date)
);

CREATE INDEX IF NOT EXISTS collection_routes_collector_date_idx ON public.collection_routes(collector_id, route_date);

-- 9. Ítems o paradas individuales de la ruta de cobro
CREATE TABLE IF NOT EXISTS public.collection_route_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.collection_routes(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.installments(id),
  order_index integer NOT NULL DEFAULT 0,
  visited boolean NOT NULL DEFAULT false,
  collected_amount numeric(18,2) DEFAULT 0,
  notes text,
  visited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, loan_id)
);

-- 10. Cola de sincronización para transacciones offline
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_tx_id uuid NOT NULL UNIQUE,
  collector_id uuid NOT NULL REFERENCES public.profiles(id),
  loan_id uuid NOT NULL REFERENCES public.loans(id),
  installment_number integer NOT NULL,
  amount numeric(18,2) NOT NULL,
  borrower_otp varchar(10) NOT NULL,
  receipt_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'REJECTED')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_queue_collector_idx ON public.sync_queue(collector_id, status);

-- 11. Triggers automáticos para actualizar updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_loans_updated_at ON public.loans;
CREATE TRIGGER trg_loans_updated_at BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_installments_updated_at ON public.installments;
CREATE TRIGGER trg_installments_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_routes_updated_at ON public.collection_routes;
CREATE TRIGGER trg_routes_updated_at BEFORE UPDATE ON public.collection_routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. Habilitación de Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_route_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- 13. Políticas de Seguridad RLS
-- A. Profiles: Cada usuario puede leer su propio perfil; perfiles públicos de prestatarios con slug activo son legibles
CREATE POLICY "Usuarios leen su propio perfil"
ON public.profiles FOR SELECT
USING (auth.uid() = auth_user_id);

CREATE POLICY "Lectura publica de passaporte si esta habilitado"
ON public.profiles FOR SELECT
USING (passport_enabled = true AND passport_slug IS NOT NULL);

CREATE POLICY "Usuarios actualizan su propio perfil"
ON public.profiles FOR UPDATE
USING (auth.uid() = auth_user_id);

-- B. Loans: Prestamistas y prestatarios acceden a sus propios créditos
CREATE POLICY "Prestamistas y prestatarios consultan sus creditos"
ON public.loans FOR SELECT
USING (
  auth.uid() IN (
    SELECT auth_user_id FROM public.profiles WHERE id = lender_id OR id = borrower_id
  )
);

CREATE POLICY "Prestamistas registran creditos"
ON public.loans FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT auth_user_id FROM public.profiles WHERE id = lender_id AND role = 'LENDER'
  )
);

-- C. Installments: Consulta permitida a prestatario, prestamista o cobrador asignado
CREATE POLICY "Partes autorizadas consultan cuotas"
ON public.installments FOR SELECT
USING (
  loan_id IN (
    SELECT l.id FROM public.loans l
    JOIN public.profiles p ON (p.id = l.lender_id OR p.id = l.borrower_id)
    WHERE p.auth_user_id = auth.uid()
    UNION
    SELECT lc.loan_id FROM public.loan_collectors lc
    JOIN public.profiles p ON p.id = lc.collector_id
    WHERE p.auth_user_id = auth.uid() AND lc.active = true
  )
);

-- D. Collection Routes: El cobrador consulta sus propias rutas
CREATE POLICY "Cobradores ven sus rutas"
ON public.collection_routes FOR SELECT
USING (
  collector_id IN (
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
  )
);

COMMIT;
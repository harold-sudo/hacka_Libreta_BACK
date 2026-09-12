-- ZERO-PII audit trail. Additive migration; no existing rows are deleted.
-- Eventos on-chain de LibretaRegistry + acciones críticas del backend
-- (LOAN_REGISTERED, PAYMENT_CONFIRMED, LOAN_COMPLETED, intentos de acceso).
BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type      text NOT NULL CHECK (event_type IN (
                    'LOAN_REGISTERED','LOAN_COMPLETED','PAYMENT_CONFIRMED',
                    'DIGITAL_PAYMENT_ATTEMPT','AUDIT_DOSSIER_GENERATED',
                    'UNAUTHORIZED_ACCESS_ATTEMPT','OTHER')),
  loan_id         text CHECK (loan_id IS NULL OR loan_id ~ '^0x[0-9a-fA-F]{64}$'),
  actor_address   text CHECK (actor_address IS NULL OR actor_address ~ '^0x[0-9a-fA-F]{40}$'),
  -- Solo hashes, wallets o valores numéricos. NUNCA PII en claro.
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  tx_hash         text CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  block_number    bigint,
  chain_id        integer,
  idempotency_key text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS audit_logs_loan_id_idx ON public.audit_logs (loan_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_addr_idx ON public.audit_logs (actor_address);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- Outbox durable: eventos que no pudieron escribirse en tiempo real por caída
-- de red son drenados con reintentos y backoff por el backend.
CREATE TABLE IF NOT EXISTS public.audit_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL CHECK (event_type IN (
                    'LOAN_REGISTERED','LOAN_COMPLETED','PAYMENT_CONFIRMED',
                    'DIGITAL_PAYMENT_ATTEMPT','AUDIT_DOSSIER_GENERATED',
                    'UNAUTHORIZED_ACCESS_ATTEMPT','OTHER')),
  loan_id         text,
  actor_address   text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  tx_hash         text,
  block_number    bigint,
  chain_id        integer,
  idempotency_key text NOT NULL UNIQUE,
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_outbox_next_attempt_idx
  ON public.audit_outbox (next_attempt_at) WHERE attempts < 99;

-- Cursor del listener on-chain para no perder bloques (writes quemados).
CREATE TABLE IF NOT EXISTS public.audit_listener_state (
  writer           text PRIMARY KEY,
  contract_address text NOT NULL,
  chain_id         integer NOT NULL,
  block_number     bigint NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Acceso exclusivo vía service_role; nunca por anon/autenticados.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_listener_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs,public.audit_outbox,public.audit_listener_state FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.audit_logs,public.audit_outbox,public.audit_listener_state TO service_role;

-- Agregado en SQL (GROUP BY) para el dashboard; evita traer toda la tabla en JS.
CREATE OR REPLACE FUNCTION public.libreta_audit_counts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('event_type', e, 'count', n) ORDER BY n DESC),
    '[]'::jsonb
  )
  FROM (SELECT event_type AS e, count(*) AS n FROM public.audit_logs GROUP BY event_type) t;
$$;
REVOKE ALL ON FUNCTION public.libreta_audit_counts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.libreta_audit_counts() TO service_role;

COMMIT;
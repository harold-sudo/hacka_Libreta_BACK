-- Apply AFTER Supabase.sql. Additive migration; no existing rows are deleted.
BEGIN;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS settlement_network text
  CHECK (settlement_network IS NULL OR settlement_network = 'stellar:testnet');
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS pollar_network text
  CHECK (pollar_network IS NULL OR pollar_network = 'stellar:testnet');
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS payment_rail text
  CHECK (payment_rail IS NULL OR payment_rail IN ('CASH','POLLAR'));
-- Replace only the legacy condition requiring an EVM chain id for Pollar.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.installments'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%payment_method%'
      AND pg_get_constraintdef(oid) LIKE '%pollar_chain_id%'
  LOOP EXECUTE format('ALTER TABLE public.installments DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE public.installments ADD CONSTRAINT installments_pollar_settlement_check CHECK (
  (payment_method = 'POLLAR_USDC' AND pollar_tx_hash IS NOT NULL AND
    ((pollar_network IS NOT NULL AND pollar_network='stellar:testnet' AND pollar_chain_id IS NULL) OR
     (pollar_network IS NULL AND pollar_chain_id IS NOT NULL))) OR
  (payment_method IS DISTINCT FROM 'POLLAR_USDC' AND pollar_tx_hash IS NULL AND pollar_chain_id IS NULL AND pollar_network IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS installments_stellar_tx_idx ON public.installments(pollar_network,pollar_tx_hash)
  WHERE pollar_network IS NOT NULL;

-- No PII: wallet routing is separated from publicly readable profiles.
CREATE TABLE IF NOT EXISTS public.pollar_wallet_routes (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  network text NOT NULL CHECK(network='stellar:testnet'),
  address text NOT NULL CHECK(address ~ '^G[A-Z2-7]{55}$')
);
CREATE TABLE IF NOT EXISTS public.pollar_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL UNIQUE REFERENCES public.installments(id),
  loan_id uuid NOT NULL REFERENCES public.loans(id),
  borrower_id uuid NOT NULL REFERENCES public.profiles(id),
  lender_id uuid NOT NULL REFERENCES public.profiles(id),
  hsk_loan_id text NOT NULL CHECK(hsk_loan_id ~ '^0x[0-9a-fA-F]{64}$'),
  installment_number integer NOT NULL,
  network text NOT NULL CHECK(network='stellar:testnet'),
  sender text NOT NULL CHECK(sender ~ '^G[A-Z2-7]{55}$'),
  recipient text NOT NULL CHECK(recipient ~ '^G[A-Z2-7]{55}$'),
  amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount<1000000000),
  issuer text NOT NULL CHECK(issuer ~ '^G[A-Z2-7]{55}$'),
  min_ledger bigint NOT NULL CHECK(min_ledger>0),
  hsk_chain_id integer NOT NULL CHECK(hsk_chain_id=133),
  hsk_contract text NOT NULL CHECK(hsk_contract ~ '^0x[0-9a-fA-F]{40}$'),
  status text NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','VERIFIED','ANCHORED')),
  tx_hash text CHECK(tx_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash text CHECK(receipt_hash ~ '^0x[0-9a-f]{64}$'),
  paid_at timestamptz,
  hsk_tx_hash text CHECK(hsk_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  anchor_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(network,tx_hash), CHECK(sender<>recipient),
  CHECK((status='CREATED') = (tx_hash IS NULL)),
  CHECK((tx_hash IS NULL) = (receipt_hash IS NULL)),
  CHECK((tx_hash IS NULL) = (paid_at IS NULL))
);
CREATE TABLE IF NOT EXISTS public.pollar_payment_candidates (
  intent_id uuid NOT NULL REFERENCES public.pollar_payment_intents(id),
  tx_hash text NOT NULL CHECK(tx_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','REJECTED')),
  error_code text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(intent_id,tx_hash)
);
CREATE TABLE IF NOT EXISTS public.pollar_worker_lease (
  id integer PRIMARY KEY CHECK(id=1), owner uuid, until_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pollar_worker_lease(id) VALUES(1) ON CONFLICT DO NOTHING;

-- All access goes through authenticated backend checks; never directly via anon.
ALTER TABLE public.pollar_wallet_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pollar_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pollar_payment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pollar_worker_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pollar_wallet_routes,public.pollar_payment_intents,public.pollar_payment_candidates,public.pollar_worker_lease FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pollar_wallet_routes,public.pollar_payment_intents,public.pollar_payment_candidates,public.pollar_worker_lease TO service_role;

CREATE OR REPLACE FUNCTION public.pollar_create_intent(
 p_installment uuid,p_actor uuid,p_sender text,p_issuer text,p_ledger bigint,p_contract text
) RETURNS public.pollar_payment_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.installments; l public.loans; r public.pollar_payment_intents; dest text;
BEGIN
 SELECT * INTO i FROM installments WHERE id=p_installment;
 SELECT * INTO l FROM loans WHERE id=i.loan_id FOR UPDATE;
 SELECT * INTO i FROM installments WHERE id=p_installment FOR UPDATE;
 IF i.id IS NULL OR l.borrower_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'CUOTA_NO_AUTORIZADA'; END IF;
 SELECT * INTO r FROM pollar_payment_intents WHERE installment_id=i.id;
 IF r.id IS NOT NULL THEN
   IF r.sender<>p_sender THEN RAISE EXCEPTION 'INTENCION_OTRA_WALLET'; END IF;
   RETURN r;
 END IF;
 IF l.currency<>'USDC' OR l.settlement_network IS DISTINCT FROM 'stellar:testnet'
    OR l.status<>'ACTIVE' OR i.status NOT IN ('PENDING','OVERDUE') OR i.payment_rail IS NOT NULL
 THEN RAISE EXCEPTION 'CUOTA_NO_DISPONIBLE'; END IF;
 IF EXISTS(SELECT 1 FROM installments WHERE loan_id=l.id AND installment_number<i.installment_number AND
    (status<>'PAID' OR hsk_sync_status<>'SYNCED')) THEN RAISE EXCEPTION 'CUOTA_ANTERIOR_PENDIENTE'; END IF;
 SELECT address INTO dest FROM pollar_wallet_routes WHERE profile_id=l.lender_id AND network='stellar:testnet';
 IF dest IS NULL THEN RAISE EXCEPTION 'PRESTAMISTA_SIN_WALLET'; END IF;
 UPDATE installments SET payment_rail='POLLAR' WHERE id=i.id;
 INSERT INTO pollar_payment_intents(installment_id,loan_id,borrower_id,lender_id,hsk_loan_id,installment_number,
 network,sender,recipient,amount,issuer,min_ledger,hsk_chain_id,hsk_contract)
 VALUES(i.id,l.id,l.borrower_id,l.lender_id,l.hsk_loan_id,i.installment_number,'stellar:testnet',p_sender,dest,i.amount,p_issuer,p_ledger,133,p_contract)
 RETURNING * INTO r;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.pollar_observe(p_intent uuid,p_actor uuid,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.pollar_payment_intents;
BEGIN
 SELECT * INTO r FROM pollar_payment_intents WHERE id=p_intent FOR UPDATE;
 IF r.id IS NULL OR r.borrower_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'CUOTA_NO_AUTORIZADA'; END IF;
 IF r.status<>'CREATED' THEN
   IF r.tx_hash<>p_hash THEN RAISE EXCEPTION 'CUOTA_YA_PAGADA'; END IF;
   RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM pollar_payment_candidates WHERE intent_id=p_intent AND tx_hash=p_hash) THEN RETURN; END IF;
 IF (SELECT count(*) FROM pollar_payment_candidates WHERE intent_id=p_intent AND status='PENDING')>=5
 THEN RAISE EXCEPTION 'DEMASIADOS_PAGOS_PENDIENTES'; END IF;
 INSERT INTO pollar_payment_candidates(intent_id,tx_hash) VALUES(p_intent,p_hash);
END $$;

-- Called ONLY after server-side Horizon verification; loan row serializes concurrent completions.
CREATE OR REPLACE FUNCTION public.pollar_settle(p_intent uuid,p_hash text,p_receipt text,p_paid_at timestamptz)
RETURNS public.pollar_payment_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.pollar_payment_intents; i public.installments;
BEGIN
 SELECT * INTO r FROM pollar_payment_intents WHERE id=p_intent;
 IF r.id IS NULL THEN RAISE EXCEPTION 'INTENCION_NO_EXISTE'; END IF;
 PERFORM 1 FROM loans WHERE id=r.loan_id FOR UPDATE;
 SELECT * INTO i FROM installments WHERE id=r.installment_id FOR UPDATE;
 SELECT * INTO r FROM pollar_payment_intents WHERE id=p_intent FOR UPDATE;
 IF r.status<>'CREATED' THEN
   IF r.tx_hash<>p_hash OR r.receipt_hash<>p_receipt THEN RAISE EXCEPTION 'CUOTA_YA_PAGADA'; END IF;
   RETURN r;
 END IF;
 IF i.status='PAID' OR i.payment_rail IS DISTINCT FROM 'POLLAR' THEN RAISE EXCEPTION 'CUOTA_YA_PAGADA'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pollar_payment_candidates WHERE intent_id=p_intent AND tx_hash=p_hash AND status='PENDING')
 THEN RAISE EXCEPTION 'PAGO_NO_REPORTADO'; END IF;
 UPDATE pollar_payment_intents SET status='VERIFIED',tx_hash=p_hash,receipt_hash=p_receipt,paid_at=p_paid_at
 WHERE id=p_intent RETURNING * INTO r;
 UPDATE installments SET status='PAID',paid_date=p_paid_at,payment_method='POLLAR_USDC',pollar_network='stellar:testnet',
 pollar_chain_id=NULL,pollar_tx_hash='0x'||p_hash,receipt_hash=p_receipt,hsk_sync_status='PENDING' WHERE id=i.id;
 UPDATE pollar_payment_candidates SET status='VERIFIED' WHERE intent_id=p_intent AND tx_hash=p_hash;
 IF NOT EXISTS(SELECT 1 FROM installments WHERE loan_id=r.loan_id AND status<>'PAID') THEN
   UPDATE loans SET status='COMPLETED',completed_at=p_paid_at WHERE id=r.loan_id;
 END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.pollar_mark_anchored(p_intent uuid,p_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.pollar_payment_intents;
BEGIN
 SELECT * INTO r FROM pollar_payment_intents WHERE id=p_intent FOR UPDATE;
 IF r.id IS NULL OR r.status NOT IN ('VERIFIED','ANCHORED') THEN RAISE EXCEPTION 'PAGO_NO_VERIFICADO'; END IF;
 UPDATE pollar_payment_intents SET status='ANCHORED',hsk_tx_hash=coalesce(p_hash,hsk_tx_hash),anchor_error=NULL WHERE id=p_intent;
 UPDATE installments SET hsk_sync_status='SYNCED' WHERE id=r.installment_id AND receipt_hash=r.receipt_hash;
END $$;

CREATE OR REPLACE FUNCTION public.pollar_claim_worker(p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE pollar_worker_lease SET owner=p_owner,until_at=now()+interval '2 minutes' WHERE id=1 AND until_at<now();
 RETURN FOUND;
END $$;

-- Reserve the cash rail BEFORE any external HSK call (also used by offline sync).
CREATE OR REPLACE FUNCTION public.libreta_claim_cash(p_installment uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE installments SET payment_rail='CASH' WHERE id=p_installment AND status<>'PAID' AND (payment_rail IS NULL OR payment_rail='CASH');
 IF NOT FOUND THEN RAISE EXCEPTION 'CUOTA_RESERVADA_O_PAGADA'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.libreta_protect_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.payment_rail IS NOT NULL AND NEW.payment_rail IS DISTINCT FROM OLD.payment_rail THEN RAISE EXCEPTION 'RAIL_INMUTABLE'; END IF;
 IF OLD.payment_rail IS NOT NULL AND (NEW.loan_id IS DISTINCT FROM OLD.loan_id OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.installment_number IS DISTINCT FROM OLD.installment_number)
 THEN RAISE EXCEPTION 'CUOTA_INMUTABLE'; END IF;
 IF OLD.status='PAID' AND (NEW.status<>OLD.status OR NEW.receipt_hash IS DISTINCT FROM OLD.receipt_hash OR
    NEW.pollar_tx_hash IS DISTINCT FROM OLD.pollar_tx_hash OR NEW.payment_method IS DISTINCT FROM OLD.payment_method)
 THEN RAISE EXCEPTION 'PAGO_INMUTABLE'; END IF;
 IF OLD.payment_rail='POLLAR' AND NEW.status='PAID' AND NOT EXISTS(
 SELECT 1 FROM pollar_payment_intents p WHERE p.installment_id=NEW.id AND p.status IN ('VERIFIED','ANCHORED')
 AND p.receipt_hash=NEW.receipt_hash AND '0x'||p.tx_hash=NEW.pollar_tx_hash AND NEW.payment_method='POLLAR_USDC')
 THEN RAISE EXCEPTION 'PAGO_SIN_VERIFICAR'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_payment ON installments;
CREATE TRIGGER protect_payment BEFORE UPDATE ON installments FOR EACH ROW EXECUTE FUNCTION libreta_protect_payment();

-- Snapshot fields never change, even if the lender changes their receiving wallet.
CREATE OR REPLACE FUNCTION public.pollar_protect_intent() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','tx_hash','receipt_hash','paid_at','hsk_tx_hash','anchor_error','next_attempt_at'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','tx_hash','receipt_hash','paid_at','hsk_tx_hash','anchor_error','next_attempt_at'])
 THEN RAISE EXCEPTION 'INTENCION_INMUTABLE'; END IF;
 IF OLD.tx_hash IS NOT NULL AND (NEW.tx_hash IS DISTINCT FROM OLD.tx_hash OR NEW.receipt_hash IS DISTINCT FROM OLD.receipt_hash OR NEW.paid_at IS DISTINCT FROM OLD.paid_at)
 THEN RAISE EXCEPTION 'PAGO_INMUTABLE'; END IF;
 IF (OLD.status='VERIFIED' AND NEW.status='CREATED') OR (OLD.status='ANCHORED' AND NEW.status<>'ANCHORED') THEN RAISE EXCEPTION 'ESTADO_INMUTABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_intent ON pollar_payment_intents;
CREATE TRIGGER protect_intent BEFORE UPDATE ON pollar_payment_intents FOR EACH ROW EXECUTE FUNCTION pollar_protect_intent();

REVOKE ALL ON FUNCTION public.pollar_create_intent(uuid,uuid,text,text,bigint,text),public.pollar_observe(uuid,uuid,text),
 public.pollar_settle(uuid,text,text,timestamptz),public.pollar_mark_anchored(uuid,text),public.pollar_claim_worker(uuid),
 public.libreta_claim_cash(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pollar_create_intent(uuid,uuid,text,text,bigint,text),public.pollar_observe(uuid,uuid,text),
 public.pollar_settle(uuid,text,text,timestamptz),public.pollar_mark_anchored(uuid,text),public.pollar_claim_worker(uuid),
 public.libreta_claim_cash(uuid) TO service_role;
COMMIT;

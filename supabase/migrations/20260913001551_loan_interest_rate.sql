-- Nullable for legacy loans: their percentage was not explicitly agreed in this field.
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS interest_rate numeric(6,2)
  CHECK (interest_rate >= 0 AND interest_rate <= 1000);
COMMENT ON COLUMN public.loans.interest_rate IS 'One-time percentage of principal for the entire loan; not a periodic or annual rate. NULL for legacy loans.';

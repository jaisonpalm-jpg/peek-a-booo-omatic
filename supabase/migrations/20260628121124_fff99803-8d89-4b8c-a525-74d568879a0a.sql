CREATE TABLE public.library_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  length NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  weight NUMERIC,
  insulated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_units TO authenticated;
GRANT ALL ON public.library_units TO service_role;

ALTER TABLE public.library_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own library units"
  ON public.library_units
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX library_units_user_id_idx ON public.library_units(user_id);
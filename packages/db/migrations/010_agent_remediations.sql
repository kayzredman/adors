-- Agent remediation proposals — human-in-the-loop approval for autonomous healing
CREATE TABLE IF NOT EXISTS public.agent_remediations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_name text NOT NULL,
  db_type         text NOT NULL,
  command         text NOT NULL,
  reason          text NOT NULL DEFAULT '',
  risk            text NOT NULL DEFAULT 'medium',
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executed', 'failed', 'rejected')),
  proposed_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  result          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_remediations_status ON public.agent_remediations (status);
CREATE INDEX idx_agent_remediations_created ON public.agent_remediations (created_at DESC);

-- RLS
ALTER TABLE public.agent_remediations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read remediations"
  ON public.agent_remediations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert remediations"
  ON public.agent_remediations FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update remediations"
  ON public.agent_remediations FOR UPDATE
  TO authenticated USING (true);

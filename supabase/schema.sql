-- ePSA Screening Tool — Supabase schema
-- Run this in the Supabase SQL editor once after creating a new project.

create table if not exists clinical_sessions (
  id                  text primary key,
  session_ref         text unique,
  created_at          timestamptz,
  type                text,
  status              text,
  final_category      text,
  -- Part 1 inputs (de-identified per HIPAA Safe Harbor; age capped at 89)
  age                 integer,
  race                text,
  family_history      text,
  genetic_risk        text,
  bmi                 real,
  exercise            text,
  smoking             text,
  chemical_exposure   text,
  diet_pattern        text,
  comorbidity_score   integer,
  ipss_qol            integer,
  shim_q1             integer,
  -- Part 1 result
  tier_key            text,
  tier_label          text,
  display_range       text,
  -- Part 2 inputs (entered by staff after lab results)
  psa                 real,
  pirads              text,
  on_hormonal_therapy boolean,
  -- Consent and source
  consented           boolean,
  device_id           text,
  -- Complete session blob (queryable JSONB)
  full_record         jsonb
);

-- Row-Level Security
alter table clinical_sessions enable row level security;

-- Kiosk tablets can insert new sessions (no auth required)
create policy "kiosk_insert"
  on clinical_sessions for insert
  with check (true);

-- Anyone can read a specific session by its EP ref IF consent was given.
-- This allows the main ePSA app to import via EP-YYYYMMDD-XXXX without auth.
create policy "public_read_consented_by_ref"
  on clinical_sessions for select
  using (consented = true);

-- Authenticated staff (Microsoft SSO via Supabase Auth) can read all sessions
create policy "staff_read_all"
  on clinical_sessions for select
  using (auth.role() = 'authenticated');

-- Authenticated staff can update (e.g. enter PSA results, mark consent)
create policy "staff_update"
  on clinical_sessions for update
  using (auth.role() = 'authenticated');

-- Authenticated staff can delete
create policy "staff_delete"
  on clinical_sessions for delete
  using (auth.role() = 'authenticated');

-- Index for fast EP ref lookups
create index if not exists idx_session_ref on clinical_sessions (session_ref);
create index if not exists idx_created_at  on clinical_sessions (created_at desc);

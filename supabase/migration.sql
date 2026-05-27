-- ── IndemniteKM — Migration Supabase ────────────────────────────────────────
-- Coller ce SQL dans : supabase.com → Ton projet → SQL Editor → New query

-- Table des trajets
create table if not exists public.trips (
  id             text        primary key,
  user_id        uuid        references auth.users on delete cascade not null,
  start_time     bigint      not null,
  end_time       bigint,
  distance_km    float       not null default 0,
  duration_ms    bigint,
  indemnite      float       not null default 0,
  status         text        not null default 'completed',
  start_address  text,
  end_address    text,
  points         jsonb       not null default '[]'::jsonb,
  cities_visited jsonb       not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

-- Index pour accélérer les requêtes par utilisateur
create index if not exists trips_user_id_idx on public.trips (user_id);
create index if not exists trips_start_time_idx on public.trips (start_time desc);

-- Row Level Security : chaque utilisateur ne voit que ses propres trajets
alter table public.trips enable row level security;

create policy "Chaque utilisateur accède uniquement à ses trajets"
  on public.trips
  for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

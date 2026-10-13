-- Indeca Truck Inspection: schema for Supabase (Postgres + Auth + Storage).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
--
-- Use a NEW Supabase project for this app, not the Ticket Log's, so the two can never touch
-- each other's data.
--
-- Security model: every read and write goes through the app server, which checks the signed-in
-- person's role first (src/server/inspections.ts, fleet.ts, people.ts) and then uses the secret
-- key. Row-level security is switched on with no policies, so the public (publishable) key can't
-- read or change anything directly. Sign-in itself is Supabase Auth (phone number + PIN).

-- ---------------------------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------------------------

create type public.app_role as enum ('driver', 'manager', 'mechanic', 'viewer');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  name        text not null check (length(name) between 1 and 80),
  phone       text unique,
  role        public.app_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Wrong-PIN attempts, so a mobile number is locked for a while after too many.
create table public.sign_in_failures (
  id     bigint generated always as identity primary key,
  phone  text not null,
  at     timestamptz not null default now()
);
create index sign_in_failures_phone_at on public.sign_in_failures (phone, at);
alter table public.sign_in_failures enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------------------------------

create table public.vehicles (
  id                  uuid primary key,
  kind                text not null check (kind in ('truck', 'trailer')),
  unit                text not null check (length(unit) between 1 and 20),
  vin                 text not null default '',
  year                text not null default '',
  make                text not null default '',
  model               text not null default '',
  plate               text not null default '',
  default_trailer_id  uuid references public.vehicles (id),
  notes               text not null default '',
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create unique index vehicles_unit_unique on public.vehicles (kind, lower(unit));
alter table public.vehicles enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Inspections: one row per inspection, one row per answered checklist item
-- ---------------------------------------------------------------------------------------------

create table public.inspections (
  id                 uuid primary key,
  token              text not null unique,          -- the QR link; long and random
  truck_id           uuid not null references public.vehicles (id),
  trailer_id         uuid references public.vehicles (id),
  inspector_id       uuid not null references public.profiles (id),
  inspector_name     text not null,
  location           text not null default '',
  checklist_version  text not null,
  started_at         timestamptz not null,
  updated_at         timestamptz not null,
  certified_at       timestamptz,
  overall            text check (overall in ('in_service', 'needs_repair', 'out_of_service')),
  comments           text not null default '',
  signature          text not null default ''
);
create index inspections_truck on public.inspections (truck_id, started_at desc);
create index inspections_trailer on public.inspections (trailer_id, started_at desc);
create index inspections_inspector on public.inspections (inspector_id, started_at desc);
alter table public.inspections enable row level security;

create table public.inspection_items (
  inspection_id  uuid not null references public.inspections (id) on delete cascade,
  item_id        text not null,
  result         jsonb not null,  -- { verdict, value, date, note, photos: [{key, takenAt}], resolution }
  updated_at     timestamptz not null default now(),
  primary key (inspection_id, item_id)
);
alter table public.inspection_items enable row level security;

-- Once signed off, the inspection header never changes.
create function public.guard_certified() returns trigger
language plpgsql as $$
begin
  if old.certified_at is not null then
    raise exception 'a signed-off inspection cannot change';
  end if;
  return new;
end
$$;
create trigger inspections_guard before update on public.inspections
  for each row execute function public.guard_certified();

-- Only drafts can be deleted.
create function public.guard_delete() returns trigger
language plpgsql as $$
begin
  if old.certified_at is not null then
    raise exception 'a signed-off inspection cannot be deleted';
  end if;
  return old;
end
$$;
create trigger inspections_guard_delete before delete on public.inspections
  for each row execute function public.guard_delete();

-- ---------------------------------------------------------------------------------------------
-- Photos: private bucket. Object names are "<uuid>.jpg". Only the server reads and writes it.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('inspection-photos', 'inspection-photos', false)
  on conflict (id) do nothing;

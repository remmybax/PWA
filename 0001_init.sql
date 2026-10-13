-- Indeca Ticket Log: schema for Supabase (Postgres + Auth + Storage).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
--
-- Row-level security mirrors the permission table in CLAUDE.md:
--   driver    sees only their own loads; can add loads; can never update or delete one
--   dispatch  sees and edits every load; manages people
--   viewer    sees every load (e.g. payroll); no edits
--   everyone else: no active profile row = no access
--
-- Field names in field_status / reading JSON use the app's keys (src/lib/fields.ts): date, lease,
-- ticket, tank, reject, gm, tTemp, topGauge, bTemp, bottomGauge, obGrav, obTemp, sw, sealOn,
-- sealOff, station, waitTime, comments.

-- ---------------------------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------------------------

create type public.app_role as enum ('driver', 'dispatch', 'viewer');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  name        text not null check (length(name) between 1 and 80),
  phone       text unique,
  role        public.app_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helpers used by policies. SECURITY DEFINER so they can read profiles regardless of RLS.
create function public.current_role_if_active() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_if_active() in ('dispatch', 'viewer'), false)
$$;

create function public.is_dispatch() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_if_active() = 'dispatch', false)
$$;

alter table public.profiles enable row level security;

create policy "people see themselves; staff see everyone"
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

-- People are added and changed by the app server with the service key, after it has checked
-- the caller is dispatch (src/server/people.ts). No insert/update/delete policies for users.

-- ---------------------------------------------------------------------------------------------
-- Loads: the 18 sheet columns in sheet order, plus bookkeeping
-- ---------------------------------------------------------------------------------------------

create table public.loads (
  id            uuid primary key,
  driver_id     uuid not null references public.profiles (id),
  logged_at     timestamptz not null default now(),
  photo_key     text,                       -- object name in the "tickets" storage bucket

  ticket_date   date not null,              -- 1  Date
  lease         text not null default '',   -- 2  Lease #
  ticket        text not null,              -- 3  Ticket#
  tank          text not null default '',   -- 4  Tank #
  reject        text not null default 'N' check (reject in ('N', 'Y')),  -- 5
  gm            text not null check (gm in ('G', 'M')),                  -- 6  G/M
  t_temp        text not null default '',   -- 7  T.Temp (blank for meter loads)
  top_gauge     text not null default '',   -- 8  Top gauge or meter
  b_temp        text not null default '',   -- 9  B.Temp
  bottom_gauge  text not null default '',   -- 10 B Gauge or meter
  ob_grav       text not null default '',   -- 11 Ob.Grav
  ob_temp       text not null default '',   -- 12 Ob.Temp
  sw            text not null default '',   -- 13 S&W
  seal_on       text not null default '',   -- 14 Seal On
  seal_off      text not null default '',   -- 15 Seal Off
  station       text not null default '',   -- 16 Station #
  wait_time     text not null default '0' check (wait_time ~ '^[0-9]+(\.[0-9]+)?$'),  -- 17 Wait Time (hours)
  comments      text not null default '',   -- 18 Comments

  field_status  jsonb not null default '{}'::jsonb,  -- per field: read | confirmed | driver | edited
  reading       jsonb,                               -- what the ticket reader returned; never changed

  -- Hard rule: no fractions anywhere. Gauges are feet and decimal inches (14' 3.5").
  constraint no_fractions check (
    concat_ws('|', lease, ticket, tank, t_temp, top_gauge, b_temp, bottom_gauge, ob_grav, ob_temp, sw, seal_on, seal_off, station, wait_time)
      !~ '[0-9]\s*/\s*[0-9]|[½¼¾⅛⅜⅝⅞]'
  )
);

create unique index loads_ticket_unique on public.loads (ticket);
create index loads_driver_date on public.loads (driver_id, ticket_date);
create index loads_date on public.loads (ticket_date);

alter table public.loads enable row level security;

create policy "drivers see their own loads; staff see all"
  on public.loads for select
  using (driver_id = auth.uid() or public.is_staff());

create policy "active drivers log their own loads"
  on public.loads for insert
  with check (driver_id = auth.uid() and public.current_role_if_active() = 'driver');

create policy "only dispatch edits a logged load"
  on public.loads for update
  using (public.is_dispatch())
  with check (public.is_dispatch());

-- No delete policy: loads are never deleted.

-- Who logged it, when, the photo and the original reading never change.
create function public.guard_load_identity() returns trigger
language plpgsql as $$
begin
  if new.driver_id <> old.driver_id or new.logged_at <> old.logged_at
     or new.photo_key is distinct from old.photo_key or new.reading is distinct from old.reading then
    raise exception 'driver, logged time, photo and original reading of a load cannot change';
  end if;
  return new;
end
$$;

create trigger loads_guard before update on public.loads
  for each row execute function public.guard_load_identity();

-- ---------------------------------------------------------------------------------------------
-- Change history (append-only)
-- ---------------------------------------------------------------------------------------------

create table public.load_changes (
  id          bigint generated always as identity primary key,
  load_id     uuid not null references public.loads (id),
  changed_at  timestamptz not null default now(),
  changed_by  uuid not null references public.profiles (id),
  changed_by_name text not null,
  field       text not null,
  old_value   text not null,
  new_value   text not null,
  note        text
);

create index load_changes_load on public.load_changes (load_id, changed_at);

alter table public.load_changes enable row level security;

create policy "history is visible with its load"
  on public.load_changes for select
  using (exists (select 1 from public.loads l where l.id = load_id and (l.driver_id = auth.uid() or public.is_staff())));

create policy "dispatch records changes as themselves"
  on public.load_changes for insert
  with check (public.is_dispatch() and changed_by = auth.uid());

-- No update/delete policies: history is never rewritten.

-- Dispatch edit: update the load and record its history in one transaction. Runs as the caller,
-- so the policies above still apply.
create function public.edit_load(p_id uuid, p_columns jsonb, p_status jsonb, p_changes jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.loads l
     set (ticket_date, lease, ticket, tank, reject, gm, t_temp, top_gauge, b_temp, bottom_gauge,
          ob_grav, ob_temp, sw, seal_on, seal_off, station, wait_time, comments, field_status) =
         (select r.ticket_date, r.lease, r.ticket, r.tank, r.reject, r.gm, r.t_temp, r.top_gauge, r.b_temp,
                 r.bottom_gauge, r.ob_grav, r.ob_temp, r.sw, r.seal_on, r.seal_off, r.station, r.wait_time,
                 r.comments, p_status
            from jsonb_populate_record(l, p_columns) r)
   where l.id = p_id;
  if not found then
    raise exception 'load not found or not allowed';
  end if;

  insert into public.load_changes (load_id, changed_at, changed_by, changed_by_name, field, old_value, new_value, note)
  select p_id, (c->>'at')::timestamptz, auth.uid(), c->>'byName', c->>'field', c->>'from', c->>'to', c->>'note'
    from jsonb_array_elements(p_changes) c;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Tickets read but not logged yet (held server-side so the reading can't be altered)
-- ---------------------------------------------------------------------------------------------

create table public.pending_readings (
  photo_key   text primary key,
  driver_id   uuid not null references public.profiles (id),
  reading     jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.pending_readings enable row level security;

create policy "drivers manage their own pending readings"
  on public.pending_readings for all
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid() and public.current_role_if_active() = 'driver');

-- ---------------------------------------------------------------------------------------------
-- Ticket photos: private bucket. Object names are "<uuid>.jpg".
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('tickets', 'tickets', false)
  on conflict (id) do nothing;

create policy "active drivers upload ticket photos"
  on storage.objects for insert
  with check (bucket_id = 'tickets' and public.current_role_if_active() = 'driver');

create policy "photos are visible with their load or pending scan"
  on storage.objects for select
  using (
    bucket_id = 'tickets' and (
      public.is_staff()
      or exists (select 1 from public.pending_readings p where p.photo_key = name and p.driver_id = auth.uid())
      or exists (select 1 from public.loads l where l.photo_key = name and l.driver_id = auth.uid())
    )
  );

-- No update/delete policies on photos: the original ticket photo is kept.

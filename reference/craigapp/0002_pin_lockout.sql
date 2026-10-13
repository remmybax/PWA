-- Wrong-PIN attempts, so a mobile number is locked for a while after too many (src/server/pin.ts).
-- Only the app server (secret key) reads and writes this table; no one signed in can see it.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table public.sign_in_failures (
  id     bigint generated always as identity primary key,
  phone  text not null,
  at     timestamptz not null default now()
);

create index sign_in_failures_phone_at on public.sign_in_failures (phone, at);

alter table public.sign_in_failures enable row level security;
-- No policies: invisible to everyone except the server.

# Connecting the app to Supabase

About 15 minutes. You do steps 1–4 (they need your account); after that the app takes over.

## 1. Create the project

1. Sign up at https://supabase.com and create a **New project**.
   - Name: `indeca-ticket-log`
   - Region: **East US (Ohio)** or **Central US**, close to Odessa
   - Database password: generate one and keep it somewhere safe (you won't need it day to day)
2. Wait a minute or two for it to finish setting up.

> **Free plan:** projects pause after about a week with nobody using it. Restore it from the
> dashboard if that happens; nothing is lost. Once drivers use it daily it won't pause, and the
> Pro plan (about $25/month) never pauses and adds daily backups.

## 2. Create the tables

1. In the dashboard: **SQL Editor** → **New query**.
2. Paste all of `supabase/migrations/0001_init.sql` and click **Run**. It should say "Success".
3. New query again: paste `supabase/migrations/0002_pin_lockout.sql` and **Run**.

This creates the tables, the photo bucket and the rules for who can see what (drivers see only
their own loads, only dispatch can edit).

## 3. Turn off public sign-ups

**Authentication** → **Sign In / Providers** → **Email**: turn **off** "Allow new users to sign up".
Only dispatch adds people (from the app). Leave the Email provider itself on; the app uses it
behind the scenes with phone number + PIN.

## 4. Copy the keys into the app

**Project Settings** → **API Keys** (and **Data API** for the URL). Create a file named
`.env.local` in the project folder:

```bash
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
PIN_SECRET=<a long random string; generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))">
GEMINI_API_KEY=...
```

Older projects show "anon" and "service_role" keys instead; those work too
(`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

`GEMINI_API_KEY` is optional: a free key from https://aistudio.google.com/apikey turns on automatic
ticket reading. Without it, drivers type the fields in from the photo.

`PIN_SECRET` turns 5-digit PINs into passwords Supabase accepts. Set it once and never change it:
changing it makes every PIN stop working.

**The secret key can read and change everything.** Keep it in `.env.local` only. Never email it
or commit it (`.env.local` is already excluded from git).

## 5. Create Craig's sign-in

```bash
npm run create-dispatcher -- --name "Craig" --phone 4325551234 --pin 12345
```

Use his real mobile number and a 5-digit PIN you'll give him. He then signs in and adds drivers
(name, mobile number, PIN) under **People & access**.

## 6. Run it

```bash
npm run dev
```

The sign-in screen now asks for a mobile number and PIN instead of the name picker. Sample data
isn't loaded into Supabase; it starts empty.

## What lives where

| What | Where |
|---|---|
| People and their roles | `profiles` table (+ Supabase Auth for the PIN) |
| Loads | `loads` table, one row per load, the 18 sheet columns |
| Edit history | `load_changes` table, never rewritten |
| Ticket photos | `tickets` storage bucket (private) |

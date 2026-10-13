# From demo to real: Supabase

About 15 minutes. Same steps as the Ticket Log, but in a **new, separate Supabase project**, so this
app can never touch the Ticket Log's data (and can be deleted without affecting it).

> The free Supabase plan allows two projects per account. If the Ticket Log already uses one, this
> takes the second.

## 1. Create the project

1. https://supabase.com → **New project**.
   - Name: `indeca-truck-inspection`
   - Region: **East US (Ohio)** or **Central US**
   - Database password: generate one and keep it somewhere safe
2. Wait for it to finish setting up.

## 2. Create the tables

**SQL Editor** → **New query** → paste all of `supabase/migrations/0001_init.sql` → **Run**.

It creates the people, fleet, inspection and photo storage. Every read and write goes through the
app, which checks the person's role first; the tables are locked to everyone else.

## 3. Turn off public sign-ups

**Authentication** → **Sign In / Providers** → **Email**: turn **off** "Allow new users to sign up".
Leave the Email provider itself on; the app uses it behind the scenes with phone number + PIN.

## 4. Keys

**Project Settings** → **API Keys** (and **Data API** for the URL). In the `inspection-app` folder,
copy `env.example` to `.env.local` and fill in:

```bash
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
PIN_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))">
```

**The secret key can read and change everything.** Keep it in `.env.local` only; never paste it in a
chat or commit it (`.env.local` is already excluded from git).

## 5. First manager

```bash
npm run create-manager -- --name "Dan V." --phone 4325551234 --pin 12345
```

Sign in with that number and PIN. Then:

- **Fleet**: add the real trucks and trailers (unit number, VIN, plate, usual trailer).
- **People**: add drivers, the shop and anyone view-only, each with a mobile number and a PIN.

The Supabase build starts empty; none of the demo data is copied.

## 6. Put it online

Same choice as the Ticket Log (it currently runs on the PC). Any Next.js host works, e.g. Netlify or
Vercel. Set the same `.env.local` values there, plus:

```bash
PUBLIC_BASE_URL=https://<the address it's hosted at>
TICKET_LOG_URL=https://<the Ticket Log's address>   # optional
```

`PUBLIC_BASE_URL` matters: it's what every QR code points to, so set it before printing stickers.

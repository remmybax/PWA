# Indeca Ticket Log

Replaces the handwritten driver log sheet at Indeca Crude Xpress. A driver photographs each run
ticket, the app reads the printed fields into the weekly log, and dispatch reviews, edits and exports
every driver's loads for payroll. The brief is in [CLAUDE.md](CLAUDE.md). Where the build stands and
what still needs a decision is in [docs/BUILD-NOTES.md](docs/BUILD-NOTES.md).

## Run it

```bash
npm install
npm run dev     # development
npm run build && npm run start     # what drivers should use: faster, no dev badge
```

Without Supabase configured, the app runs as a local demo: data in `.data/`, and you pick a person
on the sign-in screen. To use Supabase (real sign-in with mobile number + PIN, shared database,
photo storage), follow [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md).

In the local demo, open http://localhost:3000 and pick a person:

| Person | Sees |
|---|---|
| Dan VanWormer, Driver 02–04 | Scan screen → review → My log (their own loads only) |
| Craig | Dispatch dashboard, edits, export, People & access |
| Blaze | Dispatch dashboard read-only, export (the "viewer" role dispatch can grant) |

Sample data is the week of 09/20 – 09/26/2026 from the designs. Use the week arrows (driver) or
**Go to the latest loads** (dispatch) to get there. `npm run seed` resets the data.

**Phones:** the live camera needs HTTPS. Over plain `http://<your-pc>:3000` on a phone, the shutter
opens the phone's own camera instead, which works the same.

## Ticket reading

With `GEMINI_API_KEY` set (free tier) the app reads the photo with Gemini and flags any field it's
unsure of for the driver to confirm. `ANTHROPIC_API_KEY` uses Claude instead (paid). With neither,
or if reading fails, the driver types the fields in from the photo. See `.env.example`.

To measure accuracy on real tickets, see [samples/README.md](samples/README.md):

```bash
npm run accuracy
```

## Checks

```bash
npm test        # unit tests: formats (no fractions), permissions, logging, edits, history, access
npm run lint    # TypeScript
```

## Layout

| Path | What |
|---|---|
| `src/lib/fields.ts` | The 18 sheet columns. Drives screens, reader prompt, export and PDF |
| `src/lib/format.ts` | Parsing/validation. Converts any fraction to decimals |
| `src/server/loads.ts` | Permission rules, logging, dispatch edits with change history |
| `src/server/store.ts` | Storage interface + local JSON store (`.data/`) |
| `src/server/supabase-store.ts` | Supabase storage (used when `SUPABASE_URL` is set) |
| `src/server/reader/` | Ticket reader: Gemini, Claude, or type-it-in (shared prompt in `prompt.ts`) |
| `src/server/export.ts` | Payroll Excel/CSV and the weekly sheet PDF |
| `src/app/` | Screens: `/` scan, `/my-log`, `/sheet`, `/dispatch`, `/dispatch/people` |
| `supabase/migrations/` | Supabase schema with row-level security (paste into the SQL Editor) |
| `design/` | Claude Design references (not shipped) |

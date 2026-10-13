# Build notes

Where each build step from CLAUDE.md stands, what was decided along the way, and what still needs
input.

## Status

| Step | State |
|---|---|
| 1. Data model and seed data | Done. The local demo store uses the sample rows from the designs. |
| 2. Driver flow | Done, tested on a phone: scan → photo preview → check fields → log → My log → full sheet / PDF. |
| 3. Ticket reading | Done with Gemini Flash-Lite (free tier, 500 reads/day). Tested on a handful of real tickets. Its confidence scores aren't reliable, so the driver ticks Ticket #, Top gauge and B Gauge on every load. A proper accuracy run (`npm run accuracy`, 10–20 tickets) is still to do. |
| 4. Dispatch dashboard, edits, export | Done: Day / Week / Month / From–To / All time, driver filter, tiles, side panel with photo, edits with reason and change history. Export to CSV, Excel, PDF or JPEG. |
| 5. Auth and roles | Done on Supabase: mobile number + 5-digit PIN, lockout after 5 wrong PINs, roles enforced on every page and API route and by row-level security in the database. People & access lets dispatch add people, change roles, set PINs and switch access off. |
| 6. Pay record | Not started (not phase 1). |

## Decisions made along the way (easy to change)

- **Supabase or local file.** With `SUPABASE_URL` set, everything lives in Supabase. Without it, a local
  JSON file (`.data/`) and a pick-your-name sign-in are used. That's for development and the tests,
  not for real use.
- **Sign-in is mobile number + 5-digit PIN that dispatch sets** (the PIN length Indeca already
  uses). Supabase needs passwords of 6+ characters, so the app turns the PIN into a long password with
  `PIN_SECRET`. 5 wrong PINs lock a number for 15 minutes, and setting a new PIN unlocks it. No text
  message or email is ever sent, so there's no SMS cost.
- **Supabase free plan pauses** after about a week unused. Daily use keeps it awake; Pro (about
  $25/month) never pauses and has backups.
- **Reading rules** (in the prompt, `src/server/reader/prompt.ts` and `src/lib/fields.ts`):
  printed text only, handwriting ignored; an empty printed space stays empty; a printed 0 stays 0;
  fractions become decimals.
- **Station #** comes from the ticket: a 3–4 digit station code if the last line of the Receiver has
  one (PLAINS BADGER TRK - 7185 → 7185), otherwise that line's name (DB ANDREWS, CR1 - MARATHON),
  or the single-line receiver (P66). Falls back to the driver's last station. Required to log.
- **Required to log:** Date, Ticket #, Tank #, G/M, both gauges or meter readings, Ob.Grav, Ob.Temp,
  S&W, Station #, plus T.Temp and B.Temp for gauge loads. Lease # (some tickets have none), seals and
  comments are optional. Reject defaults to N and Wait Time to 0.
- **Ticket # must be unique.** A second load with the same number is refused ("Already logged").
- **Driver can correct any read field** by tapping it. A corrected field is marked "driver
  confirmed", and the app's original reading is kept.
- **Meter loads:** T.Temp and B.Temp are cleared, and the gauge columns hold the meter start and end.
- **Weeks run Sunday–Saturday**, like the 09/20 – 09/26 example in the designs. "Today" is Odessa
  time (America/Chicago).
- **Exports** cover whatever range and driver the dashboard shows. Excel has a Loads sheet and a By
  driver summary; every value is text except Wait Time, so Excel never drops leading zeros or
  mangles gauges. The JPEG opens the phone's share sheet so it can go straight into a text.
- **"Viewer" role** is for people dispatch grants access to (e.g. Blaze in payroll): sees and
  exports everything, edits nothing.
- **If reading fails** (no signal, outage, free-tier limit, not a ticket), the driver gets a
  type-it-in form, so a load can always be logged. Claude (paid) is wired in as an alternative
  reader (`ANTHROPIC_API_KEY`) if Indeca ever wants more accurate reading.

## Not done / known gaps

- **Hosting.** It runs on Dan's PC for now (`npm run start`, phones on the same Wi-Fi). Putting it
  online (e.g. Netlify) gives a permanent HTTPS address that works over cell signal.
- **Offline.** A photo taken with no signal shows "No signal, try again". Queuing it on the phone
  and uploading later is the biggest gap for real use in the field.
- **Keys pasted in chat** (Supabase secret key, Gemini key) should be replaced before real drivers
  use it.
- **Test data in Supabase:** two switched-off test accounts ("TEST … (Claude)") and their loads.
- The live camera view needs HTTPS; over plain HTTP the shutter opens the phone's own camera.
- `npm audit` flags a moderate `uuid` advisory inside `exceljs`. It doesn't affect how exceljs uses
  uuid here; revisit when exceljs updates.

## Questions for Craig (from CLAUDE.md)

The ones that would change the code:

- **Blaze's file format:** it decides the export columns and layout.
- **Fields he actually uses / extra fields** (net barrels, BOL #): add them in `src/lib/fields.ts`.
  The reader prompt, schema, screens, export and PDF all follow from there.
- **Approved software/hosting:** Supabase and wherever the app is hosted.

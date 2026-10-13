# Build notes

What was built, what was decided along the way (all easy to change), and what's still open.

## Built

| Part | State |
|---|---|
| Checklist | 6 sections, 86 items (fewer without a trailer), from `planning/monthly-inspection-checklist.md`. Trailer items drop out for a bobtail inspection. |
| Driver flow | Home (Ticket upload / Truck inspection) → pick truck and trailer → section by section → review → type name to sign → QR label and paper report. Drafts can be left and picked up later; picking the same truck resumes the draft. |
| Photos | Live camera (OneTrip-style, no gallery), flash where the phone allows, every photo shrunk on the phone and stamped with unit, item and time. Up to 6 per item. |
| Answers | Pass / Fail / N/A; documents Present / Missing / N/A plus date; readings with limits judge themselves (tread below 4/32" steer or 2/32" drive fails); counts (triangles, chocks, seals) fail when short. |
| Fails | Need a note and a photo. The review screen lists them. "In service" can't be chosen while anything failed. |
| Locking | Once signed, nothing changes, except a manager or the shop marking a failed item repaired (with note, optional photo). The original failure is never hidden. |
| Carry-over | Starting a truck shows the open defects from its last inspection. |
| Saving | Every answer saves as it's tapped. With no signal, answers and photos wait on the phone and send by themselves when signal returns (a banner says how many are waiting; the review screen warns too). |
| QR | Each signed inspection gets a long random link. Anyone with it can read that one report (with photos), nothing else. |
| Sticker | Picture sized for the Nelko PM220 at 203 dpi: 50 × 30 (default), 40 × 30, 50 × 50 mm. Share straight to the Nelko app on a phone, or save it. |
| Paper report | One US Letter page (two if long): unit info, status boxes, defects, paperwork dates, supplies, walk-around, comments, signature and "reviewed by" line, sticker box top right. Option to print the QR straight onto the page. |
| Dashboard | Overview tiles, trucks table (status, last/next inspection, defects, documents), needs-attention list, recent inspections; Inspections (filter by unit, status, month); Defects (shop worklist, recent repairs); Documents (expired / due in 30 days / all); unit pages with history, dates and photo gallery; Fleet; People; CSV export (`/dashboard/export`, or `?defects=1` for one row per defect). |
| Roles | Driver (own inspections only), Manager (everything), Mechanic/shop (dashboard + repairs + can inspect), View only. |
| Storage | Local file demo, or Supabase (schema in `supabase/migrations/0001_init.sql`). |
| Tests | 21 tests on the rules (`npm test`). |

## Decisions made (easy to change)

- **Separate app, same stack as the Ticket Log** (Next.js + Supabase), its own folder and its own
  Supabase project. Nothing in the Ticket Log was changed.
- **Monthly** = due one calendar month after the last sign-off. Warnings start 30 days out
  (`INSPECTION_INTERVAL_MONTHS`, `WARN_DAYS` in `src/lib/inspection.ts`).
- **Open defects** are counted from each truck's latest inspection. If a newer inspection passes an
  item, the old failure no longer counts as open.
- **Document dates** shown on the dashboard come from the latest inspection that recorded them.
  Trailer documents (trailer registration, tank tests) belong to the trailer.
- **Sign-off** is the inspector typing their name, after being signed in with their own PIN.
- **Overall status** is the inspector's call; the app only suggests one and blocks "In service" when
  something failed. Which fails should force "Out of service" is Indeca policy, not decided here.
- **The QR page** says when a newer inspection exists for that truck, but doesn't link to it.
- Supplies list and minimums (3 triangles, 2 chocks, 10 seals) are guesses to confirm.

## Not done / known gaps

- **Not online yet.** Runs on a PC like the Ticket Log. QR stickers need `PUBLIC_BASE_URL` set to
  the real address first, or they'll point at the PC.
- **No-signal photos attach when their section is open.** A photo taken with no signal uploads by
  itself later, and is attached to its item the next time that section is on screen. Signing is
  blocked until it is, so nothing is lost, but the driver may need to open the section again.
- **No offline app shell** (service worker), so the app must be opened with signal at least once
  per session. It can still be added to the home screen.
- **Supabase build not run against a real project.** The demo build is fully tested; the Supabase
  store follows the Ticket Log's working pattern but needs one real setup pass.
- **Checklist items need Dan's review**: permits list, whether tank V/K/I/P markings apply, supplies,
  who signs, walk order (currently free order, any section any time).
- **Ticket Log link** is a plain link to its address. True "one app, two modes" (shared sign-in)
  would mean merging the two apps later; they're built the same way so that's possible.

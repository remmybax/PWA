# Indeca Truck Inspection

Monthly vehicle inspections for Indeca Crude Xpress. A driver walks the truck with their phone:
a checklist of about 85 items, live-camera photos stamped with the unit and time, paperwork with
expiration dates, and a supplies count. Signing locks the inspection and produces:

- a **QR sticker** sized for the Nelko PM220 label printer (50 × 30, 40 × 30 or 50 × 50 mm),
- a **one-page paper report** with a box at the top right for the sticker,
- a **read-only report page** that the QR opens for anyone holding the paper, with every photo.

Managers and the shop get a **fleet dashboard**: which trucks are due or overdue, open defects
(marked repaired with a note and photo), every document date coming up in the next 30 days,
inspection history and photos per truck, fleet and people management, and a CSV export.

It is a separate app from the Ticket Log (CraigApp) but built the same way and in the same Indeca
style, so the two can later share one driver home screen. The driver home already asks
"Ticket upload or Truck inspection?"; Ticket upload opens the Ticket Log at `TICKET_LOG_URL`.

## Run it (local demo)

```bash
cd inspection-app
npm install
npm run dev            # then open http://localhost:3000
```

With no Supabase set up, the app runs as a demo: data lives in `.data/`, and the sign-in screen
lets you pick a person. The demo fleet (trucks 101–106, trailers T-201–T-205) comes with signed
inspections covering every situation: in service, needs repair, out of service, an overdue truck, a
truck never inspected, expiring and expired documents, and a half-done inspection.

| Sign in as | To see |
|---|---|
| Mike Reyes (driver) | The driver home, starting and doing an inspection, the QR label |
| Jose Garza (driver) | An inspection already in progress (truck 104) |
| Dan V. (manager) | The dashboard, fleet, people, marking defects repaired |
| Ray (Shop) (mechanic) | The dashboard, marking defects repaired |
| Office (view only) | The dashboard without any editing |

`npm run reset-demo` puts the demo data back to the start.

**On a phone:** run `npm run dev`, then open `http://<the PC's Wi-Fi address>:3000` on a phone on
the same Wi-Fi. Over plain http the live viewfinder is blocked by the phone's browser, so the shutter
opens the phone's own camera instead; once the app is online with https, the live viewfinder works.
QR codes made in the demo point at the PC's address, so they only open on that Wi-Fi.

## Checks

```bash
npm test        # inspection rules: verdicts, required photos, sign-off, locking, repairs, fleet, people
npm run lint    # TypeScript
npm run build   # production build
```

## Where things are

| | |
|---|---|
| The checklist (every item, photo rule, limit) | `src/lib/checklist.ts` |
| Rules: pass/fail, done, defects, dates | `src/lib/inspection.ts` |
| Who can do what | `src/server/inspections.ts`, `fleet.ts`, `people.ts` |
| Storage: local file or Supabase | `src/server/store.ts`, `supabase-store.ts`, `supabase/migrations/` |
| Driver screens | `src/app/page.tsx`, `src/app/inspect/` |
| Camera | `src/components/Camera.tsx` |
| QR page and paper report | `src/app/r/[token]/`, `src/components/ReportView.tsx` |
| QR sticker | `src/components/LabelMaker.tsx` |
| Dashboard | `src/app/dashboard/` |

Changing the checklist is one file: `src/lib/checklist.ts`. The screens, report, paper report,
dashboard and export all follow it.

**[Screenshot tour](docs/TOUR.md)** · More: [docs/BUILD-NOTES.md](docs/BUILD-NOTES.md) (decisions and gaps),
[docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) (going from demo to real).

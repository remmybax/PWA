# Indeca Ticket Log — build brief

Replace the handwritten daily/weekly driver log at Indeca Crude Xpress (Odessa, TX) with an app.
Drivers photograph each run ticket (BOL). The app reads the printed fields into a structured log.
Dispatch (Craig) reviews every driver's loads and exports them for payroll (Blaze).

Background: `docs/proposal-for-craig.md`. The paper sheet being replaced: `docs/current-paper-log-sheet.png`.

## Users and permissions

| Role | Can do |
|---|---|
| Driver | Capture tickets, confirm/correct unreadable fields, add Reject / Station # / Wait Time / Comments. **View only** after a load is logged; can't edit it. Sees only their own loads. |
| Dispatch (Craig) | View, edit and export every driver's loads. Every edit is kept in a change history (original value is never lost). Grants access to others. |
| Everyone else | No access unless dispatch grants it. |

## The log record: exact fields, in this order (matches the paper sheet)

Header: **Employee Name**, **Week**.

| # | Field | Source | Notes |
|---|---|---|---|
| 1 | Date | ticket | MM/DD |
| 2 | Lease # | ticket | |
| 3 | Ticket# | ticket | run ticket number; unique per load |
| 4 | Tank # | ticket | |
| 5 | Reject | driver | N / Y |
| 6 | G/M | ticket | G = gauge, M = meter |
| 7 | T.Temp | ticket | top temp, °F; blank for meter loads |
| 8 | Top gauge or meter | ticket | gauge as ft' in" or meter reading |
| 9 | B.Temp | ticket | bottom temp, °F; blank for meter loads |
| 10 | B Gauge or meter | ticket | |
| 11 | Ob.Grav | ticket | observed gravity |
| 12 | Ob.Temp | ticket | observed temp, °F |
| 13 | S&W | ticket | |
| 14 | Seal On | ticket | |
| 15 | Seal Off | ticket | |
| 16 | Station # | driver | |
| 17 | Wait Time | driver | decimal hours (0.25, 1.5) |
| 18 | Comments | driver | free text |

Also stored per load: driver, logged-at timestamp, original ticket photo, per-field status
(read by app / confirmed by driver / edited by dispatch) and the change history.

**Hard rule: no fractions anywhere. Inches are decimals: 4' 1.25", 14' 3.5", 13' 8.75".**
This applies to display, input, storage and export.

## Screens (designs in `design/`)

The `.dc.html` files are design references made in Claude Design. Read their inline styles for
layout, spacing, colors and copy. They need a design runtime to render, so don't ship them.
Rebuild the screens as real components.

1. `Main.dc.html`: Driver, scan ticket. Camera with a frame guide, plus a "My log" link.
2. `Review.dc.html`: Driver, check fields. The app lists the fields it read. Any field it couldn't read
   is flagged, and the driver must confirm or correct it before logging. Below that is a "You add" section (Reject, Station #, Wait Time, Comments).
   "Log this load" appends the row, with no separate submit step.
3. `MyLoads.dc.html`: Driver, my log on a phone, view only. The weekly sheet scrolls sideways. Shows loads/wait totals.
4. `DriverLog.dc.html`: Driver's full weekly sheet laid out like the paper form, with a Download PDF button.
5. `Dispatch.dc.html`: Craig's dashboard. Day/Week/Month, a driver filter, and totals tiles.
   The table has all 18 sheet columns plus Driver and Status. Clicking a row opens a side panel with the
   ticket photo beside every field, plus Edit fields and Change history. "Export for payroll" is also here.

## Design system

- Logo: `assets/indeca-logo.png`. White header bar, 4px navy bottom border.
- Navy `#0D085C`: headers, primary buttons, table header.
- Orange `#F05004` (logo orange): non-text accents only (camera frame, shutter).
- Dark orange `#C44104`: orange buttons that carry white text (for contrast).
- Orange tint `#FDE6D6` with text `#8A3303` marks driver-confirmed or flagged fields.
- Neutrals: ground `#F2F3F5`, ink `#161C2A`, muted `#565B66`, lines `#D5D8DE`.
- **Sharp corners everywhere (border-radius 0). No pills or rounded "bubbles."**
- Type: Barlow Condensed (headings), IBM Plex Sans (body), IBM Plex Mono (numbers).
- Touch targets ≥ 44px. It must be readable in direct sun.

## Suggested stack (change it if Indeca has approved software)

- **Installable web app (PWA)** so drivers don't need an app store: Next.js + TypeScript, mobile-first.
- **Supabase**: login, Postgres, and photo storage. Row-level security enforces "drivers see only their own loads, can't edit."
- **Ticket reading**: send the photo to the Claude API (vision). Ask for structured JSON of the fields above, with a
  confidence value per field. Any field with low confidence is flagged for the driver to confirm.
- Export: CSV/Excel for payroll, and a PDF that matches the paper sheet.

## Project setup

- Run `git init` before writing code, and commit after each build step.
- Keep the project outside OneDrive or any other synced folder, because syncing `node_modules` is slow and causes conflicts.
  If it has to stay in a synced folder, exclude `node_modules` and `.next`.

## Build order

1. Data model and seed data (use the sample rows in `design/MyLoads.dc.html` and `design/Dispatch.dc.html`).
2. Driver flow: capture → review/confirm → log → my log. Use a mock of the ticket-reading step first.
3. Wire in the real ticket reading using the photos in `samples/`. Measure field-by-field accuracy.
4. Dispatch dashboard, editing with change history, and export.
5. Auth and roles.
6. Later (not phase 1): a pay record, where dispatch adds pay per load after payroll runs.

## Open questions (ask Craig before phase 1 is final)

- What format is his current master log in? Is he re-keying the photographed sheets by hand?
- What exactly does Blaze in payroll need, and in what file format?
- Which fields does he actually use, and which are just carried along?
- Does he want fields the paper sheet doesn't have (net barrels, a separate BOL #)? The record has exactly the
  18 sheet fields until he says otherwise. Keep the ticket-reading prompt and schema easy to extend.
- Does he want daily/weekly/monthly exports, or live access?
- Is there approved software or hosting the app has to fit into?

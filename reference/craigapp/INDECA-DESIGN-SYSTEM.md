# Indeca app design system

The look of the Indeca Ticket Log, written down so other Indeca apps can match it. The mockups in
`design/*.dc.html` (made in Claude Design) show the original screens; the built app (`src/app/`,
`src/app/globals.css`) is the source of truth where they differ (see "Changed since the mockups").

## Feel

Industrial and plain: a work tool used in a truck cab and in direct sun. Flat colour, hard edges,
strong contrast, big touch targets. No gradients, shadows, rounded corners, cards-with-shadows or
decorative icons.

## Logo and header

- Logo: `assets/indeca-logo.png` (flame + INDECA / CRUDE XPRESS), on white only.
- Every screen starts with a **white header bar with a 4px navy bottom border**. Logo on the left
  (36px tall on phones, 44px on desktop); one action on the right (e.g. "My log", "View only" chip,
  or the user's name and Sign out).

## Colour

| Token | Hex | Use |
|---|---|---|
| Navy | `#0D085C` | Headings, primary buttons, table headers, selected segment, the header rule |
| Navy line | `#3A3585` | Dividers inside navy table headers |
| Navy tint | `#E0DFF1` | "Edited by dispatch" cells and notes |
| Navy select | `#E7E6F3` | Selected table row (plus a 4px dark-orange bar on its left edge) |
| Orange | `#F05004` | Logo orange. **Non-text accents only**: camera frame corners, shutter, progress bar |
| Dark orange | `#C44104` | The one main action per screen when it's orange (Log this load, Use photo); always white text |
| Orange tint | `#FDE6D6` | Fields that need or got a driver's check; highlighted "just logged" row |
| Orange ink | `#8A3303` | Text on orange tint; warnings |
| Orange deep | `#6B2800` | Body text inside orange notes |
| Orange line | `#F5BF9A` | Border of orange-tinted tiles |
| Ground | `#F2F3F5` | Page background |
| Ink | `#161C2A` | Body text, sheet grid lines |
| Ink 2 | `#3A404C` | Secondary labels |
| Muted | `#565B66` | Help text, captions |
| Lines | `#D5D8DE` | Borders of panels and quiet buttons |
| Lines soft / row | `#E8EAEE` / `#E1E4E9` | Row dividers |
| Field line | `#9AA0AC` | Input borders |
| Chip | `#E3E6EB` | Neutral chips ("View only"), sheet column header background |
| OK green | `#2F6B3A` | Check marks, "Ready to log" |
| Camera | `#12161F` / `#1C2230` / `#B9BECA` | Dark camera screen: background / viewfinder / muted text |

## Type

| Role | Font | Notes |
|---|---|---|
| Headings | **Barlow Condensed** 700, UPPERCASE, letter-spacing 0.02em | Screen titles 24–28px in navy |
| Section labels | Barlow Condensed 600, 15px, UPPERCASE, letter-spacing 0.06em, navy | "READ FROM TICKET", "YOU ADD" |
| Body | **IBM Plex Sans** 400/500/600 | 14–16px; inputs are 16px so iPhones don't zoom |
| Numbers and codes | **IBM Plex Mono** 400/500 | Every value on a sheet, tickets, gauges, totals (26–28px for big totals) |

## Shape and spacing

- **Sharp corners everywhere: border-radius 0.** No pills, no rounded bubbles. Enforced globally.
- Touch targets at least **44px** tall; main actions 52–56px.
- Phone screens: 16px side padding, max width 520px centred on desktop.
- Borders are 1px; emphasis borders 2px (flagged field box); the header rule 4px.

## Components

- **Buttons:** primary = navy fill, white text. Main orange action = dark orange fill, white text,
  full width, 56px, with an arrow icon. Outline = white with navy border and navy text. Quiet =
  white with grey border.
- **Segmented control:** joined buttons in a 1px navy frame; selected = navy fill + white text,
  others white + navy text (Reject No/Yes, Day/Week/Month/From–To/All time, Gauge/Meter).
- **Inputs:** white, 1px field-line border, 44px tall, mono for numbers. Error = 2px dark-orange
  border plus orange-ink message underneath.
- **Flag box:** orange-tint panel with a 2px dark-orange border, a bold label ("B Gauge — couldn't
  read clearly"), help line, the input, and a "Matches the ticket" checkbox.
- **Tick row:** an orange-tint line in a list with a 22px checkbox, the label and the value; used for
  values that must be checked every time.
- **Read row:** label on the left, mono value and a green check on the right, 44px tall; tap to edit.
- **Status chips:** small, square, 12px semibold. Neutral grey "Read OK", orange tint "Driver
  confirmed", navy tint "Edited by dispatch".
- **Tiles:** white boxes with a 1px border, small muted label over a 28px mono number. The one tile
  that needs attention is orange tint.
- **Sheet table:** recreates the paper log. 1px ink grid, headings exactly as printed (two-line
  headings allowed), mono values, em dash for blanks. Any value too long for its column shrinks
  (13 → 11 → 9.5px) and finally wraps onto two lines; it is never cut off.
- **Dispatch table:** navy header row, white rows, light row lines; the selected row is navy-select
  with an orange bar on the left. Cells tinted by status.
- **Side panel:** 420px white panel on the right: who and when, a big Barlow title, the photo,
  coloured notes, a 3-column grid of label/value pairs, then actions.
- **Camera screen:** dark. Orange corner brackets frame the subject, a dashed placeholder sheet
  inside, an 80px square shutter (white frame, orange square), side buttons for flash and upload.
  After a photo it shows the photo with Retake / Use photo.

## Screens (mockups → built app)

| Mockup | Screen |
|---|---|
| `Main.dc.html` | Driver: scan ticket (camera) |
| `Review.dc.html` | Driver: check fields, add Reject / Station / Wait / Comments, Log this load |
| `MyLoads.dc.html` | Driver: My log on the phone, sideways-scrolling weekly sheet |
| `DriverLog.dc.html` | Full weekly sheet laid out like the paper form, Download PDF |
| `Dispatch.dc.html` | Dispatch dashboard: ranges, driver filter, tiles, table, side panel |

## Changed since the mockups

- **Sign-in** screen (mobile number + 5-digit PIN) and **People & access** page were added in the
  same style.
- **Photo preview** step on the camera screen (Retake / Use photo) before upload.
- **Tick rows** on the review screen: Ticket #, Top gauge and B Gauge are ticked off on every load.
- **Type-it-in form** when nothing could be read: one plain list of inputs, G/M as a Gauge/Meter
  segmented control.
- Dispatch ranges are **Day / Week / Month / From–To / All time**, and the export row reads
  **Export to: CSV · Excel · PDF · JPEG** (outline buttons) instead of one orange "Export for
  payroll" button.
- Shrink-to-fit on every sheet column.

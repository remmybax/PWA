# BOL Ticket Logging App — Proposal for Craig

Sep 24, 2026 · @Dan

## The Problem

Right now, every driver's BOL ticket information gets hand-copied onto a paper gauge log sheet at the end of the day. That sheet is then photographed and sent to Craig in dispatch, who reviews it and forwards it to Blaze in payroll.

That's three manual steps between the actual ticket and the record that determines pay:

1. Driver hand-transcribes ticket data onto paper
2. Driver photographs the paper sheet
3. Craig manually reviews the photo and likely re-keys it into his own master log before it goes to payroll

Every one of those steps is a place for a transcription error, a delay, or a lost or illegible sheet — and none of it needs to happen by hand anymore.

## Proposed Solution

Build a simple app where a driver photographs each BOL ticket, and the app reads the printed fields straight off the ticket into a structured spreadsheet — no hand transcription onto paper, no separate photo-of-a-log-sheet step.

Craig ends up with the same fields as today's paper log sheet: Date, Lease #, Ticket#, Tank #, Reject, G/M, T.Temp, Top gauge or meter, B.Temp, B Gauge or meter, Ob.Grav, Ob.Temp, S&W, Seal On, Seal Off, Station #, Wait Time and Comments. They arrive already organized and typed correctly, instead of as a photo of handwriting he has to read and likely re-enter himself. The app can also read fields the sheet doesn't carry, such as net barrels, if Craig wants them.

## How It Would Work

1. Driver photographs the BOL ticket right after each load, not batched at end of day
2. The app confirms it captured every required field before the driver moves on
3. That load's data appends as a new row in the driver's log automatically — no separate submit step
4. Craig can pull the data by day, week, or month whenever he needs it, rather than waiting on a photo text from each driver

## Access and Permissions

- Drivers get a view-only link to their own logged loads — a way to check their own numbers, no editing
- Craig has full permissions: view, edit, and export across every driver's data
- Everyone else stays out unless Craig grants access

## Future Extension: Living Pay Record

Once loads are logged digitally, Craig could add actual payment figures to the same records after payroll runs. That would turn the tool into a running pay record drivers can check anytime, replacing the separate weekly load sheet that currently tells drivers what they got paid.

## Open Questions for Craig

- [ ] What format is his current master log in (spreadsheet, software, something else)?
- [ ] Is he currently re-keying the photographed log sheets by hand?
- [ ] What does he need to hand off to Blaze in payroll, and in what format?
- [ ] What fields does he actually use versus what's just carried along on the ticket?
- [ ] Does he want anything the paper sheet doesn't carry today, such as net barrels or a separate BOL #?
- [ ] Would he want daily/weekly/monthly exports, or live access to the data at any time?
- [ ] Is there approved software or hosting the app has to fit into?

## Next Steps

1. Build a first working draft of the app: ticket capture plus the driver's weekly log sheet
2. Demo it to Craig, using this doc as background, and get answers to the open questions above
3. Confirm he'd actually use it, and revise for any constraints (approved software, payroll format) before rolling it out
4. Hold the pay-record extension until the core log is working

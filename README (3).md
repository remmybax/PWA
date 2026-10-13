# Sample tickets

Put 10–20 real run ticket photos here before trusting the ticket reader. Include a mix:

- Clean gauge tickets
- Meter (LACT) tickets
- Wrinkled, glare, or low-light shots
- Tickets from different purchasers/formats

Photos in this folder are **not committed to git** (see `.gitignore`), since real tickets carry lease
and seal numbers.

## Answers

Copy `answers.example.csv` to `answers.csv` and add one row per photo with the correct values, read by
a person from the paper ticket. The `file` column is the photo's file name. Other columns can use the
sheet headings (`Top gauge or meter`) or the field keys (`topGauge`). You only need the ticket columns;
Reject, Station #, Wait Time and Comments are added by the driver, not read.

Gauges can be written `14 3.5` to avoid quoting (`14' 3.5"` also works if the cell is quoted in the
CSV). Fractions are converted to decimals before comparing, so `14 3 1/2` is fine too.

## Measuring

```bash
npm run accuracy -- --limit 3
```

Uses whichever reader is set up in `.env.local` (`GEMINI_API_KEY`, or `ANTHROPIC_API_KEY` for Claude). Each photo is one read, counted against Gemini's free 500 a day. Results go to `accuracy-report.md`.
The column to watch is **Missed**: values the reader got wrong without flagging them for the driver.
Those are the ones that reach payroll unchecked. If it isn't zero, lower the confidence threshold in
`src/server/loads.ts` or adjust the prompt in `src/server/reader/claude.ts`.

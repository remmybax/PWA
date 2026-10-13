# one-trip-admin

OneTrip Admin is the read-only review dashboard for OneTrip, a pre-trip truck inspection system that stops drivers from "pencil whipping" inspections. The driver app (`onetrip-driver`) uploads each certified inspection — station photos, `inspection-data.json`, and `inspection-summary.txt` — to a OneTrip-controlled Google Drive through a Cloud Run backend. This dashboard reads that same Drive folder and never writes to it.

## Screens

1. **Truck List**: one row per truck with its most recent inspection and a Clean/Defect badge. Defect trucks sort first.
2. **Inspection History**: every inspection for one truck, most recent first.
3. **Inspection Detail**: a zone-by-zone breakdown with photos and recorded values. Flagged items sit at the top, and any defect a mechanic has certified fixed in `onetrip-mechanic` shows as resolved, with who fixed it and what was done.
4. **Baseline Comparison**: the truck's per-zone baseline photos beside this inspection's station photos.

There's also a dedicated No Access screen for a Google account that signs in fine but can't see the Drive folder.

## How it works

Plain HTML/CSS/vanilla JavaScript, with no framework, build step, or npm dependencies. `index.html` loads the scripts in order: `js/auth.js` (Google Identity Services sign-in, `drive.readonly` scope), `js/driveApi.js` (a thin `fetch()` wrapper over the Drive v3 REST API), `js/data.js` (walks `Trucks/<truck>/<YYYY-MM>/<YYYY-MM-DD>_<driver>/` under a hardcoded root folder ID), and `js/app.js` (rendering). Colors, fonts, and radii are tokens in `css/tokens.css`.

Two things are coupled to other repos and must be kept in sync by hand:
- `UPLOAD_ROOT_FOLDER_ID` in `js/data.js` must match the same constant in `onetrip-drive-function/index.js`.
- Baseline photos are fetched from `onetrip-driver`'s public repo (`BASELINE_PHOTOS_REPO_RAW_BASE`). Zone names are mapped to baseline zone numbers by `ZONE_NAME_TO_NUMBER`, so renaming a zone or moving that folder in the driver repo breaks Screen 4 silently.

## Access and deploying

Sign-in needs a Google account that is a test user on the OAuth consent screen (still in Testing status) and has view access to the shared "OneTrip Uploads" Drive folder. Deploying is a push to `main`; GitHub Pages serves the site. There's no service worker, so there's no cache version to bump.

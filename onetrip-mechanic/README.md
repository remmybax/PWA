# onetrip-mechanic

The third app in the OneTrip ecosystem — closes the loop after a defect gets flagged in the driver app:

1. **Driver reports a defect** — already happens today in [onetrip-driver](https://github.com/onetripapp/onetrip-driver) (a FAIL status with a required photo).
2. **Mechanic certifies the repair** — this app's job. The mechanic sees the flagged defect, does the repair, and signs off that it's fixed.
3. **Next driver acknowledges** — a separate, later change to onetrip-driver itself, not part of this repo.

Plain HTML/CSS/vanilla JavaScript, no build step, deployed by GitHub Pages on push to `main` — same shape as [onetrip-admin](https://github.com/onetripapp/one-trip-admin). Reads and writes directly into the same Google Drive folder structure the driver app already uses, authenticating straight to Drive from the signed-in mechanic's own Google account (not through onetrip-driver's Cloud Run backend).

## One-time setup before this can run live

1. **Create this app's own OAuth Client ID** in Google Cloud Console (same project as the other two OneTrip apps):
   - APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application
   - Authorized JavaScript origins: this app's GitHub Pages origin
   - On the OAuth consent screen, add the mechanic's Google account under "Test users" (the `drive` scope is sensitive, so the app stays in Testing mode rather than needing Google's verification review)
   - Paste the resulting Client ID into `js/auth.js` in place of `OAUTH_CLIENT_ID`
2. **Share the "OneTrip Uploads" Drive folder** with that same Google account, granting **Editor** access (not just Viewer — this app writes resolution data back into `inspection-data.json`).

## Data model

Reads any inspection folder where a `stations.<stationId>.subItems[]` entry has `status: "fail"`. A resolved defect gets a `resolution` object written onto that specific sub-item (not a single top-level field on the inspection — a truck can carry more than one independent open defect at once, each certified separately):

```json
{
  "resolution": {
    "fixedBy": "Emmett",
    "fixedDate": "2026-09-15",
    "repairNotes": "Replaced brake chamber, tested air pressure, within spec",
    "repairPhoto": "resolution-photo.jpg",
    "status": "repaired"
  }
}
```

No `[OOS]`/`[MECH]` severity tag exists in `inspection-data.json` yet — that classification needs a real FMCSA Out-of-Service Criteria review per item (a task for later, not something to guess at here), so Screen 1 currently sorts open defects by days-open instead.

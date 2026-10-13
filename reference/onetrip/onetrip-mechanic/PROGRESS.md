# onetrip-mechanic — Progress

## Phase 6: Mechanic Portal (this repo)

### Policy decisions made at kickoff

Three open questions were answered before any code was written:

1. **Auth pattern**: same as the driver app — no separate mechanic login/password system. Google Sign-In is still required (unavoidably — writing to Drive directly from the browser needs a real OAuth token, the same mechanism onetrip-admin already uses for reads), but that's a technical requirement for Drive access, not an app-level identity system. "Who did this repair" is just a typed name field (`fixedBy`), matching the driver app's own `driverName` pattern.
2. **Disputed defects**: no separate "disputed" status. The mechanic must physically inspect the item regardless (legal requirement), then marks it resolved with an explanation in the repair notes — whether that explanation is "replaced the part" or "inspected, no actual defect found, likely a bad photo angle." Both are just `resolution.status: "repaired"` with different notes.
3. **OOS enforcement**: `[OOS]`-tagged defects should block the truck in the driver app until cleared; `[MECH]`-tagged defects stay advisory only. **Not implemented yet** — this requires a change to the driver app itself and is explicitly deferred to a separate session.

### OOS/MECH tagging — deferred, not guessed at

While building Screen 1, it became clear `inspection-data.json` has **no OOS/MECH severity tag today** — `failedItems` and `stations[].subItems[]` carry no such field. Rather than inventing a classification table without real FMCSA Out-of-Service Criteria review, the decision was made to **skip severity tagging entirely** for now. Screen 1 sorts by days-open (oldest first) instead. The real fix — adding proper tags to the driver app's own station data — needs Dan/Kevin reviewing actual FMCSA criteria per item, not either of us guessing. Tracked as a future task against `onetrip-driver`, not this repo.

### Screens built and verified

All three screens are built, deployed, and confirmed working against live Drive data (truck 826016's real flagged defects):

- **Screen 1 — Open Defects Dashboard**: flattens every truck's most recent inspection into a flat worklist (one row per open defect, not per truck, since a truck can carry multiple independent defects at once), sorted oldest-first.
- **Screen 2 — Individual Defect View**: full detail (photo, station, value, who flagged it, when), a repair-notes field, an optional proof-photo upload, and Certify Fixed. Confirmed live: a real resolution wrote correctly and the item dropped off the dashboard.
- **Screen 3 — Resolved History**: full-tree walk (every inspection ever recorded, not just each truck's most-recent) looking for any sub-item carrying a `resolution`, since a certified fix lives inside whatever inspection was "most recent" *at the time it was certified* — a later day's new inspection doesn't carry it forward. Confirmed live: the just-certified item appeared correctly.

### Data model

`resolution` is written onto the specific failed sub-item inside `stations[stationId].subItems[]`, **not** a single top-level field on the inspection — a truck can carry more than one independent open defect at once (confirmed live: truck 826016 had 5 simultaneously), each needing its own independent certification.

```json
"resolution": {
  "fixedBy": "Emmett",
  "fixedDate": "2026-09-15",
  "repairNotes": "Replaced brake chamber, tested air pressure, within spec",
  "repairPhoto": "resolution-1b-1b-brake-chamber.jpg",
  "status": "repaired",
  "resolvedAt": "2026-09-15T14:32:07.000Z"
}
```

The write path (`certifyDefectFixed` in `js/data.js`) re-fetches the file fresh immediately before writing, re-validates the exact sub-item is still failing and unresolved, and only then merges the smallest possible change before writing the whole file back — never a blind overwrite from whatever Screen 1/2 had cached in memory.

### Phase 6 sanity pass (post-build verification)

A full verification pass was run after all three screens were confirmed working:

- **Deployment verified byte-for-byte**: every source file (`index.html`, both CSS files, all four JS files) diffed identical against what's actually served from the live GitHub Pages URL, and GitHub's `main` branch HEAD matches the local repo's HEAD. Not just "a commit exists" — the live site is confirmed serving exactly this code.
- **No leftover debug code**: no `console.log`, `TODO`/`FIXME`, `debugger`, hardcoded test truck IDs, or stray placeholder `alert()` calls anywhere in the source.
- **Write-safety traced through carefully** (highest-stakes area, given this app writes to real inspection data):
  - Confirmed a certified fix's `resolution` attaches to the correct specific sub-item only — verified by tracing the `stationId`/`subItemId` matching logic and that `.find()` returns a live reference into the freshly-fetched object, not a copy.
  - Confirmed the original inspection data is fully preserved on write — the whole file is read fresh, only one sub-item's `resolution` field is added, and the complete object (including every other station, `failedItems`, `summary`, `transitionLog`, etc.) is written back unchanged.
  - Confirmed **sequential** certification of two defects on the same truck/inspection is safe (re-fetching fresh before each write means the second certify's write includes the first's already-saved resolution).
  - **Found a real gap**: certifying two *different* sub-items on the *same* inspection file from two concurrent sessions (e.g., two browser tabs, or two devices) has a lost-update race — the guard only checks that the *specific* sub-item being certified isn't already resolved, not that no other sub-item's write is in flight. Given the current single-mechanic ("just Emmett") usage pattern, the window where this could actually manifest is narrow, but it should be revisited if a second mechanic or multi-device usage is ever added.
  - **Found a minor gap**: if a proof-photo upload succeeds but the JSON write immediately after it fails (network drop, token expiry), retrying re-uploads a new photo file under the same deterministic filename rather than reusing or replacing the orphaned one — Drive allows duplicate filenames in one folder, so a retry after a partial failure can leave a harmless but unreferenced duplicate photo behind.
- **Cross-app consistency checked**:
  - Design tokens, typography, and component class names (`.btn-primary`, `.app-title`, `.page-header`, etc.) are copied verbatim from `onetrip-admin` for a consistent look and feel.
  - Form input styling (`.field-label`, `.text-input`) matches `onetrip-driver`'s own naming, the one sibling app that has form inputs to match against.
  - **Fixed during this pass**: the mobile breakpoint was `599px`, inconsistent with `onetrip-admin`'s established `719px`/`720px` convention — corrected to match.
  - **Found during this pass, since fixed in `onetrip-admin` (commit f76fa79, not yet visually confirmed live)**: `onetrip-admin`'s Inspection Detail screen renders its "Items Flagged" list from `failedItems`, a snapshot the driver app writes once at certification time. It has no awareness of the `resolution` field this app adds to `stations[].subItems[]`. After a mechanic certifies a fix here, viewing that same inspection in the admin dashboard will still show the item as flagged, with no indication it's been resolved. This is a real staleness gap between the two apps — worth a note for whoever next touches `onetrip-admin`, not something to fix from this repo.

### Post-sanity-pass hardening (2026-10-11)

All three gaps from the sanity pass were addressed in one change (built unattended; verified with a mocked-Drive test harness, **not yet tested live**):

- **Lost-update race — narrowed, not eliminated.** Drive v3 has no conditional write, so true atomicity would need a backend. `certifyDefectFixed` now (1) validates before uploading anything, (2) uploads the proof photo *before* the final read so the read → merge → write is back-to-back, and (3) reads the file back after writing — if another session's write clobbered this resolution, it re-merges on top of their version (preserving their change too), up to 3 attempts; if someone else resolved the same item meanwhile, it stops with the "already certified" error. All Drive reads now use `cache: 'no-store'` so "fresh" really is fresh. Residual risk: another session's write landing after this one's read-back, within a sub-second window.
- **Orphaned duplicate photo on retry — fixed.** Proof-photo filenames now include a per-form attempt ID (`resolution-<station>-<subItem>-<attemptId>.<ext>`). A retry from the same open form finds its own earlier upload and replaces it in place; a different session can never overwrite a photo another resolution references. Older resolutions keep their old filenames — History looks photos up by the exact stored name, so nothing breaks.
- **No success confirmation — fixed.** After Certify Fixed, Open Defects shows a dismissible banner ("Truck X, Station Y — item: certified fixed by Name"), cleared on any other navigation.

### Deliberately deferred (not this session, not this repo)

**The driver-app acknowledgment gate** — step 3 of the original three-step chain ("next driver sees what was flagged and what was done about it before starting their own inspection") — requires changes to `onetrip-driver`'s own codebase and has not been started. This needs its own session against that repo.

### Verdict

Phase 6 is functionally complete and the core write path is sound — the read-verify-write pattern correctly protects against stale-data corruption and re-certifying an already-resolved item, and every screen has been confirmed working against real Drive data end to end. The two write-safety gaps found (cross-session concurrent writes to different sub-items; orphaned photo on partial-failure retry) are real but narrow, low-probability under today's single-mechanic usage, and worth fixing before this app is used by more than one mechanic at once rather than blocking use today.

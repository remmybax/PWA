// OneTrip Drive upload function.
//
// This is the only thing in the whole system that ever authenticates to
// Google Drive. The driver never sees a Google sign-in prompt — the app
// (js/drive.js in the PWA) just POSTs a file here, and this function writes
// it to Drive using a credential controlled by OneTrip, not the driver's
// own account. That's the entire point of this backend: every submission
// lands in the same OneTrip-controlled Drive regardless of who's running
// the app or what they're signed into on their phone.

import { http } from '@google-cloud/functions-framework';
import { google } from 'googleapis';
import { Readable } from 'stream';

// ---- Configuration --------------------------------------------------------

// TODO(multi-tenant): once fleet accounts exist, this becomes a lookup —
// resolve `fleetId` (sent in the request body) against a small config store
// to get that fleet's own OAuth credential + Drive destination, so each
// fleet's Workspace stays isolated. Today there's exactly one destination,
// so fleetId is accepted but ignored.
//
// This authenticates as the real OneTrip Google account (theonetripapp@
// gmail.com) via a long-lived refresh token, NOT a service account. Service
// accounts have no storage quota of their own on a personal (non-Workspace)
// Google account, so a service account can never own files it creates —
// even in a folder explicitly shared with it as Editor. A refresh token
// tied to the real account sidesteps that entirely: files are created
// under the real account's own storage. The driver never sees any part of
// this — the refresh token was obtained once, manually, by the OneTrip
// account owner via Google's OAuth Playground, not through this app.
function getDriveCredentials(fleetId) {
  const clientId = process.env.DRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.DRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Drive OAuth credentials are not fully configured');
  }
  return { clientId, clientSecret, refreshToken };
}

const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET;

const MAX_FIELD_LENGTH = 200;
const MAX_CONTENT_BYTES = 15 * 1024 * 1024; // generous headroom above the ~1.6MB photos this app produces

// ---- Drive client (cached per fleet across warm invocations) --------------

const driveClientCache = new Map();

async function getDriveClient(fleetId) {
  const cacheKey = fleetId || 'default';
  if (driveClientCache.has(cacheKey)) return driveClientCache.get(cacheKey);

  const credentials = getDriveCredentials(fleetId);
  const auth = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: credentials.refreshToken });

  const drive = google.drive({ version: 'v3', auth });
  driveClientCache.set(cacheKey, drive);
  return drive;
}

// ---- Drive folder helpers (same convention as the original client code) ---

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(drive, name, parentId) {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and ${parentClause} and trashed = false`;
  const list = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
  if (list.data.files && list.data.files.length > 0) return list.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  return created.data.id;
}

// The top-level folder in the real Drive account that all uploads live
// under, so everything the app writes stays contained under one folder
// rather than scattered across the account's whole My Drive root.
//
// This is a literal folder ID, not a by-name lookup, and that's
// deliberate: the credential here is scoped to `drive.file`, which only
// ever sees files/folders this app itself created via the API — it can't
// search Drive by name the way the old (broader-scoped) version of this
// function did. This exact folder was created by this app, under this
// credential, on 2026-09-11, replacing the pre-scope-narrowing root
// (whose old data is untouched in Drive, just no longer reachable through
// this app — a deliberate choice, since everything under it so far was
// beta/test data, not worth a continuity migration).
const UPLOAD_ROOT_FOLDER_ID = '1bYVmVsOJU7Rb12akZwSQlEk-YZyFcpfV';

async function ensureFolderPath(drive, pathSegments) {
  let parentId = UPLOAD_ROOT_FOLDER_ID;
  for (const segment of pathSegments) {
    parentId = await findOrCreateFolder(drive, segment, parentId);
  }
  return parentId;
}

function driveYearMonth(dateStr) {
  return String(dateStr).slice(0, 7); // 'YYYY-MM-DD' -> 'YYYY-MM'
}

// ---- Read helpers (new — this credential has never read anything back  ----
// ---- before now, only ever created files) ----------------------------
//
// The `drive.file` scope this credential runs under (see getDriveCredentials
// above) only ever sees files/folders the app itself created via the API —
// exactly what these read helpers need, since every inspection-data.json
// they'll ever look at was created by this same backend's own
// drive.files.create() call. No scope widening needed for any of this.

// Find-only version of findOrCreateFolder — returns null instead of
// creating anything. Used by the read paths below, which must never bring
// a truck folder into existence just by checking it (a truck with zero
// inspection history yet is a completely normal, expected case).
async function findFolder(drive, name, parentId) {
  const q = `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const list = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
  return list.data.files && list.data.files.length > 0 ? list.data.files[0].id : null;
}

async function listChildFolders(drive, parentId) {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const list = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive', pageSize: 200 });
  return list.data.files || [];
}

async function findFileInFolder(drive, parentId, name) {
  const q = `'${parentId}' in parents and name = '${escapeDriveQueryValue(name)}' and trashed = false`;
  const list = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive', pageSize: 1 });
  return list.data.files && list.data.files.length > 0 ? list.data.files[0] : null;
}

// responseType 'text' (not the default JSON auto-parse) so a malformed or
// unexpectedly-empty file fails at JSON.parse with a clear error, rather
// than however gaxios's own auto-parsing chooses to fail.
async function fetchFileJson(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return JSON.parse(res.data);
}

async function updateFileJson(drive, fileId, obj) {
  await drive.files.update({
    fileId,
    media: { mimeType: 'application/json', body: Readable.from(Buffer.from(JSON.stringify(obj, null, 2))) },
  });
}

// Same guard onetrip-admin/onetrip-mechanic both use against stray/malformed
// test artifacts in Drive — kept in sync by hand across all three apps that
// read this same folder tree; there's no shared module to import it from.
function looksLikeRealInspectionData(data) {
  return !!(data && data.date && data.driverName && data.certifiedAt);
}

// ---- Resolution acknowledgment (new) -----------------------------------
//
// A mechanic's certified fix (see onetrip-mechanic/js/data.js's
// certifyDefectFixed) writes a `resolution` object onto the specific failed
// sub-item inside stations[stationId].subItems[] — never a new file, always
// the SAME inspection-data.json the defect was originally flagged in. That
// matters here: a driver could start (and certify) one or more NEW
// inspections on this truck before the fix is even made, let alone
// acknowledged — nothing in the current system blocks that (OOS enforcement
// isn't built yet, per onetrip-mechanic's own PROGRESS.md) — so the
// resolution can end up sitting in an OLDER inspection file than whatever is
// "most recent" by the time a driver goes to acknowledge it. Checking only
// the most-recent inspection would silently miss exactly the cases that
// matter most. So this walks this ONE truck's entire inspection history
// (bounded to one truck, not the whole fleet, so it stays cheap) — the same
// full-tree approach onetrip-mechanic's own Resolved History screen uses,
// for the identical reason.
//
// Folder listings at each level are fetched in parallel (Promise.all) so
// wall-clock latency scales with the tree's DEPTH, not its total file count
// — this runs synchronously in the middle of a driver tapping "Begin
// Inspection," and the driver app deliberately fails open if this is too
// slow or errors out, so it's worth keeping genuinely fast rather than
// technically-correct-but-slow.
async function findUnacknowledgedResolutionsForTruck(drive, truckNumber) {
  const trucksFolderId = await findFolder(drive, 'Trucks', UPLOAD_ROOT_FOLDER_ID);
  if (!trucksFolderId) return []; // nothing has ever been uploaded at all yet

  const truckFolderId = await findFolder(drive, truckNumber, trucksFolderId);
  if (!truckFolderId) return []; // this truck has no inspection history yet — normal, not an error

  const monthFolders = await listChildFolders(drive, truckFolderId);
  const dayFolderLists = await Promise.all(monthFolders.map((m) => listChildFolders(drive, m.id)));
  const dayFolders = dayFolderLists.flat();

  const perDayResults = await Promise.all(
    dayFolders.map(async (dayFolder) => {
      const dataFile = await findFileInFolder(drive, dayFolder.id, 'inspection-data.json');
      if (!dataFile) return [];

      let inspectionData;
      try {
        inspectionData = await fetchFileJson(drive, dataFile.id);
      } catch (err) {
        console.error('Skipping unreadable inspection-data.json', dayFolder.name, err.message);
        return [];
      }
      if (!looksLikeRealInspectionData(inspectionData)) return [];

      const found = [];
      const stations = inspectionData.stations || {};
      for (const [stationId, station] of Object.entries(stations)) {
        for (const subItem of station.subItems || []) {
          const resolution = subItem.resolution;
          if (resolution && resolution.status === 'repaired' && !resolution.acknowledgedBy) {
            found.push({
              dataFileId: dataFile.id,
              stationId,
              subItemId: subItem.id,
              zoneName: station.zoneName || null,
              stationLabel: station.label || null,
              subItemLabel: subItem.label || null,
              resolution,
            });
          }
        }
      }
      return found;
    })
  );

  return perDayResults.flat();
}

// Applies driver acknowledgments to one or more inspection-data.json files
// in one call — a driver can have unacknowledged resolutions spread across
// DIFFERENT inspection files (different original flag dates), not just
// different sub-items within one file, so this groups the requested items
// by dataFileId and only re-fetches/rewrites each distinct file once, even
// if it contains more than one of the items being acknowledged.
//
// Re-fetches each file fresh immediately before writing (same discipline
// onetrip-mechanic's own certifyDefectFixed uses, for the same reason: never
// write from a copy that could already be stale) and re-validates each
// target sub-item still has an unacknowledged repaired resolution. If it's
// already been acknowledged by someone else in the meantime, that one is
// silently skipped rather than treated as an error — unlike a contested
// repair certification, two drivers both having genuinely seen the same
// resolved item is harmless; there's nothing to reject, just nothing left
// to do for that one.
async function applyAcknowledgments(drive, items, acknowledgedBy) {
  const byFile = new Map();
  for (const item of items) {
    if (!byFile.has(item.dataFileId)) byFile.set(item.dataFileId, []);
    byFile.get(item.dataFileId).push(item);
  }

  const acknowledgedAt = new Date().toISOString();
  let acknowledgedCount = 0;

  for (const [dataFileId, fileItems] of byFile) {
    const freshData = await fetchFileJson(drive, dataFileId);
    if (!looksLikeRealInspectionData(freshData)) continue;

    let changed = false;
    for (const item of fileItems) {
      const station = freshData.stations && freshData.stations[item.stationId];
      const subItem = station && (station.subItems || []).find((si) => si.id === item.subItemId);
      if (!subItem || !subItem.resolution) continue;
      if (subItem.resolution.status !== 'repaired' || subItem.resolution.acknowledgedBy) continue; // already acknowledged, or no longer valid — skip, not an error

      subItem.resolution.acknowledgedBy = acknowledgedBy;
      subItem.resolution.acknowledgedAt = acknowledgedAt;
      changed = true;
      acknowledgedCount++;
    }

    if (changed) await updateFileJson(drive, dataFileId, freshData);
  }

  return acknowledgedCount;
}

// ---- Validation -------------------------------------------------------

function isValidField(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_FIELD_LENGTH;
}

const MAX_ACKNOWLEDGE_ITEMS = 100; // generous headroom above any realistic count; defensive input bound, not an expected limit

function isValidAckItem(item) {
  return (
    item &&
    typeof item === 'object' &&
    isValidField(item.dataFileId) &&
    isValidField(item.stationId) &&
    isValidField(item.subItemId)
  );
}

// ---- HTTP handler -----------------------------------------------------

http('uploadinspectionfile', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // A shared secret baked into a public static site's JS can't be a real
  // secret — anyone can read it out of the client bundle. This is a soft
  // tripwire against casual/opportunistic abuse of the endpoint, and it's
  // rotatable independently of the far more sensitive Drive OAuth
  // credentials below. Real per-caller authorization arrives later with the
  // fleet-Workspace-authenticated driver model.
  // .trim() on both sides: pasting a secret into a web text box very
  // commonly picks up a trailing newline or space, which would otherwise
  // fail this comparison for a reason that has nothing to do with the
  // secret actually being wrong.
  const providedSecret = (req.get('X-App-Secret') || '').trim();
  const expectedSecret = (APP_SHARED_SECRET || '').trim();
  if (!expectedSecret || providedSecret !== expectedSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // action is new — its absence (every existing caller's request shape)
  // falls straight through to the original upload behavior below, byte-for-
  // byte unchanged. Both new actions are read/write operations against
  // files this same drive.file-scoped credential already created itself,
  // so no scope change or new credential was needed for either — see
  // findUnacknowledgedResolutionsForTruck's own comment above for why a
  // truck-scoped full-history walk is required here rather than a
  // most-recent-only check.
  const { action } = req.body || {};

  if (action === 'checkResolutions') {
    const { truckNumber: checkTruckNumber, fleetId: checkFleetId } = req.body || {};
    if (!isValidField(checkTruckNumber)) {
      res.status(400).json({ error: 'truckNumber is required' });
      return;
    }
    try {
      const drive = await getDriveClient(checkFleetId);
      const items = await findUnacknowledgedResolutionsForTruck(drive, checkTruckNumber.trim());
      res.status(200).json({ ok: true, items });
    } catch (err) {
      console.error('checkResolutions failed', err);
      res.status(500).json({ error: 'Check failed', detail: err.message });
    }
    return;
  }

  if (action === 'acknowledgeResolutions') {
    const { items, acknowledgedBy, fleetId: ackFleetId } = req.body || {};
    if (!isValidField(acknowledgedBy)) {
      res.status(400).json({ error: 'acknowledgedBy is required' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ACKNOWLEDGE_ITEMS || !items.every(isValidAckItem)) {
      res.status(400).json({ error: 'items must be a non-empty array of valid { dataFileId, stationId, subItemId }' });
      return;
    }
    try {
      const drive = await getDriveClient(ackFleetId);
      const acknowledgedCount = await applyAcknowledgments(drive, items, acknowledgedBy.trim());
      res.status(200).json({ ok: true, acknowledgedCount });
    } catch (err) {
      console.error('acknowledgeResolutions failed', err);
      res.status(500).json({ error: 'Acknowledge failed', detail: err.message });
    }
    return;
  }

  const { truckNumber, driverName, date, filename, contentBase64, mimeType, fleetId } = req.body || {};

  if (!isValidField(truckNumber) || !isValidField(driverName) || !isValidField(date) || !isValidField(filename)) {
    res.status(400).json({ error: 'Missing or invalid required field' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    res.status(400).json({ error: 'contentBase64 is required' });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch (err) {
    res.status(400).json({ error: 'contentBase64 is not valid base64' });
    return;
  }
  if (buffer.length === 0 || buffer.length > MAX_CONTENT_BYTES) {
    res.status(400).json({ error: 'File content is empty or too large' });
    return;
  }

  try {
    const drive = await getDriveClient(fleetId);
    const folderId = await ensureFolderPath(drive, [
      'Trucks',
      truckNumber.trim(),
      driveYearMonth(date),
      `${date}_${driverName.trim()}`,
    ]);

    const uploaded = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
      fields: 'id, name',
    });

    res.status(200).json({ ok: true, fileId: uploaded.data.id, fileName: uploaded.data.name });
  } catch (err) {
    console.error('Upload failed', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

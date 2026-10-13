// OneTrip Mechanic — builds screen data by walking the same Drive folder
// tree onetrip-admin already reads (and onetrip-drive-function writes):
//   <root> / "Trucks" / <TruckNumber> / <YYYY-MM> / <YYYY-MM-DD>_<DriverName> / inspection-data.json
//
// Root folder ID is hardcoded (not a name lookup) to match onetrip-admin's
// own UPLOAD_ROOT_FOLDER_ID exactly — see that repo's js/data.js for the
// full history of why (drive.file backend scope, the old pre-2026-09-11
// root, the name-collision hazard). Keep this in sync with that constant.
const UPLOAD_ROOT_FOLDER_ID = '1bYVmVsOJU7Rb12akZwSQlEk-YZyFcpfV';
const TRUCKS_FOLDER_NAME = 'Trucks';

// Folder names are YYYY-MM or YYYY-MM-DD_DriverName — fixed-width date
// prefix means plain string sort already puts the most recent one first.
function sortFoldersByNameDesc(folders) {
  return folders.slice().sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

// Guards against stray/malformed test artifacts in Drive (same check as
// onetrip-admin's own looksLikeRealInspection).
function looksLikeRealInspection(inspectionData) {
  return !!(inspectionData && inspectionData.date && inspectionData.driverName && inspectionData.certifiedAt);
}

// Same meaning as onetrip-admin's NoDriveAccessError — see that repo's
// js/data.js for the full reasoning on why an empty Trucks-folder lookup
// specifically (as opposed to any other empty result) means "no access".
class NoDriveAccessError extends Error {}

async function findTrucksFolderId() {
  const trucksFolderId = await findFolder(TRUCKS_FOLDER_NAME, UPLOAD_ROOT_FOLDER_ID);
  if (!trucksFolderId) {
    throw new NoDriveAccessError(
      `Could not find the "${TRUCKS_FOLDER_NAME}" folder inside the OneTrip Uploads root — this Google account likely doesn't have access to it yet (folder ID ${UPLOAD_ROOT_FOLDER_ID}).`
    );
  }
  return trucksFolderId;
}

// Walks one truck folder down to its single most recent REAL inspection,
// skipping past any malformed/stray folder along the way. Only the most
// recent inspection matters for "is this truck currently carrying an open
// defect" — each day's inspection is a fresh, independent record (the
// driver re-checks every item from scratch), so an older day's fail is
// superseded by whatever the newest inspection says: either the same
// defect got re-flagged (and this newest record is the one to act on) or
// it didn't reappear (fixed, or genuinely passed today). Also returns the
// data file's own id, needed later by Screen 2 to write the resolution
// back into the right file.
async function loadMostRecentInspectionForTruck(truckFolderId) {
  const monthFolders = sortFoldersByNameDesc(await listChildFolders(truckFolderId));

  for (const monthFolder of monthFolders) {
    const dayFolders = sortFoldersByNameDesc(await listChildFolders(monthFolder.id));

    for (const dayFolder of dayFolders) {
      const dataFile = await findFileInFolder(dayFolder.id, 'inspection-data.json');
      if (!dataFile) continue;

      const inspectionData = await fetchFileJson(dataFile.id);
      if (!looksLikeRealInspection(inspectionData)) continue;

      return { inspectionData, folderId: dayFolder.id, dataFileId: dataFile.id };
    }
  }

  return null;
}

// Every failed sub-item in one inspection's `stations` object that has no
// `resolution` field yet — this is where the "unresolved FAIL" definition
// actually lives, not `failedItems` (that flat array is a point-in-time
// snapshot the driver app writes at certification and never carries a
// sub-item's own stable id, only its label — see onetrip-driver/js/
// state.js's getAllFailedItems). `stations[stationId].subItems[]` entries
// DO carry that stable id (see buildInspectionExport in the same file),
// which Screen 2 will need to safely target ONE specific sub-item when
// writing its resolution back, so this walks `stations` directly instead.
function findOpenDefectsInInspection(inspectionData) {
  const opens = [];
  const stations = inspectionData.stations || {};
  for (const [stationId, station] of Object.entries(stations)) {
    for (const subItem of station.subItems || []) {
      if (subItem.status === 'fail' && !subItem.resolution) {
        opens.push({
          stationId,
          zoneName: station.zoneName,
          stationLabel: station.label,
          photoCaptured: station.photoCaptured,
          photoFilename: station.photoFilename,
          subItemId: subItem.id,
          subItemLabel: subItem.label,
          value: subItem.value,
          unit: subItem.unit,
        });
      }
    }
  }
  return opens;
}

function daysSince(isoOrDateStr) {
  if (!isoOrDateStr) return 0;
  const then = new Date(isoOrDateStr);
  if (isNaN(then.getTime())) return 0;
  const diffMs = Date.now() - then.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// Flattens every truck's open defects into one worklist — one row per
// defect, not per truck, since a truck can be carrying more than one open
// fail at once and each is independently worked and certified.
async function loadOpenDefects() {
  const trucksFolderId = await findTrucksFolderId();
  const truckFolders = await listChildFolders(trucksFolderId);

  const defects = [];
  for (const truckFolder of truckFolders) {
    const result = await loadMostRecentInspectionForTruck(truckFolder.id);
    if (!result) continue;

    const { inspectionData, folderId, dataFileId } = result;
    const flaggedAt = inspectionData.certifiedAt || inspectionData.date;

    for (const item of findOpenDefectsInInspection(inspectionData)) {
      defects.push({
        truckNumber: inspectionData.truckNumber || truckFolder.name,
        driverName: inspectionData.driverName,
        flaggedAt,
        daysOpen: daysSince(flaggedAt),
        folderId,
        dataFileId,
        ...item,
      });
    }
  }

  // No OOS/MECH severity tag exists in inspection-data.json yet (that's a
  // separate future change to the driver app's own station data, reviewed
  // against real FMCSA criteria rather than guessed at here) — so urgency
  // sorting is by days-open, oldest first, until that tag exists.
  defects.sort((a, b) => b.daysOpen - a.daysOpen);

  return defects;
}

// Screen 3: Resolved History. Unlike loadOpenDefects, this can't limit
// itself to each truck's most recent inspection — a resolution written
// today lives inside whatever inspection was "most recent" AT THE TIME it
// was certified, and a newer inspection since then (superseding it on the
// open-defects dashboard) doesn't carry that resolution forward. So this
// walks every inspection ever recorded, for every truck, looking for any
// sub-item that has a `resolution` — a full-tree walk, deliberately not
// the cheaper most-recent-only version, since a reference log needs every
// past certification, not just the current state of each truck.
async function loadResolvedHistory() {
  const trucksFolderId = await findTrucksFolderId();
  const truckFolders = await listChildFolders(trucksFolderId);

  const resolved = [];
  for (const truckFolder of truckFolders) {
    const monthFolders = await listChildFolders(truckFolder.id);
    for (const monthFolder of monthFolders) {
      const dayFolders = await listChildFolders(monthFolder.id);
      for (const dayFolder of dayFolders) {
        const dataFile = await findFileInFolder(dayFolder.id, 'inspection-data.json');
        if (!dataFile) continue;

        const inspectionData = await fetchFileJson(dataFile.id);
        if (!looksLikeRealInspection(inspectionData)) continue;

        const truckNumber = inspectionData.truckNumber || truckFolder.name;
        const stations = inspectionData.stations || {};
        for (const [stationId, station] of Object.entries(stations)) {
          for (const subItem of station.subItems || []) {
            if (!subItem.resolution) continue;
            resolved.push({
              truckNumber,
              stationId,
              zoneName: station.zoneName,
              stationLabel: station.label,
              subItemLabel: subItem.label,
              flaggedAt: inspectionData.certifiedAt || inspectionData.date,
              driverName: inspectionData.driverName,
              folderId: dayFolder.id,
              ...subItem.resolution,
            });
          }
        }
      }
    }
  }

  resolved.sort((a, b) => {
    const ak = a.resolvedAt || '';
    const bk = b.resolvedAt || '';
    return ak < bk ? 1 : ak > bk ? -1 : 0;
  });

  return resolved;
}

// Thrown when the specific sub-item this call is trying to resolve already
// has a resolution — someone else certified it fixed between this screen
// loading and the mechanic hitting Certify Fixed.
class DefectAlreadyResolvedError extends Error {}

// Thrown for any other way the record no longer matches what Screen 2
// loaded (station/sub-item gone, or no longer failing) — a re-inspection
// happened, or the data genuinely doesn't match what this screen expects.
class DefectRecordChangedError extends Error {}

// Finds the exact sub-item a defect points at inside a freshly-fetched
// copy of its inspection file. Returns a live reference into `data` (not a
// copy), so setting `.resolution` on it mutates the object that gets
// written back.
function findDefectSubItem(data, defect) {
  if (!looksLikeRealInspection(data)) {
    throw new Error('This inspection record looks incomplete or corrupted — refresh the dashboard and try again.');
  }
  const station = data.stations && data.stations[defect.stationId];
  if (!station) {
    throw new DefectRecordChangedError(`Station ${defect.stationId} no longer exists in this inspection record.`);
  }
  const subItem = (station.subItems || []).find((si) => si.id === defect.subItemId);
  if (!subItem) {
    throw new DefectRecordChangedError(`This item no longer exists in Station ${defect.stationId}.`);
  }
  if (subItem.status !== 'fail') {
    throw new DefectRecordChangedError('This item is no longer marked as failed — it may have been re-inspected since you opened this page.');
  }
  return subItem;
}

function assertStillUnresolved(subItem) {
  if (subItem.resolution) {
    throw new DefectAlreadyResolvedError('This defect was already certified fixed by someone else. Refresh the dashboard.');
  }
}

// The proof photo's filename carries `attemptId` (one per opening of the
// certify form — see handleSelectDefect in app.js) so that a retry after a
// half-finished certify (photo uploaded, JSON write failed) finds and
// overwrites its OWN earlier upload instead of leaving a duplicate behind,
// while a different session certifying the same item can never overwrite
// a photo some other resolution already references.
async function uploadRepairPhoto(defect, blob, attemptId) {
  const mimeType = blob.type || 'image/jpeg';
  const subtype = mimeType.split('/')[1];
  const extension = subtype === 'png' ? 'png' : subtype === 'webp' ? 'webp' : 'jpg';
  const baseName = `resolution-${defect.stationId}-${defect.subItemId}-${attemptId}`;
  const filename = `${baseName}.${extension}`;

  const existing = (await listFilesInFolder(defect.folderId)).find((f) => f.name.startsWith(`${baseName}.`));
  if (existing) {
    await replaceFileWithBlob(existing.id, filename, blob, mimeType);
  } else {
    await uploadFileToFolder(defect.folderId, filename, blob, mimeType);
  }
  return filename;
}

const CERTIFY_WRITE_ATTEMPTS = 3;

// Writes a mechanic's repair certification back into inspection-data.json.
// Drive's media-upload PATCH replaces a file's entire content and Drive v3
// has no conditional (compare-and-swap) write, so this can't make the write
// atomic — instead it keeps the read-to-write window as small as possible
// and then checks its own work:
//
//   1. Read + validate once up front, so nothing gets uploaded for a defect
//      that's already resolved or gone.
//   2. Upload the proof photo (the slow part) BEFORE the final read, so the
//      read -> merge -> write sequence below is back-to-back with no upload
//      sitting in the middle of it. Uploading first also means a failed
//      upload never leaves the record pointing at a photo that isn't there.
//   3. Re-read fresh, merge only this sub-item's `resolution` onto that
//      live copy, write the whole file back.
//   4. Read it back. If another session's write landed in between and
//      clobbered this resolution, redo step 3 on top of their version
//      (which keeps their change too). If someone else resolved this same
//      item in the meantime, stop and say so.
//
// What's left is the rare case where another session's write lands after
// step 4's read-back here — it would have to start within the same
// sub-second window. Acceptable for a small mechanic crew; a real lock
// would need a backend.
//
// `resolution` lives on the specific failed sub-item inside `stations`
// (not one field on the whole inspection) because a single inspection can
// carry more than one independent open defect at once, each certified on
// its own — see findOpenDefectsInInspection's own comment above.
async function certifyDefectFixed(defect, { fixedBy, repairNotes, repairPhotoBlob, attemptId }) {
  assertStillUnresolved(findDefectSubItem(await fetchFileJson(defect.dataFileId), defect));

  const repairPhotoFilename = repairPhotoBlob ? await uploadRepairPhoto(defect, repairPhotoBlob, attemptId) : null;

  const resolvedAt = new Date().toISOString();
  const resolution = {
    fixedBy,
    fixedDate: resolvedAt.slice(0, 10),
    repairNotes,
    repairPhoto: repairPhotoFilename,
    status: 'repaired',
    resolvedAt,
  };

  for (let attempt = 0; attempt < CERTIFY_WRITE_ATTEMPTS; attempt++) {
    const freshData = await fetchFileJson(defect.dataFileId);
    const subItem = findDefectSubItem(freshData, defect);
    if (!(subItem.resolution && subItem.resolution.resolvedAt === resolvedAt)) {
      assertStillUnresolved(subItem);
      subItem.resolution = resolution;
      await updateFileContent(defect.dataFileId, freshData);
    }

    const savedSubItem = findDefectSubItem(await fetchFileJson(defect.dataFileId), defect);
    if (savedSubItem.resolution && savedSubItem.resolution.resolvedAt === resolvedAt) return;
    assertStillUnresolved(savedSubItem);
  }

  throw new Error('Could not confirm this repair was saved — the inspection record kept changing underneath it. Check Resolved History before trying again.');
}

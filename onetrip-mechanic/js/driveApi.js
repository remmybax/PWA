// OneTrip Mechanic — thin wrapper over the Drive v3 REST API.
//
// Read functions mirror onetrip-admin/js/driveApi.js (same plain fetch()
// approach, no npm client, no build step); the write functions at the
// bottom serve Screen 2's Certify Fixed step.

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

class DriveApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
  }
}

async function driveFetch(path, params = {}) {
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  // no-store: certifyDefectFixed's re-fetch-before-write and its
  // read-back-after-write are only meaningful if the browser never hands
  // back a cached copy of inspection-data.json.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new DriveApiError(`Drive API ${path} failed (${res.status}): ${body.slice(0, 300)}`, res.status);
  }
  return res;
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Finds a folder by name, optionally scoped to a parent.
async function findFolder(name, parentId) {
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const q = `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`;
  const res = await driveFetch('/files', { q, fields: 'files(id, name)', spaces: 'drive', pageSize: 10 });
  const data = await res.json();
  if (!data.files || data.files.length === 0) return null;
  return data.files[0].id;
}

// Lists every immediate child folder of a parent (truck folders, then month
// folders, then date_driver folders).
async function listChildFolders(parentId) {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  let files = [];
  let pageToken;
  do {
    const res = await driveFetch('/files', {
      q,
      fields: 'nextPageToken, files(id, name)',
      spaces: 'drive',
      pageSize: 200,
      pageToken,
    });
    const data = await res.json();
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

// Finds a single named file inside a folder (inspection-data.json).
async function findFileInFolder(parentId, name) {
  const q = `'${parentId}' in parents and name = '${escapeDriveQueryValue(name)}' and trashed = false`;
  const res = await driveFetch('/files', { q, fields: 'files(id, name)', spaces: 'drive', pageSize: 1 });
  const data = await res.json();
  if (!data.files || data.files.length === 0) return null;
  return data.files[0];
}

// Lists every non-folder file inside a folder — used for station photos.
async function listFilesInFolder(parentId) {
  const q = `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  let files = [];
  let pageToken;
  do {
    const res = await driveFetch('/files', {
      q,
      fields: 'nextPageToken, files(id, name, mimeType)',
      spaces: 'drive',
      pageSize: 200,
      pageToken,
    });
    const data = await res.json();
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function fetchFileText(fileId) {
  const res = await driveFetch(`/files/${fileId}`, { alt: 'media' });
  return res.text();
}

async function fetchFileJson(fileId) {
  const text = await fetchFileText(fileId);
  return JSON.parse(text);
}

// Same `alt=media` endpoint as fetchFileText, just read as bytes — used for
// station photos on the defect cards and detail screen.
async function fetchFileBlob(fileId) {
  const res = await driveFetch(`/files/${fileId}`, { alt: 'media' });
  return res.blob();
}

const DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Overwrites an existing file's content wholesale — this is the only write
// primitive Screen 2's Certify Fixed step uses. Drive's media-upload PATCH
// replaces the entire file, so the caller is responsible for reading the
// file fresh immediately beforehand and merging into that, not writing a
// stale copy (see certifyDefectFixed in data.js, which does exactly that).
async function updateFileContent(fileId, jsonObject) {
  const res = await fetch(`${DRIVE_UPLOAD_API_BASE}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jsonObject),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new DriveApiError(`Drive file update failed (${res.status}): ${body.slice(0, 300)}`, res.status);
  }
  return res.json();
}

// Drive's multipart upload wants a raw `multipart/related` body (a metadata
// JSON part plus the binary part), not the `multipart/form-data` a plain
// FormData object would produce, so this builds the body by hand as a Blob
// (safe for binary content, unlike string concatenation).
function buildMultipartBody(metadata, blob, mimeType) {
  const boundary = `onetrip-mechanic-${Date.now()}`;
  const metadataPart = `--${boundary}
Content-Type: application/json; charset=UTF-8

${JSON.stringify(metadata)}
`;
  const mediaHeaderPart = `--${boundary}
Content-Type: ${mimeType || 'application/octet-stream'}

`;
  const closingPart = `
--${boundary}--`;
  return { boundary, body: new Blob([metadataPart, mediaHeaderPart, blob, closingPart]) };
}

// Creates a new file inside an existing folder — used for the mechanic's
// repair-proof photo.
async function uploadFileToFolder(parentId, filename, blob, mimeType) {
  const { boundary, body } = buildMultipartBody({ name: filename, parents: [parentId] }, blob, mimeType);

  const res = await fetch(`${DRIVE_UPLOAD_API_BASE}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new DriveApiError(`Drive photo upload failed (${res.status}): ${errBody.slice(0, 300)}`, res.status);
  }
  return res.json();
}

// Replaces an existing file's bytes (and name, in case the extension
// changed) in place — used when a Certify Fixed retry finds the proof photo
// its own earlier, half-finished attempt already uploaded, so the retry
// doesn't leave a second copy behind.
async function replaceFileWithBlob(fileId, filename, blob, mimeType) {
  const { boundary, body } = buildMultipartBody({ name: filename }, blob, mimeType);

  const res = await fetch(`${DRIVE_UPLOAD_API_BASE}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new DriveApiError(`Drive photo replace failed (${res.status}): ${errBody.slice(0, 300)}`, res.status);
  }
  return res.json();
}

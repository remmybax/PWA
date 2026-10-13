// OneTrip photo store — station photos live in IndexedDB, not localStorage.
// localStorage caps out around 5-10MB per origin, which a full inspection's
// worth of real camera photos (23+ station photos, not 1x1 test pixels)
// can realistically hit. IndexedDB's quota is typically hundreds of MB to
// GB, so photos live here; the lightweight inspection state (statuses,
// values, truck info) stays in localStorage via state.js.

const PHOTO_DB_NAME = 'onetrip-photos';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = 'photos';

let photoDbPromise = null;

function openPhotoDB() {
  if (photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'stationId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A rejected promise is still truthy, so without this the guard above
  // would permanently latch onto one failed open attempt (a transient
  // permission hiccup, say) and every photo action for the rest of the
  // page session would immediately re-fail with the same stale error.
  // Clearing the cache on failure lets the next call retry from scratch.
  photoDbPromise.catch(() => {
    photoDbPromise = null;
  });
  return photoDbPromise;
}

// savedAt doubles as the photo's capture time: the camera overlay saves
// the canvas snapshot the instant Capture is tapped, and a retake replaces
// the whole record, so it always reflects the photo actually being kept.
async function savePhoto(stationId, dataUri) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).put({ stationId, dataUri, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhotoRecord(stationId) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readonly');
    const req = tx.objectStore(PHOTO_STORE_NAME).get(stationId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getPhoto(stationId) {
  const record = await getPhotoRecord(stationId);
  return record ? record.dataUri : null;
}

async function clearAllPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 64-bit difference hash ("dHash"), as 16 hex chars. Recorded with every
// photo so a later check can spot a driver re-photographing the same
// printouts day after day: re-shooting a print shifts lighting and angle
// slightly, which defeats an exact byte comparison but barely moves this
// hash (compare by Hamming distance — a handful of differing bits means
// "same picture"). Nothing compares hashes yet; this only starts building
// the archive that comparison needs, since an archive can't be backfilled.
// Shrinking to 9x8 grayscale first throws away detail and color on
// purpose; each bit is just "is the next pixel to the right brighter".
async function computePhotoDHash(dataUri) {
  const img = new Image();
  img.src = dataUri;
  await img.decode();

  const width = 9;
  const height = 8;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  let hex = '';
  let nibble = 0;
  let bitsInNibble = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width - 1; col++) {
      const left = gray[row * width + col];
      const right = gray[row * width + col + 1];
      nibble = (nibble << 1) | (right > left ? 1 : 0);
      bitsInNibble++;
      if (bitsInNibble === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bitsInNibble = 0;
      }
    }
  }
  return hex;
}

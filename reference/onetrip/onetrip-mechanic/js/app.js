// OneTrip Mechanic — rendering. Same full-teardown-and-rebuild pattern as
// onetrip-admin and onetrip-driver: one render() call clears and rebuilds
// whatever screen is current, no diffing.

const root = document.getElementById('app');

// 'signin' | 'loading' | 'defects' | 'defectDetail' | 'history' | 'noAccess' | 'error'
let currentScreen = 'signin';
let openDefects = [];
let resolvedHistory = [];
let loadError = null;

// Whichever load is currently in flight, so the error screen's Retry
// button re-runs the thing that actually failed.
let pendingRetry = null;

// Screen 2 state — the one defect currently open, and the in-progress
// certify form for it. Form text lives here (not just read from the DOM at
// submit time) so that a re-render triggered by the submit itself — the
// "Certifying…" loading state, or a failure re-render after
// certifyDefectFixed throws — doesn't wipe out what the mechanic already
// typed and force a retype.
let selectedDefect = null;
let certifyFixedByValue = '';
let certifyNotesValue = '';
let certifyPhotoFile = null;
let certifyPhotoPreviewUrl = null;
let certifySubmitting = false;
let certifyError = null;
let certifyAttemptId = null;

// Shown at the top of Open Defects right after a successful Certify Fixed —
// without it the item just silently vanishes from the list, which reads
// the same as "did that even work?". Cleared on any other navigation.
let lastCertified = null;

// Just a convenience so the mechanic doesn't retype their name on every
// defect — NOT an identity/auth system (see auth.js: Drive access is what
// actually gates this app). Anyone can clear/overwrite it from this same
// browser.
const MECHANIC_NAME_STORAGE_KEY = 'onetrip-mechanic-last-name';

function getRememberedMechanicName() {
  try {
    return localStorage.getItem(MECHANIC_NAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function rememberMechanicName(name) {
  try {
    localStorage.setItem(MECHANIC_NAME_STORAGE_KEY, name);
  } catch {
    // Private browsing / storage disabled — not worth failing the certify over.
  }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function render() {
  root.textContent = '';
  if (currentScreen === 'signin') root.appendChild(renderSignIn());
  else if (currentScreen === 'loading') root.appendChild(renderLoading());
  else if (currentScreen === 'error') root.appendChild(renderError());
  else if (currentScreen === 'noAccess') root.appendChild(renderNoAccess());
  else if (currentScreen === 'defects') root.appendChild(renderDefectsScreen());
  else if (currentScreen === 'defectDetail') root.appendChild(renderDefectDetailScreen());
  else if (currentScreen === 'history') root.appendChild(renderHistoryScreen());
}

function renderSignIn() {
  return el('div', { class: 'signin-screen' }, [
    el('h1', { class: 'app-title' }, 'OneTrip Mechanic'),
    el('p', { class: 'app-subtitle' }, 'Sign in with a Google account that has edit access to the OneTrip Uploads Drive folder.'),
    el('button', { class: 'btn-primary', onClick: handleSignIn }, 'Sign in with Google'),
  ]);
}

function renderLoading() {
  return el('div', { class: 'loading-screen' }, [el('p', {}, 'Loading…')]);
}

function renderError() {
  return el('div', { class: 'error-screen' }, [
    el('p', { class: 'error-text' }, loadError || 'Something went wrong.'),
    el('button', { class: 'btn-secondary', onClick: handleRetry }, 'Retry'),
  ]);
}

// Same reasoning as onetrip-admin's renderNoAccess: sign-in succeeding only
// proves the Google account is real, not that it can see the shared
// folder — that's a separate, one-time share done in Drive itself.
function renderNoAccess() {
  return el('div', { class: 'error-screen' }, [
    el('h1', { class: 'app-title' }, 'No Access Yet'),
    el(
      'p',
      { class: 'app-subtitle' },
      "You're signed in, but this Google account doesn't have access to OneTrip's Drive data yet. Contact Dan to get edit access to the shared folder."
    ),
    el('button', { class: 'btn-primary', onClick: handleSignOut }, 'Sign Out & Try a Different Account'),
  ]);
}

function renderDefectsScreen() {
  const header = el('header', { class: 'page-header' }, [
    el('div', { class: 'header-titles' }, [
      el('h1', { class: 'app-title' }, 'Open Defects'),
      el('p', { class: 'app-subtitle' }, `${openDefects.length} open item${openDefects.length === 1 ? '' : 's'}, oldest first`),
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'btn-text', onClick: handleShowHistory }, 'History'),
      el('button', { class: 'btn-text', onClick: handleSignOut }, 'Sign out'),
    ]),
  ]);

  const banner = renderCertifiedBanner();

  if (openDefects.length === 0) {
    return el('div', { class: 'defects-screen' }, [header, banner, el('p', { class: 'empty-state' }, 'No open defects — every truck is clean.')]);
  }

  const list = el('div', { class: 'defect-list' }, openDefects.map(renderDefectCard));
  return el('div', { class: 'defects-screen' }, [header, banner, list]);
}

function renderCertifiedBanner() {
  if (!lastCertified) return null;
  const c = lastCertified;
  return el('div', { class: 'success-banner', role: 'status' }, [
    el('span', {}, `Truck ${c.truckNumber}, Station ${c.stationId} — ${c.subItemLabel}: certified fixed by ${c.fixedBy}.`),
    el('button', { class: 'btn-text success-banner-dismiss', onClick: handleDismissCertifiedBanner }, 'Dismiss'),
  ]);
}

function renderHistoryScreen() {
  const header = el('header', { class: 'page-header' }, [
    el('div', { class: 'header-titles' }, [
      el('button', { class: 'btn-text back-link', onClick: handleBackToDefects }, '← Open Defects'),
      el('h1', { class: 'app-title' }, 'Resolved History'),
      el('p', { class: 'app-subtitle' }, `${resolvedHistory.length} resolved item${resolvedHistory.length === 1 ? '' : 's'}, most recent first`),
    ]),
    el('button', { class: 'btn-text', onClick: handleSignOut }, 'Sign out'),
  ]);

  if (resolvedHistory.length === 0) {
    return el('div', { class: 'defects-screen' }, [header, el('p', { class: 'empty-state' }, 'No resolved defects yet.')]);
  }

  const list = el('div', { class: 'defect-list' }, resolvedHistory.map(renderHistoryCard));
  return el('div', { class: 'defects-screen' }, [header, list]);
}

function renderHistoryCard(record) {
  return el('div', { class: 'history-card' }, [
    renderHistoryPhoto(record),
    el('div', { class: 'defect-info' }, [
      el('span', { class: 'defect-truck' }, `Truck ${record.truckNumber}`),
      el('span', { class: 'defect-station' }, `Station ${record.stationId} — ${record.subItemLabel}`),
      el('span', { class: 'defect-meta' }, `Fixed by ${record.fixedBy || 'unknown'} on ${formatFlaggedAt(record.fixedDate)}`),
      record.repairNotes ? el('span', { class: 'history-notes' }, record.repairNotes) : null,
    ]),
  ]);
}

// Lazy-loaded proof photo (if the mechanic attached one) — same pattern as
// the dashboard/detail photos, but sourced from the day folder the
// resolution was actually written into rather than the driver's original.
function renderHistoryPhoto(record) {
  if (!record.repairPhoto) {
    return el('div', { class: 'defect-photo-unavailable' }, 'No photo');
  }

  const img = el('img', { class: 'defect-photo', alt: `Repair proof for Station ${record.stationId}` });
  const wrap = el('div', {}, [img]);

  findFileInFolder(record.folderId, record.repairPhoto)
    .then((file) => {
      if (!file) throw new Error('repair photo not found');
      return fetchFileBlob(file.id);
    })
    .then((blob) => {
      img.src = URL.createObjectURL(blob);
    })
    .catch((err) => {
      console.error('Failed to load repair photo', record.repairPhoto, err);
      wrap.textContent = '';
      wrap.appendChild(el('div', { class: 'defect-photo-unavailable' }, 'Photo unavailable'));
    });

  return wrap;
}

function renderDefectCard(defect) {
  const card = el('button', { class: 'defect-card', onClick: () => handleSelectDefect(defect) }, [
    renderDefectPhoto(defect),
    el('div', { class: 'defect-info' }, [
      el('span', { class: 'defect-truck' }, `Truck ${defect.truckNumber}`),
      el('span', { class: 'defect-station' }, `Station ${defect.stationId} — ${defect.subItemLabel}`),
      el('span', { class: 'defect-meta' }, defect.zoneName),
    ]),
    el('div', { class: 'defect-side' }, [
      el('span', { class: `days-open-badge${defect.daysOpen === 0 ? ' days-open-badge-fresh' : ''}` }, formatDaysOpen(defect.daysOpen)),
      el('span', { class: 'flagged-date' }, formatFlaggedAt(defect.flaggedAt)),
    ]),
  ]);
  return card;
}

// Lazy-loaded exactly like onetrip-admin's renderStationPhoto: the fileId
// lookup needs a Drive query (listFilesInFolder), so the placeholder shows
// immediately and the real image swaps in once that resolves.
function renderDefectPhoto(defect) {
  if (!defect.photoCaptured || !defect.photoFilename) {
    return el('div', { class: 'defect-photo-unavailable' }, 'No photo');
  }

  const img = el('img', { class: 'defect-photo', alt: `Station ${defect.stationId} photo` });
  const wrap = el('div', {}, [img]);

  findFileInFolder(defect.folderId, defect.photoFilename)
    .then((file) => {
      if (!file) throw new Error('photo not found');
      return fetchFileBlob(file.id);
    })
    .then((blob) => {
      img.src = URL.createObjectURL(blob);
    })
    .catch((err) => {
      console.error('Failed to load defect photo', defect.photoFilename, err);
      wrap.textContent = '';
      wrap.appendChild(el('div', { class: 'defect-photo-unavailable' }, 'Photo unavailable'));
    });

  return wrap;
}

function renderDefectDetailScreen() {
  const d = selectedDefect;
  const header = el('header', { class: 'page-header' }, [
    el('div', { class: 'header-titles' }, [
      el('button', { class: 'btn-text back-link', onClick: handleBackToDefects }, '← Open Defects'),
      el('h1', { class: 'app-title' }, `Truck ${d.truckNumber}`),
    ]),
    el('button', { class: 'btn-text', onClick: handleSignOut }, 'Sign out'),
  ]);

  const hasValue = d.value !== null && d.value !== undefined && d.value !== '';
  const valueText = hasValue ? `: ${formatValueWithUnit(d.value, d.unit)}` : '';

  const detail = el('div', { class: 'detail-card' }, [
    el('span', { class: 'detail-zone' }, d.zoneName),
    el('h2', { class: 'detail-station-title' }, `Station ${d.stationId} — ${d.stationLabel}`),
    el('p', { class: 'detail-item-label' }, `${d.subItemLabel}${valueText}`),
    renderDefectDetailPhoto(d),
    el('p', { class: 'detail-flagged-by' }, `Flagged by ${d.driverName || 'unknown driver'} — ${formatFlaggedAt(d.flaggedAt)} (${formatDaysOpen(d.daysOpen)})`),
  ]);

  const sections = [header, detail, renderCertifyForm()];
  return el('div', { class: 'defects-screen' }, sections);
}

// Full-size version of the driver's original photo — same lazy-load
// pattern as the dashboard card's thumbnail, just larger.
function renderDefectDetailPhoto(defect) {
  if (!defect.photoCaptured || !defect.photoFilename) {
    return el('div', { class: 'detail-photo-unavailable' }, 'No photo captured for this station');
  }

  const img = el('img', { class: 'detail-photo', alt: `Station ${defect.stationId} photo` });
  const wrap = el('div', {}, [img]);

  findFileInFolder(defect.folderId, defect.photoFilename)
    .then((file) => {
      if (!file) throw new Error('photo not found');
      return fetchFileBlob(file.id);
    })
    .then((blob) => {
      img.src = URL.createObjectURL(blob);
    })
    .catch((err) => {
      console.error('Failed to load defect photo', defect.photoFilename, err);
      wrap.textContent = '';
      wrap.appendChild(el('div', { class: 'detail-photo-unavailable' }, 'Photo unavailable'));
    });

  return wrap;
}

function renderCertifyForm() {
  const nameInput = el('input', {
    class: 'text-input',
    type: 'text',
    id: 'certify-fixed-by',
    value: certifyFixedByValue,
    placeholder: 'Your name',
    onInput: (e) => {
      certifyFixedByValue = e.target.value;
    },
  });

  const notesInput = el('textarea', {
    class: 'text-input textarea-input',
    id: 'certify-notes',
    rows: '4',
    placeholder: 'What did you find, and what did you do about it?',
    onInput: (e) => {
      certifyNotesValue = e.target.value;
    },
  });
  notesInput.value = certifyNotesValue;

  const photoInputId = 'certify-photo-input';
  const photoPreview = el('div', { class: 'certify-photo-preview' });
  renderCertifyPhotoPreview(photoPreview);

  const photoInput = el('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    id: photoInputId,
    class: 'certify-photo-input',
    onChange: (e) => handlePhotoFileChange(e.target.files[0] || null, photoPreview),
  });

  const certifyButton = el(
    'button',
    { class: 'btn-primary', onClick: () => handleCertifySubmit(certifyFixedByValue, certifyNotesValue) },
    certifySubmitting ? 'Certifying…' : 'Certify Fixed'
  );
  if (certifySubmitting) certifyButton.setAttribute('disabled', 'true');

  const formChildren = [
    el('h2', { class: 'certify-heading' }, 'Certify Repair'),
    el('label', { class: 'field-label', for: 'certify-fixed-by' }, 'Fixed By'),
    nameInput,
    el('label', { class: 'field-label', for: 'certify-notes' }, 'What Was Done'),
    notesInput,
    el('label', { class: 'field-label', for: photoInputId }, 'Proof Photo (optional)'),
    photoInput,
    photoPreview,
  ];

  if (certifyError) formChildren.push(el('p', { class: 'error-text certify-error' }, certifyError));
  formChildren.push(certifyButton);

  return el('div', { class: 'certify-form' }, formChildren);
}

function renderCertifyPhotoPreview(container) {
  container.textContent = '';
  if (!certifyPhotoPreviewUrl) return;
  container.appendChild(el('img', { class: 'certify-photo-preview-img', src: certifyPhotoPreviewUrl, alt: 'Repair proof photo preview' }));
}

function formatValueWithUnit(value, unit) {
  if (!unit) return String(value);
  return /^[a-zA-Z]/.test(unit) ? `${value} ${unit}` : `${value}${unit}`;
}

function formatDaysOpen(days) {
  if (days === 0) return 'Flagged today';
  if (days === 1) return '1 day open';
  return `${days} days open`;
}

function formatFlaggedAt(isoOrDateStr) {
  if (!isoOrDateStr) return '—';
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// Runs an async load, showing the loading screen while in flight and the
// error screen (with working Retry) if it throws.
async function runLoad(loadFn, onSuccess) {
  pendingRetry = () => runLoad(loadFn, onSuccess);
  currentScreen = 'loading';
  render();
  try {
    const result = await loadFn();
    onSuccess(result);
  } catch (err) {
    console.error('Load failed', err);
    if (err instanceof NoDriveAccessError) {
      currentScreen = 'noAccess';
    } else {
      loadError = err.message || String(err);
      currentScreen = 'error';
    }
  }
  render();
}

function loadDefects() {
  runLoad(loadOpenDefects, (result) => {
    openDefects = result;
    currentScreen = 'defects';
  });
}

function handleShowHistory() {
  lastCertified = null;
  runLoad(loadResolvedHistory, (result) => {
    resolvedHistory = result;
    currentScreen = 'history';
  });
}

function handleSignIn() {
  signIn();
}

function handleSignOut() {
  signOut();
  openDefects = [];
  resolvedHistory = [];
  lastCertified = null;
  currentScreen = 'signin';
  render();
}

function handleRetry() {
  if (pendingRetry) pendingRetry();
}

function handleSelectDefect(defect) {
  lastCertified = null;
  selectedDefect = defect;
  certifyFixedByValue = getRememberedMechanicName();
  certifyNotesValue = '';
  certifyPhotoFile = null;
  certifyPhotoPreviewUrl = null;
  certifySubmitting = false;
  certifyError = null;
  certifyAttemptId = Date.now().toString(36);
  currentScreen = 'defectDetail';
  render();
}

function handleBackToDefects() {
  if (certifyPhotoPreviewUrl) URL.revokeObjectURL(certifyPhotoPreviewUrl);
  selectedDefect = null;
  certifyFixedByValue = '';
  certifyNotesValue = '';
  currentScreen = 'defects';
  render();
}

function handleDismissCertifiedBanner() {
  lastCertified = null;
  render();
}

function handlePhotoFileChange(file, previewContainer) {
  if (certifyPhotoPreviewUrl) URL.revokeObjectURL(certifyPhotoPreviewUrl);
  certifyPhotoFile = file;
  certifyPhotoPreviewUrl = file ? URL.createObjectURL(file) : null;
  renderCertifyPhotoPreview(previewContainer);
}

async function handleCertifySubmit(fixedBy, repairNotes) {
  const trimmedName = (fixedBy || '').trim();
  const trimmedNotes = (repairNotes || '').trim();
  if (!trimmedName || !trimmedNotes) {
    certifyError = 'Enter your name and a description of what was done before certifying.';
    render();
    return;
  }

  certifySubmitting = true;
  certifyError = null;
  render();

  try {
    await certifyDefectFixed(selectedDefect, {
      fixedBy: trimmedName,
      repairNotes: trimmedNotes,
      repairPhotoBlob: certifyPhotoFile,
      attemptId: certifyAttemptId,
    });
    rememberMechanicName(trimmedName);
    lastCertified = {
      truckNumber: selectedDefect.truckNumber,
      stationId: selectedDefect.stationId,
      subItemLabel: selectedDefect.subItemLabel,
      fixedBy: trimmedName,
    };
    if (certifyPhotoPreviewUrl) URL.revokeObjectURL(certifyPhotoPreviewUrl);
    selectedDefect = null;
    certifyFixedByValue = '';
    certifyNotesValue = '';
    certifyPhotoFile = null;
    certifyPhotoPreviewUrl = null;
    loadDefects();
  } catch (err) {
    console.error('Certify Fixed failed', err);
    certifySubmitting = false;
    certifyError = err.message || String(err);
    render();
  }
}

function showAuthError(message) {
  loadError = message;
  currentScreen = 'error';
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth(loadDefects);
  render();
});

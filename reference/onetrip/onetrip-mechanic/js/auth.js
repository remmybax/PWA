// OneTrip Mechanic — Google sign-in via Google Identity Services (GIS).
//
// Same direct-to-Drive pattern as onetrip-admin (see that repo's js/auth.js)
// rather than the driver app's Cloud Run backend — but this app WRITES back
// into inspection-data.json (the Certify Fixed step on Screen 2), so it
// needs the full read/write Drive scope, not admin's drive.readonly. The
// signed-in account still needs actual Editor access to the "OneTrip
// Uploads" folder in Drive for writes to succeed — that's a one-time share
// done in Drive itself, not something this code can grant.
//
// OAUTH_CLIENT_ID below is a placeholder — this app needs its OWN OAuth
// Client ID (same pattern as onetrip-driver and onetrip-admin each having
// their own), created in Google Cloud Console:
//   1. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
//   2. Application type: Web application
//   3. Authorized JavaScript origins: the GitHub Pages origin this app is
//      served from (e.g. https://onetripapp.github.io)
//   4. On the OAuth consent screen, add the mechanic's Google account under
//      "Test users" (the `drive` scope is sensitive, so this stays in
//      Testing mode rather than needing Google's verification review)
//   5. Share the "OneTrip Uploads" Drive folder with that same account,
//      granting Editor (not just Viewer) access
// Paste the resulting Client ID in place of the placeholder below.
const DRIVE_READWRITE_SCOPE = 'https://www.googleapis.com/auth/drive';
const OAUTH_CLIENT_ID = '106361031303-74eh7020f8m6irctjdj53kee3u9fp49f.apps.googleusercontent.com';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function isSignedIn() {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

function getAccessToken() {
  return accessToken;
}

function initAuth(onSignedIn) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: OAUTH_CLIENT_ID,
    scope: DRIVE_READWRITE_SCOPE,
    callback: (response) => {
      if (response.error) {
        console.error('Google sign-in failed', response);
        showAuthError(response.error_description || response.error);
        return;
      }
      accessToken = response.access_token;
      // expires_in is seconds from now; back off 60s early so an in-flight
      // Drive call can't get rejected mid-request right at the boundary.
      tokenExpiresAt = Date.now() + (response.expires_in - 60) * 1000;
      onSignedIn();
    },
  });
}

function signIn() {
  tokenClient.requestAccessToken({ prompt: '' });
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
}

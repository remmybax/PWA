// URL builders safe to use on the server and in the browser.

export function photoUrl(key: string, token?: string): string {
  return `/api/photos/${encodeURIComponent(key)}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}

export function reportPath(token: string): string {
  return `/r/${token}`;
}

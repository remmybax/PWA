// Small DOM helpers shared by every view.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(d, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export const ICONS = {
  logo: 'M5 19V10a4 4 0 0 1 4-4h10M16 3l3 3-3 3M5 22a1.5 1.5 0 1 0 0-3a1.5 1.5 0 1 0 0 3z',
  folder: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  sync: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18 3v4h-4M6 21v-4h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  auto: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};

export function flagText(text) {
  return el('span', { class: 'flag-text' }, icon(ICONS.flag, 14), text);
}

export function toast(message, { error = false } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el('div', { class: `toast${error ? ' error' : ''}` }, icon(error ? ICONS.flag : ICONS.check, 14), message);
  host.append(t);
  setTimeout(() => t.remove(), error ? 6000 : 3200);
}

// ---------- Theme: auto (follow system) / light / dark, shared by panel and tab ----------

const THEMES = ['auto', 'light', 'dark'];
let theme = 'auto';

function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export async function initTheme(onChange) {
  try { theme = (await chrome.storage.local.get('theme')).theme || 'auto'; } catch { theme = 'auto'; }
  applyTheme();
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.theme) return;
    theme = changes.theme.newValue || 'auto';
    applyTheme();
    onChange?.();
  });
}

export function themeButton() {
  const label = { auto: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' }[theme];
  const d = { auto: ICONS.auto, light: ICONS.sun, dark: ICONS.moon }[theme];
  return el('button', {
    type: 'button',
    class: 'btn link',
    title: `${label}. Click to change.`,
    'aria-label': `${label}. Click to change.`,
    onClick: () => chrome.storage.local.set({ theme: THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] }),
  }, icon(d, 18));
}

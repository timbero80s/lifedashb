// Small shared helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export async function fetchJSON(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

// localStorage-backed cache so the wall keeps showing the last good data.
export const cache = {
  get(key) {
    try {
      const raw = localStorage.getItem('wd:' + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem('wd:' + key, JSON.stringify({ t: Date.now(), value })); }
    catch { /* private mode / quota */ }
  },
};

// Run loader(); on failure fall back to the cached value and mark it stale.
export async function withCache(key, loader) {
  try {
    const value = await loader();
    cache.set(key, value);
    return { value, stale: false };
  } catch (err) {
    const hit = cache.get(key);
    if (hit) return { value: hit.value, stale: true, error: err };
    return { value: null, stale: true, error: err };
  }
}

export function every(minutes, fn) {
  const run = () => Promise.resolve(fn()).catch((e) => console.warn('task failed', e));
  run();
  return setInterval(run, Math.max(0.25, minutes) * 60_000);
}

// ── time, always in the configured timezone ────────────────────────────
export function tzParts(date, timezone) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: p.weekday,
  };
}

export const fmtTime = (date, tz) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).format(date);

export const fmtDay = (date, tz, opts = { weekday: 'short' }) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(date);

// "in 4d 02h" / "in 3h 12m" / "in 14 min" / "now"
export function countdown(target, now = Date.now()) {
  let s = Math.round((new Date(target).getTime() - now) / 1000);
  if (s <= 0) return 'now';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600);  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `in ${d}d ${String(h).padStart(2, '0')}h`;
  if (h) return `in ${h}h ${String(m).padStart(2, '0')}m`;
  return `in ${m} min`;
}

// local-midnight-anchored day key in a timezone, for comparing calendar days
export function dayKey(date, tz) {
  const p = tzParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function isoWeek(date, tz) {
  const { year, month, day } = tzParts(date, tz);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round((d - firstThursday) / (7 * 864e5));
}

export const minutesSinceMidnight = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

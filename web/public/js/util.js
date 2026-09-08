// Small shared helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// fetch JSON with a timeout and a friendly error
export async function fetchJSON(url, opts = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// localStorage-backed cache so the wall keeps showing the last good data
// even when the network hiccups.
export const cache = {
  get(key) {
    try {
      const raw = localStorage.getItem('wd:' + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },
  set(key, value) {
    try {
      localStorage.setItem('wd:' + key, JSON.stringify({ t: Date.now(), value }));
    } catch { /* private mode / quota — ignore */ }
  },
};

// Run loader(), cache the result. On failure fall back to cached value and
// mark it stale. Returns { value, stale, ageMs }.
export async function withCache(key, loader) {
  try {
    const value = await loader();
    cache.set(key, value);
    return { value, stale: false, ageMs: 0 };
  } catch (err) {
    const hit = cache.get(key);
    if (hit) return { value: hit.value, stale: true, ageMs: Date.now() - hit.t, error: err };
    return { value: null, stale: true, ageMs: Infinity, error: err };
  }
}

// schedule a repeating task; runs immediately, then every `minutes`.
export function every(minutes, fn) {
  const run = () => Promise.resolve(fn()).catch((e) => console.warn('task failed', e));
  run();
  return setInterval(run, Math.max(1, minutes) * 60_000);
}

// ---- date / time formatting (always in the configured timezone) ----------

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
    weekday: p.weekday.toUpperCase(),
  };
}

export function fmtTime(date, timezone, opts = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit', ...opts,
  }).format(date);
}

export function fmtClockRelative(date, timezone) {
  const now = Date.now();
  const diffMin = Math.round((date.getTime() - now) / 60000);
  if (diffMin <= 0 && diffMin > -2) return 'now';
  if (diffMin > 0 && diffMin < 60) return `in ${diffMin}m`;
  if (diffMin >= 60 && diffMin < 60 * 24) {
    const h = Math.floor(diffMin / 60), m = diffMin % 60;
    return `in ${h}h${m ? ' ' + m + 'm' : ''}`;
  }
  return fmtTime(date, timezone, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function isoWeek(date, timezone) {
  const { year, month, day } = tzParts(date, timezone);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d - firstThursday;
  return 1 + Math.round(diff / (7 * 864e5));
}

export function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

export function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

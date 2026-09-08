import { CONFIG } from '../config.js';
import { $, el, every, tzParts, dayKey } from '../util.js';
import { setAlert, clearAlert } from '../bus.js';

// The highest-value square inch in a UK hallway: the things a family forgets,
// that have a hard deadline, and that nobody has looked up. All computed
// locally from config — no API, nothing to go stale.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Next collection on or after today, and which alternating bin it is.
function nextCollection(bins, now, tz) {
  const p = tzParts(now, tz);
  const todayUTC = Date.UTC(p.year, p.month - 1, p.day);
  let offset = (bins.day - new Date(todayUTC).getUTCDay() + 7) % 7;
  // after the collection has happened, look to next week
  if (offset === 0 && p.hour >= 12) offset = 7;
  const dateUTC = todayUTC + offset * 864e5;

  const anchorUTC = localMidnight(bins.anchorDate);
  const weeks = Math.round((dateUTC - anchorUTC) / (7 * 864e5));
  const alt = bins.alternating || [];
  const anchorIdx = Math.max(0, alt.findIndex((a) => a.key === bins.anchorType));
  const which = alt.length ? alt[(((anchorIdx + weeks) % alt.length) + alt.length) % alt.length] : null;

  return { dateUTC, offset, which, weekly: bins.weekly || [] };
}

export function initHousehold() {
  const body = $('#house-body');
  const cfg = CONFIG.household;

  function schoolLine(now) {
    const s = cfg.school;
    if (!s || !s.enabled) return null;
    const key = dayKey(now, CONFIG.timezone);
    if ((s.insetDays || []).includes(key)) return { v: 'INSET day — no school', alert: true };
    const term = (s.terms || []).find((t) => key >= t.from && key <= t.to);
    if (!term) return { v: 'Holiday' };
    const dow = new Date(localMidnight(key)).getUTCDay();
    const note = (s.notes || {})[dow];
    return { v: term.name + (note ? ` · ${note}` : '') };
  }

  function render() {
    const now = new Date();
    body.innerHTML = '';

    if (cfg.bins && cfg.bins.enabled) {
      const { offset, which, weekly } = nextCollection(cfg.bins, now, CONFIG.timezone);
      const all = [which, ...weekly].filter(Boolean);

      // the alternating bin is the payload; weekly ones are a supporting note
      const main = el('div', { class: 'hh-main' });
      if (which) {
        main.append(el('div', { class: 'hh-bin' },
          el('span', { class: 'swatch', style: `background:${which.colour}` }),
          document.createTextNode(which.label)));
      }
      for (const w of weekly) {
        main.append(el('div', { class: 'hh-also' },
          el('span', { class: 'swatch', style: `background:${w.colour}` }),
          document.createTextNode(w.label)));
      }
      body.append(main);

      const { hour } = tzParts(now, CONFIG.timezone);
      const dueTonight = offset === 1 || (offset === 0 && hour < 12);
      const when = offset === 0 ? 'Collected today'
        : offset === 1 ? 'Out tonight'
        : `${DAYS[cfg.bins.day]}, ${offset} days`;
      body.append(el('div', { class: 'hh-when' + (dueTonight ? ' due' : ''), text: when }));

      if (offset === 1) {
        setAlert('bins', { text: `${all.map((b) => b.label).join(' + ')} out tonight`, level: 'warn', priority: 20 });
      } else clearAlert('bins');
    }

    const school = schoolLine(now);
    if (school) {
      body.append(el('div', { class: 'hh-row' },
        el('span', { class: 'k', text: (cfg.school.label || 'School').toUpperCase() }),
        el('span', { class: 'v grow trunc' + (school.alert ? ' alert' : ''), text: school.v })));
    }
  }

  every(CONFIG.refresh.house, render);
}

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

// The next bin night on or after today, and which bins go out on it.
// `bins.day` is the evening they go OUT, so today still counts until late.
function nextCollection(bins, now, tz) {
  const p = tzParts(now, tz);
  const todayUTC = Date.UTC(p.year, p.month - 1, p.day);
  let offset = (bins.day - new Date(todayUTC).getUTCDay() + 7) % 7;
  if (offset === 0 && p.hour >= 22) offset = 7;   // they're out; roll on a week
  const dateUTC = todayUTC + offset * 864e5;

  const alt = bins.alternating || [];
  let which = null;
  if (alt.length) {
    const weeks = Math.round((dateUTC - localMidnight(bins.anchorDate)) / (7 * 864e5));
    const i = alt.findIndex((a) => a.key === bins.anchorType);
    which = alt[((((i < 0 ? 0 : i) + weeks) % alt.length) + alt.length) % alt.length];
  }
  return { dateUTC, offset, which, weekly: bins.weekly || [] };
}

export function initHousehold() {
  const body = $('#house-body');
  const cfg = CONFIG.household;

  // Priority: is the school shut today? then which term? then which holiday,
  // and when is everyone back.
  function shortDate(key) {
    return new Date(localMidnight(key)).toLocaleDateString('en-GB',
      { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  function schoolLine(now) {
    const s = cfg.school;
    if (!s || !s.enabled) return null;
    const key = dayKey(now, CONFIG.timezone);

    const term = (s.terms || []).find((t) => key >= t.from && key <= t.to);
    if (term) {
      // a closure only matters on a day school would otherwise be on
      const shut = (s.closures || []).find((c) => c.date === key);
      if (shut) return { v: `${shut.label} — no school`, alert: true };
      const note = (s.notes || {})[new Date(localMidnight(key)).getUTCDay()];
      const daysLeft = Math.round((localMidnight(term.to) - localMidnight(key)) / 864e5);
      const tail = note ? ` · ${note}`
        : daysLeft <= 7 ? ` · breaks ${shortDate(term.to)}`
        : '';
      return { v: term.name + tail };
    }

    const hol = (s.holidays || []).find((h) => key >= h.from && key <= h.to);
    const next = (s.terms || []).filter((t) => t.from > key).sort((a, b) => a.from < b.from ? -1 : 1)[0];
    const back = next ? ` · back ${shortDate(next.from)}` : '';
    return { v: (hol ? hol.name : 'Holiday') + back };
  }

  function render() {
    const now = new Date();
    body.innerHTML = '';

    if (cfg.bins && cfg.bins.enabled) {
      const { offset, which, weekly } = nextCollection(cfg.bins, now, CONFIG.timezone);
      const all = [which, ...weekly].filter(Boolean);

      // The alternating bin is the headline — it's the one that gets forgotten.
      // The every-week ones are a supporting note.
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

      const tonight = offset === 0;
      const when = tonight ? 'Out tonight'
        : offset === 1 ? `${DAYS[cfg.bins.day]} — tomorrow night`
        : `${DAYS[cfg.bins.day]} night · ${offset} days`;
      body.append(el('div', { class: 'hh-when' + (tonight ? ' due' : ''), text: when }));

      if (tonight) {
        setAlert('bins', {
          text: `${all.map((b) => b.label).join(' + ')} out tonight`,
          level: 'warn', priority: 20,
        });
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

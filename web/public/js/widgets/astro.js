import { CONFIG } from '../config.js';
import { $, el, every, fmtTime } from '../util.js';

// ---- moon phase (synodic approximation) --------------------------------
const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000; // in days

function moon(date = new Date()) {
  const days = date.getTime() / 86400000;
  let frac = ((days - REF_NEW_MOON) / SYNODIC) % 1;
  if (frac < 0) frac += 1;
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  const age = frac * SYNODIC;
  const names = [
    [0.02, 'NEW MOON'], [0.24, 'WAXING CRESCENT'], [0.26, 'FIRST QUARTER'],
    [0.49, 'WAXING GIBBOUS'], [0.51, 'FULL MOON'], [0.74, 'WANING GIBBOUS'],
    [0.76, 'LAST QUARTER'], [0.98, 'WANING CRESCENT'], [1.01, 'NEW MOON'],
  ];
  const name = names.find(([lim]) => frac < lim)[1];
  return { frac, illum, age, name, waxing: frac < 0.5 };
}

// ---- sunrise / sunset (NOAA, good to ~1 min for UK latitudes) ----------
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180;
  const dayMs = 86400000;
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const n = Math.floor((start / dayMs) - 10957.5 + 0.5) + 0.0008; // days since 2000
  const Jstar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const decl = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) /
    (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH > 1) return { polar: 'night' };
  if (cosH < -1) return { polar: 'day' };
  const H = Math.acos(cosH) / rad;
  const Jset = Jtransit + (H / 360);
  const Jrise = Jtransit - (H / 360);
  const toDate = (J) => new Date((J - 2440587.5) * dayMs);
  return { sunrise: toDate(Jrise), sunset: toDate(Jset) };
}

export function initAstro(coords) {
  const body = $('#astro-body');
  const lat = coords ? coords.lat : 51.52;
  const lon = coords ? coords.lon : -0.72;
  let lastSun = null;

  function render() {
    const now = new Date();
    const m = moon(now);
    const s = sunTimes(now, lat, lon);
    lastSun = s.sunrise ? s : null;

    body.innerHTML = '';

    // moon disc: shadow drawn as an offset circle
    const disc = el('div', { class: 'moon-disc' });
    const shadow = el('i');
    const shift = (m.frac < 0.5 ? 1 : -1) * (1 - m.illum) * 100;
    shadow.style.transform = `translateX(${shift}%)`;
    shadow.style.borderRadius = '50%';
    disc.append(shadow);

    body.append(el('div', { class: 'astro-moon' },
      disc,
      el('div', { class: 'txt' },
        el('div', { class: 'name', text: m.name }),
        el('div', { class: 'pct', text: `${Math.round(m.illum * 100)}% lit · day ${Math.round(m.age)} of 29` }),
      ),
    ));

    if (s.sunrise) {
      const dayLen = s.sunset - s.sunrise;
      const h = Math.floor(dayLen / 3600000), mn = Math.round((dayLen % 3600000) / 60000);
      body.append(
        el('div', { class: 'astro-row' }, el('span', { text: 'SUNRISE' }), el('b', { text: fmtTime(s.sunrise, CONFIG.timezone) })),
        el('div', { class: 'astro-row' }, el('span', { text: 'SUNSET' }), el('b', { text: fmtTime(s.sunset, CONFIG.timezone) })),
        el('div', { class: 'astro-row' }, el('span', { text: 'DAYLIGHT' }), el('b', { text: `${h}h ${String(mn).padStart(2, '0')}m` })),
      );
    } else {
      body.append(el('div', { class: 'astro-row' }, el('span', { text: 'SUN' }),
        el('b', { text: s.polar === 'day' ? 'UP ALL DAY' : 'DOWN ALL DAY' })));
    }
  }

  every(CONFIG.refresh.astro, render);
  return { getSun: () => lastSun };
}

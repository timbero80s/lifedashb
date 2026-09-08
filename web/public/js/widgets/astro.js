import { CONFIG } from '../config.js';
import { $, el, every, fmtTime } from '../util.js';

const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;

function moon(date = new Date()) {
  let frac = (((date.getTime() / 86400000) - REF_NEW_MOON) / SYNODIC) % 1;
  if (frac < 0) frac += 1;
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  const names = [
    [0.02, 'New moon'], [0.24, 'Waxing crescent'], [0.26, 'First quarter'],
    [0.49, 'Waxing gibbous'], [0.51, 'Full moon'], [0.74, 'Waning gibbous'],
    [0.76, 'Last quarter'], [0.98, 'Waning crescent'], [1.01, 'New moon'],
  ];
  return { frac, illum, name: names.find(([lim]) => frac < lim)[1] };
}

// NOAA sunrise/sunset — good to about a minute at UK latitudes.
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180, dayMs = 86400000;
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const n = Math.floor((start / dayMs) - 10957.5 + 0.5) + 0.0008;
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
  const toDate = (J) => new Date((J - 2440587.5) * dayMs);
  return { sunrise: toDate(Jtransit - H / 360), sunset: toDate(Jtransit + H / 360) };
}

export function initAstro(coords) {
  const body = $('#astro-body');
  const lat = coords ? coords.lat : 51.52;
  const lon = coords ? coords.lon : -0.72;

  function render() {
    const now = new Date();
    const m = moon(now);
    const s = sunTimes(now, lat, lon);

    body.innerHTML = '';
    const disc = el('div', { class: 'moon' });
    const shadow = el('i');
    // shift a same-size dark circle across the lit disc to draw the phase
    shadow.style.transform = `translateX(${(m.frac < 0.5 ? 1 : -1) * (1 - m.illum) * 100}%)`;
    disc.append(shadow);
    body.append(el('div', { class: 'moon-wrap' }, disc,
      el('div', { class: 'moon-txt' },
        el('div', { class: 'nm', text: m.name }),
        el('div', { class: 'pc', text: `${Math.round(m.illum * 100)}% lit` }))));

    if (s.sunrise) {
      const len = s.sunset - s.sunrise;
      const h = Math.floor(len / 3600000), mn = Math.round((len % 3600000) / 60000);
      body.append(
        el('div', { class: 'astro-row' }, el('span', { class: 'k', text: 'Sunrise' }), el('span', { text: fmtTime(s.sunrise, CONFIG.timezone) })),
        el('div', { class: 'astro-row' }, el('span', { class: 'k', text: 'Sunset' }), el('span', { text: fmtTime(s.sunset, CONFIG.timezone) })),
        el('div', { class: 'astro-row' }, el('span', { class: 'k', text: 'Daylight' }), el('span', { text: `${h}h ${String(mn).padStart(2, '0')}m` })),
      );
    }
  }

  every(CONFIG.refresh.astro, render);
}

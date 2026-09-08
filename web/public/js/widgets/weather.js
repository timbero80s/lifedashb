import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, fmtDay } from '../util.js';
import { reportStatus } from '../bus.js';

// Monochrome SVG glyphs — colour emoji at 30px are muddy and render
// inconsistently across the Fire's font stack.
const G = {
  sun:   '<circle cx="12" cy="12" r="5"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>',
  part:  '<circle cx="8" cy="8" r="3.4"/><path d="M9 19h9a3.6 3.6 0 0 0 .3-7.2A5.4 5.4 0 0 0 8 12.4 3.2 3.2 0 0 0 9 19z"/>',
  rain:  '<path d="M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 18l-1 3M13 18l-1 3M18 18l-1 3"/></g>',
  snow:  '<path d="M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 19h.01M13 19h.01M18 19h.01M10.5 21.5h.01M15.5 21.5h.01"/></g>',
  storm: '<path d="M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z"/><path d="M13 16l-3 4h3l-1 4 4-5h-3z"/>',
  fog:   '<path d="M7 13h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 6a3.5 3.5 0 0 0 1 7z"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 17h16M6 21h12"/></g>',
};
const WMO = {
  0: ['sun', 'Clear'], 1: ['sun', 'Sunny'], 2: ['part', 'Part cloud'], 3: ['cloud', 'Overcast'],
  45: ['fog', 'Fog'], 48: ['fog', 'Rime fog'],
  51: ['rain', 'Drizzle'], 53: ['rain', 'Drizzle'], 55: ['rain', 'Drizzle'],
  56: ['rain', 'Frz drizzle'], 57: ['rain', 'Frz drizzle'],
  61: ['rain', 'Light rain'], 63: ['rain', 'Rain'], 65: ['rain', 'Heavy rain'],
  66: ['rain', 'Frz rain'], 67: ['rain', 'Frz rain'],
  71: ['snow', 'Light snow'], 73: ['snow', 'Snow'], 75: ['snow', 'Heavy snow'], 77: ['snow', 'Snow grains'],
  80: ['rain', 'Showers'], 81: ['rain', 'Showers'], 82: ['rain', 'Heavy showers'],
  85: ['snow', 'Snow showers'], 86: ['snow', 'Snow showers'],
  95: ['storm', 'Thunder'], 96: ['storm', 'Thunder'], 99: ['storm', 'Thunder'],
};
const info = (c) => WMO[c] || ['cloud', ''];
const icon = (k) => `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">${G[k]}</svg>`;
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (d) => DIRS[Math.round(((d % 360) / 45)) % 8];

function url(c) {
  const p = new URLSearchParams({
    latitude: c.lat, longitude: c.lon, timezone: CONFIG.timezone,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m',
    hourly: 'precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    wind_speed_unit: 'mph', temperature_unit: 'celsius',
    forecast_days: 5, models: 'ukmo_seamless',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

// The one line of forecast that changes behaviour: when will it rain today.
function rainWindow(w) {
  const t = w.hourly && w.hourly.time, p = w.hourly && w.hourly.precipitation_probability;
  if (!t || !p) return null;
  const now = Date.now();
  let start = null, end = null;
  for (let i = 0; i < t.length && i < 24; i++) {
    const at = new Date(t[i]).getTime();
    if (at < now - 36e5 || at > now + 12 * 36e5) continue;
    if (p[i] >= 50) { if (start === null) start = t[i]; end = t[i]; }
    else if (start !== null) break;
  }
  if (start === null) return null;
  const hh = (s) => s.slice(11, 16);
  return start === end ? `Rain ~${hh(start)}` : `Rain ${hh(start)}–${hh(end)}`;
}

export function initWeather(coords) {
  const body = $('#weather-body');
  const card = $('#c-wx');
  if (!coords) { body.innerHTML = '<div class="empty">No location</div>'; return; }

  async function load() {
    const { value, stale } = await withCache('weather', () => fetchJSON(url(coords)));
    if (!value) { reportStatus('weather', 'down'); return; }
    reportStatus('weather', stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', stale);
    render(value);
  }

  function render(w) {
    const c = w.current;
    const [k, txt] = info(c.weather_code);

    // hero strip
    $('#now-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('#now-cond').textContent = txt;
    $('#now-place').textContent = coords.label || CONFIG.placeLabel;

    body.innerHTML = '';
    const rain = rainWindow(w);
    body.append(el('div', { class: 'wx-meta', text:
      `Feels ${Math.round(c.apparent_temperature)}° · ${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}`
      + (rain ? ` · ${rain}` : '') }));

    const d = w.daily;
    const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max);
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < Math.min(4, d.time.length); i++) {
      const [dk] = info(d.weather_code[i]);
      const left = ((d.temperature_2m_min[i] - lo) / span) * 100;
      const width = Math.max(6, ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100);
      body.append(el('div', { class: 'wx-day' },
        el('span', { class: 'd', text: i === 0 ? 'Today' : fmtDay(new Date(d.time[i] + 'T12:00:00'), CONFIG.timezone) }),
        el('span', { class: 'ic', html: icon(dk) }),
        el('span', { class: 'bar' }, el('i', { style: `left:${left}%;width:${width}%` })),
        el('span', { class: 't', text: `${Math.round(d.temperature_2m_min[i])}°–${Math.round(d.temperature_2m_max[i])}°` }),
      ));
    }
  }

  every(CONFIG.refresh.weather, load);
}

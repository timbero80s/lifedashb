import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../app.js';

// WMO weather-code -> [emoji, short text]
const WMO = {
  0: ['☀', 'CLEAR'], 1: ['\u{1F324}', 'SUNNY'], 2: ['⛅', 'PART CLOUD'], 3: ['☁', 'OVERCAST'],
  45: ['\u{1F32B}', 'FOG'], 48: ['\u{1F32B}', 'RIME FOG'],
  51: ['\u{1F327}', 'DRIZZLE'], 53: ['\u{1F327}', 'DRIZZLE'], 55: ['\u{1F327}', 'DRIZZLE'],
  56: ['\u{1F327}', 'FRZ DRIZZLE'], 57: ['\u{1F327}', 'FRZ DRIZZLE'],
  61: ['\u{1F327}', 'LIGHT RAIN'], 63: ['\u{1F327}', 'RAIN'], 65: ['\u{1F327}', 'HEAVY RAIN'],
  66: ['\u{1F327}', 'FRZ RAIN'], 67: ['\u{1F327}', 'FRZ RAIN'],
  71: ['\u{1F328}', 'LIGHT SNOW'], 73: ['\u{1F328}', 'SNOW'], 75: ['\u{1F328}', 'HEAVY SNOW'], 77: ['\u{1F328}', 'SNOW GRAINS'],
  80: ['\u{1F326}', 'SHOWERS'], 81: ['\u{1F326}', 'SHOWERS'], 82: ['⛈', 'HEAVY SHWRS'],
  85: ['\u{1F328}', 'SNOW SHWRS'], 86: ['\u{1F328}', 'SNOW SHWRS'],
  95: ['⛈', 'THUNDER'], 96: ['⛈', 'THUNDER+HAIL'], 99: ['⛈', 'THUNDER+HAIL'],
};
const codeInfo = (c) => WMO[c] || ['•', ''];
const DAYNAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function url(coords) {
  const p = new URLSearchParams({
    latitude: coords.lat, longitude: coords.lon,
    timezone: CONFIG.timezone,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    wind_speed_unit: 'mph', temperature_unit: 'celsius', precipitation_unit: 'mm',
    forecast_days: 5, models: 'ukmo_seamless',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function initWeather(coords, onSun) {
  const body = $('#weather-body');
  if (!coords) { body.innerHTML = '<div class="loading">no location</div>'; return; }

  async function load() {
    const { value, stale } = await withCache('weather', () => fetchJSON(url(coords)));
    if (!value) { reportStatus('down'); body.innerHTML = '<div class="loading">weather offline</div>'; return; }
    reportStatus(stale ? 'stale' : 'ok');
    render(value, stale);
    if (onSun && value.daily && value.daily.sunrise) {
      onSun({ sunrise: new Date(value.daily.sunrise[0]), sunset: new Date(value.daily.sunset[0]) });
    }
  }

  function render(w, stale) {
    body.innerHTML = '';
    const c = w.current;
    const [ic, txt] = codeInfo(c.weather_code);

    // update the top strip too
    $('#now-temp').textContent = `${Math.round(c.temperature_2m)}°`;
    $('#now-place').textContent = coords.label || CONFIG.placeLabel;
    $('#now-cond').textContent = `${ic} ${txt}`;

    const now = el('div', { class: 'wx-now' },
      el('span', { class: 'big', text: `${Math.round(c.temperature_2m)}°` }),
      el('span', { class: 'meta', html:
        `feels ${Math.round(c.apparent_temperature)}°<br>` +
        `wind ${Math.round(c.wind_speed_10m)}mph &middot; hum ${Math.round(c.relative_humidity_2m)}%` }),
    );
    body.append(now);

    const d = w.daily;
    const maxes = d.temperature_2m_max, mins = d.temperature_2m_min;
    const lo = Math.min(...mins), hi = Math.max(...maxes), span = Math.max(1, hi - lo);
    const days = el('div', { class: 'wx-days' });
    for (let i = 0; i < Math.min(4, d.time.length); i++) {
      const dt = new Date(d.time[i] + 'T12:00:00');
      const [dic] = codeInfo(d.weather_code[i]);
      const left = ((mins[i] - lo) / span) * 100;
      const width = ((maxes[i] - mins[i]) / span) * 100;
      days.append(el('div', { class: 'wx-day' },
        el('span', { class: 'd', text: i === 0 ? 'TDY' : DAYNAMES[dt.getDay()] }),
        el('span', { class: 'ic', text: dic }),
        el('span', { class: 'bar' }, el('i', { style: `left:${left}%;width:${width}%` })),
        el('span', { class: 't', text: `${Math.round(mins[i])}°/${Math.round(maxes[i])}°` }),
      ));
    }
    body.append(days);
    if (stale) body.firstChild.classList.add('stale-dot');
  }

  every(CONFIG.refresh.weather, load);
}

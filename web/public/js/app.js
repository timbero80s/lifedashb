import { CONFIG } from './config.js';
import { $, every, minutesSinceMidnight, tzParts } from './util.js';
import { getCoords } from './location.js';
import { initClock } from './widgets/clock.js';
import { initWeather } from './widgets/weather.js';
import { initCalendar } from './widgets/calendar.js';
import { initFootball } from './widgets/football.js';
import { initTrains } from './widgets/trains.js';
import { initISS } from './widgets/iss.js';
import { initAstro } from './widgets/astro.js';
import { initNews } from './widgets/news.js';

// ---- theme (positive / negative / auto) ---------------------------------
function applyLcdMode(sun) {
  let mode = CONFIG.lcdMode;
  if (mode === 'auto' && sun && sun.sunrise && sun.sunset) {
    const now = Date.now();
    const night = now < sun.sunrise.getTime() || now > sun.sunset.getTime();
    mode = night ? 'negative' : 'positive';
  }
  document.documentElement.dataset.lcd = mode === 'negative' ? 'negative' : 'positive';
}

// ---- night dim ---------------------------------------------------------
function applyNightDim() {
  if (!CONFIG.nightDim) return;
  const { hour, minute } = tzParts(new Date(), CONFIG.timezone);
  const cur = hour * 60 + minute;
  const from = minutesSinceMidnight(CONFIG.nightDimFrom);
  const to = minutesSinceMidnight(CONFIG.nightDimTo);
  const dim = from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
  document.documentElement.style.setProperty('--dim', CONFIG.nightDimOpacity);
  $('#lcd').classList.toggle('dim', dim);
}

// ---- global data status light ---------------------------------------
const status = { ok: 0, stale: 0, down: 0 };
export function reportStatus(kind) {
  status[kind] = (status[kind] || 0) + 1;
  const dot = $('#net-status');
  dot.classList.remove('ok', 'stale', 'down');
  if (status.down > 0 && status.ok === 0) dot.classList.add('down');
  else if (status.stale > 0) dot.classList.add('stale');
  else dot.classList.add('ok');
}

async function main() {
  applyLcdMode();
  applyNightDim();
  every(5, applyNightDim);

  initClock();

  // location first (weather / astro / iss depend on it)
  let coords = null;
  try { coords = await getCoords(); } catch (e) { console.warn('geo failed', e); }

  const astro = initAstro(coords);
  initWeather(coords, (sun) => { applyLcdMode(sun); });
  initCalendar();
  initFootball();
  initTrains();
  initISS(coords);
  initNews();

  // re-apply auto theme every 10 min using astro's sun times
  every(10, () => applyLcdMode(astro.getSun && astro.getSun()));
}

main();

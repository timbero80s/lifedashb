import { CONFIG } from './config.js';
import { $, every, minutesSinceMidnight, tzParts, fmtTime, fetchJSON } from './util.js';
import { getCoords } from './location.js';
import { initClock } from './widgets/clock.js';
import { initWeather } from './widgets/weather.js';
import { initCalendar } from './widgets/calendar.js';
import { initFootball } from './widgets/football.js';
import { initTrains } from './widgets/trains.js';
import { initISS } from './widgets/iss.js';
import { initAstro } from './widgets/astro.js';
import { initF1 } from './widgets/f1.js';
import { initMusic } from './widgets/music.js';
import { initHousehold } from './widgets/household.js';
import { initQuote } from './widgets/quote.js';

// ── fit the fixed 2000x1200 canvas to whatever the device reports ────────
// The Fire's browser may report 2000 CSS px or 1000 at DPR 2. Scaling the
// root explicitly makes the design deterministic either way, and `zoom`
// relays out (crisp text) rather than rasterising like transform: scale.
function fit() {
  const s = Math.min(window.innerWidth / 2000, window.innerHeight / 1200);
  const app = $('#app');
  if ('zoom' in app.style) app.style.zoom = s;
  else { app.style.transform = `scale(${s})`; app.style.transformOrigin = '0 0'; }
}

// ── overnight: luminance ramp, then a minimal night face ────────────────
let nightHooks = { nextEvent: () => null };

function nowMinutes() {
  const { hour, minute } = tzParts(new Date(), CONFIG.timezone);
  return hour * 60 + minute;
}
const inWindow = (cur, from, to) => (from < to ? cur >= from && cur < to : cur >= from || cur < to);

function applyNight() {
  const cur = nowMinutes();
  const from = minutesSinceMidnight(CONFIG.night.faceFrom);
  const to = minutesSinceMidnight(CONFIG.night.faceTo);
  const nightFace = inWindow(cur, from, to);

  $('#nightface').hidden = !nightFace;
  $('#app').hidden = nightFace;

  if (nightFace) {
    $('#nf-clock').textContent = fmtTime(new Date(), CONFIG.timezone);
    const next = nightHooks.nextEvent();
    $('#nf-next').textContent = next
      ? `${fmtTime(new Date(next.start), CONFIG.timezone)}  ${next.summary}`
      : '';
    // nudge the layout a few px every 10 min so an IPS panel showing the same
    // two lines for 7 hours doesn't retain the image
    const drift = Math.floor(Date.now() / 600000) % 6;
    $('#nightface').style.transform = `translate(${drift - 3}px, ${(drift % 3) - 1}px)`;
    return;
  }

  // daytime luminance ramp — a mostly-white 11" panel at 21:00 is a lamp
  const { gainDay, gainDusk, gainLate } = CONFIG.night;
  let gain = gainDay;
  if (cur >= minutesSinceMidnight('21:30')) gain = gainLate;
  else if (cur >= minutesSinceMidnight('19:00')) gain = gainDusk;
  else if (cur < minutesSinceMidnight('07:00')) gain = gainDusk;
  document.documentElement.style.setProperty('--gain', gain.toFixed(2));
}

// The wall runs for weeks without anyone touching it, so it has to notice
// when it is serving old code. Poll the deployed version; reload if it moved.
function watchForUpdates() {
  let booted = null;
  every(15, async () => {
    try {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=version`, {}, 8000);
      if (!r || !r.version) return;
      if (booted === null) { booted = r.version; return; }
      if (r.version !== booted) location.reload();
    } catch { /* offline is not a reason to reload */ }
  });
}

async function main() {
  fit();
  window.addEventListener('resize', fit);

  initClock();
  applyNight();
  every(0.5, applyNight);

  let coords = null;
  try { coords = await getCoords(); } catch (e) { console.warn('geo failed', e); }

  initWeather(coords);
  const cal = initCalendar();
  nightHooks.nextEvent = cal.nextEvent;
  initAstro(coords);
  initTrains();
  initFootball();
  initF1();
  initISS(coords);
  initMusic();
  initHousehold();
  initQuote();
  watchForUpdates();
}

main();

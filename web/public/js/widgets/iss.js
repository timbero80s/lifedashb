import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, countdown, fmtDay, fmtTime, linkCard } from '../util.js';
import { reportStatus, setAlert, clearAlert } from '../bus.js';

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const az = (d) => DIRS[Math.round((d % 360) / 22.5) % 16];

// A side-on view of the sky: the dashed dome is straight overhead (90°), the
// solid line is the arc the station actually traces. Tells you where to look
// and how high, which a row of numbers does not.
function skyArc(pass) {
  const H = 112, L = 12, R = 238;          // horizon line
  const frac = Math.min(1, Math.max(0, (pass.maxEl || 0) / 90));
  const apex = H - frac * 97;
  const ctrl = 2 * (apex - 56);            // quadratic control point for that apex
  return `<svg class="iss-sky" viewBox="0 0 250 132">
    <path class="dome" d="M${L} ${H} Q125 -82 ${R} ${H}"/>
    <line class="horizon" x1="${L - 6}" y1="${H}" x2="${R + 6}" y2="${H}"/>
    <path class="path" d="M${L} ${H} Q125 ${ctrl.toFixed(1)} ${R} ${H}"/>
    <circle class="apex" cx="125" cy="${apex.toFixed(1)}" r="6"/>
    <text class="peak" x="125" y="${(apex - 13).toFixed(1)}" text-anchor="middle">${Math.round(pass.maxEl)}°</text>
    <text x="${L}" y="${H + 20}" text-anchor="start">${az(pass.startAz)}</text>
    <text x="${R}" y="${H + 20}" text-anchor="end">${az(pass.endAz)}</text>
  </svg>`;
}

export function initISS(coords) {
  const body = $('#iss-body');
  const card = $('#c-iss');
  const lat = coords ? coords.lat : 51.52;
  const lon = coords ? coords.lon : -0.72;
  let passes = [];

  linkCard('#c-iss', `https://www.heavens-above.com/PassSummary.aspx?satid=25544`
    + `&lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}&loc=${encodeURIComponent(CONFIG.placeLabel)}&alt=0&tz=GMT`);

  async function load() {
    const { value, stale } = await withCache('iss', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=iss&lat=${lat}&lon=${lon}&days=${CONFIG.iss.days}`);
      if (!r || !Array.isArray(r.passes)) throw new Error('bad iss payload');
      return r;
    });
    if (!value) { reportStatus('iss', 'down'); return; }
    reportStatus('iss', stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', stale);
    passes = (value.passes || [])
      .filter((p) => (p.maxEl || 0) >= CONFIG.iss.minElevationDeg && new Date(p.end || p.start) > new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    render();
  }

  function render() {
    body.innerHTML = '';
    const p = passes[0];

    if (!p) {
      card.classList.remove('is-alert');
      clearAlert('iss');
      body.append(el('div', { class: 'empty', text: 'No visible pass' }));
      return;
    }

    const start = new Date(p.start);
    const mins = Math.round((start - Date.now()) / 60000);
    const alerting = mins > 0 && mins <= CONFIG.iss.alertWithinMinutes;
    card.classList.toggle('is-alert', alerting);

    if (alerting) {
      body.append(el('div', { class: 'iss-lookup', text: `${mins} min` }));
      body.append(el('div', { class: 'iss-sub', text: 'Look up' }));
      setAlert('iss', { text: `ISS ${mins} min`, sub: `${Math.round(p.maxEl)}° · ${az(p.startAz)}`, level: 'info', priority: 50 });
    } else {
      clearAlert('iss');
      body.append(el('div', { class: 'iss-when', text: `${fmtDay(start, CONFIG.timezone)} ${fmtTime(start, CONFIG.timezone)}` }));
      body.append(el('div', { class: 'iss-sub', text: countdown(start) }));
    }

    body.append(el('div', { html: skyArc(p) }));
    body.append(el('div', { class: 'iss-row' },
      el('span', { class: 'k', text: 'Visible' }),
      el('span', { text: `${Math.round((p.duration || 0) / 60)} min` })));
    if (passes[1]) {
      const n = new Date(passes[1].start);
      body.append(el('div', { class: 'iss-row' },
        el('span', { class: 'k', text: 'Then' }),
        el('span', { text: `${fmtDay(n, CONFIG.timezone)} ${fmtTime(n, CONFIG.timezone)}` })));
    }
  }

  every(CONFIG.refresh.iss, load);
  every(1, () => { if (passes.length) render(); });
}

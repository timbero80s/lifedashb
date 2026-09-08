import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, countdown, fmtDay, fmtTime } from '../util.js';
import { reportStatus, setAlert, clearAlert } from '../bus.js';

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const az = (d) => DIRS[Math.round((d % 360) / 22.5) % 16];

export function initISS(coords) {
  const body = $('#iss-body');
  const card = $('#c-iss');
  const lat = coords ? coords.lat : 51.52;
  const lon = coords ? coords.lon : -0.72;
  let passes = [];

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
      body.append(el('div', { class: 'iss-when', text: 'Look up' }));
      body.append(el('div', { class: 'iss-row' },
        el('span', { class: 'k', text: 'Max' }), el('span', { text: `${Math.round(p.maxEl)}°` })));
      body.append(el('div', { class: 'iss-row' },
        el('span', { class: 'k', text: 'Track' }), el('span', { text: `${az(p.startAz)} → ${az(p.endAz)}` })));
      setAlert('iss', { text: `ISS ${mins} min`, sub: `${Math.round(p.maxEl)}° · ${az(p.startAz)}`, level: 'info', priority: 50 });
      return;
    }

    clearAlert('iss');
    body.append(el('div', { class: 'iss-when', text: `${fmtDay(start, CONFIG.timezone)} ${fmtTime(start, CONFIG.timezone)}` }));
    body.append(el('div', { class: 'iss-row' },
      el('span', { class: 'k', text: 'Max' }), el('span', { text: `${Math.round(p.maxEl)}°` })));
    body.append(el('div', { class: 'iss-row' },
      el('span', { class: 'k', text: 'Track' }), el('span', { text: `${az(p.startAz)} → ${az(p.endAz)}` })));
    body.append(el('div', { class: 'iss-row' },
      el('span', { class: 'k', text: 'Visible' }), el('span', { text: `${Math.round((p.duration || 0) / 60)} min` })));
    body.append(el('div', { class: 'iss-count', text: countdown(start) }));
  }

  every(CONFIG.refresh.iss, load);
  every(1, () => { if (passes.length) render(); });
}

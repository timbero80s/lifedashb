import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, fmtTime } from '../util.js';
import { reportStatus } from '../app.js';

const AZ = (deg) => {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((deg % 360) / 22.5) % 16];
};

function demo(lat) {
  const now = Date.now();
  return {
    passes: [
      { start: new Date(now + 3.5 * 3600000).toISOString(), max: new Date(now + 3.5 * 3600000 + 180000).toISOString(),
        end: new Date(now + 3.5 * 3600000 + 360000).toISOString(), maxEl: 61, startAz: 250, endAz: 110, duration: 360 },
      { start: new Date(now + 27 * 3600000).toISOString(), max: new Date(now + 27 * 3600000 + 150000).toISOString(),
        end: new Date(now + 27 * 3600000 + 300000).toISOString(), maxEl: 24, startAz: 300, endAz: 140, duration: 300 },
    ],
    demo: true,
  };
}

export function initISS(coords) {
  const body = $('#iss-body');
  const lat = coords ? coords.lat : 51.52;
  const lon = coords ? coords.lon : -0.72;
  let passes = [];

  async function load() {
    const { value, stale } = await withCache('iss', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=iss&lat=${lat}&lon=${lon}&days=${CONFIG.iss.days}`);
      if (!r || !Array.isArray(r.passes)) throw new Error('bad iss payload');
      return r;
    });
    let data = value, isDemo = false;
    if (!data) { data = demo(lat); isDemo = true; }
    reportStatus(isDemo || stale ? 'stale' : 'ok');
    passes = (data.passes || [])
      .filter((p) => (p.maxEl || 0) >= CONFIG.iss.minElevationDeg && new Date(p.end || p.start) > new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    render(isDemo || stale);
  }

  function render(stale) {
    body.innerHTML = '';
    const wrap = el('div', { class: 'iss-wrap' });

    if (!passes.length) {
      wrap.append(el('div', { class: 'iss-meta', text: 'No good visible passes in the next few days. It happens — the ISS orbit drifts in and out of visibility.' }));
      body.append(wrap);
      return;
    }

    const p = passes[0];
    const start = new Date(p.start);
    const minsAway = Math.round((start - Date.now()) / 60000);

    if (minsAway <= CONFIG.iss.alertWithinMinutes && minsAway > 0) {
      wrap.append(el('div', { class: 'iss-alert', text: `LOOK UP — ${minsAway} MIN` }));
    }

    const dayLabel = start.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: CONFIG.timezone }).toUpperCase();
    wrap.append(el('div', { class: 'iss-bigline' },
      el('span', { class: 'iss-day', text: dayLabel + ' ' }),
      el('span', { class: 'iss-big', text: fmtTime(start, CONFIG.timezone) }),
    ));
    wrap.append(el('div', { class: 'iss-meta', html:
      `max ${Math.round(p.maxEl)}° up &middot; ${Math.round((p.duration || 0) / 60)} min<br>` +
      `rises ${AZ(p.startAz)} → sets ${AZ(p.endAz)}` +
      (minsAway > CONFIG.iss.alertWithinMinutes ? `<br>in ${minsAway >= 60 ? Math.floor(minsAway / 60) + 'h ' + (minsAway % 60) + 'm' : minsAway + 'm'}` : '') }));

    // simple track: dot arcs left→right, height ~ elevation
    const track = el('div', { class: 'iss-track' }, el('div', { class: 'sky' }));
    const dot = el('div', { class: 'iss-dot' });
    const elevPct = Math.min(90, (p.maxEl || 30));
    dot.style.left = '8%';
    dot.style.top = `${100 - elevPct}%`;
    track.append(dot);
    wrap.append(track);

    if (passes[1]) {
      const n = new Date(passes[1].start);
      wrap.append(el('div', { class: 'iss-list', text:
        `then ${n.toLocaleDateString('en-GB', { weekday: 'short', timeZone: CONFIG.timezone })} ${fmtTime(n, CONFIG.timezone)} (${Math.round(passes[1].maxEl)}°)` }));
    }
    body.append(wrap);
    if (stale) wrap.classList.add('stale-dot');
  }

  every(CONFIG.refresh.iss, load);
  every(1, () => { if (passes.length) render(false); }); // refresh countdown / alert
}

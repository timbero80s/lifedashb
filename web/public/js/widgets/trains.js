import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../app.js';

function demo() {
  const now = Date.now();
  const mk = (min, place, plat, delay) => ({
    scheduled: new Date(now + min * 60000).toISOString(),
    expected: new Date(now + (min + delay) * 60000).toISOString(),
    place, platform: plat, status: delay ? `EXP ${delay}L` : 'ON TIME',
  });
  return {
    toLondon: [mk(6, 'London Paddington', '4', 0), mk(21, 'London Paddington', '4', 2), mk(36, 'London Paddington', '4', 0), mk(51, 'London Paddington', '4', 0)],
    fromLondon: [mk(9, 'ex Paddington', '5', 0), mk(24, 'ex Paddington', '5', 0), mk(39, 'ex Paddington', '5', 4), mk(54, 'ex Paddington', '5', 0)],
    demo: true,
  };
}

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timezone });
}

export function initTrains() {
  const body = $('#trains-body');

  async function load() {
    const { value, stale } = await withCache('trains', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=trains`);
      if (!r || !Array.isArray(r.toLondon)) throw new Error('bad trains payload');
      return r;
    });
    let data = value, isDemo = false;
    if (!data) { data = demo(); isDemo = true; }
    reportStatus(isDemo || stale ? 'stale' : 'ok');
    render(data, stale && !isDemo);
  }

  function colEl(title, glyph, rows, reverse) {
    const col = el('div', { class: 'tr-col' });
    col.append(el('h5', {}, el('span', { text: glyph }), document.createTextNode(' ' + title)));
    (rows || []).slice(0, CONFIG.trains.rows).forEach((r) => {
      const late = r.expected && r.scheduled && (new Date(r.expected) - new Date(r.scheduled) > 60000);
      col.append(el('div', { class: 'tr-row' },
        el('span', { class: 't', text: hhmm(r.scheduled) }),
        el('span', { class: 'dest', text: r.place || '' }),
        el('span', { class: 'st ' + (late ? 'late' : 'ontime'), text: r.status || (late ? 'LATE' : 'ON TIME') }),
      ));
    });
    if (!rows || !rows.length) col.append(el('div', { class: 'cal-empty', text: 'no services' }));
    const anim = el('div', { class: 'tr-anim' + (reverse ? ' rev' : '') }, el('span', { class: 'glyph', text: '🚆' }));
    col.append(anim);
    return col;
  }

  function render(data, stale) {
    body.innerHTML = '';
    const cols = el('div', { class: 'tr-cols' },
      colEl('TO LONDON', '→', data.toLondon, false),
      colEl('FROM LONDON', '←', data.fromLondon, true),
    );
    body.append(cols);
    if (stale) body.firstChild.classList.add('stale-dot');
  }

  every(CONFIG.refresh.trains, load);
}

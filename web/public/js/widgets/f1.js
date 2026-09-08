import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, countdown, fmtDay, fmtTime } from '../util.js';
import { reportStatus, setAlert, clearAlert } from '../bus.js';

export function initF1() {
  const body = $('#f1-body');
  const card = $('#c-f1');
  let data = null;

  async function load() {
    const { value, stale } = await withCache('f1', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=f1`);
      if (!r || !r.race) throw new Error('bad f1 payload');
      return r;
    });
    if (!value) { reportStatus('f1', 'down'); body.innerHTML = '<div class="empty">No F1 data</div>'; return; }
    reportStatus('f1', stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', stale);
    data = value;
    render();
  }

  function render() {
    if (!data) return;
    const { race, driver } = data;
    body.innerHTML = '';

    const start = new Date(race.start);
    const q = race.qualifying ? new Date(race.qualifying) : null;
    const mins = (start - Date.now()) / 60000;

    body.append(el('div', { class: 'f1-race' },
      el('div', { class: 'nm trunc', text: race.name.replace(/ Grand Prix$/, ' GP') }),
      el('div', { class: 'loc trunc', text:
        `${fmtDay(start, CONFIG.timezone)} ${fmtTime(start, CONFIG.timezone)}`
        + (q ? ` · Q ${fmtDay(q, CONFIG.timezone)} ${fmtTime(q, CONFIG.timezone)}` : '')
        + (race.locality ? ` · ${race.locality}` : '') }),
    ));

    const foot = el('div', { class: 'f1-foot' },
      el('div', { class: 'f1-count' + (mins > 0 && mins < 180 ? ' soon' : ''),
        text: mins > 0 ? countdown(start) : 'Racing' }));
    if (driver) {
      foot.append(el('div', { class: 'f1-driver' },
        el('span', { class: 'p', text: 'P' + driver.position }),
        el('div', {},
          el('div', { class: 'pts', text: `${driver.points} pts` }),
          el('div', { class: 'who trunc', text: driver.team || CONFIG.f1.driverLabel }),
        ),
      ));
    }
    body.append(foot);

    // lights out within 30 minutes is time-bound and actionable — you can sit down
    if (mins > 0 && mins <= 30) {
      setAlert('f1', { text: `${race.name.replace(/ Grand Prix$/, ' GP')} ${countdown(start)}`, sub: 'lights out', level: 'info', priority: 30 });
    } else clearAlert('f1');
  }

  every(CONFIG.refresh.f1, load);
  every(1, render);   // keeps the countdown honest
}

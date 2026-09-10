import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, countdown, fmtDay, fmtTime, linkCard } from '../util.js';
import { reportStatus, setAlert, clearAlert } from '../bus.js';

// A racing helmet in the driver's colours — the card is about one person, so
// it should look like it, and a silhouette reads faster than a word at 2 m.
function helmet({ shell, stripe, visor }) {
  return `<svg class="f1-helmet" viewBox="0 0 64 48" aria-hidden="true">
    <path fill="${shell}"  d="M7 31C7 15 18 5 33 5c14 0 24 9 24 22v6c0 5-4 8-9 8H17c-6 0-10-4-10-10z"/>
    <path fill="${stripe}" d="M33 5c5 0 9 1 13 3l-5 9c-2-1-5-2-8-2z"/>
    <path fill="${visor}"  d="M27 16c9-2 20-1 28 3v10c-8 3-19 3-28 1-4-3-4-11 0-14z"/>
    <path fill="rgba(255,255,255,.20)" d="M30 18c7-1 16-1 23 2l-23 1z"/>
  </svg>`;
}

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
    const start = new Date(race.start);
    const q = race.qualifying ? new Date(race.qualifying) : null;
    const mins = (start - Date.now()) / 60000;

    body.innerHTML = '';
    body.append(el('div', { class: 'f1-race' },
      el('div', { class: 'nm trunc', text: race.name.replace(/ Grand Prix$/, ' GP') }),
      el('div', { class: 'loc trunc', text:
        `${fmtDay(start, CONFIG.timezone)} ${fmtTime(start, CONFIG.timezone)}`
        + (q ? ` · Q ${fmtDay(q, CONFIG.timezone)} ${fmtTime(q, CONFIG.timezone)}` : '')
        + (race.locality ? ` · ${race.locality}` : '') }),
    ));
    body.append(el('div', { class: 'f1-count' + (mins > 0 && mins < 180 ? ' soon' : ''),
      text: mins > 0 ? countdown(start) : 'Racing' }));

    const foot = el('div', { class: 'f1-foot' }, el('span', { html: helmet(CONFIG.f1.helmet) }));
    if (driver) {
      foot.append(el('div', { class: 'f1-driver grow' },
        el('div', { class: 'f1-driver__top' },
          el('span', { class: 'p', text: 'P' + driver.position }),
          el('span', { class: 'who', text: CONFIG.f1.driverLabel })),
        el('div', { class: 'pts', text: `${driver.points} pts · ${driver.team || ''}`.replace(/ · $/, '') }),
      ));
    } else {
      foot.append(el('div', { class: 'f1-driver grow' },
        el('div', { class: 'pts', text: `${CONFIG.f1.driverLabel} — no standing yet` })));
    }
    body.append(foot);

    linkCard('#c-f1', CONFIG.f1.link);

    // lights out within 30 minutes is time-bound and actionable — you can sit down
    if (mins > 0 && mins <= 30) {
      setAlert('f1', { text: `${race.name.replace(/ Grand Prix$/, ' GP')} ${countdown(start)}`, sub: 'lights out', level: 'info', priority: 30 });
    } else clearAlert('f1');
  }

  every(CONFIG.refresh.f1, load);
  every(1, render);
}

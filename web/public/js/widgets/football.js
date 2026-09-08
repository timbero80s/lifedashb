import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../app.js';

const ord = (n) => {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function demo() {
  return CONFIG.clubs.map((c) => ({
    key: c.key, name: c.name, position: null, played: null, points: null,
    form: '', lastMatch: null, nextMatch: null, note: 'demo — deploy backend for live data',
  }));
}

export function initFootball() {
  const body = $('#football-body');

  async function load() {
    const { value, stale } = await withCache('football', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=football`);
      if (!r || !Array.isArray(r.clubs)) throw new Error('bad football payload');
      return r.clubs;
    });
    let clubs = value, isDemo = false;
    if (!clubs) { clubs = demo(); isDemo = true; }
    reportStatus(isDemo || stale ? 'stale' : 'ok');
    render(clubs, stale && !isDemo);
  }

  function render(clubs, stale) {
    body.innerHTML = '';
    for (const c of clubs) {
      const wrap = el('div', { class: 'fb-club' });
      const head = el('div', { class: 'fb-head' },
        el('span', { class: 'nm', text: c.name }),
        c.position
          ? el('span', { class: 'pos', html: `${ord(c.position)} <small>P${c.played ?? '-'} · ${c.points ?? '-'}pt</small>` })
          : el('span', { class: 'fb-na', text: 'table n/a' }),
      );
      wrap.append(head);

      if (c.form) {
        wrap.append(el('div', { class: 'fb-line' },
          ...[...c.form].map((r) => el('span', { class: `res-${r}`, text: r + ' ' }))));
      }
      if (c.lastMatch) {
        wrap.append(el('div', { class: 'fb-line', text:
          `last: ${c.lastMatch.opponent} ${c.lastMatch.score || ''} ${c.lastMatch.homeAway || ''}`.trim() }));
      }
      if (c.nextMatch) {
        const d = new Date(c.nextMatch.utcDate);
        const when = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: CONFIG.timezone }) +
          ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timezone });
        wrap.append(el('div', { class: 'fb-next' },
          el('span', { class: 'vs', text: `next: ${c.nextMatch.homeAway || ''} ` }),
          document.createTextNode(`${c.nextMatch.opponent} · ${when}`)));
      } else if (!c.note) {
        wrap.append(el('div', { class: 'fb-na', text: 'no upcoming fixture found' }));
      }
      if (c.note) wrap.append(el('div', { class: 'fb-na', text: c.note }));
      body.append(wrap);
    }
    if (stale) body.firstChild.classList.add('stale-dot');
  }

  every(CONFIG.refresh.football, load);
}

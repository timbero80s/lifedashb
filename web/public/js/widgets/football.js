import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, cache } from '../util.js';
import { reportStatus } from '../app.js';

// The free football sources are rate-limited and flaky, so a fresh fetch often
// comes back thinner than a previous one. Keep the best info we've seen per club.
function mergeClub(fresh, prev) {
  if (!prev) return fresh;
  const out = { ...fresh };
  if (!out.position && prev.position) {
    out.position = prev.position; out.played = prev.played; out.points = prev.points;
  }
  if (!out.form && prev.form) out.form = prev.form;
  if (!out.nextMatch && prev.nextMatch && new Date(prev.nextMatch.utcDate) > Date.now()) {
    out.nextMatch = prev.nextMatch;
  }
  if (!out.lastMatch && prev.lastMatch) out.lastMatch = prev.lastMatch;
  if (out.position || out.nextMatch || out.lastMatch) out.note = null;
  return out;
}

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
    const prev = (cache.get('football') || {}).value || null;
    const { value, stale } = await withCache('football', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=football`, {}, 20000);
      if (!r || !Array.isArray(r.clubs)) throw new Error('bad football payload');
      // merge each club against what we had before, then persist the richer set
      const merged = r.clubs.map((c) => mergeClub(c, prev && prev.find((p) => p.key === c.key)));
      return merged;
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

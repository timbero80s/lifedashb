import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, cache, fmtDay, fmtTime } from '../util.js';
import { reportStatus } from '../bus.js';

const ord = (n) => {
  if (!n) return null;
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Free football sources are rate-limited and flaky, so a fresh fetch often
// comes back thinner than the last. Keep the best we have seen per club.
function mergeClub(fresh, prev) {
  if (!prev) return fresh;
  const out = { ...fresh };
  if (!out.position && prev.position) {
    out.position = prev.position; out.played = prev.played; out.points = prev.points;
  }
  if (!out.form && prev.form) out.form = prev.form;
  if (!out.lastMatch && prev.lastMatch) out.lastMatch = prev.lastMatch;
  if (!out.nextMatch && prev.nextMatch && new Date(prev.nextMatch.utcDate) > Date.now()) {
    out.nextMatch = prev.nextMatch;
  }
  if (out.position || out.nextMatch || out.lastMatch) out.note = null;
  return out;
}

function resultClass(score, homeAway) {
  if (!score || !/^\d+-\d+$/.test(score)) return '';
  const [h, a] = score.split('-').map(Number);
  const mine = homeAway === '(H)' ? h : a, theirs = homeAway === '(H)' ? a : h;
  return mine > theirs ? 'w' : mine < theirs ? 'l' : '';
}

export function initFootball() {
  const body = $('#football-body');
  const card = $('#c-fb');

  async function load() {
    const prev = (cache.get('football') || {}).value || null;
    const { value, stale } = await withCache('football', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=football`, {}, 20000);
      if (!r || !Array.isArray(r.clubs)) throw new Error('bad football payload');
      return r.clubs.map((c) => mergeClub(c, prev && prev.find((p) => p.key === c.key)));
    });
    if (!value) { reportStatus('football', 'down'); return; }
    reportStatus('football', stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', stale);
    render(value);
  }

  function render(clubs) {
    body.innerHTML = '';
    for (const c of clubs) {
      const cfg = CONFIG.clubs.find((x) => x.key === c.key) || {};
      const wrap = el('div', { class: 'fb-club' },
        el('span', { class: 'bar', style: `background:${cfg.colour || 'var(--text-3)'}` }));

      const top = el('div', { class: 'fb-top' },
        el('span', { class: 'nm', text: cfg.name || c.name }));
      if (c.position) {
        top.append(el('span', { class: 'pos', text: ord(c.position) }));
        top.append(el('span', { class: 'pts', text: `${c.points ?? '–'} pts` }));
      } else {
        top.append(el('span', { class: 'pts', style: 'margin-left:auto', text: 'table n/a' }));
      }
      wrap.append(top);

      const bits = [];
      if (c.lastMatch) {
        const cls = resultClass(c.lastMatch.score, c.lastMatch.homeAway);
        bits.push(el('span', { class: cls },
          `${c.lastMatch.score || ''} v ${c.lastMatch.opponent} ${c.lastMatch.homeAway || ''}`.trim()));
      }
      if (c.nextMatch) {
        const d = new Date(c.nextMatch.utcDate);
        bits.push(el('span', { class: 'faint', text: ' · ' }));
        bits.push(el('span', { text:
          `${fmtDay(d, CONFIG.timezone)} ${fmtTime(d, CONFIG.timezone)} ${c.nextMatch.opponent} ${c.nextMatch.homeAway || ''}`.trim() }));
      }
      wrap.append(el('div', { class: 'fb-sub trunc' }, bits.length ? bits : [el('span', { text: 'No fixture data' })]));
      body.append(wrap);
    }
  }

  every(CONFIG.refresh.football, load);
}

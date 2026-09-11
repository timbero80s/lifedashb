import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, fmtDay, fmtTime } from '../util.js';
import { reportStatus } from '../bus.js';

const ord = (n) => {
  if (!n) return null;
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

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
    // No merging here: the Worker already merges against KV and knows which
    // source each field came from. Doing it a second time in the browser was
    // resurrecting results that were weeks out of date.
    const { value, stale } = await withCache('football', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=football`, {}, 20000);
      if (!r || !Array.isArray(r.clubs)) throw new Error('bad football payload');
      return r.clubs;
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
        // only separate if there is actually a result in front of it
        if (bits.length) bits.push(el('span', { class: 'faint', text: ' · ' }));
        bits.push(el('span', { text:
          `${fmtDay(d, CONFIG.timezone)} ${fmtTime(d, CONFIG.timezone)} ${c.nextMatch.opponent} ${c.nextMatch.homeAway || ''}`.trim() }));
      }
      wrap.append(el('div', { class: 'fb-sub trunc' }, bits.length ? bits : [el('span', { text: 'No fixture data' })]));
      body.append(wrap);
    }
  }

  every(CONFIG.refresh.football, load);
}

import { CONFIG } from '../config.js';
import { $, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../app.js';
import { TIPS } from '../tips.js';

const QUERIES = [
  { tag: 'HW', q: 'hardware' },
  { tag: 'HW', q: 'chip OR silicon OR robot' },
  { tag: 'AI', q: 'AI coding OR agent OR LLM' },
  { tag: 'AI', q: 'Claude OR Anthropic' },
];

async function fetchStories() {
  const cut = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 4; // last 4 days
  const all = [];
  for (const { tag, q } of QUERIES) {
    const u = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}` +
      `&tags=story&numericFilters=points>${CONFIG.news.hnMinPoints},created_at_i>${cut}&hitsPerPage=15`;
    try {
      const r = await fetchJSON(u);
      for (const h of r.hits || []) {
        if (!h.title) continue;
        const lower = h.title.toLowerCase();
        if (CONFIG.news.blocklist.some((w) => lower.includes(w))) continue;
        all.push({ tag, title: h.title.trim(), points: h.points || 0, id: h.objectID });
      }
    } catch { /* skip this query */ }
  }
  // dedupe by id, keep the highest-scoring, sort by points
  const seen = new Map();
  for (const s of all) if (!seen.has(s.id) || seen.get(s.id).points < s.points) seen.set(s.id, s);
  return [...seen.values()].sort((a, b) => b.points - a.points).slice(0, 12);
}

export function initNews() {
  const tagEl = $('#news-tag');
  const itemEl = $('#news-item');
  let items = [];
  let idx = 0;

  function buildDeck(stories) {
    const deck = [];
    stories.forEach((s, i) => {
      deck.push({ tag: s.tag, text: s.title });
      if (i % 2 === 1) deck.push({ tag: 'TIP', text: TIPS[(i / 2 | 0) % TIPS.length] });
    });
    if (!deck.length) deck.push(...TIPS.map((t) => ({ tag: 'TIP', text: t })));
    return deck;
  }

  function rotate() {
    if (!items.length) return;
    const it = items[idx % items.length];
    idx++;
    itemEl.classList.add('swap');
    setTimeout(() => {
      tagEl.textContent = it.tag;
      itemEl.textContent = it.text;
      itemEl.classList.remove('swap');
    }, 400);
  }

  async function load() {
    const { value, stale } = await withCache('news', fetchStories);
    reportStatus(value && value.length ? (stale ? 'stale' : 'ok') : 'stale');
    items = buildDeck(value || []);
    idx = 0;
    rotate();
  }

  every(CONFIG.refresh.news, load);
  setInterval(rotate, Math.max(4, CONFIG.news.rotateSeconds) * 1000);
}

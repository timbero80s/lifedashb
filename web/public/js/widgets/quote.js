import { CONFIG } from '../config.js';
import { $, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../bus.js';

// A line worth reading, changing a few times a day. The backend serves a
// different set each day; this steps through it slowly. One 400ms crossfade
// is the only motion permitted on the board.
export function initQuote() {
  const card = $('#c-quote');
  const cover = $('#quote-cover');
  const qEl = $('#quote-q');
  const mEl = $('#quote-meta');
  let list = [], i = 0;

  async function load() {
    const { value, stale } = await withCache('quote', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=quote`);
      if (!r || !Array.isArray(r.quotes) || !r.quotes.length) throw new Error('bad quote payload');
      return r.quotes;
    });
    if (!value) { reportStatus('quote', 'down'); return; }
    reportStatus('quote', stale ? 'stale' : 'ok');
    list = value;
    // start somewhere sensible for the time of day rather than always at 0
    i = Math.floor(Date.now() / (CONFIG.quote.rotateMinutes * 60000)) % list.length;
    paint();
  }

  function paint() {
    const q = list[i % list.length];
    if (!q) return;
    qEl.textContent = `“${q.text}”`;
    mEl.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = q.book;
    mEl.append(document.createTextNode(q.author + ' · '), b,
      document.createTextNode(` · first published ${q.year < 0 ? Math.abs(q.year) + ' BC' : q.year}`));

    if (q.cover) {
      cover.src = q.cover;
      cover.hidden = false;
      cover.onerror = () => { cover.hidden = true; };
    } else {
      cover.hidden = true;
    }
  }

  function rotate() {
    if (list.length < 2) return;
    card.classList.add('swap');
    setTimeout(() => { i++; paint(); card.classList.remove('swap'); }, 400);
  }

  every(CONFIG.refresh.quote, load);
  every(CONFIG.quote.rotateMinutes, rotate);
}

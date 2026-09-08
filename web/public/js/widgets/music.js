import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../bus.js';

// Two halves in a short card: one notable album released on today's date in
// history, and one notable album out in the last few weeks.
export function initMusic() {
  const body = $('#music-body');
  const card = $('#c-mus');
  let data = null, tick = 0;

  async function load() {
    const { value, stale } = await withCache('music', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=music`, {}, 25000);
      if (!r || (!r.onThisDay && !r.newReleases)) throw new Error('bad music payload');
      return r;
    });
    if (!value) { reportStatus('music', 'down'); body.innerHTML = '<div class="empty">—</div>'; return; }
    reportStatus('music', stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', stale);
    data = value;
    render();
  }

  function row(tag, item) {
    return el('div', { class: 'mus-row' },
      el('span', { class: 'yr', text: tag }),
      el('span', { class: 'grow trunc' },
        el('span', { class: 'ti', text: item.title }),
        el('span', { class: 'ar', text: ' — ' + item.artist }),
      ));
  }

  // Both lists are longer than the two slots, so step through them slowly.
  // One swap every few minutes is not a ticker; it is a card that stays
  // interesting for a week.
  function render() {
    if (!data) return;
    body.innerHTML = '';
    const hist = data.onThisDay || [], neu = data.newReleases || [];
    if (hist.length) body.append(row(String(hist[tick % hist.length].year), hist[tick % hist.length]));
    if (neu.length) body.append(row('New', neu[tick % neu.length]));
    if (!hist.length && !neu.length) body.append(el('div', { class: 'empty', text: '—' }));
  }

  every(CONFIG.refresh.music, load);
  every(7, () => { tick++; render(); });
}

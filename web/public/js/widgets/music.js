import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every } from '../util.js';
import { reportStatus } from '../bus.js';

// Two halves: one notable album released on today's date in history, and one
// notable album out recently. Sleeve art comes from the Cover Art Archive,
// keyed by the MusicBrainz id the backend gets from Wikidata.
const spotify = (item) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${item.artist} ${item.title}`)}`;

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

  function art(item) {
    if (item.art) {
      const img = el('img', { class: 'mus-art', src: item.art, alt: '', loading: 'lazy' });
      // a missing sleeve must never show a broken-image glyph on a wall
      img.addEventListener('error', () => img.replaceWith(fallback(item)), { once: true });
      return img;
    }
    return fallback(item);
  }
  const fallback = (item) =>
    el('div', { class: 'mus-art mus-art--fallback', text: (item.artist || '?').trim()[0].toUpperCase() });

  function row(tag, item) {
    return el('a', { class: 'mus-row', href: spotify(item), target: '_blank', rel: 'noopener noreferrer' },
      art(item),
      el('div', { class: 'mus-meta grow' },
        el('div', { class: 'mus-tag', text: tag }),
        el('div', { class: 'mus-ti trunc', text: item.title }),
        el('div', { class: 'mus-ar trunc', text: item.artist }),
      ));
  }

  // Both lists are longer than the two slots, so step through them slowly.
  // One swap every few minutes is not a ticker.
  function render() {
    if (!data) return;
    body.innerHTML = '';
    const hist = data.onThisDay || [], neu = data.newReleases || [];
    if (hist.length) {
      const it = hist[tick % hist.length];
      body.append(row(`ON THIS DAY · ${it.year}`, it));
    }
    if (neu.length) body.append(row('NEW RELEASE', neu[tick % neu.length]));
    if (!hist.length && !neu.length) body.append(el('div', { class: 'empty', text: '—' }));
  }

  every(CONFIG.refresh.music, load);
  every(7, () => { tick++; render(); });
}

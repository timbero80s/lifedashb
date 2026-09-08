import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, fmtTime, tzParts, minutesSinceMidnight } from '../util.js';
import { reportStatus, setAlert, clearAlert } from '../bus.js';

const lateMins = (t) => Math.round((new Date(t.expected) - new Date(t.scheduled)) / 60000);
const isCancelled = (t) => /cancel/i.test(t.status || '');

function inCommuteWindow() {
  const { hour, minute } = tzParts(new Date(), CONFIG.timezone);
  const cur = hour * 60 + minute;
  return CONFIG.trains.commuteWindows
    .some(([a, b]) => cur >= minutesSinceMidnight(a) && cur < minutesSinceMidnight(b));
}

export function initTrains() {
  const body = $('#trains-body');
  const card = $('#c-tr');

  async function load() {
    const { value, stale } = await withCache('trains', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=trains`);
      if (!r || !Array.isArray(r.toLondon)) throw new Error('bad trains payload');
      return r;
    });
    if (!value) { reportStatus('trains', 'down'); body.innerHTML = '<div class="empty">No service data</div>'; return; }
    reportStatus('trains', stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', stale);
    render(value);
    escalate(value);
  }

  function section(title, arrow, rows, cls) {
    const sec = el('div', { class: 'tr-sec ' + cls });
    const bad = (rows || []).filter((r) => isCancelled(r) || lateMins(r) >= 3).length;
    sec.append(el('div', { class: 'tr-head' },
      el('span', { class: 'arrow', text: arrow }),
      el('span', { text: title }),
      el('span', { class: 'grow' }),
      el('span', { style: bad ? 'color:var(--warn)' : '', text: bad ? `${bad} delayed` : 'Good service' }),
    ));

    const list = (rows || []).slice(0, CONFIG.trains.rows);
    if (!list.length) { sec.append(el('div', { class: 'empty', text: '—' })); return sec; }

    for (const r of list) {
      const late = lateMins(r);
      const cancelled = isCancelled(r);
      const row = el('div', { class: 'tr-row' + (cancelled ? ' cancelled' : '') });
      if (!cancelled && late >= 3) {
        row.append(el('span', { class: 't struck', text: fmtTime(new Date(r.scheduled), CONFIG.timezone) }));
        row.append(el('span', { class: 'exp', text: fmtTime(new Date(r.expected), CONFIG.timezone) }));
      } else {
        row.append(el('span', { class: 't', text: fmtTime(new Date(r.scheduled), CONFIG.timezone) }));
      }
      row.append(el('span', { class: 'dest grow trunc', text: cancelled ? 'Cancelled' : (r.place || '') }));
      if (r.platform && r.platform !== '?') row.append(el('span', { class: 'plat', text: r.platform }));
      sec.append(row);
    }
    return sec;
  }

  function render(d) {
    body.innerHTML = '';
    body.append(section('Paddington', '→', d.toLondon, 'to'));
    body.append(section('from Paddington', '←', d.fromLondon, 'from'));
  }

  // Escalation needs BOTH time-boundedness and actionability: a delay only
  // matters if somebody in this house might be about to travel.
  function escalate(d) {
    if (!inCommuteWindow()) { clearAlert('trains'); return; }
    const soon = [...(d.toLondon || []), ...(d.fromLondon || [])]
      .filter((r) => new Date(r.scheduled) - Date.now() < 45 * 60000);
    const cancelled = soon.find(isCancelled);
    const late = soon.find((r) => lateMins(r) >= CONFIG.trains.escalateDelayMins);
    if (cancelled) {
      setAlert('trains', {
        text: `${fmtTime(new Date(cancelled.scheduled), CONFIG.timezone)} cancelled`,
        sub: cancelled.place || '', level: 'bad', priority: 60,
      });
    } else if (late) {
      setAlert('trains', {
        text: `${fmtTime(new Date(late.scheduled), CONFIG.timezone)} +${lateMins(late)} min`,
        sub: late.place || '', level: 'warn', priority: 40,
      });
    } else clearAlert('trains');
  }

  every(CONFIG.refresh.trains, load);
}

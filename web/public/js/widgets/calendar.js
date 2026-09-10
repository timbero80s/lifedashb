import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, fmtTime, dayKey } from '../util.js';
import { reportStatus } from '../bus.js';

// A 7-column week grid cannot hold a legible event at this size — 100px per
// day forces 13px type, which is below the eye's resolving power at 2 m.
// So: today and tomorrow at reading size, and the rest of the week as a
// density strip. Fixed height regardless of how busy the week is.
const MAX_TODAY = 3;
const MAX_TOMORROW = 1;
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function demo(now) {
  const mk = (dayOff, h, m, summary) => {
    const s = new Date(now); s.setDate(s.getDate() + dayOff); s.setHours(h, m, 0, 0);
    return { summary, start: s.toISOString(), end: new Date(s.getTime() + 36e5).toISOString(), allDay: false };
  };
  return [mk(0, 9, 30, 'Team standup'), mk(0, 14, 0, 'Design review'),
    mk(1, 9, 0, 'Dentist'), mk(2, 18, 30, '5-a-side'), mk(4, 16, 0, 'Retro')];
}

export function initCalendar() {
  const body = $('#calendar-body');
  const card = $('#c-cal');
  let events = [];

  async function load() {
    const { value, stale } = await withCache('calendar', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=calendar`);
      if (!r || !Array.isArray(r.events)) throw new Error('bad calendar payload');
      return r.events;
    });
    const isDemo = !value;
    events = value || demo(new Date());
    reportStatus('calendar', isDemo ? 'down' : stale ? 'stale' : 'ok');
    card.classList.toggle('is-stale', !!stale && !isDemo);
    render();
  }

  function section(label, list, max, dimAll) {
    const frag = document.createDocumentFragment();
    frag.append(el('div', { class: 'cal-head', text: label }));
    if (!list.length) { frag.append(el('div', { class: 'empty', text: '—' })); return frag; }
    const now = Date.now();
    for (const ev of list.slice(0, max)) {
      const start = new Date(ev.start), end = new Date(ev.end || ev.start);
      const past = end.getTime() < now;
      const live = !past && start.getTime() <= now;
      frag.append(el('div', { class: `cal-ev${past ? ' past' : ''}${live ? ' now' : ''}${dimAll ? ' dim' : ''}` },
        el('span', { class: 't', text: ev.allDay ? 'all day' : fmtTime(start, CONFIG.timezone) }),
        el('span', { class: 's grow trunc', text: ev.summary || 'Busy' }),
      ));
    }
    if (list.length > max) frag.append(el('div', { class: 'cal-more', text: `+${list.length - max} more` }));
    return frag;
  }

  function render() {
    const now = new Date();
    const todayKey = dayKey(now, CONFIG.timezone);
    const tmr = new Date(now.getTime() + 864e5);
    const tmrKey = dayKey(tmr, CONFIG.timezone);

    const byDay = new Map();
    for (const ev of events) {
      const k = dayKey(new Date(ev.start), CONFIG.timezone);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(ev);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => (b.allDay ? 0 : 1) - (a.allDay ? 0 : 1) || new Date(a.start) - new Date(b.start));
    }

    body.innerHTML = '';
    body.append(section('Today', byDay.get(todayKey) || [], MAX_TODAY, false));
    body.append(section('Tomorrow', byDay.get(tmrKey) || [], MAX_TOMORROW, true));

    // 7-day density strip: how busy is the rest of the week, at glance size
    const strip = el('div', { class: 'cal-strip' });
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 864e5);
      const k = dayKey(d, CONFIG.timezone);
      const n = (byDay.get(k) || []).length;
      const dots = el('span', { class: 'dots' });
      for (let j = 0; j < Math.min(3, n); j++) dots.append(el('i'));
      strip.append(el('div', { class: 'd' + (i === 0 ? ' today' : '') },
        el('span', { class: 'dl', text: DAY_LETTER[d.getDay()] }), dots));
    }
    body.append(strip);
  }

  every(CONFIG.refresh.calendar, load);
  every(1, () => { if (events.length) render(); });   // keeps "now" bar honest

  return {
    // used by the night face
    nextEvent() {
      const now = Date.now();
      return events
        .filter((e) => new Date(e.start).getTime() > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null;
    },
  };
}

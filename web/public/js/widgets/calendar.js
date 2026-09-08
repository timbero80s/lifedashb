import { CONFIG } from '../config.js';
import { $, el, fetchJSON, withCache, every, fmtTime, tzParts } from '../util.js';
import { reportStatus } from '../app.js';

const DOW_MON = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DOW_SUN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_PER_DAY = 5;

function startOfWeek(now) {
  const p = tzParts(now, CONFIG.timezone);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dow = d.getUTCDay(); // 0 Sun..6 Sat
  const back = CONFIG.weekStartsMonday ? (dow + 6) % 7 : dow;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

function demoEvents(weekStart) {
  const mk = (dayOffset, h, m, dur, summary) => {
    const s = new Date(weekStart); s.setUTCDate(s.getUTCDate() + dayOffset); s.setUTCHours(h, m, 0, 0);
    const e = new Date(s.getTime() + dur * 60000);
    return { summary, start: s.toISOString(), end: e.toISOString(), allDay: false };
  };
  return [
    mk(0, 9, 30, 30, 'Team standup'),
    mk(0, 14, 0, 60, 'Design review'),
    mk(1, 12, 30, 60, 'Lunch w/ Sam'),
    mk(2, 8, 0, 0, 'Bins out'),
    mk(2, 18, 30, 90, '5-a-side'),
    mk(3, 10, 0, 45, '1:1'),
    mk(4, 16, 0, 30, 'Retro'),
    mk(5, 11, 0, 120, 'Maidenhead Utd (H)'),
    mk(6, 9, 0, 0, 'Long run'),
  ];
}

export function initCalendar() {
  const body = $('#calendar-body');

  async function load() {
    const weekStart = startOfWeek(new Date());
    const { value, stale, error } = await withCache('calendar', async () => {
      const r = await fetchJSON(`${CONFIG.apiBase}?service=calendar`);
      if (!r || !Array.isArray(r.events)) throw new Error('bad calendar payload');
      return r.events;
    });

    let events = value;
    let demo = false;
    if (!events) { events = demoEvents(weekStart); demo = true; }

    reportStatus(demo ? 'stale' : (stale ? 'stale' : 'ok'));
    render(weekStart, events, { stale: stale && !demo, demo });
  }

  function render(weekStart, events, flags) {
    const names = CONFIG.weekStartsMonday ? DOW_MON : DOW_SUN;
    const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const a = weekStart, b = new Date(weekEnd.getTime() - 1);
    $('#cal-range').textContent =
      `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}` +
      (flags.demo ? '  (demo)' : flags.stale ? '  (stale)' : '');

    const todayKey = (() => {
      const p = tzParts(new Date(), CONFIG.timezone);
      return `${p.year}-${p.month}-${p.day}`;
    })();

    // bucket events by day index 0..6
    const buckets = Array.from({ length: 7 }, () => []);
    for (const ev of events) {
      const s = new Date(ev.start);
      if (s >= weekEnd || new Date(ev.end || ev.start) < weekStart) continue;
      const idx = Math.floor((Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - weekStart.getTime()) / 864e5);
      if (idx < 0 || idx > 6) continue;
      buckets[idx].push(ev);
    }
    buckets.forEach((list) => list.sort((x, y) =>
      (x.allDay ? -1 : 0) - (y.allDay ? -1 : 0) || new Date(x.start) - new Date(y.start)));

    const grid = el('div', { class: 'cal-grid' });
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart); day.setUTCDate(day.getUTCDate() + i);
      const key = `${day.getUTCFullYear()}-${day.getUTCMonth() + 1}-${day.getUTCDate()}`;
      const col = el('div', { class: 'cal-col' + (key === todayKey ? ' today' : '') });
      col.append(el('h4', {}, el('span', { text: names[i] }), el('span', { text: String(day.getUTCDate()) })));

      const list = buckets[i];
      if (!list.length) col.append(el('div', { class: 'cal-empty', text: '—' }));
      list.slice(0, MAX_PER_DAY).forEach((ev) => {
        const cls = 'cal-ev' + (ev.allDay ? ' allday' : '');
        const tm = ev.allDay ? '' : fmtTime(new Date(ev.start), CONFIG.timezone) + ' ';
        col.append(el('div', { class: cls },
          el('span', { class: 'tm', text: tm }),
          document.createTextNode(ev.summary || '(busy)')));
      });
      if (list.length > MAX_PER_DAY) col.append(el('div', { class: 'cal-more', text: `+${list.length - MAX_PER_DAY} more` }));
      grid.append(col);
    }
    body.innerHTML = '';
    body.append(grid);
  }

  every(CONFIG.refresh.calendar, load);
}

import { CONFIG } from '../config.js';
import { $, tzParts, isoWeek } from '../util.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DOW_MON = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function initClock() {
  const order = CONFIG.weekStartsMonday ? DOW_MON : DOW;
  $('#dow-row').innerHTML = order.map((d) => `<span data-d="${d}">${d}</span>`).join('');

  function tick() {
    const now = new Date();
    const p = tzParts(now, CONFIG.timezone);

    const hh = String(p.hour).padStart(2, '0');
    const mm = String(p.minute).padStart(2, '0');
    const ss = String(p.second).padStart(2, '0');
    $('#time-big').textContent = `${hh}:${mm}`;
    $('#time-sec').textContent = ss;

    $('#date-line').textContent = `${p.weekday} ${String(p.day).padStart(2, '0')} ${MONTHS[p.month - 1]} ${p.year}`;

    const wk = isoWeek(now, CONFIG.timezone);
    $('#week-label').textContent = `WK ${String(wk).padStart(2, '0')}`;

    const startOfYear = Date.UTC(p.year, 0, 1);
    const today = Date.UTC(p.year, p.month - 1, p.day);
    const doy = Math.floor((today - startOfYear) / 864e5) + 1;
    $('#doy-label').textContent = `DAY ${String(doy).padStart(3, '0')}`;

    const cur = p.weekday.slice(0, 2);
    document.querySelectorAll('#dow-row span').forEach((s) => {
      s.classList.toggle('on', s.dataset.d === cur);
    });

    // align the next tick to the wall-clock second
    setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();
}

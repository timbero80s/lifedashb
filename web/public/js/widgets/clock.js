import { CONFIG } from '../config.js';
import { $, tzParts, isoWeek, fmtTime } from '../util.js';

// No seconds: nobody reads them from across a room, and a 1 Hz repaint is
// motion in the periphery all day for no information.
export function initClock() {
  function tick() {
    const now = new Date();
    $('#clock').textContent = fmtTime(now, CONFIG.timezone);

    const long = new Intl.DateTimeFormat('en-GB', {
      timeZone: CONFIG.timezone, weekday: 'long', day: 'numeric', month: 'long',
    }).format(now);
    $('#date-line').textContent = `${long} · Week ${isoWeek(now, CONFIG.timezone)}`;

    // re-run just after the next minute boundary
    const { second } = tzParts(now, CONFIG.timezone);
    setTimeout(tick, (61 - second) * 1000 - (Date.now() % 1000));
  }
  tick();
}

// Shared state between widgets and the shell: the data-health dot and the
// single alert lane. Kept out of app.js so widgets never import it circularly.
import { $ } from './util.js';

// ── data health ─────────────────────────────────────────────────────────
const health = new Map();

export function reportStatus(key, state) {   // 'ok' | 'stale' | 'down'
  health.set(key, state);
  const v = [...health.values()];
  const dot = $('#net-dot');
  if (!dot) return;
  dot.classList.remove('ok', 'stale', 'down');
  if (v.includes('down') && !v.includes('ok')) dot.classList.add('down');
  else if (v.includes('stale') || v.includes('down')) dot.classList.add('stale');
  else dot.classList.add('ok');
}

// ── the alert lane ──────────────────────────────────────────────────────
// Empty almost always. One alert at a time, highest priority wins.
// Escalation requires BOTH time-boundedness and actionability.
const alerts = new Map();

export function setAlert(key, { text, sub = '', level = 'info', priority = 0 }) {
  alerts.set(key, { text, sub, level, priority });
  render();
}
export function clearAlert(key) {
  if (alerts.delete(key)) render();
}

function render() {
  const lane = $('#alert-lane');
  if (!lane) return;
  const best = [...alerts.values()].sort((a, b) => b.priority - a.priority)[0];
  if (!best) { lane.hidden = true; lane.textContent = ''; return; }
  lane.hidden = false;
  lane.dataset.level = best.level;
  lane.innerHTML = '';
  const t = document.createElement('span');
  t.textContent = best.text;
  lane.append(t);
  if (best.sub) {
    const s = document.createElement('span');
    s.className = 'a-sub';
    s.textContent = best.sub;
    lane.append(s);
  }
}

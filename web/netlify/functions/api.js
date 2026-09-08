// ============================================================================
//  Serverless proxy for the Wall Dashboard.
//  Routes:  /api?service=calendar | football | trains | iss
//  Secrets come from Netlify environment variables (see .env.example):
//    CALENDAR_ICS_URLS   comma-separated Google "secret iCal" URLs
//    FOOTBALL_DATA_TOKEN  football-data.org API token
//    RTT_USERNAME / RTT_PASSWORD   api.rtt.io credentials
//    N2YO_API_KEY        n2yo.com API key (optional; falls back to a keyless API)
//    SPORTSDB_KEY        thesportsdb key (optional, default "3")
// ============================================================================

const headers = (seconds) => ({
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  // browser cache
  'cache-control': `public, max-age=${Math.min(seconds, 120)}`,
  // Netlify's edge CDN: serve a cached good response and keep serving it while
  // it revalidates in the background — this is what smooths over flaky upstreams
  'netlify-cdn-cache-control': `public, durable, s-maxage=${seconds}, stale-while-revalidate=${seconds * 6}`,
});

// how long the CDN may cache each service's response
const TTL = { calendar: 300, football: 1800, trains: 45, iss: 3600 };

exports.handler = async (event) => {
  const service = (event.queryStringParameters || {}).service || '';
  try {
    let data;
    switch (service) {
      case 'calendar': data = await calendar(); break;
      case 'football': data = await football(); break;
      case 'trains':   data = await trains(); break;
      case 'iss':      data = await iss(event.queryStringParameters || {}); break;
      default:
        return { statusCode: 400, headers: headers(60), body: JSON.stringify({ error: 'unknown service' }) };
    }
    return { statusCode: 200, headers: headers(TTL[service] || 60), body: JSON.stringify(data) };
  } catch (err) {
    console.error(service, err);
    return {
      statusCode: 502,
      headers: headers(15),
      body: JSON.stringify({ error: String(err && err.message || err), service }),
    };
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const j = async (url, opts, retries = 1) => {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, opts);
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && attempt < retries) {
      await sleep(500 + attempt * 700);
      continue;
    }
    throw new Error(`${url.split('?')[0]} -> ${r.status}`);
  }
};
const txt = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url.split('?')[0]} -> ${r.status}`);
  return r.text();
};

// ===========================================================================
//  CALENDAR
// ===========================================================================
async function calendar() {
  const urls = (process.env.CALENDAR_ICS_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return { events: [], note: 'CALENDAR_ICS_URLS not set' };

  const windowStart = Date.now() - 2 * 864e5;
  const windowEnd = Date.now() + 16 * 864e5;
  const all = [];

  for (const url of urls) {
    try {
      const raw = await txt(url);
      for (const ev of parseICS(raw, windowStart, windowEnd)) all.push(ev);
    } catch (e) {
      console.warn('ics fetch failed', e.message);
    }
  }
  all.sort((a, b) => new Date(a.start) - new Date(b.start));
  return { events: all.slice(0, 200) };
}

function unfoldICS(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function tzOffsetMs(tz, date) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUTC - date.getTime();
  } catch { return 0; }
}

function icsDate(val, params) {
  if (/^\d{8}$/.test(val)) {
    const y = +val.slice(0, 4), m = +val.slice(4, 6) - 1, d = +val.slice(6, 8);
    return { ms: Date.UTC(y, m, d), allDay: true };
  }
  const mt = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!mt) return null;
  const [, Y, Mo, D, H, Mi, S, Z] = mt;
  const asUTC = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
  if (Z) return { ms: asUTC, allDay: false };
  const tz = (params && params.TZID) || 'Europe/London';
  return { ms: asUTC - tzOffsetMs(tz, new Date(asUTC)), allDay: false };
}

const WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseICS(raw, windowStart, windowEnd) {
  const lines = unfoldICS(raw).split('\n');
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { props: {} }; continue; }
    if (line === 'END:VEVENT') { if (cur) emitEvent(cur, out, windowStart, windowEnd); cur = null; continue; }
    if (!cur) continue;
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    const left = line.slice(0, ci);
    const value = line.slice(ci + 1);
    const [name, ...paramParts] = left.split(';');
    const params = {};
    for (const pp of paramParts) {
      const eq = pp.indexOf('=');
      if (eq > 0) params[pp.slice(0, eq).toUpperCase()] = pp.slice(eq + 1);
    }
    cur.props[name.toUpperCase()] = { value, params };
  }
  return out;
}

function emitEvent(ev, out, windowStart, windowEnd) {
  const p = ev.props;
  if (!p.DTSTART) return;
  const start = icsDate(p.DTSTART.value, p.DTSTART.params);
  if (!start) return;
  const end = p.DTEND ? icsDate(p.DTEND.value, p.DTEND.params) : null;
  const durMs = end ? (end.ms - start.ms) : (start.allDay ? 864e5 : 3600e3);
  const summary = (p.SUMMARY && p.SUMMARY.value || '').replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';').trim();
  const location = (p.LOCATION && p.LOCATION.value || '').replace(/\\,/g, ',').trim();

  const exdates = new Set();
  if (p.EXDATE) {
    for (const part of p.EXDATE.value.split(',')) {
      const d = icsDate(part, p.EXDATE.params);
      if (d) exdates.add(d.ms - (d.ms % 60000));
    }
  }

  const push = (ms) => {
    if (ms + durMs < windowStart || ms > windowEnd) return;
    if (exdates.has(ms - (ms % 60000))) return;
    out.push({
      summary: summary || '(busy)',
      start: new Date(ms).toISOString(),
      end: new Date(ms + durMs).toISOString(),
      allDay: start.allDay,
      location: location || undefined,
    });
  };

  if (!p.RRULE) { push(start.ms); return; }

  // ---- limited RRULE expansion ----
  const rule = {};
  for (const kv of p.RRULE.value.split(';')) {
    const [k, v] = kv.split('=');
    rule[k.toUpperCase()] = v;
  }
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10));
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
  const until = rule.UNTIL ? (icsDate(rule.UNTIL.replace(/Z$/, 'Z'), {}) || {}).ms : null;
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((s) => s.replace(/^[+-]?\d*/, '')) : null;

  const hardStop = Math.min(windowEnd, until || windowEnd);
  let emitted = 0;
  const startDate = new Date(start.ms);

  const stepDate = (d, units) => {
    const nd = new Date(d);
    if (freq === 'DAILY') nd.setUTCDate(nd.getUTCDate() + units);
    else if (freq === 'WEEKLY') nd.setUTCDate(nd.getUTCDate() + units * 7);
    else if (freq === 'MONTHLY') nd.setUTCMonth(nd.getUTCMonth() + units);
    else if (freq === 'YEARLY') nd.setUTCFullYear(nd.getUTCFullYear() + units);
    return nd;
  };

  // cap iterations for safety
  for (let i = 0, cursor = new Date(startDate); i < 800; i++, cursor = stepDate(startDate, i * interval)) {
    const base = cursor.getTime();
    if (base > hardStop + 864e5) break;

    if (freq === 'WEEKLY' && byday) {
      // expand to each weekday in that week
      const weekStart = new Date(base);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      for (const bd of byday) {
        const wd = WEEKDAY[bd];
        if (wd == null) continue;
        const occ = new Date(weekStart);
        occ.setUTCDate(occ.getUTCDate() + wd);
        occ.setUTCHours(startDate.getUTCHours(), startDate.getUTCMinutes(), startDate.getUTCSeconds(), 0);
        const ms = occ.getTime();
        if (ms < start.ms) continue;
        if (until && ms > until) break;
        if (count && emitted >= count) break;
        push(ms); emitted++;
      }
    } else {
      if (count && emitted >= count) break;
      if (until && base > until) break;
      push(base); emitted++;
    }
    if (count && emitted >= count) break;
  }
}

// ===========================================================================
//  FOOTBALL
// ===========================================================================
const CLUBS = [
  { key: 'spurs', name: 'TOTTENHAM', fdId: 73, fdComp: 'PL', sdb: 'Tottenham Hotspur', league: '4328' },
  { key: 'maidenhead', name: 'MAIDENHEAD UTD', fdId: null, sdb: 'Maidenhead United', league: '4682' },
  { key: 'ferro', name: 'FERRO C. OESTE', fdId: null, sdb: 'Ferro Carril Oeste', league: '4616' },
];

// reject reserve / women / youth sides when picking a team from a search
const EXCLUDE_TEAM = /\b(women|ladies|femen|reserves?|academy|youth|u1[0-9]|u2[0-9]|sub-?20|'?b'?|ii)\b/i;

function seasonCandidates() {
  const now = new Date();
  const Y = now.getUTCFullYear();
  const eu = now.getUTCMonth() >= 6 ? `${Y}-${Y + 1}` : `${Y - 1}-${Y}`;
  // European (Aug-May) form first, then calendar-year form for leagues like
  // Argentina's. Two tries is enough; more just burns the shared rate limit.
  return [eu, `${Y}`];
}

// Netlify Blobs — a tiny persistent store so a rate-limited fetch can fall
// back to the last good data instead of showing "unavailable".
async function blobStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore('dashboard');
  } catch { return null; }
}

function mergeClubRec(fresh, prev) {
  if (!prev) return fresh;
  const out = { ...fresh };
  if (!out.position && prev.position) {
    out.position = prev.position; out.played = prev.played; out.points = prev.points;
  }
  if (!out.form && prev.form) out.form = prev.form;
  if (!out.lastMatch && prev.lastMatch) out.lastMatch = prev.lastMatch;
  if (!out.nextMatch && prev.nextMatch && new Date(prev.nextMatch.utcDate).getTime() > Date.now()) {
    out.nextMatch = prev.nextMatch;
  }
  if (out.position || out.nextMatch || out.lastMatch) out.note = null;
  return out;
}

async function football() {
  const store = await blobStore();
  let prev = null;
  if (store) { try { prev = await store.get('football', { type: 'json' }); } catch {} }
  const prevClubs = (prev && prev.clubs) || [];

  const out = [];
  for (const c of CLUBS) {
    const rec = { key: c.key, name: c.name, position: null, played: null, points: null,
      form: '', lastMatch: null, nextMatch: null, note: null };
    try {
      if (c.fdId && process.env.FOOTBALL_DATA_TOKEN) {
        await fillFromFootballData(c, rec);
      } else {
        await fillFromSportsDB(c, rec);
      }
    } catch (e) {
      rec.note = 'live data unavailable';
      console.warn('football', c.key, e.message);
      try { if (!rec.position) await fillFromSportsDB(c, rec); } catch {}
    }
    out.push(mergeClubRec(rec, prevClubs.find((p) => p.key === c.key)));
  }

  const payload = { clubs: out, updated: new Date().toISOString() };
  if (store) { try { await store.setJSON('football', payload); } catch {} }
  return payload;
}

async function fillFromFootballData(c, rec) {
  const H = { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN };
  const standings = await j(`https://api.football-data.org/v4/competitions/${c.fdComp}/standings`, { headers: H });
  const table = (standings.standings.find((s) => s.type === 'TOTAL') || standings.standings[0]).table;
  const row = table.find((r) => r.team.id === c.fdId);
  if (row) {
    rec.position = row.position; rec.played = row.playedGames; rec.points = row.points;
    rec.form = (row.form || '').replace(/[^WDL]/g, '').slice(-5);
  }
  try {
    const next = await j(`https://api.football-data.org/v4/teams/${c.fdId}/matches?status=SCHEDULED&limit=1`, { headers: H });
    const m = next.matches && next.matches[0];
    if (m) {
      const home = m.homeTeam.id === c.fdId;
      rec.nextMatch = { opponent: (home ? m.awayTeam.shortName || m.awayTeam.name : m.homeTeam.shortName || m.homeTeam.name),
        homeAway: home ? '(H)' : '(A)', utcDate: m.utcDate, competition: m.competition && m.competition.name };
    }
  } catch (e) { console.warn('fd next', e.message); }
  try {
    const last = await j(`https://api.football-data.org/v4/teams/${c.fdId}/matches?status=FINISHED&limit=1`, { headers: H });
    const m = last.matches && last.matches[last.matches.length - 1];
    if (m) {
      const home = m.homeTeam.id === c.fdId;
      rec.lastMatch = {
        opponent: (home ? m.awayTeam.shortName || m.awayTeam.name : m.homeTeam.shortName || m.homeTeam.name),
        homeAway: home ? '(H)' : '(A)',
        score: `${m.score.fullTime.home}-${m.score.fullTime.away}`,
      };
    }
  } catch (e) { console.warn('fd last', e.message); }
}

async function fillFromSportsDB(c, rec) {
  const key = process.env.SPORTSDB_KEY || '3';
  const base = `https://www.thesportsdb.com/api/v1/json/${key}`;
  const search = await j(`${base}/searchteams.php?t=${encodeURIComponent(c.sdb)}`);
  const candidates = (search.teams || []).filter((t) =>
    (!t.strSport || /soccer|football/i.test(t.strSport)) && !EXCLUDE_TEAM.test(t.strTeam || ''));
  const team = candidates.find((t) => (t.strTeam || '').toLowerCase() === c.sdb.toLowerCase())
    || candidates[0] || (search.teams || [])[0];
  const teamId = team && team.idTeam;
  const teamName = team && team.strTeam;

  // try the configured league id first, then whatever the team record says
  const leagueIds = [...new Set([c.league, team && team.idLeague, team && team.idLeague2].filter(Boolean))];
  const firstWord = c.sdb.toLowerCase().split(' ')[0];

  // standings — try candidate leagues x candidate seasons
  for (const leagueId of leagueIds) {
    if (rec.position) break;
    for (const season of seasonCandidates()) {
      try {
        const tbl = await j(`${base}/lookuptable.php?l=${leagueId}&s=${season}`);
        const rows = tbl.table || [];
        const mine = rows.find((r) => (teamId && r.idTeam === teamId) ||
          (r.strTeam && teamName && r.strTeam.toLowerCase() === teamName.toLowerCase()) ||
          (r.strTeam && r.strTeam.toLowerCase().includes(firstWord)));
        if (mine) {
          rec.position = +(mine.intRank || mine.intPosition);
          rec.played = +(mine.intPlayed || 0) || null;
          rec.points = +(mine.intPoints || 0) || null;
          break;
        }
      } catch { /* try next season */ }
    }
  }

  if (!teamId) { if (!rec.note) rec.note = 'club not found on data source'; return; }

  try {
    const next = await j(`${base}/eventsnext.php?id=${teamId}`);
    const m = (next.events || [])[0];
    if (m) {
      const home = m.strHomeTeam && teamName && m.strHomeTeam.toLowerCase() === teamName.toLowerCase();
      rec.nextMatch = {
        opponent: home ? m.strAwayTeam : m.strHomeTeam,
        homeAway: home ? '(H)' : '(A)',
        utcDate: m.strTimestamp || `${m.dateEvent}T${m.strTime || '15:00:00'}Z`,
        competition: m.strLeague,
      };
    }
  } catch (e) {
    if (!rec.note) rec.note = 'fixtures need a premium data key';
  }

  try {
    const last = await j(`${base}/eventslast.php?id=${teamId}`);
    const m = (last.results || [])[0];
    if (m) {
      const home = m.strHomeTeam && teamName && m.strHomeTeam.toLowerCase() === teamName.toLowerCase();
      rec.lastMatch = {
        opponent: home ? m.strAwayTeam : m.strHomeTeam,
        homeAway: home ? '(H)' : '(A)',
        score: (m.intHomeScore != null) ? `${m.intHomeScore}-${m.intAwayScore}` : '',
      };
    }
  } catch { /* ignore */ }
}

// ===========================================================================
//  TRAINS  (Realtime Trains API — api.rtt.io)
// ===========================================================================
const STATION = process.env.TRAIN_STATION || 'MAI';
const LONDON = process.env.TRAIN_LONDON || 'PAD';
const LONDON_NAME = 'Paddington';

function rttAuth() {
  const u = process.env.RTT_USERNAME, p = process.env.RTT_PASSWORD;
  if (!u || !p) return null;
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

function hhmmToISO(hhmm, baseDate) {
  if (!hhmm || hhmm.length < 4) return null;
  const h = +hhmm.slice(0, 2), m = +hhmm.slice(2, 4);
  // baseDate is a Date at London local midnight expressed as UTC ms map; approximate with Europe/London offset
  const d = new Date(baseDate);
  d.setUTCHours(h, m, 0, 0);
  // shift so the wall clock reads hh:mm in London
  const offset = tzOffsetMs('Europe/London', d);
  let t = d.getTime() - offset;
  // handle a service that has rolled past midnight
  if (t < Date.now() - 6 * 3600e3) t += 864e5;
  return new Date(t).toISOString();
}

async function trains() {
  const auth = rttAuth();
  if (!auth) return { toLondon: [], fromLondon: [], note: 'RTT_USERNAME / RTT_PASSWORD not set' };

  const headers = { Authorization: auth };
  const now = new Date();
  const baseMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const [dep, arr] = await Promise.all([
    j(`https://api.rtt.io/api/v1/json/search/${STATION}`, { headers }),
    j(`https://api.rtt.io/api/v1/json/search/${STATION}/arrivals`, { headers }),
  ]);

  const toLondon = (dep.services || [])
    .filter((s) => s.locationDetail && (s.locationDetail.destination || []).some((d) => /paddington/i.test(d.description || '')))
    .map((s) => {
      const ld = s.locationDetail;
      return {
        scheduled: hhmmToISO(ld.gbttBookedDeparture, baseMidnight),
        expected: hhmmToISO(ld.realtimeDeparture || ld.gbttBookedDeparture, baseMidnight),
        place: (ld.destination[0] && ld.destination[0].description) || LONDON_NAME,
        platform: ld.platform || '?',
        status: statusOf(ld.gbttBookedDeparture, ld.realtimeDeparture, ld.realtimeDepartureActual, ld.cancelReasonShortText),
        operator: s.atocName,
      };
    })
    .filter((x) => x.scheduled)
    .slice(0, 8);

  const fromLondon = (arr.services || [])
    .filter((s) => s.locationDetail && (s.locationDetail.origin || []).some((o) => /paddington/i.test(o.description || '')))
    .map((s) => {
      const ld = s.locationDetail;
      return {
        scheduled: hhmmToISO(ld.gbttBookedArrival, baseMidnight),
        expected: hhmmToISO(ld.realtimeArrival || ld.gbttBookedArrival, baseMidnight),
        place: 'ex ' + ((ld.origin[0] && ld.origin[0].description) || LONDON_NAME),
        platform: ld.platform || '?',
        status: statusOf(ld.gbttBookedArrival, ld.realtimeArrival, ld.realtimeArrivalActual, ld.cancelReasonShortText),
        operator: s.atocName,
      };
    })
    .filter((x) => x.scheduled)
    .slice(0, 8);

  return { toLondon, fromLondon, station: STATION };
}

function statusOf(booked, realtime, actual, cancel) {
  if (cancel) return 'CANCELLED';
  if (!realtime || realtime === booked) return 'ON TIME';
  const d = (+realtime.slice(0, 2) * 60 + +realtime.slice(2, 4)) - (+booked.slice(0, 2) * 60 + +booked.slice(2, 4));
  if (d <= 0) return 'ON TIME';
  return `EXP ${realtime.slice(0, 2)}:${realtime.slice(2, 4)}`;
}

// ===========================================================================
//  ISS PASSES
// ===========================================================================
async function iss(q) {
  const lat = parseFloat(q.lat), lon = parseFloat(q.lon);
  const days = Math.min(10, parseInt(q.days || '5', 10));
  if (!isFinite(lat) || !isFinite(lon)) throw new Error('lat/lon required');

  if (process.env.N2YO_API_KEY) {
    try {
      const r = await j(`https://api.n2yo.com/rest/v1/satellite/visualpasses/25544/${lat}/${lon}/0/${days}/30/&apiKey=${process.env.N2YO_API_KEY}`);
      const passes = (r.passes || []).map((p) => ({
        start: new Date(p.startUTC * 1000).toISOString(),
        max: new Date(p.maxUTC * 1000).toISOString(),
        end: new Date(p.endUTC * 1000).toISOString(),
        maxEl: p.maxEl, startAz: p.startAz, endAz: p.endAz, duration: p.duration,
      }));
      return { passes, source: 'n2yo' };
    } catch (e) { console.warn('n2yo failed, trying fallback', e.message); }
  }

  // keyless fallback (g7vrd) — looks ~48h ahead
  const r = await j(`https://api.g7vrd.co.uk/v1/satellite-passes/25544/${lat}/${lon}.json?minimum_visible_time_s=120`);
  const passes = (r.passes || []).map((p) => ({
    start: p.start,
    max: p.tca,
    end: p.end,
    maxEl: p.max_elevation || 0,
    startAz: p.aos_azimuth || 0,
    endAz: p.los_azimuth || 0,
    duration: (new Date(p.end) - new Date(p.start)) / 1000,
  }));
  return { passes, source: 'g7vrd' };
}

// ============================================================================
//  Cloudflare Worker for the Wall Dashboard.
//  Serves /api?service=... ; everything else falls through to static assets.
//  Secrets are set with `wrangler secret put NAME` (see README):
//    CALENDAR_ICS_URLS    comma-separated Google "secret iCal" URLs
//    FOOTBALL_DATA_TOKEN  football-data.org API token
//    RTT_TOKEN            api-portal.rtt.io refresh token
//    N2YO_API_KEY         n2yo.com key (optional; falls back to a keyless API)
//  Plain vars (TRAIN_STATION, TRAIN_LONDON, SPORTSDB_KEY) live in wrangler.jsonc.
// ============================================================================

const headers = (seconds) => ({
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  // The browser holds it briefly; `s-maxage` is what Cloudflare's edge cache
  // obeys, which is what smooths over the flaky free upstreams.
  'cache-control': `public, max-age=${Math.min(seconds, 120)}, s-maxage=${seconds}`
    + `, stale-while-revalidate=${seconds * 6}`,
});

// how long the edge may cache each service's response
// RTT's free tier: 10/min, 100/hour, 1000/DAY — the daily cap is the binding
// one. Each origin hit costs 2 location calls, so a 300s edge TTL over ~18
// waking hours is 12*2*18 = 432/day. The widget also stops polling overnight.
const TTL = { calendar: 300, football: 1800, trains: 300, iss: 3600, f1: 3600, music: 21600, quote: 21600, version: 60 };

// a response we don't want cached for long because upstream probably choked
function isThin(service, data) {
  if (!data) return true;
  if (service === 'football') {
    return !data.clubs || !data.clubs.some((c) => c.position || c.nextMatch || c.lastMatch);
  }
  if (service === 'iss') return !data.passes || data.passes.length === 0;
  if (service === 'f1') return !data.race;
  if (service === 'music') return !(data.onThisDay || []).length && !(data.newReleases || []).length;
  if (service === 'quote') return !(data.quotes || []).length;
  if (service === 'calendar') return false; // an empty week is legitimately empty
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const service = url.searchParams.get('service') || '';

    // Workers don't edge-cache dynamic responses automatically the way a CDN
    // does for static files, so do it explicitly. The deployment version goes
    // into the key, so shipping a change drops the old entries rather than
    // serving them for the rest of their TTL.
    const version = (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || 'dev';
    const keyUrl = new URL(url);
    keyUrl.searchParams.set('__v', version);
    const cacheKey = new Request(keyUrl.toString(), { method: 'GET' });

    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    let res;
    try {
      let data;
      switch (service) {
        case 'calendar': data = await calendar(env); break;
        case 'football': data = await football(env); break;
        case 'trains':   data = await trains(env); break;
        case 'iss':      data = await iss(Object.fromEntries(url.searchParams), env); break;
        case 'f1':       data = await f1(env); break;
        case 'music':    data = await music(env); break;
        case 'quote':    data = await quote(env); break;
        // lets the wall notice it is running old code and reload itself
        case 'version':  data = { version }; break;
        default:
          return new Response(JSON.stringify({ error: 'unknown service' }),
            { status: 400, headers: headers(60) });
      }
      const ttl = isThin(service, data) ? 15 : (TTL[service] || 60);
      res = new Response(JSON.stringify(data), { status: 200, headers: headers(ttl) });
    } catch (err) {
      console.error(service, err);
      res = new Response(JSON.stringify({ error: String((err && err.message) || err), service }),
        { status: 502, headers: headers(15) });
    }

    // don't block the response on writing to cache
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
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
async function calendar(env) {
  const urls = (env.CALENDAR_ICS_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
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

// Workers KV — a tiny persistent store so a rate-limited fetch falls back to
// the last good data instead of showing "unavailable". (The Netlify Blobs
// version of this never actually worked; KV does.)
async function kvGet(env, key) {
  if (!env.CACHE) return null;
  try { return await env.CACHE.get(key, { type: 'json' }); } catch { return null; }
}
async function kvPut(env, key, value) {
  if (!env.CACHE) return;
  try { await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: 7 * 86400 }); } catch {}
}

function mergeClubRec(fresh, prev) {
  if (!prev) return fresh;
  const out = { ...fresh };
  if (!out.position && prev.position) {
    out.position = prev.position; out.played = prev.played; out.points = prev.points;
  }
  if (!out.form && prev.form) out.form = prev.form;
  // Only carry a previous result forward if it is still plausibly the last
  // one. A month-old "last result" is worse than showing none.
  if (!out.lastMatch && prev.lastMatch && prev.lastMatch.utcDate
      && Date.now() - new Date(prev.lastMatch.utcDate).getTime() < 14 * 864e5) {
    out.lastMatch = prev.lastMatch;
  }
  if (!out.nextMatch && prev.nextMatch && new Date(prev.nextMatch.utcDate).getTime() > Date.now()) {
    out.nextMatch = prev.nextMatch;
  }
  if (out.position || out.nextMatch || out.lastMatch) out.note = null;
  return out;
}

async function football(env) {
  const prev = await kvGet(env, 'football');
  const prevClubs = (prev && prev.clubs) || [];

  const out = [];
  for (const c of CLUBS) {
    const rec = { key: c.key, name: c.name, position: null, played: null, points: null,
      form: '', lastMatch: null, nextMatch: null, note: null };
    try {
      if (c.fdId && env.FOOTBALL_DATA_TOKEN) {
        await fillFromFootballData(c, rec, env);
      } else {
        await fillFromSportsDB(c, rec, env);
      }
    } catch (e) {
      rec.note = 'live data unavailable';
      console.warn('football', c.key, e.message);
      try { if (!rec.position) await fillFromSportsDB(c, rec, env); } catch {}
    }
    out.push(mergeClubRec(rec, prevClubs.find((p) => p.key === c.key)));
  }

  const payload = { clubs: out, updated: new Date().toISOString() };
  await kvPut(env, 'football', payload);
  return payload;
}

async function fillFromFootballData(c, rec, env) {
  const H = { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN };
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
        utcDate: m.utcDate,
      };
    }
  } catch (e) { console.warn('fd last', e.message); }
}

async function fillFromSportsDB(c, rec, env) {
  const key = env.SPORTSDB_KEY || '3';
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
        utcDate: m.strTimestamp || (m.dateEvent ? `${m.dateEvent}T15:00:00Z` : null),
      };
    }
  } catch { /* ignore */ }
}

// ===========================================================================
//  TRAINS  (Realtime Trains "next generation" API — data.rtt.io)
//  Auth: RTT_TOKEN is the refresh token from https://api-portal.rtt.io ,
//  exchanged here for a ~20-minute access token (cached on the warm lambda).
// ===========================================================================
const RTT_BASE = 'https://data.rtt.io';

let _rttAccess = null; // { token, exp }

// RTT returns naive datetimes ("2026-09-08T18:11:00") that mean Europe/London
// local time. Parse them to a correct absolute instant.
function rttParse(s) {
  if (!s) return null;
  if (/(?:Z|[+-]\d\d:?\d\d)$/.test(s)) return new Date(s);
  const asUTC = Date.parse(s + 'Z');
  return new Date(asUTC - tzOffsetMs('Europe/London', new Date(asUTC)));
}

async function rttAccessToken(env) {
  const refresh = env.RTT_TOKEN || env.RTT_PASSWORD;
  if (!refresh) return null;
  if (_rttAccess && _rttAccess.exp - 60000 > Date.now()) return _rttAccess.token;
  // the portal issues a refresh token; swap it for a short-life access token
  try {
    const r = await j(`${RTT_BASE}/api/get_access_token`, {
      headers: { Authorization: `Bearer ${refresh}` },
    });
    _rttAccess = { token: r.token, exp: new Date(r.validUntil).getTime() };
    return _rttAccess.token;
  } catch (e) {
    // maybe RTT_TOKEN is already a long-life access token — use it directly
    console.warn('rtt token exchange failed, trying token as-is', e.message);
    _rttAccess = { token: refresh, exp: Date.now() + 5 * 60000 };
    return refresh;
  }
}

function rttStatus(t, schedDate, expDate) {
  if (!t) return 'ON TIME';
  if (t.isCancelled || t.displayAs === 'CANCELLED') return 'CANCELLED';
  if (!schedDate || !expDate) return 'ON TIME';
  const late = Math.round((expDate - schedDate) / 60000);
  if (late <= 0) return 'ON TIME';
  const hhmm = expDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `EXP ${hhmm}`;
}

function mapService(s, kind) {
  const t = s.temporalData && s.temporalData[kind === 'dep' ? 'departure' : 'arrival'];
  if (!t) return null;
  const schedDate = rttParse(t.scheduleAdvertised || t.scheduleInternal);
  if (!schedDate) return null;
  const expDate = rttParse(t.realtimeActual || t.realtimeForecast) || schedDate;
  const ends = kind === 'dep' ? s.destination : s.origin;
  const place = ((ends && ends[0] && ends[0].location && ends[0].location.description) || '').replace(/^London /, '');
  const plat = s.locationMetadata && s.locationMetadata.platform;
  return {
    scheduled: schedDate.toISOString(),
    expected: expDate.toISOString(),
    place: kind === 'dep' ? place : 'ex ' + place,
    platform: (plat && (plat.forecast || plat.planned)) || '?',
    status: rttStatus(t, schedDate, expDate),
    operator: (s.scheduleMetadata && s.scheduleMetadata.operator && s.scheduleMetadata.operator.name) || '',
  };
}

async function trains(env) {
  const STATION = env.TRAIN_STATION || 'MAI';
  const LONDON = env.TRAIN_LONDON || 'PAD';
  const access = await rttAccessToken(env);
  if (!access) return { toLondon: [], fromLondon: [], note: 'RTT_TOKEN not set' };
  const headers = { Authorization: `Bearer ${access}` };

  let toRaw, fromRaw;
  try {
    [toRaw, fromRaw] = await Promise.all([
      j(`${RTT_BASE}/rtt/location?code=gb-nr:${STATION}&filterTo=gb-nr:${LONDON}&timeWindow=150`, { headers }, 0),
      j(`${RTT_BASE}/rtt/location?code=gb-nr:${STATION}&filterFrom=gb-nr:${LONDON}&timeWindow=150`, { headers }, 0),
    ]);
  } catch (e) {
    if (/-> 429$/.test(e.message)) {
      // over quota: say so plainly and let the edge retry shortly
      return { toLondon: [], fromLondon: [], station: STATION, note: 'Rate limited' };
    }
    throw e;
  }

  const clean = (arr) => arr.filter(Boolean)
    .filter((x) => new Date(x.expected).getTime() > Date.now() - 5 * 60000)
    .slice(0, 8);

  return {
    toLondon: clean((toRaw.services || []).map((s) => mapService(s, 'dep'))),
    fromLondon: clean((fromRaw.services || []).map((s) => mapService(s, 'arr'))),
    station: STATION,
  };
}

// ===========================================================================
//  ISS PASSES
// ===========================================================================
async function iss(q, env) {
  const lat = parseFloat(q.lat), lon = parseFloat(q.lon);
  const days = Math.min(10, parseInt(q.days || '5', 10));
  if (!isFinite(lat) || !isFinite(lon)) throw new Error('lat/lon required');

  if (env.N2YO_API_KEY) {
    try {
      const r = await j(`https://api.n2yo.com/rest/v1/satellite/visualpasses/25544/${lat}/${lon}/0/${days}/30/&apiKey=${env.N2YO_API_KEY}`);
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

// ===========================================================================
//  FORMULA 1  (Jolpica — the drop-in successor to the retired Ergast API)
// ===========================================================================
const F1_BASE = 'https://api.jolpi.ca/ergast/f1';

async function f1(env) {
  const F1_DRIVER = (env.F1_DRIVER_ID || 'colapinto').toLowerCase();
  const [nextRaw, standRaw] = await Promise.all([
    j(`${F1_BASE}/current/next.json`),
    j(`${F1_BASE}/current/driverstandings.json`),
  ]);

  const r = ((nextRaw.MRData.RaceTable || {}).Races || [])[0];
  const race = r ? {
    name: r.raceName,
    round: +r.round,
    circuit: r.Circuit.circuitName,
    locality: r.Circuit.Location && r.Circuit.Location.locality,
    country: r.Circuit.Location && r.Circuit.Location.country,
    start: `${r.date}T${r.time || '13:00:00Z'}`,
    qualifying: r.Qualifying ? `${r.Qualifying.date}T${r.Qualifying.time || '14:00:00Z'}` : null,
    sprint: r.Sprint ? `${r.Sprint.date}T${r.Sprint.time || '14:00:00Z'}` : null,
  } : null;

  let driver = null;
  const lists = (standRaw.MRData.StandingsTable || {}).StandingsLists || [];
  if (lists.length) {
    const row = (lists[0].DriverStandings || [])
      .find((e) => (e.Driver.driverId || '').toLowerCase().includes(F1_DRIVER));
    if (row) {
      driver = {
        position: +row.position,
        points: +row.points,
        wins: +row.wins,
        team: (row.Constructors && row.Constructors[0] && row.Constructors[0].name || '').replace(/ F1 Team$/, ''),
      };
    }
  }
  return { race, driver };
}

// ===========================================================================
//  MUSIC  (Wikidata — sitelink count is a decent proxy for "notable")
//  Binding the dates with VALUES turns a full scan into indexed lookups:
//  ~0.5s instead of ~13s, which is the difference between working and not.
// ===========================================================================
const WD = 'https://query.wikidata.org/sparql';
const WD_HEADERS = {
  Accept: 'application/sparql-results+json',
  'User-Agent': 'WallDashboard/1.0 (personal wall display)',
};

async function sparql(query) {
  const r = await fetch(`${WD}?query=${encodeURIComponent(query)}`, { headers: WD_HEADERS });
  if (!r.ok) throw new Error(`wikidata -> ${r.status}`);
  const d = await r.json();
  return d.results.bindings;
}

const iso = (d) => d.toISOString().slice(0, 10);

function albumQuery(dateValues, extraFilter, order) {
  // P436 is the MusicBrainz release-group id, which is the key into the
  // Cover Art Archive — that's where the sleeve images come from.
  return `SELECT ?albumLabel ?artistLabel ?date ?sitelinks ?mbid WHERE {
  VALUES ?date { ${dateValues} }
  ?album wdt:P31 wd:Q482994 ; wdt:P577 ?date ; wdt:P175 ?artist ; wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?album wdt:P436 ?mbid }
  ${extraFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,en-gb" }
} ORDER BY ${order} LIMIT 8`;
}

async function music(env) {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const thisYear = now.getUTCFullYear();

  // same calendar day, every year back to 1958
  const anniversary = [];
  for (let y = 1958; y < thisYear; y++) anniversary.push(`"${y}-${mm}-${dd}"^^xsd:dateTime`);

  // the last 35 days, for "out recently"
  const recent = [];
  for (let n = 0; n <= 35; n++) {
    recent.push(`"${iso(new Date(now.getTime() - n * 864e5))}"^^xsd:dateTime`);
  }

  const [hist, neu] = await Promise.all([
    sparql(albumQuery(anniversary.join(' '), 'FILTER(?sitelinks > 14)', 'DESC(?sitelinks)')).catch(() => []),
    sparql(albumQuery(recent.join(' '), '', 'DESC(?sitelinks)')).catch(() => []),
  ]);

  const map = (b) => {
    const mbid = b.mbid && b.mbid.value;
    return {
      title: b.albumLabel.value,
      artist: b.artistLabel.value,
      date: b.date.value.slice(0, 10),
      year: +b.date.value.slice(0, 4),
      art: mbid ? `https://coverartarchive.org/release-group/${mbid}/front-250` : null,
    };
  };

  return {
    onThisDay: hist.map(map).filter((x) => !/^Q\d+$/.test(x.artist)),
    newReleases: neu.map(map).filter((x) => !/^Q\d+$/.test(x.artist)),
  };
}

// ===========================================================================
//  QUOTE OF THE MOMENT
//  A hand-picked list rather than a quotes API, because the APIs mostly serve
//  motivational filler. Short, attributed, heavily weighted to public domain.
//  Open Library supplies the sleeve; the year here is authoritative (Open
//  Library's first_publish_year often reflects a translation or reprint).
// ===========================================================================
const QUOTES = [
  { t: 'It was the best of times, it was the worst of times.', a: 'Charles Dickens', b: 'A Tale of Two Cities', y: 1859, c: 13301713 },
  { t: 'Call me Ishmael.', a: 'Herman Melville', b: 'Moby-Dick', y: 1851, c: 10544254 },
  { t: 'It is not down in any map; true places never are.', a: 'Herman Melville', b: 'Moby-Dick', y: 1851, c: 10544254 },
  { t: 'All happy families are alike; each unhappy family is unhappy in its own way.', a: 'Leo Tolstoy', b: 'Anna Karenina', y: 1878, c: 2560652 },
  { t: 'The past is a foreign country: they do things differently there.', a: 'L. P. Hartley', b: 'The Go-Between', y: 1953, c: 717615 },
  { t: 'We are all in the gutter, but some of us are looking at the stars.', a: 'Oscar Wilde', b: "Lady Windermere's Fan", y: 1892, c: 3075636 },
  { t: 'Whereof one cannot speak, thereof one must be silent.', a: 'Ludwig Wittgenstein', b: 'Tractatus Logico-Philosophicus', y: 1921, c: 5415771 },
  { t: 'The limits of my language mean the limits of my world.', a: 'Ludwig Wittgenstein', b: 'Tractatus Logico-Philosophicus', y: 1921, c: 5415771 },
  { t: 'One must imagine Sisyphus happy.', a: 'Albert Camus', b: 'The Myth of Sisyphus', y: 1942, c: 12726570 },
  { t: 'It was a bright cold day in April, and the clocks were striking thirteen.', a: 'George Orwell', b: 'Nineteen Eighty-Four', y: 1949, c: 9267242 },
  { t: 'All animals are equal, but some animals are more equal than others.', a: 'George Orwell', b: 'Animal Farm', y: 1945, c: 11261770 },
  { t: 'Someone must have slandered Josef K., for one morning he was arrested.', a: 'Franz Kafka', b: 'The Trial', y: 1925, c: 14910748 },
  { t: 'So we beat on, boats against the current, borne back ceaselessly into the past.', a: 'F. Scott Fitzgerald', b: 'The Great Gatsby', y: 1925, c: 10590366 },
  { t: 'The mind is its own place, and in itself can make a heaven of hell.', a: 'John Milton', b: 'Paradise Lost', y: 1667, c: 5992814 },
  { t: 'I would prefer not to.', a: 'Herman Melville', b: 'Bartleby, the Scrivener', y: 1853, c: 10521439 },
  { t: 'Time is the substance I am made of.', a: 'Jorge Luis Borges', b: 'Labyrinths', y: 1962, c: 10831408 },
  { t: 'The world is full of obvious things which nobody by any chance ever observes.', a: 'Arthur Conan Doyle', b: 'The Hound of the Baskervilles', y: 1902, c: 8063264 },
  { t: 'Ever tried. Ever failed. No matter. Try again. Fail again. Fail better.', a: 'Samuel Beckett', b: 'Worstward Ho', y: 1983, c: 6635734 },
  { t: "The past is never dead. It's not even past.", a: 'William Faulkner', b: 'Requiem for a Nun', y: 1951, c: 9327745 },
  { t: 'For most of history, Anonymous was a woman.', a: 'Virginia Woolf', b: "A Room of One's Own", y: 1929, c: 6559057 },
  { t: 'Life must be understood backwards, but it must be lived forwards.', a: 'Søren Kierkegaard', b: 'Journals', y: 1843, c: 10047852 },
  { t: 'Man is born free, and everywhere he is in chains.', a: 'Jean-Jacques Rousseau', b: 'The Social Contract', y: 1762, c: 2292601 },
  { t: 'Whoever fights monsters should see to it that he does not become a monster.', a: 'Friedrich Nietzsche', b: 'Beyond Good and Evil', y: 1886, c: 14444933 },
  { t: 'Not all those who wander are lost.', a: 'J. R. R. Tolkien', b: 'The Fellowship of the Ring', y: 1954, c: 14627060 },
  { t: 'Any sufficiently advanced technology is indistinguishable from magic.', a: 'Arthur C. Clarke', b: 'Profiles of the Future', y: 1962, c: 380579 },
  { t: 'So it goes.', a: 'Kurt Vonnegut', b: 'Slaughterhouse-Five', y: 1969, c: 12727001 },
  { t: 'We are what we pretend to be, so we must be careful what we pretend to be.', a: 'Kurt Vonnegut', b: 'Mother Night', y: 1961, c: 239848 },
  { t: 'The unexamined life is not worth living.', a: 'Plato', b: 'Apology', y: -399, c: 14398204 },
  { t: 'It does not do to dwell on dreams and forget to live.', a: 'J. K. Rowling', b: "Harry Potter and the Philosopher's Stone", y: 1997, c: 15155833 },
  { t: 'There is no greater agony than bearing an untold story inside you.', a: 'Maya Angelou', b: 'I Know Why the Caged Bird Sings', y: 1969, c: 9367075 },
  { t: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.', a: 'Jane Austen', b: 'Pride and Prejudice', y: 1813, c: 14348537 },
  { t: 'Memory believes before knowing remembers.', a: 'William Faulkner', b: 'Light in August', y: 1932, c: 8292249 },
  { t: 'Beware; for I am fearless, and therefore powerful.', a: 'Mary Shelley', b: 'Frankenstein', y: 1818, c: 12356249 },
  { t: 'I am no bird; and no net ensnares me.', a: 'Charlotte Brontë', b: 'Jane Eyre', y: 1847, c: 8235363 },
  { t: 'Heaven knows we need never be ashamed of our tears.', a: 'Charles Dickens', b: 'Great Expectations', y: 1861, c: 13322313 },
  { t: 'A man who dares to waste one hour of time has not discovered the value of life.', a: 'Charles Darwin', b: 'The Life and Letters of Charles Darwin', y: 1887, c: 1789659 },
  { t: 'The truth is rarely pure and never simple.', a: 'Oscar Wilde', b: 'The Importance of Being Earnest', y: 1895, c: 1260453 },
  { t: 'There are years that ask questions and years that answer.', a: 'Zora Neale Hurston', b: 'Their Eyes Were Watching God', y: 1937, c: 12752055 },
  { t: 'The greatest hazard of all, losing oneself, can occur very quietly in the world.', a: 'Søren Kierkegaard', b: 'The Sickness Unto Death', y: 1849, c: 104000 },
];

const QUOTES_PER_DAY = 6;

async function quote(env) {
  // Cover ids were resolved from Open Library once and baked in, so this
  // endpoint makes no external calls: instant, and immune to their rate limit.
  const day = Math.floor(Date.now() / 864e5);
  const quotes = [];
  for (let i = 0; i < QUOTES_PER_DAY; i++) {
    const q = QUOTES[(day * QUOTES_PER_DAY + i) % QUOTES.length];
    quotes.push({
      text: q.t, author: q.a, book: q.b, year: q.y,
      cover: q.c ? `https://covers.openlibrary.org/b/id/${q.c}-M.jpg` : null,
    });
  }
  return { quotes };
}


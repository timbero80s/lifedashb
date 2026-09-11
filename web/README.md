# Wall Dashboard

An always-on wall dashboard for an **Amazon Fire Max 11** (landscape, 2000×1200),
designed as non-interactive iOS-style widget cards on a dark ground and sized to
be read from 1–3 metres across a room.

**Live:** https://wall-dashboard.faboinn.workers.dev
**Source:** https://github.com/timbero80s/lifedashb

## What's on it

| Card | Source | Key needed |
|---|---|---|
| Clock, date, week number | local | — |
| Weather now + 4-day outlook | Open-Meteo (UK Met Office model) | no |
| Calendar — today, tomorrow, week density strip | Google secret iCal | yes |
| Today in the house — bins, school term, kit reminders, Week A/B | local config | no |
| Trains — Maidenhead ⇄ Paddington | Realtime Trains | yes |
| Football — Tottenham, Maidenhead Utd, Ferro Carril Oeste | football-data.org + thesportsdb | partly |
| Formula 1 — next race + Colapinto's standing | Jolpica | no |
| ISS — next visible pass, with sky arc | N2YO, keyless fallback | optional |
| Sun & moon | computed locally | no |
| Music — on this day + new releases, with sleeve art | Wikidata + Cover Art Archive | no |
| Quote bar — quote, author, book, year, cover | curated + Open Library | no |

Every card keeps showing its last good data if a source fails, and the dot by the
temperature goes green / amber / red for overall data health.

## Deploying

No build step and no dependencies — a deploy just uploads files:

```
cd web
npx -y wrangler@latest deploy
```

About fifteen seconds, and it consumes no build minutes. That is the whole
reason this moved off Netlify, whose free build credits ran out mid-project.

On a new machine, authorise once with `npx -y wrangler@latest login`.

Preview locally first with `npx -y wrangler@latest dev` — that serves the static
files and `/api` together on one port, exactly as production does.

## Secrets

Stored encrypted by Cloudflare, never in this repo. Set them in the dashboard
(Workers → `wall-dashboard` → Settings → Variables and Secrets) or with
`npx -y wrangler@latest secret put NAME`:

| Name | Where to get it |
|---|---|
| `CALENDAR_ICS_URLS` | Google Calendar → ⋮ → Settings and sharing → Integrate calendar → **Secret address in iCal format**. Comma-separated for several calendars. |
| `FOOTBALL_DATA_TOKEN` | https://www.football-data.org/client/register |
| `RTT_TOKEN` | https://api-portal.rtt.io/ → request an API token |
| `N2YO_API_KEY` | https://www.n2yo.com/api/ — optional; a keyless source is used if absent |

Non-secret settings (`TRAIN_STATION`, `TRAIN_LONDON`, `SPORTSDB_KEY`,
`F1_DRIVER_ID`) live in `wrangler.jsonc` under `vars`.

## Changing things

Nearly everything is in **`public/js/config.js`**, which holds no secrets:

- `postcode`, `placeLabel`, `timezone`
- `clubs` — which teams, and their identity colour
- `f1.driverId` / `driverLabel`
- `household.bins` — collection night, and the green/black alternation anchor
- `household.school` — terms, holidays, INSET closures, the Week A/B cycle
  anchor, and weekday kit reminders
- `iss` thresholds, `refresh` intervals, `night` dimming and night-face hours

The quote list lives in `src/worker.js`. Each entry carries a baked-in Open
Library cover id (`c:`), resolved once so the endpoint makes no external calls;
to add a quote, look its cover up via
`openlibrary.org/search.json?title=…&author=…&fields=cover_i`.

## How it's put together

- `public/` — the page: plain HTML/CSS/ES modules, no framework, no build
- `src/worker.js` — one Cloudflare Worker serving `/api` and proxying the
  sources that need a key or that a browser can't reach directly
- `wrangler.jsonc` — assets, KV binding, and the non-secret vars

The page is authored at a fixed 2000×1200 and scaled to the viewport at runtime,
because the Fire's browser may report either 2000 or 1000 CSS pixels. Type has a
hard floor of 22px: anything that cannot be read at arm's length across a room
does not belong on a wall.

## Known limits of the free data

- **Maidenhead United's league position** shows "table n/a" — thesportsdb's free
  tier only returns the top 5 of a table. Fixtures and results do come through.
- **thesportsdb's shared test key is rate-limited**, so a good response is cached
  at the edge for 30 minutes, thin responses for only 15 seconds, and the last
  good per-club data is kept in KV and in the tablet's own storage.
- **Realtime Trains' free tier** allows 1000 calls/day. Each origin hit costs
  two, so the widget polls every 5 minutes and stops overnight.
- **ISS passes** genuinely don't happen every night. "No visible pass" is
  normal, not a fault.

## On the tablet

1. Fire settings → Device Options → tap Serial Number seven times → Developer
   Options → **Stay awake while charging**.
2. Install **Fully Kiosk Browser**, set the start URL to the live link above,
   and turn on Kiosk Mode, Keep Screen On, and Launch on Boot.
3. Mount landscape, leave it on the charger.

The dashboard dims itself through the evening and switches to a minimal amber
night face between 23:00 and 06:30.

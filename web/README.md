# Wall Dashboard

**Live:** https://timbero-wall-dashboard.netlify.app
(Netlify site `timbero-wall-dashboard`, deployed 2026-09-08.)

**Still to do:** add `RTT_TOKEN` in Netlify for the trains widget — sign up at
https://api-portal.rtt.io/ and request an API token, then Netlify → Site
configuration → Environment variables → add **key** `RTT_TOKEN`, **value** the
whole token string → Deploys → Trigger deploy. Everything else is live.

To redeploy after editing files in `web/`: from the `web/` directory run
`npx -y @netlify/mcp@latest --site-id bbd13bb4-48d1-447b-8e2f-49a779b47c87`
(it will prompt you to sign in to Netlify), or connect the GitHub repo to the
site for automatic deploys.

---

A Casio-LCD-style wall dashboard for an **Amazon Fire Max 11** (landscape). One
web page, no app store. It shows:

- Date, day-of-week, week number, big 7-segment clock
- Weather for your postcode (now + 5-day), from the UK Met Office model via Open-Meteo
- Your **weekly Google Calendar** (Mon–Sun grid)
- League position + last/next fixture for **Tottenham**, **Maidenhead United**, **Ferro Carril Oeste**
- **Maidenhead ⇆ London** trains (to Paddington, and arrivals from Paddington)
- Next visible **ISS pass** over your postcode, with a "LOOK UP" alert
- **Moon phase**, sunrise, sunset, day length
- A ticker of positive **hardware / AI** headlines mixed with **Claude Code / Claude-as-coworker tips**

It keeps showing the last good data if the network drops, and the little dot
top-right goes green / amber / red for data health.

---

## How it's built

- `public/` — the dashboard itself (plain HTML/CSS/JS, no build step)
- `netlify/functions/api.js` — a tiny serverless proxy that holds your API keys
  and fetches the things a browser can't fetch directly (calendar, trains, ISS,
  Spurs table)
- Hosted free on **Netlify**

Weather, moon/sun and the news ticker work **without any backend** — so if you
just open `public/index.html` on a web server you already get a live dashboard,
with demo placeholders for calendar / football / trains / ISS until you deploy.

---

## Setup — step by step

### 1. Create the free accounts you need

| What | Where | Gives you |
|---|---|---|
| Netlify | https://app.netlify.com/signup | hosting + the proxy |
| football-data.org | https://www.football-data.org/client/register | Tottenham table & fixtures (`FOOTBALL_DATA_TOKEN`) |
| Realtime Trains | https://api-portal.rtt.io/ → sign up → request an API token | train times (`RTT_TOKEN`) |
| N2YO (optional) | https://www.n2yo.com/api/ | better ISS passes (`N2YO_API_KEY`). If you skip it a keyless service is used automatically. |

For **thesportsdb** (Maidenhead Utd + Ferro) no signup is required — the free
test key `3` is used by default. A Patreon key (`SPORTSDB_KEY`) unlocks
next-fixture data for the lower leagues; without it you still get league
position and last result where available.

### 2. Get your Google Calendar link(s)

For **each** calendar you want on the wall:

1. Google Calendar (on a computer) → hover the calendar in the left list →
   **⋮ → Settings and sharing**
2. Scroll to **Integrate calendar**
3. Copy **"Secret address in iCal format"** (ends in `/basic.ics`)

Keep these private — anyone with the link can read that calendar. They go into
Netlify as an environment variable, **not** into the code.

### 3. Deploy to Netlify

**Option A — drag and drop (quickest)**

1. Zip the `web/` folder (or just its contents)
2. Go to https://app.netlify.com/drop and drop it
3. Open **Site configuration → Build & deploy → Continuous deployment** is not
   needed; just note your site URL (e.g. `https://something.netlify.app`)

**Option B — from GitHub (best for updates)**

1. Push this repo to GitHub
2. Netlify → **Add new site → Import an existing project** → pick the repo
3. Set **Base directory** to `web`, **Publish directory** to `web/public`,
   **Functions directory** to `web/netlify/functions` (the `netlify.toml`
   already sets these if base directory is `web`)

### 4. Add your keys to Netlify

Netlify → **Site configuration → Environment variables → Add a variable**.
Add the ones you have (see `.env.example` for the full list):

```
CALENDAR_ICS_URLS   = https://calendar.google.com/.../basic.ics,https://calendar.google.com/.../basic.ics
FOOTBALL_DATA_TOKEN = <your football-data.org token>
RTT_TOKEN           = <your api-portal.rtt.io token>
N2YO_API_KEY        = <optional>
SPORTSDB_KEY        = 3
```

Then **Deploys → Trigger deploy → Deploy site** so the new variables take effect.

### 5. Check it

Open your Netlify URL in a normal browser. You can test the proxy directly:

- `https://your-site.netlify.app/api?service=calendar`
- `https://your-site.netlify.app/api?service=football`
- `https://your-site.netlify.app/api?service=trains`
- `https://your-site.netlify.app/api?service=iss&lat=51.52&lon=-0.72`

Each should return JSON. If one returns an error, the message tells you which
key is missing or wrong.

---

## Put it on the Fire tablet

1. On the Fire: **Settings → Device Options → tap "Serial Number" 7 times** to
   unlock Developer Options, then turn on **Stay awake while charging**.
2. Install **Fully Kiosk Browser** (free) from the Amazon Appstore (or use the
   Silk browser in full-screen).
3. In Fully Kiosk:
   - **Start URL** = your Netlify URL
   - Turn on **Kiosk Mode**, **Keep screen on**, **Auto-reload on idle** (e.g.
     every few hours), and **Launch on boot**
   - Optionally set a **screen dim** schedule (the dashboard also dims itself
     late at night — see `nightDim` in config)
4. Mount the tablet in landscape, keep it on the charger.

---

## Changing things

Everything you'd want to tweak is in **`public/js/config.js`** (safe to edit,
no secrets):

- `postcode`, `placeLabel`
- `trains.station` / `londonTerminus` (CRS codes — Maidenhead is `MAI`)
- `clubs` list and their data-source hints
- `lcdMode`: `positive` (chosen), `negative`, or `auto`
- `nightDim` schedule
- `refresh` intervals

Edit the **Claude tips** shown in the ticker in `public/js/tips.js`.

After editing, redeploy (Option A: drop the folder again; Option B: `git push`).

---

## Known limits (free data sources)

- **Tottenham**: full data (table, form, last & next fixture) via football-data.org.
- **Ferro Carril Oeste** (Primera Nacional): league position **and** last/next
  fixture both come through on thesportsdb's free tier.
- **Maidenhead United** (National League): last/next fixture come through, but
  **league position shows "table n/a"** — thesportsdb's free tier only returns
  the top 5 of a table and files Maidenhead under the wrong division. A paid
  thesportsdb key (`SPORTSDB_KEY`) would fix this.
- thesportsdb's shared free key is rate-limited, so the backend caches a good
  response at Netlify's edge for 30 min and the tablet keeps the best data it
  has seen — a momentary upstream failure never blanks the panel.
- **Trains**: matched by destination/origin containing "Paddington", which
  covers GWR and most Elizabeth line services to/from London. Realtime Trains
  free tier is for personal use.
- **ISS**: visible passes genuinely don't happen every day — quiet stretches are
  normal, not a bug.
- **Weather** uses `ukmo_seamless` (UK Met Office) with no API key.

---

## Local preview (optional, needs Node)

```bash
cd web
npm i -g netlify-cli
netlify dev
```

Without Node you can still preview the front-end only:

```bash
cd web/public
python3 -m http.server 8777
# open http://localhost:8777
```

(calendar/football/trains/ISS show demo data until deployed to Netlify)

// ============================================================================
//  WALL DASHBOARD — user configuration
//  Everything in this file is safe to be public. Secrets (API keys, the
//  private calendar links) live in Netlify environment variables instead.
//  Edit the values below, save, and redeploy (or just refresh in demo mode).
// ============================================================================

export const CONFIG = {
  // --- Location -------------------------------------------------------------
  // Your postcode is used to look up latitude / longitude (via postcodes.io)
  // for weather, sun times and ISS passes. Coordinates are cached after the
  // first successful lookup.
  postcode: 'SL6 7QT',
  placeLabel: 'MAIDENHEAD',
  countryLabel: 'UK',

  // --- Clock / locale ------------------------------------------------------
  timezone: 'Europe/London',
  clock24h: true,
  weekStartsMonday: true,

  // --- Trains ------------------------------------------------------------
  // CRS (3-letter) station codes. Maidenhead is "MAI". London terminus for
  // the fast trains is London Paddington = "PAD".
  trains: {
    station: 'MAI',
    stationLabel: 'MAIDENHEAD',
    londonTerminus: 'PAD',
    londonLabel: 'LONDON PADDINGTON',
    rows: 5, // how many services to show per direction
  },

  // --- Football ---------------------------------------------------------
  // For each club: a display name, and hints the backend uses to find it.
  //  - footballDataId: numeric team id on football-data.org (Premier League
  //    teams only on the free tier). Tottenham = 73. Leave null otherwise.
  //  - sportsDbSearch: exact team name for thesportsdb.com lookup.
  //  - sportsDbLeagueId: league id on thesportsdb for the standings table.
  clubs: [
    {
      key: 'spurs',
      name: 'TOTTENHAM',
      footballDataId: 73,
      footballDataCompetition: 'PL',
      sportsDbSearch: 'Tottenham',
      sportsDbLeagueId: '4328', // English Premier League
    },
    {
      key: 'maidenhead',
      name: 'MAIDENHEAD UTD',
      footballDataId: null,
      sportsDbSearch: 'Maidenhead United',
      sportsDbLeagueId: '4574', // English National League (Vanarama)
    },
    {
      key: 'ferro',
      name: 'FERRO C. OESTE',
      footballDataId: null,
      sportsDbSearch: 'Ferro Carril Oeste',
      sportsDbLeagueId: '4406', // Argentinian Primera Nacional
    },
  ],

  // --- ISS --------------------------------------------------------------
  iss: {
    minElevationDeg: 15,   // ignore passes lower than this (hard to see)
    alertWithinMinutes: 60, // show a "LOOK UP" alert when a pass is this soon
    days: 5,
  },

  // --- News / tips ticker ---------------------------------------------
  news: {
    rotateSeconds: 12,
    hnMinPoints: 60,
    // headlines whose title contains any of these are hidden (keeps it positive)
    blocklist: ['dies', 'dead', 'lawsuit', 'sued', 'ban', 'bankrupt', 'layoff',
      'layoffs', 'fired', 'hack', 'breach', 'scam', 'war', 'shooting', 'crash victims'],
  },

  // --- Look & feel -------------------------------------------------------
  // "positive"  = grey-green LCD, dark digits (chosen)
  // "negative"  = black LCD, light digits
  // "auto"      = positive by day, negative between sunset and sunrise
  lcdMode: 'positive',
  nightDim: true,          // gently dim the whole panel late at night
  nightDimFrom: '22:30',
  nightDimTo: '06:30',
  nightDimOpacity: 0.55,

  // --- Refresh intervals (minutes) ------------------------------------
  refresh: {
    weather: 15,
    calendar: 10,
    football: 360,
    trains: 1,
    iss: 180,
    astro: 30,
    news: 30,
  },

  // --- Backend ---------------------------------------------------------
  // Where the serverless proxies live. "/api" is redirected to the function
  // by netlify.toml and gets proper edge caching. In pure static / demo mode
  // the dashboard falls back to mock data for anything backend-dependent.
  apiBase: '/api',
};

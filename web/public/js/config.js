// ============================================================================
//  WALL DASHBOARD — user configuration
//  Everything here is safe to be public. Secrets (API tokens, the private
//  calendar links) live in Netlify environment variables instead.
// ============================================================================

export const CONFIG = {
  // --- Location -----------------------------------------------------------
  postcode: 'SL6 7QT',
  placeLabel: 'MAIDENHEAD',
  timezone: 'Europe/London',

  // --- Trains --------------------------------------------------------------
  // Station codes are set on the backend (TRAIN_STATION / TRAIN_LONDON).
  trains: {
    rows: 3,
    // only escalate a delay to the alert lane during travel hours
    commuteWindows: [['07:00', '09:15'], ['16:30', '19:00']],
    escalateDelayMins: 10,
  },

  // --- Football ------------------------------------------------------------
  // `colour` is only used for the 3px identity bar down the left of each row.
  clubs: [
    { key: 'spurs',      name: 'Tottenham',      colour: '#132257' },
    { key: 'maidenhead', name: 'Maidenhead Utd', colour: '#000000' },
    { key: 'ferro',      name: 'Ferro C. Oeste', colour: '#046A38' },
  ],

  // --- Formula 1 -----------------------------------------------------------
  f1: {
    driverId: 'colapinto',   // Ergast/Jolpica driver id
    driverLabel: 'Colapinto',
  },

  // --- ISS -----------------------------------------------------------------
  iss: {
    minElevationDeg: 25,     // below this it is not worth looking up for
    alertWithinMinutes: 60,  // card inverts and shouts inside this window
    days: 5,
  },

  // ==========================================================================
  //  HOUSEHOLD  ← the bit you need to fill in
  // ==========================================================================
  household: {
    // Bins. `day` is the evening they go OUT (0=Sun, 1=Mon … 6=Sat).
    // Blue + food every week; green and black alternate. The cycle is
    // derived from anchorDate/anchorType, taken from the calendar entries
    // "Green and Blue Bins" (Thu 10 Sep) and "Black and Blue bins" (Thu 17).
    bins: {
      enabled: true,
      day: 4,                       // Thursday night
      anchorDate: '2026-09-10',
      anchorType: 'green',
      alternating: [
        { key: 'green', label: 'Green', colour: '#30D158' },
        { key: 'black', label: 'Black', colour: '#6E6E73' },
      ],
      weekly: [
        { key: 'blue', label: 'Blue', colour: '#0A84FF' },
        { key: 'food', label: 'Food', colour: '#A2845E' },
      ],
    },

    // School terms — add or edit ranges as you get the dates. Anything outside
    // a range reads as "holiday". INSET days are shown by name.
    school: {
      enabled: true,
      label: 'School',
      terms: [
        { name: 'Autumn 1', from: '2026-09-03', to: '2026-10-23' },
        { name: 'Autumn 2', from: '2026-11-02', to: '2026-12-18' },
      ],
      insetDays: ['2026-09-01', '2026-09-02'],
      // recurring reminders by weekday (0=Sun … 6=Sat)
      notes: {
        1: 'PE kit',
        5: 'Swimming',
      },
    },
  },

  // --- Refresh intervals (minutes) -----------------------------------------
  refresh: {
    weather: 15, calendar: 10, football: 180, trains: 1,
    iss: 180, astro: 30, f1: 180, music: 360, house: 30,
  },

  // --- Overnight behaviour -------------------------------------------------
  night: {
    faceFrom: '23:00',   // minimal amber night face starts
    faceTo:   '06:30',   // full dashboard returns
    // luminance ramp for the full dashboard: gain at noon vs after dark
    gainDay: 1.0,
    gainDusk: 0.55,
    gainLate: 0.35,      // from 21:30 until the night face takes over
  },

  // --- Backend -------------------------------------------------------------
  // On the deployed site this is same-origin. When previewing from a local
  // static server there are no functions, so borrow the live ones.
  apiBase: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? 'https://timbero-wall-dashboard.netlify.app/api'
    : '/api',
};

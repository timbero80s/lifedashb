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
    // helmet graphic — Alpine blue with an Argentine-sky stripe
    helmet: { shell: '#0093CC', stripe: '#9FD9F6', visor: '#101216' },
    link: 'https://www.formula1.com/en/results/2026/drivers',
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

    // School calendar. Terms and holidays are named ranges; `closures` are
    // single days inside a term when the school is shut to students.
    school: {
      enabled: true,
      label: 'School',
      // Sir William Borlase's Grammar School, 2026/27 — taken from
      // https://www.swbgs.com/term-dates
      terms: [
        { name: 'Autumn 1', from: '2026-09-04', to: '2026-10-16' },
        { name: 'Autumn 2', from: '2026-11-02', to: '2026-12-18' },
        { name: 'Spring 1', from: '2027-01-05', to: '2027-02-12' },
        { name: 'Spring 2', from: '2027-02-22', to: '2027-03-25' },
        { name: 'Summer 1', from: '2027-04-12', to: '2027-05-28' },
        { name: 'Summer 2', from: '2027-06-07', to: '2027-07-16' },
      ],
      holidays: [
        { name: 'Half-term',         from: '2026-10-17', to: '2026-11-01' },
        { name: 'Christmas holiday', from: '2026-12-19', to: '2027-01-03' },
        { name: 'Half-term',         from: '2027-02-13', to: '2027-02-21' },
        { name: 'Easter holiday',    from: '2027-03-26', to: '2027-04-11' },
        { name: 'Half-term',         from: '2027-05-29', to: '2027-06-06' },
        { name: 'Summer holiday',    from: '2027-07-17', to: '2027-09-01' },
      ],
      // days inside a term when the school is shut to students
      closures: [
        { date: '2026-09-01', label: 'INSET day' },
        { date: '2026-09-02', label: 'INSET day' },
        { date: '2026-10-19', label: 'INSET day' },
        { date: '2027-01-04', label: 'INSET day' },
        { date: '2027-05-03', label: 'Bank holiday' },
        { date: '2027-06-28', label: 'INSET day' },
      ],
      // Recurring weekday reminders, e.g. { 1: 'PE kit' } for Mondays.
      // Empty until you tell me what actually needs remembering.
      notes: {},
    },
  },

  // --- Refresh intervals (minutes) -----------------------------------------
  refresh: {
    weather: 15, calendar: 10, football: 180, trains: 2.5,
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

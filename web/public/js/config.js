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
    // Bins. `day` is the COLLECTION day (0=Sun, 1=Mon … 6=Sat); the card
    // prompts you the evening before. Schedule confirmed against the council's
    // own lookup for 16a Cannon Court Road (UPRN 100080352631):
    //   Fri 11 Sep  Garden + Recycling
    //   Fri 18 Sep  Refuse + Recycling
    //   Fri 25 Sep  Garden + Recycling
    // i.e. recycling every week; garden (green) and refuse (black) alternate.
    bins: {
      enabled: true,
      day: 5,                       // Friday
      anchorDate: '2026-09-11',     // a Friday the GREEN bin went out
      anchorType: 'green',
      alternating: [
        { key: 'green', label: 'Green', colour: '#30D158' },
        { key: 'black', label: 'Black', colour: '#6E6E73' },
      ],
      // food waste goes out alongside the recycling, so both are weekly
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
      // Two-week timetable cycle. Anchored on a week the user confirmed:
      // w/c Monday 7 Sep 2026 was Week B.
      // `pauseOverHolidays`: a two-week cycle normally resumes where it left
      // off rather than alternating through the holidays. Set false if the
      // school actually counts calendar weeks. (The two only disagree after
      // a holiday of an odd number of weeks — first one is Feb half-term.)
      cycle: {
        enabled: true,
        anchorMonday: '2026-09-07',
        anchorWeek: 'B',
        pauseOverHolidays: true,
      },

      // Weekday reminders (0=Sun … 6=Sat). From Teo's Year 9 timetable:
      // Games is period 5 Tuesday on the Field, and PE is in the Sports Hall
      // on Friday — in BOTH Week A and Week B, so kit days don't depend on
      // knowing which week it is.
      notes: {
        2: 'Games kit (outdoor)',
        4: 'Hockey kit',
        5: 'PE kit (indoor)',
      },
    },
  },

  // --- Refresh intervals (minutes) -----------------------------------------
  refresh: {
    weather: 15, calendar: 10, football: 60, trains: 5,
    iss: 180, astro: 30, f1: 180, music: 360, house: 30, quote: 360,
  },

  // --- Quote bar -----------------------------------------------------------
  // How often the quote changes. The backend serves a fresh set each day.
  quote: { rotateMinutes: 25 },

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
  // The Worker serves the static files and /api from the same origin, both in
  // `wrangler dev` and in production, so this is always relative.
  apiBase: '/api',
};

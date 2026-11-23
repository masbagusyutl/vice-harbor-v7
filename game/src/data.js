// Vice Harbor v7 — world data: districts, jobs, races, crew, ranks. All names original.
export const CITY = {
  min: -400, max: 400,
  waterX: 340,        // east of this is the harbor
  beachX: 300,        // sand strip between city and water
  roadStep: 90,       // road grid spacing
  roadWidth: 16,
};

// 10 named districts in a 5 x 2 grid (x bands of 160, z split at 0).
export const DISTRICTS = [
  { name: 'Fishmarket',   x0: -400, x1: -240, z0: -400, z1: 0,   base: '#5a4a3a', lit: '#ffd28a', accent: '#e8a34c', hMin: 8,  hMax: 22, signs: ['FISHMARKET', 'FRESH CATCH', 'PIER 9'] },
  { name: 'The Docks',    x0: -240, x1: -80,  z0: -400, z1: 0,   base: '#4a4a52', lit: '#ffb14c', accent: '#c98a2e', hMin: 10, hMax: 30, signs: ['DOCKS', 'CRANE 7', 'WAREHOUSE'] },
  { name: 'Marina Bay',   x0: -80,  x1: 80,   z0: -400, z1: 0,   base: '#3a4a5e', lit: '#8ad8ff', accent: '#3fa8d8', hMin: 14, hMax: 42, signs: ['MARINA', 'HOTEL MARINA', 'YACHT CLUB'] },
  { name: 'Old Pier',     x0: 80,   x1: 240,  z0: -400, z1: 0,   base: '#54423a', lit: '#ff9a6a', accent: '#d86a3a', hMin: 8,  hMax: 26, signs: ['OLD PIER', 'ARCADE', 'FUNFAIR'] },
  { name: 'Palm Court',   x0: 240,  x1: 400,  z0: -400, z1: 0,   base: '#6a5a3a', lit: '#ffe08a', accent: '#e8c84c', hMin: 10, hMax: 30, signs: ['PALM COURT', 'SUNSET BAR', 'PALMS HOTEL'] },
  { name: 'Foundry',      x0: -400, x1: -240, z0: 0,    z1: 400, base: '#3e3a3a', lit: '#ff7a3c', accent: '#b85a2a', hMin: 10, hMax: 34, signs: ['FOUNDRY', 'SCRAP YARD', 'GUN SHOP'] },
  { name: 'Neon Row',     x0: -240, x1: -80,  z0: 0,    z1: 400, base: '#2e2a4a', lit: '#ff2e88', accent: '#ff2e88', hMin: 18, hMax: 52, signs: ['NEON ROW', '24H TACOS', 'KARAOKE', 'NOODLE BAR'] },
  { name: 'Canal District', x0: -80, x1: 80,  z0: 0,    z1: 400, base: '#3a3a4a', lit: '#7affc8', accent: '#2ed88a', hMin: 12, hMax: 36, signs: ['CANAL', 'BRIDGE CAFE', 'FLOWERS'] },
  { name: 'Hillcrest',    x0: 80,   x1: 240,  z0: 0,    z1: 400, base: '#3a3f5e', lit: '#ffe9a8', accent: '#8a9ad8', hMin: 30, hMax: 72, signs: ['HILLCREST', 'SKYLINE', 'TOWER 12'] },
  { name: 'Sunset Strip', x0: 240,  x1: 400,  z0: 0,    z1: 400, base: '#5e3a4a', lit: '#ff6a8a', accent: '#d84a7a', hMin: 12, hMax: 34, signs: ['SUNSET STRIP', 'DRIVE-IN', 'MOTEL'] },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[6];
}

// Respect ranks.
export const RANKS = [
  { at: 0, name: 'Rookie' },
  { at: 50, name: 'Runner' },
  { at: 150, name: 'Hustler' },
  { at: 300, name: 'Enforcer' },
  { at: 500, name: 'Harbor Legend' },
];

export function rankFor(respect) {
  let r = RANKS[0];
  for (const cand of RANKS) if (respect >= cand.at) r = cand;
  return r;
}

// Gun shop stock.
export const WEAPONS = [
  { id: 'fists', name: 'Fists', price: 0, damage: 8, rate: 2.0 },
  { id: 'pistol', name: 'Pistol', price: 200, damage: 25, rate: 3.0 },
  { id: 'smg', name: 'SMG', price: 500, damage: 18, rate: 8.0 },
  { id: 'shotgun', name: 'Shotgun', price: 900, damage: 60, rate: 1.2 },
];

// Crew of three, each with a role bonus. Recruited by finishing jobs.
export const CREW = [
  { id: 'finn', name: 'Finn Okafor', role: 'Wheelman', bonus: '+15% race prizes', afterJob: 6 },
  { id: 'petra', name: 'Petra Lind', role: 'Lookout', bonus: 'Wanted fades twice as fast', afterJob: 3 },
  { id: 'ezra', name: 'Ezra Vale', role: 'Fixer', bonus: '+10% job cash', afterJob: 5 },
];

// Turf zones pay periodic income once captured.
export const TURF_ZONES = [
  { id: 'palm', name: 'Palm Court turf', x: 300, z: -200, r: 42, income: 30 },
  { id: 'neon', name: 'Neon Row turf', x: -160, z: 200, r: 42, income: 30 },
  { id: 'foundry', name: 'Foundry turf', x: -320, z: 200, r: 42, income: 30 },
];

// Street race routes: loops of waypoints on the road grid.
export const RACES = [
  { id: 'neon-mile', name: 'Neon Mile', laps: 2, prize: [400, 200, 100, 50],
    waypoints: [[-90, 90], [-90, 270], [0, 270], [0, 90]] },
  { id: 'coastline', name: 'Coastline Sprint', laps: 2, prize: [500, 250, 120, 60],
    waypoints: [[270, -270], [270, 180], [180, 180], [180, -270]] },
  { id: 'harbor-loop', name: 'Harbor Loop', laps: 1, prize: [600, 300, 150, 75],
    waypoints: [[-270, -270], [270, -270], [270, 270], [-270, 270]] },
];

export const RIVALS = [
  { name: 'Cole Brandt', color: 0x18c8e8, skill: 0.96 },
  { name: 'Sana Ito', color: 0xe83a8a, skill: 0.92 },
  { name: 'Drex Halloran', color: 0x9ae83a, skill: 0.88 },
];

// Seven story jobs. Stages: goto / pickup / dropoff / collect / stay / boat / race / escape / choice.
export const JOBS = [
  {
    id: 1, name: 'First Fare', giver: 'Dana Kestrel',
    briefing: 'Dana needs a driver. Pick up her client on Neon Row and drop them at Marina Bay. Drive clean.',
    reward: 150, respect: 10,
    stages: [
      { type: 'pickup', x: -180, z: 180, text: 'Pick up the client — Neon Row' },
      { type: 'dropoff', x: 0, z: -270, text: 'Drop the client — Marina Bay' },
    ],
  },
  {
    id: 2, name: 'Harbor Run', giver: 'Tomas Rye',
    briefing: 'A package for the Docks. The toll gate at the canal is run by the Harbor Boys — pay it, or smash through.',
    reward: 250, respect: 15,
    stages: [
      { type: 'goto', x: 0, z: 0, text: 'Reach the canal toll gate' },
      { type: 'choice', text: 'Toll gate: pay $50, or smash through?',
        options: [
          { label: 'Pay the $50 toll', effect: { cash: -50, wanted: 0, respect: 0 } },
          { label: 'Smash through the gate', effect: { cash: 0, wanted: 2, respect: 5 } },
        ] },
      { type: 'goto', x: -180, z: -270, text: 'Deliver the package — The Docks' },
    ],
  },
  {
    id: 3, name: 'Turf War', giver: 'Ilsa Maren',
    briefing: 'Palm Court belongs to the Harbor Boys. Take their corner and hold it until they back off.',
    reward: 300, respect: 25,
    stages: [
      { type: 'stay', x: 300, z: -200, r: 30, secs: 8, text: 'Hold the Palm Court corner (8s)' },
      { type: 'escape', text: 'Lose the heat — get your wanted level to zero' },
    ],
  },
  {
    id: 4, name: 'Night Market', giver: 'Nadia Sol',
    briefing: 'Three crates went missing in the Neon Row market. Find them on foot and bring them back to Nadia.',
    reward: 200, respect: 15,
    stages: [
      { type: 'collect', count: 3, spots: [[-180, 140], [-95, 220], [-180, 300]], text: 'Recover the crates in the night market (0/3)' },
      { type: 'goto', x: -180, z: 180, text: 'Return the crates to Nadia Sol' },
    ],
  },
  {
    id: 5, name: "Smuggler's Tide", giver: 'Ezra Vale',
    briefing: 'A boat is waiting at Old Pier. Run the three buoys in the harbor and bring her home. Watch the patrol.',
    reward: 350, respect: 25,
    stages: [
      { type: 'boat', x: 395, z: -70, text: 'Board the boat at Old Pier' },
      { type: 'boat', x: 430, z: 100, text: 'Round buoy 1' },
      { type: 'boat', x: 390, z: 260, text: 'Round buoy 2' },
      { type: 'boat', x: 395, z: -70, text: 'Bring the boat home' },
    ],
  },
  {
    id: 6, name: 'Neon Mile', giver: 'Cole Brandt',
    briefing: 'Cole Brandt says nobody beats him on Neon Row. Prove him wrong — two laps, three rivals, winner takes the pot.',
    reward: 400, respect: 30,
    stages: [
      { type: 'race', race: 'neon-mile', text: 'Win the Neon Mile — 2 laps' },
    ],
  },
  {
    id: 7, name: 'Harbor Crown', giver: 'Ilsa Maren',
    briefing: 'The big one. Win the Harbor Loop, then run the crown cargo to the pier. What you do with it is your call.',
    reward: 600, respect: 40,
    stages: [
      { type: 'race', race: 'harbor-loop', text: 'Win the Harbor Loop — 1 lap' },
      { type: 'goto', x: 300, z: -270, text: 'Collect the crown cargo — Old Pier' },
      { type: 'choice', text: 'The cargo: hand it over, or keep it?',
        options: [
          { label: 'Hand it over (+$600, +10 respect)', effect: { cash: 600, wanted: 0, respect: 10 } },
          { label: 'Keep the cargo (+$900, +3 wanted, +20 respect)', effect: { cash: 900, wanted: 3, respect: 20 } },
        ] },
      { type: 'goto', x: -360, z: -270, text: 'Lay low at the Fishmarket' },
    ],
  },
];

// Vice Harbor v7 — gameplay: player, jobs, races, taxi, turf, crew, wanted, economy.
// Written fresh in-session for gta6-01.
import * as THREE from 'three';
import { clamp, lerp, mulberry32, TAU, angleDiff } from './util.js';
import { JOBS, RACES, RIVALS, CREW, WEAPONS, TURF_ZONES, rankFor, districtAt } from './data.js';
import { collideCircle, inWater } from './city.js';
import { makeCarMesh, makeBoatMesh, Car, TrafficCar, PoliceCar, Helicopter } from './vehicles.js';

const SAVE_KEY = 'viceharbor-v7-save';
const TOTAL_UNITS = 7 + 3 + 24 + 3 + 3; // jobs + races + collectibles + turf + crew

export function createGame(G) {
  const rng = mulberry32(777);
  const P = G.player;

  // ---------- pedestrians ----------
  const pedColors = [0xd84a6a, 0x4ad8a8, 0xd8c84a, 0x6a8ad8, 0xe8e8e8, 0x8a4ad8, 0x4ad8d8, 0xd88a2e];
  const peds = [];
  function makePed(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 8),
      new THREE.MeshLambertMaterial({ color: pedColors[Math.floor(rng() * pedColors.length)] }));
    body.position.y = 0.95;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xd8a888 }));
    head.position.y = 2.0;
    g.add(head);
    g.position.set(x, 0, z);
    G.scene.add(g);
    return { mesh: g, pos: new THREE.Vector3(x, 0, z), target: null, speed: 1.2 + rng() * 1.2, down: 0, cool: 0 };
  }
  function spawnPeds(n, area) {
    for (let i = 0; i < n; i++) {
      const x = area ? area.x0 + rng() * (area.x1 - area.x0) : -360 + rng() * 660;
      const z = area ? area.z0 + rng() * (area.z1 - area.z0) : -360 + rng() * 720;
      if (x > 300) continue;
      peds.push(makePed(x, z));
    }
  }

  // ---------- collectibles ----------
  const coins = [];
  const coinMat = new THREE.MeshBasicMaterial({ color: 0xffd83a, toneMapped: false });
  const coinGeo = new THREE.TorusGeometry(0.9, 0.32, 8, 18);
  function spawnCoins() {
    const crng = mulberry32(4242);
    for (let i = 0; i < 24; i++) {
      const x = -360 + crng() * 640;
      const z = -360 + crng() * 700;
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.position.set(x, 1.4, z);
      m.rotation.x = Math.PI / 2;
      G.scene.add(m);
      coins.push({ mesh: m, x, z, got: false });
    }
  }

  // ---------- markers ----------
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffe83a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 36, 14, 1, true), markerMat);
  const markerRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe83a, toneMapped: false }));
  markerRing.rotation.x = Math.PI / 2;
  const markerGroup = new THREE.Group();
  markerGroup.add(markerBeam);
  markerGroup.add(markerRing);
  markerGroup.visible = false;
  G.scene.add(markerGroup);
  let markerPos = null;
  function showMarker(x, z) {
    markerPos = { x, z };
    markerGroup.position.set(x, 18, z);
    markerRing.position.y = -16.5;
    markerGroup.visible = true;
  }
  function hideMarker() { markerGroup.visible = false; markerPos = null; }

  // ---------- traffic / police / heli ----------
  const traffic = [];
  const police = [];
  let heli = null;
  let parkedCars = [];
  let playerBoat = null;
  const dockedBoats = [];

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const loop = G.city.roadLoops[Math.floor(rng() * G.city.roadLoops.length)];
      const color = [0xd83838, 0x2e6ad8, 0xe8c832, 0x38b878, 0xe8e8e8, 0x222228][Math.floor(rng() * 6)];
      const car = new TrafficCar(G, makeCarMesh(color), loop, 9 + rng() * 6);
      car.mesh.position.set(loop[0][0], 0, loop[0][1]);
      car.pos.set(loop[0][0], 0, loop[0][1]);
      traffic.push(car);
    }
  }
  function spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const x = -360 + Math.floor(rng() * 8) * 90 + 10;
      const z = -360 + Math.floor(rng() * 8) * 90 + (rng() < 0.5 ? -11 : 11);
      if (x > 300) continue;
      const color = [0xd83838, 0x2e6ad8, 0xe8c832, 0x38b878, 0xe8e8e8][Math.floor(rng() * 5)];
      const mesh = makeCarMesh(color);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() < 0.5 ? Math.PI : 0);
      G.scene.add(mesh);
      parkedCars.push({ mesh, x, z, taken: false });
    }
  }
  function spawnDockedBoats() {
    for (const [bx, bz] of [[395, -80], [410, -80], [425, -80]]) {
      const mesh = makeBoatMesh();
      mesh.position.set(bx, 0.2, bz);
      G.scene.add(mesh);
      dockedBoats.push({ mesh, x: bx, z: bz, taken: false });
    }
  }
  function spawnPoliceCar() {
    const a = rng() * TAU;
    const x = clamp(P.pos.x + Math.cos(a) * 80, -380, 320);
    const z = clamp(P.pos.z + Math.sin(a) * 80, -380, 380);
    const car = new PoliceCar(G, makeCarMesh(0x1a2a4a, { police: true }), x, z);
    police.push(car);
    return car;
  }
  function ensurePolice() {
    const want = Math.min(P.wanted, 5);
    while (police.length < want) spawnPoliceCar();
    while (police.length > want) {
      const c = police.pop();
      G.scene.remove(c.mesh);
    }
    if (P.wanted >= 4 && !heli) heli = new Helicopter(G);
    if (P.wanted < 4 && heli) { G.scene.remove(heli.mesh); heli = null; }
  }

  // ---------- economy / respect / wanted ----------
  function addCash(n) { P.cash = Math.max(0, P.cash + n); }
  function addRespect(n) {
    const before = rankFor(P.respect).name;
    P.respect += n;
    const after = rankFor(P.respect).name;
    if (after !== before) G.message(`Respect up — you are now ${after}`);
  }
  function setWanted(n) {
    P.wanted = clamp(Math.round(n), 0, 5);
    ensurePolice();
  }
  let wantedQuiet = 0;
  function updateWanted(dt) {
    let near = false;
    for (const c of police) {
      const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if (d < 80) near = true;
    }
    if (P.wanted > 0 && !near) {
      wantedQuiet += dt * (G.crew.includes('petra') ? 2 : 1);
      if (wantedQuiet > 10) {
        wantedQuiet = 0;
        setWanted(P.wanted - 1);
        if (P.wanted === 0) { G.stats.copsEscaped++; G.message('You lost the cops.'); }
      }
    } else wantedQuiet = 0;
  }

  // ---------- jobs ----------
  G.job = null;
  function startJob(id) {
    const def = JOBS.find((j) => j.id === id);
    if (!def) return false;
    G.job = { def, stage: 0, stayT: 0, collected: [], raceDone: false };
    G.message(`Job: ${def.name} — ${def.giver}`);
    enterStage();
    return true;
  }
  function enterStage() {
    const s = G.job.def.stages[G.job.stage];
    if (!s) { completeJob(); return; }
    G.job.stayT = 0;
    G.job.collected = [];
    if (s.type === 'goto' || s.type === 'pickup' || s.type === 'dropoff' || s.type === 'boat') {
      showMarker(s.x, s.z);
    } else if (s.type === 'collect') {
      G.job.spots = s.spots.map(([x, z]) => ({ x, z, got: false }));
      const next = G.job.spots.find((sp) => !sp.got);
      if (next) showMarker(next.x, next.z);
    } else if (s.type === 'stay') {
      showMarker(s.x, s.z);
    } else if (s.type === 'race') {
      startRace(s.race, true);
    } else if (s.type === 'escape') {
      hideMarker();
    } else if (s.type === 'choice') {
      hideMarker();
      G.choice = { text: s.text, options: s.options };
      G.mode = 'choice';
    }
    G.hudDirty = true;
  }
  function advanceStage() {
    G.job.stage++;
    if (G.job.stage >= G.job.def.stages.length) completeJob();
    else enterStage();
  }
  function completeJob() {
    const def = G.job.def;
    const mult = G.crew.includes('ezra') ? 1.1 : 1;
    const cash = Math.round(def.reward * mult);
    addCash(cash);
    addRespect(def.respect);
    G.stats.jobsDone.push(def.id);
    const crew = CREW.find((c) => c.afterJob === def.id);
    if (crew && !G.crew.includes(crew.id)) {
      G.crew.push(crew.id);
      G.message(`${crew.name} joined your crew — ${crew.role} (${crew.bonus})`);
    }
    hideMarker();
    G.job = null;
    G.mode = 'jobdone';
    G.jobDoneInfo = { name: def.name, cash, respect: def.respect };
    G.message(`JOB COMPLETE: ${def.name} — +$${cash}`);
    saveGame();
  }
  function updateJob(dt) {
    if (!G.job) return;
    const s = G.job.def.stages[G.job.stage];
    if (!s) return;
    const px = P.pos.x;
    const pz = P.pos.z;
    const near = (x, z, r) => Math.hypot(px - x, pz - z) < r;
    if (s.type === 'goto' || s.type === 'pickup' || s.type === 'dropoff') {
      if (near(s.x, s.z, 7)) advanceStage();
    } else if (s.type === 'boat') {
      if (!P.boat) { if (near(s.x, s.z, 10)) { /* walk to pier first */ } }
      else if (near(s.x, s.z, 9)) advanceStage();
    } else if (s.type === 'collect') {
      for (const sp of G.job.spots) {
        if (!sp.got && near(sp.x, sp.z, 4)) {
          sp.got = true;
          G.job.collected.push(sp);
          G.message(`Crate recovered (${G.job.collected.length}/${s.count})`);
          const next = G.job.spots.find((o) => !o.got);
          if (next) showMarker(next.x, next.z);
          else advanceStage();
          break;
        }
      }
    } else if (s.type === 'stay') {
      if (near(s.x, s.z, s.r)) {
        G.job.stayT += dt;
        if (G.job.stayT >= s.secs) {
          G.turf[s.id || 'palm'] = true;
          advanceStage();
        }
      }
    } else if (s.type === 'escape') {
      if (P.wanted === 0) advanceStage();
    } else if (s.type === 'race') {
      if (G.job.raceDone) advanceStage();
    }
  }
  function chooseOption(i) {
    const s = G.job.def.stages[G.job.stage];
    const opt = s.options[i];
    if (!opt) return;
    if (opt.effect.cash) addCash(opt.effect.cash);
    if (opt.effect.respect) addRespect(opt.effect.respect);
    if (opt.effect.wanted) setWanted(P.wanted + opt.effect.wanted);
    G.message(`You chose: ${opt.label}`);
    G.choice = null;
    G.mode = 'play';
    advanceStage();
  }

  // ---------- races ----------
  G.race = null;
  function startRace(raceId, isJob) {
    const def = RACES.find((r) => r.id === raceId);
    const start = def.waypoints[0];
    const dir = Math.atan2(def.waypoints[1][1] - start[1], def.waypoints[1][0] - start[0]);
    // place player car at the line
    if (!P.car) {
      const mesh = makeCarMesh(0xff7a1e);
      const car = new Car(G, mesh, start[0] - Math.cos(dir) * 6, start[1] - Math.sin(dir) * 6, dir);
      car.isPlayer = true;
      P.car = car;
      P.onFoot = false;
      P.pos.copy(car.pos);
      P.heading = dir;
      playerMesh.visible = false;
    } else {
      P.car.pos.set(start[0] - Math.cos(dir) * 6, 0, start[1] - Math.sin(dir) * 6);
      P.car.heading = dir;
      P.car.speed = 0;
      P.car.damage = 0;
      P.car.stalled = false;
      P.pos.copy(P.car.pos);
      P.heading = dir;
      playerMesh.visible = false;
    }
    const rivals = RIVALS.map((r, i) => {
      const mesh = makeCarMesh(r.color);
      const bx = start[0] - Math.cos(dir) * (10 + i * 7);
      const bz = start[1] - Math.sin(dir) * (10 + i * 7) + (i % 2 === 0 ? 5 : -5);
      const car = new Car(G, mesh, bx, bz, dir);
      car.rivalName = r.name;
      car.skill = r.skill;
      car.cp = 0;
      car.lap = 1;
      return car;
    });
    G.race = { def, rivals, lap: 1, cp: 0, isJob, finished: false, place: 0, standings: [], t: 0 };
    G.message(`Race: ${def.name} — ${def.laps} lap${def.laps > 1 ? 's' : ''}. Beat ${RIVALS.map((r) => r.name).join(', ')}.`);
    hideMarker();
    showMarker(def.waypoints[1][0], def.waypoints[1][1]);
  }
  function raceProgress(car, cpIdx, lap) {
    const def = G.race.def;
    const [tx, tz] = def.waypoints[(cpIdx + 1) % def.waypoints.length];
    const d = Math.hypot(tx - car.pos.x, tz - car.pos.z);
    return lap * 100000 + cpIdx * 10000 - d;
  }
  function updateRace(dt) {
    const R = G.race;
    if (!R || R.finished) return;
    R.t += dt;
    const def = R.def;
    // rivals follow the loop
    for (const rv of R.rivals) {
      if (rv.finished) continue;
      const next = def.waypoints[(rv.cp + 1) % def.waypoints.length];
      const dx = next[0] - rv.pos.x;
      const dz = next[1] - rv.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 9) {
        rv.cp = (rv.cp + 1) % def.waypoints.length;
        if (rv.cp === 0) { rv.lap = (rv.lap || 1) + 1; }
      }
      const want = Math.atan2(dz, dx);
      const diff = angleDiff(rv.heading, want);
      const speed = 22 * rv.skill * (0.92 + 0.16 * Math.sin(R.t * 0.7 + rv.pos.x));
      rv.step(dt, rv.speed < speed ? 1 : 0.2, clamp(diff * 2, -1, 1));
      rv.cp = rv.cp || 0;
      rv.lap = rv.lap || 1;
    }
    // player checkpoint
    const next = def.waypoints[(R.cp + 1) % def.waypoints.length];
    if (Math.hypot(next[0] - P.pos.x, next[1] - P.pos.z) < 11) {
      R.cp = (R.cp + 1) % def.waypoints.length;
      if (R.cp === 0) R.lap++;
      const nn = def.waypoints[(R.cp + 1) % def.waypoints.length];
      showMarker(nn[0], nn[1]);
    }
    // standings
    const entries = [{ name: 'You', prog: raceProgress(P.car || { pos: P.pos }, R.cp, R.lap) }];
    for (const rv of R.rivals) entries.push({ name: rv.rivalName, prog: raceProgress(rv, rv.cp || 0, rv.lap || 1) });
    entries.sort((a, b) => b.prog - a.prog);
    R.standings = entries.map((e, i) => ({ place: i + 1, name: e.name }));
    const playerDone = R.lap > def.laps;
    const rivalsDone = R.rivals.filter((rv) => (rv.lap || 1) > def.laps).length;
    if (playerDone || rivalsDone >= 3) {
      R.finished = true;
      const place = R.standings.find((s) => s.name === 'You').place;
      R.place = place;
      const mult = G.crew.includes('finn') ? 1.15 : 1;
      const prize = Math.round(def.prize[place - 1] * mult);
      addCash(prize);
      addRespect(place === 1 ? 20 : 8);
      if (place === 1) G.stats.racesWon.push(def.id);
      G.message(`Race finished — ${def.name}: you placed ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} (+$${prize})`);
      hideMarker();
      if (R.isJob && G.job) G.job.raceDone = true;
      setTimeout(() => { if (G.race === R) G.race = null; }, 4000);
    }
  }

  // ---------- taxi ----------
  G.taxi = { active: false, phase: '', pickup: null, dest: null, fare: 0 };
  function startTaxi() {
    if (!P.car || G.taxi.active) return false;
    const a = rng() * TAU;
    const d = 70 + rng() * 90;
    const px = clamp(P.pos.x + Math.cos(a) * d, -360, 300);
    const pz = clamp(P.pos.z + Math.sin(a) * d, -360, 360);
    G.taxi = { active: true, phase: 'pickup', pickup: { x: px, z: pz }, dest: null, fare: 0 };
    showMarker(px, pz);
    G.message('Taxi fare: pick up the passenger.');
    return true;
  }
  function updateTaxi() {
    const T = G.taxi;
    if (!T.active) return;
    if (!P.car) { T.active = false; hideMarker(); G.message('Fare cancelled — you left the car.'); return; }
    if (T.phase === 'pickup' && Math.hypot(P.pos.x - T.pickup.x, P.pos.z - T.pickup.z) < 7) {
      const a = rng() * TAU;
      const d = 90 + rng() * 120;
      T.dest = { x: clamp(P.pos.x + Math.cos(a) * d, -360, 300), z: clamp(P.pos.z + Math.sin(a) * d, -360, 360) };
      T.fare = Math.round(40 + Math.hypot(T.dest.x - T.pickup.x, T.dest.z - T.pickup.z) * 0.25);
      T.phase = 'dest';
      showMarker(T.dest.x, T.dest.z);
      G.message(`Passenger aboard — drop them off (+$${T.fare}).`);
    } else if (T.phase === 'dest' && Math.hypot(P.pos.x - T.dest.x, P.pos.z - T.dest.z) < 7) {
      addCash(T.fare);
      addRespect(2);
      G.stats.fares++;
      G.message(`Fare complete — +$${T.fare}`);
      G.taxi.active = false;
      hideMarker();
    }
  }

  // ---------- turf ----------
  G.turf = {};
  let turfTimer = 0;
  function updateTurf(dt) {
    for (const zone of TURF_ZONES) {
      if (G.turf[zone.id]) continue;
      if (Math.hypot(P.pos.x - zone.x, P.pos.z - zone.z) < zone.r) {
        zone.progress = (zone.progress || 0) + dt;
        if (zone.progress >= 8) {
          G.turf[zone.id] = true;
          G.message(`Turf captured: ${zone.name} — +$${zone.income} every 30s`);
        }
      } else zone.progress = 0;
    }
    turfTimer += dt;
    if (turfTimer >= 30) {
      turfTimer = 0;
      const owned = Object.keys(G.turf).length;
      if (owned > 0) {
        const inc = owned * 30;
        addCash(inc);
        G.message(`Turf income +$${inc}`);
      }
    }
  }

  // ---------- collectibles ----------
  function updateCoins(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.got) continue;
      c.mesh.rotation.y = t * 1.5 + i;
      c.mesh.position.y = 1.4 + Math.sin(t * 2 + i) * 0.25;
      if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.5) {
        c.got = true;
        c.mesh.visible = false;
        G.stats.collectibles.push(i);
        addCash(25);
        addRespect(1);
        G.message(`Harbor coin found (${G.stats.collectibles.length}/24) — +$25`);
      }
    }
  }

  // ---------- pedestrians ----------
  function updatePeds(dt) {
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        ped.mesh.rotation.x = -Math.PI / 2;
        if (ped.down <= 0) {
          ped.mesh.rotation.x = 0;
          ped.pos.set(-360 + rng() * 660, 0, -360 + rng() * 720);
        }
        continue;
      }
      ped.cool = Math.max(0, ped.cool - dt);
      if (!ped.target || Math.hypot(ped.target.x - ped.pos.x, ped.target.z - ped.pos.z) < 3) {
        ped.target = { x: clamp(ped.pos.x + (rng() - 0.5) * 160, -370, 300), z: clamp(ped.pos.z + (rng() - 0.5) * 160, -370, 370) };
      }
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.pos.x += (dx / d) * ped.speed * dt;
      ped.pos.z += (dz / d) * ped.speed * dt;
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = Math.atan2(dx, dz);
      // hit by player car?
      if (P.car && Math.abs(P.car.speed) > 8 && Math.hypot(P.car.pos.x - ped.pos.x, P.car.pos.z - ped.pos.z) < 2.6 && ped.cool <= 0) {
        ped.down = 3;
        ped.cool = 5;
        setWanted(P.wanted + 1);
        G.message('You hit a pedestrian! Wanted +1');
      }
    }
  }

  // ---------- player ----------
  const playerMesh = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a1e, emissive: 0x2a0e00 }));
    body.position.y = 0.95;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xd8a888 }));
    head.position.y = 2.0;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.18, 10),
      new THREE.MeshLambertMaterial({ color: 0x222228 }));
    cap.position.y = 2.28;
    g.add(cap);
    G.scene.add(g);
    return g;
  })();

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const c of [...traffic, ...parkedCars.map((p) => ({ mesh: p.mesh, pos: new THREE.Vector3(p.x, 0, p.z), parked: p }))]) {
      if (c.parked && c.parked.taken) continue;
      const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  function enterCar() {
    const c = nearestCar(5);
    if (!c) return false;
    if (c.parked) {
      c.parked.taken = true;
      const car = new Car(G, c.mesh, c.x, c.z, 0);
      car.isPlayer = true;
      P.car = car;
      P.onFoot = false;
      P.pos.copy(car.pos);
      G.message('You took the parked car.');
    } else {
      // steal a traffic car
      const idx = traffic.indexOf(c);
      if (idx >= 0) traffic.splice(idx, 1);
      c.isPlayer = true;
      P.car = c;
      P.onFoot = false;
      P.pos.copy(c.pos);
      P.heading = c.heading;
      setWanted(P.wanted + 1);
      G.stats.carsStolen++;
      G.message('Car stolen! Wanted +1');
    }
    playerMesh.visible = false;
    return true;
  }
  function exitCar() {
    if (!P.car) return;
    const car = P.car;
    P.car = null;
    P.onFoot = true;
    P.pos.set(car.pos.x + Math.cos(car.heading + Math.PI / 2) * 3, 0, car.pos.z + Math.sin(car.heading + Math.PI / 2) * 3);
    P.heading = car.heading;
    playerMesh.visible = true;
    if (car.isPlayer && !car.parked) {
      // leave it as a parked player car (stays in world, non-traffic)
      car.isPlayer = false;
      parkedCars.push({ mesh: car.mesh, x: car.pos.x, z: car.pos.z, taken: true, parkedCar: car });
    }
  }
  function boardBoat() {
    const b = dockedBoats.find((d) => !d.taken && P.pos.x > 335 && Math.hypot(d.x - P.pos.x, d.z - P.pos.z) < 16);
    if (!b) return false;
    b.taken = true;
    playerBoat = new Car(G, b.mesh, b.x, b.z, 0);
    playerBoat.isBoat = true;
    P.boat = playerBoat;
    P.onFoot = false;
    P.pos.copy(playerBoat.pos);
    playerMesh.visible = false;
    G.message('You took the boat.');
    return true;
  }
  function exitBoat() {
    if (!P.boat) return;
    const boat = P.boat;
    P.boat = null;
    P.onFoot = true;
    // step onto the pier
    P.pos.set(380, 0, clamp(boat.pos.z, -100, 100));
    playerMesh.visible = true;
    boat.isBoat = false;
    dockedBoats.push({ mesh: boat.mesh, x: boat.pos.x, z: boat.pos.z, taken: false });
  }

  function movePlayer(dt) {
    const k = G.input.keys;
    if (P.boat) {
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const steer = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
      P.boat.speed = clamp(P.boat.speed + throttle * 12 * dt, -6, 20);
      if (Math.abs(P.boat.speed) > 0.5) P.boat.heading += steer * 1.4 * dt * Math.sign(P.boat.speed);
      const f = P.boat.forward();
      P.boat.pos.x = clamp(P.boat.pos.x + f.x * P.boat.speed * dt, 338, 560);
      P.boat.pos.z = clamp(P.boat.pos.z + f.z * P.boat.speed * dt, -390, 390);
      P.boat.mesh.position.copy(P.boat.pos);
      P.boat.mesh.rotation.y = -P.boat.heading;
      P.pos.copy(P.boat.pos);
      P.heading = P.boat.heading;
      return;
    }
    if (P.car) {
      let throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      let steer = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
      // Staged race shot: cruise at ~20 and follow the race route, so the car
      // reads as moving, stays P1, and the pack holds together for the shot.
      if (G.autoDrive) {
        throttle = P.car.speed < 20 ? 1 : 0;
        if (G.race) {
          const def = G.race.def;
          const [tx, tz] = def.waypoints[(G.race.cp + 1) % def.waypoints.length];
          const want = Math.atan2(tz - P.pos.z, tx - P.pos.x);
          steer = clamp(angleDiff(P.car.heading, want) * 2, -1, 1);
        }
      }
      const before = P.car.speed;
      P.car.step(dt, throttle, steer);
      const moved = Math.hypot(P.car.pos.x - P.pos.x, P.car.pos.z - P.pos.z);
      G.stats.distance += moved;
      P.pos.copy(P.car.pos);
      P.heading = P.car.heading;
      // bump traffic cars
      for (const t of traffic) {
        const d = Math.hypot(t.pos.x - P.car.pos.x, t.pos.z - P.car.pos.z);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / 2;
          const nx = (t.pos.x - P.car.pos.x) / d;
          const nz = (t.pos.z - P.car.pos.z) / d;
          t.pos.x += nx * push;
          t.pos.z += nz * push;
          if (Math.abs(P.car.speed) > 10) { P.car.damage += 4; }
        }
      }
      if (Math.abs(before) > 12 && Math.abs(P.car.speed) < 2) G.message('Crash!');
      return;
    }
    // on foot
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = run ? 9 : 5.5;
    const yaw = G.camYaw || 0;
    const mx = -Math.sin(yaw) * fwd + Math.cos(yaw) * strafe;
    const mz = -Math.cos(yaw) * fwd - Math.sin(yaw) * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      P.pos.x += (mx / len) * speed * dt;
      P.pos.z += (mz / len) * speed * dt;
      P.heading = Math.atan2(mx, mz);
      G.stats.distance += speed * dt;
    }
    if (inWater(P.pos.x, P.pos.z)) {
      P.pos.x = Math.min(P.pos.x, 338);
    }
    P.pos.x = clamp(P.pos.x, -395, 395);
    P.pos.z = clamp(P.pos.z, -395, 395);
    collideCircle(P.pos, 0.8, G.city.colliders);
    playerMesh.position.copy(P.pos);
    playerMesh.rotation.y = P.heading;
    // walk bob
    playerMesh.position.y = len > 0.01 ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.08 : 0;
  }

  // ---------- shooting ----------
  let shootCool = 0;
  const raycaster = new THREE.Raycaster();
  function shoot() {
    const w = WEAPONS.find((x) => x.id === P.weapon) || WEAPONS[0];
    if (shootCool > 0 || !G.camera) return false;
    shootCool = 1 / w.rate;
    G.onShoot?.();
    G.scene.updateMatrixWorld(true);
    raycaster.set(G.camera.position, G.camera.getWorldDirection(new THREE.Vector3()));
    const meshes = police.map((c) => c.mesh);
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length > 0 && hits[0].distance < 90) {
      let obj = hits[0].object;
      while (obj && !police.find((c) => c.mesh === obj)) obj = obj.parent;
      const car = police.find((c) => c.mesh === obj);
      if (car) {
        car.health -= w.damage;
        G.message(`Hit police car (${Math.max(0, Math.round(car.health))} hp)`);
        if (car.health <= 0) {
          const idx = police.indexOf(car);
          police.splice(idx, 1);
          G.scene.remove(car.mesh);
          setWanted(P.wanted + 2);
          G.message('Police car destroyed! Wanted +2');
        }
      }
    }
    return true;
  }

  // ---------- police behaviour / busted / wasted ----------
  let bustT = 0;
  function updatePolice(dt) {
    ensurePolice();
    let closest = 1e9;
    for (const c of police) {
      const d = c.stepAI(dt, P.pos);
      closest = Math.min(closest, d);
      // ram damage on foot
      if (P.onFoot && d < 2.6) {
        P.health -= 14 * dt;
        G.message('The police are on you!');
      }
      if (P.car && d < 4.6) {
        P.car.damage += 6 * dt;
      }
    }
    if (heli) heli.step(dt, P.pos);
    // busted?
    const speed = P.car ? Math.abs(P.car.speed) : 0;
    if (closest < 3.6 && (P.onFoot || speed < 3)) {
      bustT += dt;
      if (bustT > 2.5) {
        bustT = 0;
        const fine = Math.round(P.cash * 0.15);
        addCash(-fine);
        setWanted(0);
        P.health = 100;
        G.mode = 'busted';
        G.bustedInfo = { fine };
        teleport(-160, 180);
        G.message(`BUSTED — fined $${fine}`);
      }
    } else bustT = 0;
    if (P.health <= 0) {
      P.health = 100;
      const lost = Math.round(P.cash * 0.1);
      addCash(-lost);
      setWanted(0);
      G.mode = 'wasted';
      G.wastedInfo = { lost };
      teleport(-320, 200);
      G.message(`WASTED — lost $${lost}`);
    }
  }

  // ---------- gun shop / respray ----------
  const SHOP_POS = { x: -320, z: 200 };
  const RESPRAY_POS = { x: -160, z: -270 };
  function nearShop() { return Math.hypot(P.pos.x - SHOP_POS.x, P.pos.z - SHOP_POS.z) < 9; }
  function nearRespray() { return P.car && Math.hypot(P.pos.x - RESPRAY_POS.x, P.pos.z - RESPRAY_POS.z) < 9; }
  function buyWeapon(id) {
    const w = WEAPONS.find((x) => x.id === id);
    if (!w || P.ownedWeapons.includes(id)) return false;
    if (P.cash < w.price) { G.message(`Not enough cash for the ${w.name} ($${w.price}).`); return false; }
    addCash(-w.price);
    P.ownedWeapons.push(id);
    P.weapon = id;
    G.message(`Bought the ${w.name}.`);
    return true;
  }
  function respray() {
    if (!nearRespray() || P.cash < 100) return false;
    addCash(-100);
    const colors = [0xff7a1e, 0x18c8e8, 0xe83a8a, 0x9ae83a, 0xe8c832];
    P.car.mesh.userData.bodyMat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    G.message('Respray done — $100.');
    return true;
  }

  // ---------- save / load ----------
  function saveGame() {
    try {
      const data = {
        cash: P.cash, respect: P.respect, health: P.health, weapon: P.weapon,
        ownedWeapons: P.ownedWeapons, jobsDone: G.stats.jobsDone, racesWon: G.stats.racesWon,
        collectibles: G.stats.collectibles, turf: Object.keys(G.turf), crew: G.crew,
        fares: G.stats.fares, carsStolen: G.stats.carsStolen, distance: Math.round(G.stats.distance),
        hour: G.hour, pos: [P.pos.x, P.pos.z],
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }
  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      P.cash = d.cash; P.respect = d.respect; P.health = d.health ?? 100; P.weapon = d.weapon;
      P.ownedWeapons = d.ownedWeapons || ['fists'];
      G.stats.jobsDone = d.jobsDone || [];
      G.stats.racesWon = d.racesWon || [];
      G.stats.collectibles = d.collectibles || [];
      G.stats.fares = d.fares || 0;
      G.stats.carsStolen = d.carsStolen || 0;
      G.stats.distance = d.distance || 0;
      G.turf = {};
      for (const id of d.turf || []) G.turf[id] = true;
      G.crew = d.crew || [];
      for (const i of G.stats.collectibles) if (coins[i]) { coins[i].got = true; coins[i].mesh.visible = false; }
      if (d.hour) G.city.setHour(d.hour);
      if (d.pos) teleport(d.pos[0], d.pos[1]);
      return true;
    } catch (e) { return false; }
  }
  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }
  function percentComplete() {
    const done = G.stats.jobsDone.length + G.stats.racesWon.length + G.stats.collectibles.length
      + Object.keys(G.turf).length + G.crew.length;
    return Math.round((done / TOTAL_UNITS) * 100);
  }

  // ---------- teleport / helpers for scenes & tests ----------
  function setJobState(jobId, stage) {
    const def = JOBS.find((j) => j.id === jobId);
    if (!def) return false;
    G.job = { def, stage, stayT: 0, collected: [], raceDone: false };
    enterStage();
    return true;
  }
  function teleport(x, z) {
    P.pos.set(x, 0, z);
    if (P.car) { P.car.pos.set(x, 0, z); P.car.speed = 0; }
    if (P.boat) { P.boat.pos.set(x, 0, z); P.boat.speed = 0; }
    playerMesh.position.copy(P.pos);
  }
  function givePlayerCar(color, x, z, heading) {
    const mesh = makeCarMesh(color);
    const car = new Car(G, mesh, x, z, heading);
    car.isPlayer = true;
    P.car = car;
    P.onFoot = false;
    P.pos.copy(car.pos);
    P.heading = heading;
    playerMesh.visible = false;
    return car;
  }

  // ---------- init ----------
  function init() {
    spawnPeds(34);
    spawnCoins();
    spawnTraffic(10);
    spawnParked(9);
    spawnDockedBoats();
    teleport(-160, 180);
    P.heading = 0;
    playerMesh.position.copy(P.pos);
  }

  // ---------- main step ----------
  let markerPulse = 0;
  function step(dt) {
    movePlayer(dt);
    for (const t of traffic) t.stepAI(dt, [...traffic, P.car].filter(Boolean));
    updatePolice(dt);
    updatePeds(dt);
    updateJob(dt);
    updateRace(dt);
    updateTaxi();
    updateTurf(dt);
    updateCoins(dt);
    updateWanted(dt);
    if (G.hour !== undefined) G.city.setHour(G.hour + dt / 240);
    markerPulse += dt;
    if (markerGroup.visible) {
      markerBeam.material.opacity = 0.32 + Math.sin(markerPulse * 4) * 0.1;
      markerRing.rotation.z = markerPulse * 0.8;
      markerRing.position.y = -16.5 + Math.sin(markerPulse * 2) * 0.4;
    }
    shootCool = Math.max(0, shootCool - dt);
    G.city.update(dt);
  }

  return {
    init, step, startJob, chooseOption, startRace, startTaxi, shoot,
    enterCar, exitCar, boardBoat, exitBoat, buyWeapon, respray, nearShop, nearRespray,
    saveGame, loadGame, hasSave, percentComplete, teleport, givePlayerCar,
    setWanted, addCash, addRespect, ensurePolice, setJobState, spawnPeds,
    get peds() { return peds; },
    get traffic() { return traffic; },
    get police() { return police; },
    get parkedCars() { return parkedCars; },
    get coins() { return coins; },
    get heli() { return heli; },
    get playerMesh() { return playerMesh; },
    get markerPos() { return markerPos; },
    get dockedBoats() { return dockedBoats; },
  };
}

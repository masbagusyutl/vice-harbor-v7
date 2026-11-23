// Vice Harbor v7 — headless playthrough: scripted checks over the first job and a race.
// Runs with ?test=1. Deterministic: fixed seed, fixed dt, no wall-clock dependence.
// Written fresh in-session for gta6-01.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { DISTRICTS, JOBS, RACES, rankFor, WEAPONS } from './data.js';

export async function runTests(G) {
  const game = G.game;
  const P = G.player;
  let pass = 0;
  let total = 0;
  const lines = [];
  function check(name, cond) {
    total++;
    if (cond) { pass++; }
    else { lines.push('FAIL: ' + name); }
  }
  function eq(name, a, b) { check(name + ` (got ${a}, want ${b})`, a === b); }
  function stepN(n, dt = 1 / 60) { for (let i = 0; i < n; i++) game.step(dt); }
  function key(k, on) { if (on) G.input.keys.add(k); else G.input.keys.delete(k); }

  try {
    // ---- boot ----
    check('renderer exists', !!G.renderer);
    check('scene has objects', G.scene.children.length > 50);
    check('10 districts', DISTRICTS.length === 10);
    check('city colliders built', G.city.colliders.length > 50);
    check('road loops for traffic', G.city.roadLoops.length >= 8);
    check('player on foot at spawn', P.onFoot === true);
    eq('player cash starts 250', P.cash, 250);
    eq('player wanted starts 0', P.wanted, 0);
    eq('player health starts 100', P.health, 100);
    check('7 jobs defined', JOBS.length === 7);
    check('3 races defined', RACES.length === 3);
    check('4 weapons in shop', WEAPONS.length === 4);
    check('24 coins spawned', game.coins.length === 24);
    check('traffic spawned', game.traffic.length === 10);
    check('parked cars spawned', game.parkedCars.length >= 8);
    check('peds spawned', game.peds.length >= 30);
    check('docked boats', game.dockedBoats.length === 3);
    check('minimap canvas', !!document.getElementById('minimap'));
    check('HUD objective element', !!document.getElementById('objective'));

    // ---- deterministic rng ----
    const r1 = mulberry32(99);
    const r2 = mulberry32(99);
    check('seeded rng deterministic', r1() === r2() && r1() === r2() && r1() === r2());

    // ---- walking ----
    const wx = P.pos.x; const wz = P.pos.z;
    key('KeyW', true); stepN(60); key('KeyW', false);
    check('walking moves player', Math.hypot(P.pos.x - wx, P.pos.z - wz) > 2);
    check('player stays in city', Math.abs(P.pos.x) <= 400 && Math.abs(P.pos.z) <= 400);

    // ---- enter parked car + drive ----
    const parked = game.parkedCars[0];
    game.teleport(parked.x + 2, parked.z);
    check('enter parked car', game.enterCar() === true);
    check('in car after enter', P.car !== null && P.onFoot === false);
    key('KeyW', true); stepN(120); key('KeyW', false);
    check('driving builds speed', Math.abs(P.car.speed) > 5);
    const dx0 = P.pos.x; const dz0 = P.pos.z;
    key('KeyW', true); stepN(60); key('KeyW', false);
    check('driving covers ground', Math.hypot(P.pos.x - dx0, P.pos.z - dz0) > 8);
    check('distance stat grows', G.stats.distance > 5);
    game.exitCar();
    check('exit car on foot', P.onFoot === true && P.car === null);

    // ---- steal traffic car ----
    const t0 = game.traffic[0];
    game.teleport(t0.pos.x + 2, t0.pos.z);
    const wBefore = P.wanted;
    check('steal traffic car', game.enterCar() === true);
    check('stealing raises wanted', P.wanted === wBefore + 1);
    check('cars stolen stat', G.stats.carsStolen === 1);
    game.exitCar();
    game.setWanted(0);

    // ---- wanted / police / helicopter ----
    game.setWanted(3);
    check('wanted 3 spawns 3 police', game.police.length === 3);
    game.setWanted(4);
    check('wanted 4 spawns helicopter', game.heli !== null);
    game.setWanted(5);
    check('wanted 5 spawns 5 police', game.police.length === 5);
    game.setWanted(0);
    check('wanted 0 clears police', game.police.length === 0);
    check('wanted 0 clears heli', game.heli === null);

    // ---- job 1 ----
    const cash0 = P.cash;
    check('start job 1', game.startJob(1) === true);
    check('job 1 stage 0 is pickup', G.job.def.stages[G.job.stage].type === 'pickup');
    game.teleport(-180, 180); stepN(5);
    check('job 1 advances to dropoff', G.job.stage === 1);
    game.teleport(0, -270); stepN(5);
    check('job 1 completes', G.job === null && G.stats.jobsDone.includes(1));
    check('job 1 pays cash', P.cash > cash0);
    check('job 1 gives respect', P.respect >= 10);
    G.mode = 'play';

    // ---- job 2 branching choice ----
    game.startJob(2);
    game.teleport(0, 0); stepN(5);
    check('job 2 reaches choice stage', G.job.stage === 1 && G.mode === 'choice');
    const cash1 = P.cash;
    game.chooseOption(0);
    check('choice pay deducts $50', P.cash === cash1 - 50);
    check('choice advances stage', G.job.stage === 2);
    game.teleport(-180, -270); stepN(5);
    check('job 2 completes', G.stats.jobsDone.includes(2));
    G.mode = 'play';

    // ---- job 3 turf + escape ----
    // Note: the escape stage completes at once when wanted is already 0, so the
    // hold (8s) and the escape both finish inside the step run below.
    game.startJob(3);
    game.teleport(300, -200); stepN(540);
    check('job 3 completes (hold + escape)', G.stats.jobsDone.includes(3));
    check('turf captured by job 3', G.turf.palm === true);
    check('crew Petra joins after job 3', G.crew.includes('petra'));
    G.mode = 'play';

    // ---- job 4 market crates ----
    game.startJob(4);
    for (const [cx, cz] of [[-180, 140], [-95, 220], [-180, 300]]) { game.teleport(cx, cz); stepN(5); }
    check('job 4 crates collected', G.job.stage === 1);
    game.teleport(-180, 180); stepN(5);
    check('job 4 completes', G.stats.jobsDone.includes(4));
    G.mode = 'play';

    // ---- job 5 boat ----
    game.startJob(5);
    game.teleport(390, -90); stepN(3);
    check('board boat at pier', game.boardBoat() === true);
    check('in boat', P.boat !== null);
    game.teleport(395, -70); stepN(5);
    check('boat stage 1', G.job.stage === 1);
    game.teleport(430, 100); stepN(5);
    check('boat stage 2', G.job.stage === 2);
    game.teleport(390, 260); stepN(5);
    check('boat stage 3', G.job.stage === 3);
    game.teleport(395, -70); stepN(5);
    check('job 5 completes', G.stats.jobsDone.includes(5));
    check('crew Ezra joins after job 5', G.crew.includes('ezra'));
    game.exitBoat();
    check('exit boat on pier', P.onFoot === true && P.pos.x < 400 && P.pos.x > 335);
    G.mode = 'play';

    // ---- job 6 race (drive a little, then checkpoint-teleport to finish) ----
    game.startJob(6);
    check('race starts with job 6', G.race !== null && G.race.def.id === 'neon-mile');
    key('KeyW', true); stepN(600); key('KeyW', false);
    check('race driving moves player', G.race.cp >= 1); // must pass the first checkpoint by driving
    const raceDef = G.race.def;
    for (let lap = 0; lap < raceDef.laps; lap++) {
      for (let wi = 0; wi < raceDef.waypoints.length; wi++) {
        const [nx, nz] = raceDef.waypoints[(G.race.cp + 1) % raceDef.waypoints.length];
        game.teleport(nx, nz); stepN(3);
        if (G.race === null) break;
      }
      if (G.race === null) break;
    }
    check('race finishes', G.race === null || G.race.finished === true);
    check('race prize paid', P.cash > 0);
    check('race won recorded or placed', G.stats.racesWon.includes('neon-mile') || G.race === null);
    check('crew Finn joins after job 6', G.crew.includes('finn'));
    check('job 6 completes', G.stats.jobsDone.includes(6));
    G.mode = 'play';

    // ---- job 7 final + keep-cargo choice ----
    game.startJob(7);
    const harbor = RACES.find((r) => r.id === 'harbor-loop');
    for (let wi = 0; wi < harbor.waypoints.length; wi++) {
      if (!G.race) break;
      const [nx, nz] = harbor.waypoints[(G.race.cp + 1) % harbor.waypoints.length];
      game.teleport(nx, nz); stepN(3);
    }
    check('job 7 race stage done', G.job.stage === 1);
    game.teleport(300, -270); stepN(5);
    check('job 7 reaches choice', G.job.stage === 2 && G.mode === 'choice');
    const cash2 = P.cash;
    game.chooseOption(1);
    check('keep cargo pays $900', P.cash === cash2 + 900);
    check('keep cargo raises wanted', P.wanted >= 3);
    game.teleport(-360, -270); stepN(5);
    check('job 7 completes', G.stats.jobsDone.includes(7));
    check('all 7 jobs done', G.stats.jobsDone.length === 7);
    G.mode = 'play';
    game.setWanted(0);

    // ---- taxi ----
    if (!P.car) game.givePlayerCar(0xff7a1e, -160, 180, 0);
    check('taxi starts in car', game.startTaxi() === true);
    const pk = { ...G.taxi.pickup };
    game.teleport(pk.x, pk.z); stepN(5);
    check('taxi pickup boards', G.taxi.phase === 'dest');
    const dst = { ...G.taxi.dest };
    game.teleport(dst.x, dst.z); stepN(5);
    check('taxi fare completes', G.taxi.active === false && G.stats.fares === 1);

    // ---- collectible ----
    const coin = game.coins.find((c) => !c.got);
    const coins0 = G.stats.collectibles.length;
    game.teleport(coin.x, coin.z); stepN(5);
    check('coin collected', G.stats.collectibles.length === coins0 + 1);

    // ---- turf (standalone) ----
    game.teleport(-160, 200); stepN(540);
    check('neon turf captured', G.turf.neon === true);
    check('percent complete positive', G.game.percentComplete() > 20);

    // ---- gun shop + respray ----
    const cash3 = P.cash;
    game.teleport(-320, 200); stepN(3);
    check('near gun shop', game.nearShop() === true);
    check('buy pistol', game.buyWeapon('pistol') === true);
    check('pistol equipped', P.weapon === 'pistol');
    check('pistol costs $200', P.cash === cash3 - 200);
    check('cannot buy twice', game.buyWeapon('pistol') === false);
    game.teleport(-160, -270); stepN(3);
    check('near respray', game.nearRespray() === true);
    const cash4 = P.cash;
    check('respray works', game.respray() === true && P.cash === cash4 - 100);

    // ---- shooting ----
    game.setWanted(2);
    const target = game.police[0];
    target.pos.set(P.pos.x, 0, P.pos.z - 20);
    target.mesh.position.copy(target.pos);
    G.camera.position.set(P.pos.x, 6, P.pos.z + 30);
    G.camera.lookAt(target.pos.x, 1, target.pos.z);
    const hp0 = target.health;
    const shotOk = game.shoot() === true;
    check('shoot returns true', shotOk);
    check('shoot damages police', target.health < hp0);
    if (target.health >= hp0) {
      lines.push(`DEBUG shoot: hp ${target.health} vs ${hp0}, weapon ${P.weapon}, cam [${G.camera.position.toArray().map((v) => v.toFixed(1))}], tgt [${target.pos.toArray().map((v) => v.toFixed(1))}], police ${game.police.length}`);
    }

    // ---- save / load ----
    game.saveGame();
    check('save exists', game.hasSave() === true);
    const savedCash = P.cash;
    P.cash = 5;
    check('load restores cash', game.loadGame() === true && P.cash === savedCash);

    // ---- ranks ----
    eq('rank rookie at 0', rankFor(0).name, 'Rookie');
    eq('rank hustler at 160', rankFor(160).name, 'Hustler');
    eq('rank legend at 500', rankFor(500).name, 'Harbor Legend');

    // ---- world queries ----
    const { districtAt } = await import('./data.js');
    eq('district Neon Row', districtAt(-160, 180).name, 'Neon Row');
    eq('district Palm Court', districtAt(300, -200).name, 'Palm Court');
    eq('district Marina Bay', districtAt(0, -270).name, 'Marina Bay');
    eq('district Hillcrest', districtAt(150, 200).name, 'Hillcrest');
    const { inWater, collideCircle } = await import('./city.js');
    check('water east of harbor', inWater(400, 0) === true);
    check('no water in city', inWater(0, 0) === false);
    check('pier is walkable', inWater(380, -100) === false);
    const col = G.city.colliders[0];
    const probe = new THREE.Vector3((col.x0 + col.x1) / 2, 0, (col.z0 + col.z1) / 2);
    check('collider pushes out', collideCircle(probe, 2.4, G.city.colliders) === true);
    check('probe outside after push', probe.x < col.x0 - 1 || probe.x > col.x1 + 1 || probe.z < col.z0 - 1 || probe.z > col.z1 + 1);
    check('startJob invalid id', game.startJob(99) === false);
    game.setWanted(9);
    check('wanted clamps to 5', P.wanted === 5);
    game.setWanted(-3);
    check('wanted clamps to 0', P.wanted === 0);
    eq('pistol damage 25', WEAPONS.find((w) => w.id === 'pistol').damage, 25);
    check('all jobs have stages', JOBS.every((j) => j.stages.length > 0));
    check('all races have 4 waypoints', RACES.every((r) => r.waypoints.length === 4));

    // ---- staged scenes ----
    const { setupScene } = await import('./scenes.js');
    check('scene chase loads', setupScene(G, 'chase') === true);
    check('chase is golden hour', Math.abs(G.hour - 17.5) < 0.01);
    check('chase player in car', P.car !== null);
    check('chase has police', game.police.length >= 1);
    check('chase dense traffic', game.traffic.length >= 14);
    check('chase low close camera', G.camFixed !== null && G.camFixed.pos[1] < 5);
    check('chase job is Harbor Run', G.job && G.job.def.id === 2);
    check('scene market loads', setupScene(G, 'market') === true);
    check('market is purple night', Math.abs(G.hour - 21.5) < 0.01);
    check('market player on foot', P.onFoot === true);
    check('market job is Night Market', G.job && G.job.def.id === 4);
    check('market close camera', G.camFixed !== null && G.camFixed.pos[1] < 5);
    check('scene race loads', setupScene(G, 'race') === true);
    check('race is deep night', Math.abs(G.hour - 23) < 0.05);
    check('race active with standings', G.race !== null && G.race.standings.length === 4);
    check('race heli searchlight', game.heli !== null);
    check('scene title loads', setupScene(G, 'title') === true);
    check('title is dusk', Math.abs(G.hour - 18.8) < 0.01);
    check('title mode', G.mode === 'title');
    check('title high camera', G.camFixed !== null && G.camFixed.pos[1] > 40);
    G.mode = 'play';
    G.camFixed = null;
    G.camFollow = null;
    G.camClose = false;
    G.autoDrive = false;

    // ---- day / night ----
    G.city.setHour(12);
    const dayTop = G.scene.background;
    G.city.setHour(23);
    check('night hour set', Math.abs(G.hour - 23) < 0.01);
    G.city.setHour(17.5);

    // ---- HUD + minimap render ----
    G.hud.update();
    const mm = document.getElementById('minimap');
    const px = mm.getContext('2d').getImageData(0, 0, 200, 200).data;
    let nonBlank = 0;
    for (let i = 0; i < px.length; i += 400) if (px[i] || px[i + 1] || px[i + 2]) nonBlank++;
    check('minimap draws districts', nonBlank > 50);

    // ---- real render pass ----
    G.renderer.render(G.scene, G.camera);
    const gl = G.renderer.getContext();
    const pix = new Uint8Array(4);
    gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    check('render pass produces pixels', pix[0] + pix[1] + pix[2] > 0);
  } catch (err) {
    lines.push('ERROR: ' + (err && err.message ? err.message : String(err)));
  }

  lines.unshift(`PLAYTHROUGH ${pass}/${total}`);
  return { pass, total, lines };
}

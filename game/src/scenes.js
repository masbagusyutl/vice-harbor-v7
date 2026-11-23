// Vice Harbor v7 — staged scenes for the four screenshots (?scene=chase|market|race|title).
// Deterministic: fixed positions, fixed hour, fixed HUD state. Written fresh in-session.
import { JOBS } from './data.js';
import { TrafficCar, PoliceCar, makeCarMesh } from './vehicles.js';

export function setupScene(G, name) {
  const game = G.game;
  const P = G.player;
  G.mode = 'play';
  G.camFixed = null;

  if (name === 'chase') {
    // Cover: busy golden-hour coastal chase, low close camera behind the player car.
    G.city.setHour(17.5);
    game.teleport(270, 120);
    game.givePlayerCar(0xff7a1e, 270, 120, -Math.PI / 2);
    P.cash = 1850;
    P.respect = 160;
    game.setWanted(2);
    game.setJobState(2, 2); // Harbor Run — deliver the package
    // 5 traffic cars ahead on the coastal road, 1 police car closing in at the side.
    // Tight loops (±8) so the pack holds its staging for the shot.
    const spots = [[268, 108], [273, 96], [267, 84], [272, 72], [269, 60]];
    const tcolors = [0xd83838, 0x2e6ad8, 0xe8c832, 0x38b878, 0xe8e8e8];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const car = new TrafficCar(G, makeCarMesh(tcolors[i % tcolors.length]),
        [[x, z + 8], [x, z - 8]], 5);
      car.pos.set(x, 0, z);
      car.heading = -Math.PI / 2;
      game.traffic.push(car);
    }
    const pol = new PoliceCar(G, makeCarMesh(0x1a2a4a, { police: true }), 276, 100);
    pol.heading = -Math.PI / 2;
    game.police.push(pol);
    game.spawnPeds(10, { x0: 282, x1: 296, z0: 20, z1: 150 });
    // Mid-game HUD state (staged shot): a job done, coins found, turf held, crew started.
    G.stats.jobsDone = [1];
    G.stats.collectibles = [0, 1, 2, 3, 4, 5];
    G.turf = { palm: true };
    G.crew = ['petra'];
    G.camFixed = { pos: [270, 2.6, 136], look: [270, 5, 85] };
    G.camFollow = null;
    G.autoDrive = false;
    G.sceneTitle = 'VICE HARBOR';
    return true;
  }

  if (name === 'market') {
    // Close warm-lit night street/market shot, mid-mission, non-zero HUD.
    G.city.setHour(21.5);
    if (P.car) game.exitCar();
    if (P.boat) game.exitBoat();
    game.setJobState(4, 0); // Night Market — recover the crates
    // Collect the first crate for real, so the shot is mid-mission (1/3) and the
    // marker sits on the second crate, off to the side instead of dead centre.
    game.teleport(-180, 140);
    game.step(1 / 60); game.step(1 / 60); game.step(1 / 60);
    game.teleport(-176, 208);
    P.heading = Math.PI;
    P.cash = 2450;
    P.respect = 160;
    game.setWanted(1);
    G.stats.jobsDone = [1, 2];
    G.stats.collectibles = [0, 1, 2, 3, 4, 5];
    G.turf = { palm: true };
    G.crew = ['petra'];
    game.spawnPeds(18, { x0: -220, x1: -120, z0: 130, z1: 280 });
    G.camFixed = { pos: [-176, 1.6, 216], look: [-176, 1.2, 195] };
    G.camFollow = null;
    G.autoDrive = false;
    G.sceneTitle = null;
    return true;
  }

  if (name === 'race') {
    // Night race: lifted out of near-black, rivals close, searchlight visible, player first.
    G.city.setHour(23.0);
    game.startRace('neon-mile', false);
    P.cash = 3200;
    P.respect = 210;
    game.setWanted(4);
    G.stats.jobsDone = [1, 2, 3];
    G.stats.collectibles = [0, 1, 2, 3, 4, 5];
    G.turf = { palm: true, neon: true };
    G.crew = ['petra', 'ezra'];
    // Pre-drive ~6s so the player is genuinely leading on race progress.
    G.input.keys.add('KeyW');
    for (let i = 0; i < 360; i++) game.step(1 / 60);
    G.input.keys.delete('KeyW');
    game.step(0.5);
    // Stage the rivals back onto the player's tail so the pack reads in one
    // frame: behind and to the far side (east, away from the side camera), so
    // the player stays P1 on progress and no rival crowds the camera.
    if (G.race) {
      const fwd = { x: Math.cos(P.heading), z: Math.sin(P.heading) };
      const side = { x: -fwd.z, z: fwd.x };
      G.race.rivals.forEach((rv, i) => {
        const behind = 10 + i * 8;
        const lat = -5;
        rv.pos.set(P.pos.x - fwd.x * behind + side.x * lat, 0, P.pos.z - fwd.z * behind + side.z * lat);
        rv.mesh.position.copy(rv.pos);
        rv.heading = P.heading;
        rv.speed = 14;
      });
      if (P.car) P.car.speed = 20;
    }
    G.camFixed = null;
    G.camClose = false;
    G.camFollow = { side: 20, back: 14, height: 5.5, lookAhead: 14 };
    G.autoDrive = true;
    G.sceneTitle = null;
    return true;
  }

  if (name === 'title') {
    // Title over the harbour: camera over the water looking south along the
    // coast — water and boats down the left of the frame, beach and skyline
    // to the right, dusk sky above. Title sits over sky, clear of buildings.
    G.city.setHour(18.8);
    game.teleport(-160, 180);
    P.cash = 1250;
    P.respect = 90;
    G.mode = 'title';
    G.hideTitleExtras = true;
    G.camFixed = { pos: [420, 45, -220], look: [395, 6, 20] };
    G.camFollow = null;
    G.autoDrive = false;
    G.sceneTitle = null;
    return true;
  }

  return false;
}

// Vice Harbor v7 — bootstrap, camera, input, screens, game loop.
// Written fresh in-session for gta6-01.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { districtAt } from './data.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { setupScene } from './scenes.js';
import { runTests } from './test.js';
import { JOBS, WEAPONS, TURF_ZONES } from './data.js';
import { clamp, angleLerp } from './util.js';

const params = new URLSearchParams(location.search);
const G = {
  scene: null, camera: null, renderer: null, city: null, game: null, hud: null, audio: null,
  hour: 17.5, nightFactor: 0,
  player: {
    pos: new THREE.Vector3(-160, 0, 180), heading: 0, onFoot: true, car: null, boat: null,
    health: 100, cash: 250, respect: 0, wanted: 0, weapon: 'fists', ownedWeapons: ['fists'],
  },
  input: { keys: new Set() },
  mode: 'title',
  stats: { jobsDone: [], racesWon: [], collectibles: [], fares: 0, carsStolen: 0, copsEscaped: 0, distance: 0 },
  crew: [], turf: {}, choice: null, job: null, race: null, taxi: { active: false },
  camYaw: Math.PI, camDist: 12, camFixed: null, camFollow: null, camClose: false, autoDrive: false,
  districtName: 'Neon Row', sceneTitle: null, jobDoneInfo: null, bustedInfo: null, wastedInfo: null,
  turfZones: null,
};
window.__vh = G;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
document.getElementById('app').appendChild(renderer.domElement);
G.renderer = renderer;

const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3000);
G.camera = camera;

G.city = buildCity(G);
G.game = createGame(G);
G.turfZones = TURF_ZONES;
G.hud = createHud(G);
G.audio = createAudio();
G.game.init();

// ---- screens ----
const screens = ['title', 'pause', 'wasted', 'busted', 'jobdone', 'choice', 'shop'];
function showScreens() {
  for (const s of screens) {
    const el = document.getElementById('screen-' + s);
    if (el) el.style.display = G.mode === s ? 'flex' : 'none';
  }
  document.getElementById('hud').style.display = (G.mode === 'play' || G.mode === 'choice' || G.mode === 'shop') ? 'block' : 'none';
  document.getElementById('scenetitle').style.display = G.sceneTitle && G.mode === 'play' ? 'block' : 'none';
  if (G.sceneTitle) document.getElementById('scenetitle').textContent = G.sceneTitle;
  if (G.mode === 'choice' && G.choice) {
    document.getElementById('choice-text').textContent = G.choice.text;
    document.getElementById('choice-opts').innerHTML = G.choice.options
      .map((o, i) => `<div>[${i + 1}] ${o.label}</div>`).join('');
  }
  if (G.mode === 'jobdone' && G.jobDoneInfo) {
    document.getElementById('jobdone-text').textContent =
      `${G.jobDoneInfo.name} — +$${G.jobDoneInfo.cash}, +${G.jobDoneInfo.respect} respect`;
  }
  if (G.mode === 'busted' && G.bustedInfo) {
    document.getElementById('busted-text').textContent = `Fined $${G.bustedInfo.fine}. The Harbor PD let you walk.`;
  }
  if (G.mode === 'wasted' && G.wastedInfo) {
    document.getElementById('wasted-text').textContent = `You lost $${G.wastedInfo.lost} at the clinic.`;
  }
  if (G.mode === 'shop') {
    document.getElementById('shop-list').innerHTML = WEAPONS.filter((w) => w.id !== 'fists')
      .map((w, i) => `<div>[${i + 1}] ${w.name} — $${w.price} ${G.player.ownedWeapons.includes(w.id) ? '(owned)' : ''}</div>`).join('');
  }
  if (G.mode === 'title') {
    const has = G.game.hasSave();
    document.getElementById('title-continue').style.display = has && !G.hideTitleExtras ? 'block' : 'none';
    document.getElementById('title-progress').textContent = has && !G.hideTitleExtras
      ? `Continue — ${G.game.percentComplete()}% complete` : '';
    document.querySelector('#screen-title .controls').style.display = G.hideTitleExtras ? 'none' : 'block';
  }
  if (G.mode === 'pause') {
    document.getElementById('pause-stats').innerHTML =
      `Cash $${G.player.cash} · Respect ${G.player.respect} · ${G.game.percentComplete()}% complete<br>` +
      `Jobs ${G.stats.jobsDone.length}/7 · Races ${G.stats.racesWon.length}/3 · Coins ${G.stats.collectibles.length}/24<br>` +
      `Turf ${Object.keys(G.turf).length}/3 · Crew: ${G.crew.length ? G.crew.join(', ') : 'none yet'} · Fares ${G.stats.fares} · Distance ${Math.round(G.stats.distance)}m`;
  }
}

// ---- shooting tracer ----
let tracer = null;
let tracerT = 0;
G.onShoot = () => {
  G.audio.shot();
  const from = camera.position.clone();
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const to = from.clone().add(dir.multiplyScalar(60));
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  if (tracer) { scene.remove(tracer); tracer.geometry.dispose(); }
  tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe83a, transparent: true, opacity: 0.9 }));
  scene.add(tracer);
  tracerT = 0.07;
};
G.onCarCrash = () => { G.audio.click(); };
G.onCarStalled = () => { G.message('Your car is wrecked — find another ride.'); };

// ---- input ----
const KEYMAP = {};
addEventListener('keydown', (e) => {
  G.audio.unlock();
  if (e.repeat) return;
  G.input.keys.add(e.code);
  if (G.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    G.mode = 'play';
    G.message('Welcome to Vice Harbor. Press J for your first job.');
    showScreens();
    return;
  }
  if (G.mode === 'title' && e.code === 'KeyL') {
    if (G.game.loadGame()) { G.mode = 'play'; G.message('Save loaded.'); }
    showScreens();
    return;
  }
  if (G.mode === 'jobdone' && e.code === 'Enter') { G.mode = 'play'; G.audio.complete(); showScreens(); return; }
  if ((G.mode === 'wasted' || G.mode === 'busted') && e.code === 'Enter') { G.mode = 'play'; showScreens(); return; }
  if (G.mode === 'choice' && (e.code === 'Digit1' || e.code === 'Digit2')) {
    G.game.chooseOption(e.code === 'Digit1' ? 0 : 1);
    showScreens();
    return;
  }
  if (G.mode === 'shop') {
    if (e.code === 'Escape' || e.code === 'KeyG') { G.mode = 'play'; showScreens(); return; }
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (idx >= 0) { G.game.buyWeapon(WEAPONS.filter((w) => w.id !== 'fists')[idx].id); showScreens(); }
    return;
  }
  if (G.mode === 'pause' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter')) {
    G.mode = 'play'; showScreens(); return;
  }
  if (G.mode !== 'play') return;
  if (e.code === 'KeyE') {
    if (G.player.boat) G.game.exitBoat();
    else if (G.player.car) G.game.exitCar();
    else if (!G.game.boardBoat()) G.game.enterCar();
    showScreens();
  } else if (e.code === 'KeyT') {
    G.game.startTaxi();
  } else if (e.code === 'KeyR') {
    G.game.respray();
  } else if (e.code === 'KeyG') {
    if (G.game.nearShop()) { G.mode = 'shop'; showScreens(); }
    else G.message('Gun shop is in Foundry — look for the GUN SHOP sign.');
  } else if (e.code === 'KeyJ') {
    const next = JOBS.find((j) => !G.stats.jobsDone.includes(j.id));
    if (next) G.game.startJob(next.id);
    else G.message('All 7 jobs done — you run Vice Harbor now.');
  } else if (e.code === 'KeyM') {
    const m = G.audio.toggleMute();
    G.message(m ? 'Sound muted.' : 'Sound on.');
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    G.mode = 'pause';
    G.game.saveGame();
    showScreens();
  } else if (e.code === 'KeyF') {
    G.game.shoot();
  }
});
addEventListener('keyup', (e) => G.input.keys.delete(e.code));
addEventListener('mousedown', (e) => {
  G.audio.unlock();
  if (G.mode === 'play' && e.button === 0) G.game.shoot();
  G.dragging = true;
  G.lastMX = e.clientX;
});
addEventListener('mouseup', () => { G.dragging = false; });
addEventListener('mousemove', (e) => {
  if (!G.dragging) return;
  G.camYaw += (e.clientX - G.lastMX) * 0.005;
  G.lastMX = e.clientX;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- camera ----
function updateCamera(dt) {
  const P = G.player;
  if (G.camFixed) {
    camera.position.set(...G.camFixed.pos);
    camera.lookAt(new THREE.Vector3(...G.camFixed.look));
    return;
  }
  if (G.camFollow) {
    // Side-follow camera for staged shots: tracks the player, keeps the pack in frame.
    const f = { x: Math.cos(P.heading), z: Math.sin(P.heading) };
    const r = { x: -f.z, z: f.x };
    const cf = G.camFollow;
    camera.position.set(P.pos.x + r.x * cf.side - f.x * cf.back, cf.height,
      P.pos.z + r.z * cf.side - f.z * cf.back);
    camera.lookAt(P.pos.x + f.x * cf.lookAhead, 1.5, P.pos.z + f.z * cf.lookAhead);
    return;
  }
  if (P.car || P.boat) {
    const h = P.heading;
    const target = Math.atan2(-Math.cos(h), -Math.sin(h));
    G.camYaw = angleLerp(G.camYaw, target, clamp(dt * 1.6, 0, 1));
  }
  const dist = G.camClose ? 11 : (P.car || P.boat ? 12.5 : 8);
  const height = G.camClose ? 4.2 : (P.car || P.boat ? 4.6 : 3.2);
  const cx = P.pos.x + Math.sin(G.camYaw) * dist;
  const cz = P.pos.z + Math.cos(G.camYaw) * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(P.pos.x, 2.2, P.pos.z);
}

// ---- scenes / test ----
const sceneName = params.get('scene');
if (sceneName) setupScene(G, sceneName);

if (params.has('test')) {
  G.mode = 'play';
  showScreens();
  const result = await runTests(G);
  const pre = document.getElementById('test-results');
  pre.textContent = result.lines.join('\n');
  document.title = `TEST ${result.pass}/${result.total}`;
  window.__vhTestDone = true;
  window.__vhReady = true;
} else {
  showScreens();
  const clock = new THREE.Clock();
  let frames = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = clamp(clock.getDelta(), 0, 0.05);
    if (G.mode === 'play') {
      G.game.step(dt);
      G.audio.setEngine(G.player.car ? Math.abs(G.player.car.speed) : G.player.boat ? Math.abs(G.player.boat.speed) : 0, !!(G.player.car || G.player.boat));
      G.audio.setSiren(G.player.wanted >= 2);
    } else if (G.mode === 'title') {
      G.camYaw += dt * 0.04;
      G.city.update(dt);
    } else {
      G.city.update(dt);
    }
    if (tracer) {
      tracerT -= dt;
      if (tracerT <= 0) { scene.remove(tracer); tracer.geometry.dispose(); tracer = null; }
    }
    G.districtName = districtAt(G.player.pos.x, G.player.pos.z).name;
    updateCamera(dt);
    renderer.render(scene, camera);
    G.hud.update();
    if (G.mode !== G._lastMode) { showScreens(); G._lastMode = G.mode; }
    frames++;
    if (frames === 3) window.__vhReady = true;
  }
  loop();
}

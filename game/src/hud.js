// Vice Harbor v7 — HUD: wanted stars, cash, respect, minimap with district names.
// Written fresh in-session for gta6-01.
import { DISTRICTS, rankFor, WEAPONS } from './data.js';

export function createHud(G) {
  const el = (id) => document.getElementById(id);
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const feedEl = el('feed');
  const feed = [];
  let lastMsg = '';

  G.message = (text) => {
    feed.push(text);
    if (feed.length > 5) feed.shift();
    feedEl.innerHTML = feed.map((f) => `<div>${f}</div>`).join('');
    lastMsg = text;
  };

  function drawMinimap() {
    const S = 200;
    const W = 820;
    const toMap = (x, z) => [((x + 410) / W) * S, ((z + 410) / W) * S];
    mctx.clearRect(0, 0, S, S);
    // water
    mctx.fillStyle = '#14506e';
    mctx.fillRect(toMap(340, -410)[0], 0, S - toMap(340, -410)[0], S);
    // districts (short labels so they read at thumbnail size)
    const SHORT = { Fishmarket: 'FISH', 'The Docks': 'DOCKS', 'Marina Bay': 'MARINA', 'Old Pier': 'PIER', 'Palm Court': 'PALM', Foundry: 'FOUNDRY', 'Neon Row': 'NEON', 'Canal District': 'CANAL', Hillcrest: 'HILL', 'Sunset Strip': 'SUNSET' };
    for (const d of DISTRICTS) {
      const [x0, y0] = toMap(d.x0, d.z0);
      const [x1, y1] = toMap(d.x1, d.z1);
      mctx.fillStyle = 'rgba(70,66,60,0.9)';
      mctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      mctx.strokeStyle = 'rgba(255,255,255,0.14)';
      mctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      mctx.fillStyle = 'rgba(255,255,255,0.85)';
      mctx.font = 'bold 9px Arial';
      mctx.textAlign = 'center';
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      mctx.fillText(SHORT[d.name] || d.name.toUpperCase(), cx, cy);
    }
    // roads
    mctx.strokeStyle = 'rgba(255,255,255,0.35)';
    mctx.lineWidth = 1;
    for (let v = -360; v <= 360; v += 90) {
      const [ax] = toMap(v, 0);
      const [, ay] = toMap(0, v);
      mctx.beginPath(); mctx.moveTo(ax, 0); mctx.lineTo(ax, S); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, ay); mctx.lineTo(S, ay); mctx.stroke();
    }
    // turf zones
    for (const zone of (G.turfZones || [])) {
      const [zx, zy] = toMap(zone.x, zone.z);
      mctx.fillStyle = G.turf[zone.id] ? 'rgba(80,220,120,0.55)' : 'rgba(255,80,80,0.45)';
      mctx.beginPath(); mctx.arc(zx, zy, 7, 0, Math.PI * 2); mctx.fill();
    }
    // mission marker
    if (G.game?.markerPos) {
      const [mx, my] = toMap(G.game.markerPos.x, G.game.markerPos.z);
      mctx.fillStyle = '#ffe83a';
      mctx.beginPath(); mctx.arc(mx, my, 5, 0, Math.PI * 2); mctx.fill();
      mctx.strokeStyle = '#000';
      mctx.stroke();
    }
    // police
    mctx.fillStyle = '#5a8aff';
    for (const c of G.game?.police || []) {
      const [px, py] = toMap(c.pos.x, c.pos.z);
      mctx.beginPath(); mctx.arc(px, py, 3, 0, Math.PI * 2); mctx.fill();
    }
    // player arrow
    const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(Math.atan2(Math.sin(G.player.heading), Math.cos(G.player.heading)) * -1 + Math.PI / 2);
    mctx.fillStyle = '#ff7a1e';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function update() {
    const P = G.player;
    el('wanted').textContent = '★'.repeat(P.wanted) + '☆'.repeat(5 - P.wanted);
    el('cash').textContent = '$' + P.cash.toLocaleString('en-US');
    const rank = rankFor(P.respect);
    el('respect').textContent = `${rank.name} · ${P.respect} respect`;
    const next = rankFor(P.respect + 1);
    el('health').textContent = `Health ${Math.round(P.health)}%`;
    const w = WEAPONS.find((x) => x.id === P.weapon);
    el('weapon').textContent = w ? w.name : '';
    el('clock').textContent = `${String(Math.floor(G.hour)).padStart(2, '0')}:${String(Math.floor((G.hour % 1) * 60)).padStart(2, '0')} · ${G.districtName || ''}`;
    // objective
    let obj = '';
    if (G.job) {
      const s = G.job.def.stages[G.job.stage];
      obj = `${G.job.def.name} — ${s.text}`;
      if (s.type === 'stay') obj += ` (${Math.min(s.secs, Math.floor(G.job.stayT))}/${s.secs}s)`;
      if (s.type === 'collect') obj = `${G.job.def.name} — ${s.text.replace(/\(\d+\/\d+\)/, `(${G.job.collected.length}/${s.count})`)}`;
    } else if (G.race) {
      obj = `Race: ${G.race.def.name} — Lap ${Math.min(G.race.lap, G.race.def.laps)}/${G.race.def.laps}`;
    } else if (G.taxi.active) {
      obj = G.taxi.phase === 'pickup' ? 'Taxi: pick up the passenger' : `Taxi: drop off the passenger (+$${G.taxi.fare})`;
    } else {
      obj = 'Free roam — press J for the next job';
    }
    el('objective').textContent = obj;
    // speed
    const speed = P.car ? Math.abs(P.car.speed) * 3.6 : P.boat ? Math.abs(P.boat.speed) * 3.6 : 0;
    el('speed').textContent = (P.car || P.boat) ? `${Math.round(speed)} km/h` : '';
    // race standings
    const st = el('standings');
    if (G.race && G.race.standings.length) {
      st.style.display = 'block';
      st.innerHTML = `<b>${G.race.def.name}</b><br>` + G.race.standings.map((s) => `P${s.place} ${s.name}`).join('<br>');
    } else st.style.display = 'none';
    // stats line
    el('statsline').textContent =
      `Jobs ${G.stats.jobsDone.length}/7 · Races won ${G.stats.racesWon.length}/3 · Coins ${G.stats.collectibles.length}/24 · Turf ${Object.keys(G.turf).length}/3 · Crew ${G.crew.length}/3 · ${G.game.percentComplete()}% complete`;
    drawMinimap();
  }

  return { update, get lastMsg() { return lastMsg; } };
}

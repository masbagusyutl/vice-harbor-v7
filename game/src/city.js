// Vice Harbor v7 — the city: sky, districts, buildings, palms, neon, harbor.
// Written fresh in-session for gta6-01. Deterministic from a fixed seed.
import * as THREE from 'three';
import { mulberry32, clamp, lerp, TAU, textTexture, windowsTexture, roadTexture } from './util.js';
import { CITY, DISTRICTS, districtAt } from './data.js';

const SKY_KEYS = [
  { h: 0, top: 0x0a0a24, hor: 0x1a1a3a },
  { h: 6, top: 0x5a4a7a, hor: 0xff8a5a },
  { h: 12, top: 0x3a7bd5, hor: 0xa8d8e8 },
  { h: 17.5, top: 0x452a7d, hor: 0xff9a3c },
  { h: 18.8, top: 0x7a4a7a, hor: 0xff7a4d },
  { h: 21.5, top: 0x1a1033, hor: 0x4a2a6b },
  { h: 23, top: 0x060a1e, hor: 0x12264d },
  { h: 24, top: 0x0a0a24, hor: 0x1a1a3a },
];

function hexLerp(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

export function buildCity(G) {
  const rng = mulberry32(20261123);
  const group = new THREE.Group();
  G.scene.add(group);
  const colliders = [];
  const roadLoops = [];

  // ---- sky dome ----
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x6b4a8f) },
    horizonColor: { value: new THREE.Color(0xff9a3c) },
    sunDir: { value: new THREE.Vector3(0, 0.2, -1) },
    sunColor: { value: new THREE.Color(0xffc27a) },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 8.0) * 0.28);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 28, 16), skyMat);
  group.add(sky);

  // ---- lights ----
  const sun = new THREE.DirectionalLight(0xffc27a, 2.2);
  sun.position.set(-200, 120, -300);
  G.scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x8a7ab8, 0x2a2018, 0.9);
  G.scene.add(hemi);
  // Warm fill from the east so horizontal surfaces (roads) read at golden hour,
  // when the low sun alone leaves them near black.
  const fill = new THREE.DirectionalLight(0xffd8b0, 0.55);
  fill.position.set(300, 380, 200);
  G.scene.add(fill);
  const moon = new THREE.DirectionalLight(0x6a8ad8, 0.0);
  moon.position.set(200, 300, 200);
  G.scene.add(moon);

  // ---- ground, beach, water ----
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a352e });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(820, 820), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  group.add(ground);

  const beachMat = new THREE.MeshLambertMaterial({ color: 0xb89a6a });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(44, 820), beachMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(CITY.beachX + 22 - 22 + 20, 0.01, 0);
  beach.position.x = 320;
  group.add(beach);

  const waterMat = new THREE.MeshPhongMaterial({ color: 0x14506e, shininess: 140, specular: 0x88bbdd, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(420, 820), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(340 + 210, -0.5, 0);
  group.add(water);

  // ---- roads ----
  const roadTex = roadTexture();
  const lines = [];
  for (let v = -360; v <= 360; v += CITY.roadStep) lines.push(v);
  const roadMat = new THREE.MeshPhongMaterial({ map: roadTex, shininess: 90, specular: 0x777777 });
  for (const v of lines) {
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(800, CITY.roadWidth), roadMat.clone());
    r1.material.map = roadTex.clone();
    r1.material.map.needsUpdate = true;
    r1.material.map.repeat.set(800 / 16, 1);
    r1.rotation.x = -Math.PI / 2;
    r1.position.set(0, 0.03, v);
    group.add(r1);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, 800), r1.material);
    r2.rotation.x = -Math.PI / 2;
    r2.rotation.z = Math.PI / 2;
    r2.position.set(v, 0.03, 0);
    group.add(r2);
  }

  // ---- city blocks: sidewalk bases + buildings ----
  const windowMats = [];
  const neonMats = [];
  const blockCenters = [];
  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 8; iz++) {
      const cx = -360 + 45 + ix * 90;
      const cz = -360 + 45 + iz * 90;
      if (cx > 295) continue; // beach / water
      blockCenters.push([cx, cz]);
      const d = districtAt(cx, cz);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0x45413a });
      const base = new THREE.Mesh(new THREE.PlaneGeometry(74, 74), baseMat);
      base.rotation.x = -Math.PI / 2;
      base.position.set(cx, 0.015, cz);
      group.add(base);
      const nB = 1 + Math.floor(rng() * 3);
      for (let b = 0; b < nB; b++) {
        const w = 16 + rng() * 14;
        const dep = 16 + rng() * 14;
        const h = d.hMin + rng() * (d.hMax - d.hMin);
        const ox = (rng() - 0.5) * (74 - w - 8);
        const oz = (rng() - 0.5) * (74 - dep - 8);
        const bx = cx + ox;
        const bz = cz + oz;
        const winTex = windowsTexture(d.base, d.lit, rng, Math.max(3, Math.floor(h / 7)), 4);
        const mat = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.25 });
        windowMats.push(mat);
        const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
        bld.position.set(bx, h / 2, bz);
        group.add(bld);
        // rooftop trim
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, dep + 0.6),
          new THREE.MeshLambertMaterial({ color: d.accent }));
        trim.position.set(bx, h + 0.4, bz);
        group.add(trim);
        colliders.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - dep / 2, z1: bz + dep / 2 });
      }
      // neon sign on some blocks
      if (rng() < 0.75) {
        const signText = d.signs[Math.floor(rng() * d.signs.length)];
        const tex = textTexture([signText], { color: d.accent, w: 512, h: 128 });
        const smat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
        neonMats.push(smat);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), smat);
        const edge = rng() < 0.5;
        sign.position.set(cx + (edge ? 30 : -30), 10 + rng() * 14, cz + (rng() - 0.5) * 30);
        sign.rotation.y = edge ? -Math.PI / 2 : Math.PI / 2;
        group.add(sign);
        // wet-road reflection streak under the neon sign
        const streak = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 26),
          new THREE.MeshBasicMaterial({ color: d.accent, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
        streak.rotation.x = -Math.PI / 2;
        streak.position.set(sign.position.x + (edge ? -8 : 8), 0.05, sign.position.z);
        group.add(streak);
      }
    }
  }

  // ---- palms ----
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const palmLeafMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a });
  const palms = [];
  const palmSpots = [];
  for (let i = 0; i < 46; i++) palmSpots.push([308 + rng() * 8, -380 + rng() * 760]); // beach row
  for (let i = 0; i < 26; i++) palmSpots.push([250 + rng() * 60, -380 + rng() * 760]); // Palm Court / Sunset
  for (const [px, pz] of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 6), palmTrunkMat);
    trunk.position.y = 4.5;
    trunk.rotation.z = (rng() - 0.5) * 0.12;
    palm.add(trunk);
    for (let f = 0; f < 6; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.5, 4), palmLeafMat);
      leaf.position.y = 9.2;
      leaf.rotation.z = Math.PI / 2.4;
      leaf.rotation.y = (f / 6) * TAU;
      leaf.translateY(1.2);
      palm.add(leaf);
    }
    palm.position.set(px, 0, pz);
    group.add(palm);
    palms.push(palm);
  }

  // ---- street lamps + light pools ----
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = [];
  for (let v = -360; v <= 360; v += 90) {
    for (const u of [-315, -135, 45, 225]) {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7.5, 6), lampPoleMat);
      pole.position.y = 3.75;
      lamp.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampHeadMat);
      head.position.y = 7.6;
      lamp.add(head);
      lamp.position.set(v + 10, 0, u);
      group.add(lamp);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 20), poolMat.clone());
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(v + 10, 0.06, u);
      group.add(pool);
      pools.push(pool);
    }
  }

  // ---- night market stalls (Neon Row) ----
  const stallSpots = [[-200, 140], [-120, 220], [-190, 300], [-160, 90], [-210, 250], [-130, 140], [-180, 200], [-110, 300]];
  const stallNames = ['TACOS', 'NOODLES', 'SPICES', 'FLOWERS', 'JUICE', 'KARAOKE', 'SWEETS', 'TEA'];
  const stallGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.95, toneMapped: false });
  for (let si = 0; si < stallSpots.length; si++) {
    const [sx, sz] = stallSpots[si];
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 3),
      new THREE.MeshLambertMaterial({ color: 0xa86a3a, emissive: 0x553311 }));
    counter.position.y = 1.2;
    stall.add(counter);
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(7, 4),
      new THREE.MeshLambertMaterial({ color: 0xff6a8a, side: THREE.DoubleSide }));
    awn.rotation.x = -Math.PI / 2 + 0.35;
    awn.position.y = 3.4;
    stall.add(awn);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 2.6), stallGlowMat);
    glow.position.y = 2.9;
    stall.add(glow);
    const signTex = textTexture([stallNames[si]], { color: '#ffd83a', w: 256, h: 64 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
    sign.position.y = 4.6;
    stall.add(sign);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 18), poolMat.clone());
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.07;
    stall.add(pool);
    pools.push(pool);
    stall.position.set(sx, 0, sz);
    stall.rotation.y = (rng() - 0.5) * 0.6;
    group.add(stall);
    colliders.push({ x0: sx - 3.2, x1: sx + 3.2, z0: sz - 1.8, z1: sz + 1.8 });
  }
  // Warm point lights over the night market so the stalls read at night.
  for (const [lx, lz] of [[-180, 200], [-200, 140], [-130, 140]]) {
    const pl = new THREE.PointLight(0xffb46a, 90, 45, 1.8);
    pl.position.set(lx, 6, lz);
    group.add(pl);
  }

  // ---- pier + docked boats + buoys ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(90, 1.2, 26), pierMat);
  pier.position.set(385, 0.1, -100);
  group.add(pier);
  const buoyMat = new THREE.MeshLambertMaterial({ color: 0xff5a1e, emissive: 0x882200 });
  const buoys = [];
  for (const [ux, uz] of [[380, -100], [430, 100], [390, 260]]) {
    const buoy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 8), buoyMat);
    buoy.position.set(ux, 0.6, uz);
    group.add(buoy);
    buoys.push(buoy);
  }

  // ---- clouds ----
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(14 + rng() * 16, 8, 6), cloudMat);
      puff.scale.y = 0.32;
      puff.position.set((rng() - 0.5) * 40, (rng() - 0.5) * 4, (rng() - 0.5) * 16);
      cl.add(puff);
    }
    cl.position.set(-700 + rng() * 1400, 120 + rng() * 80, -700 + rng() * 1400);
    group.add(cl);
    clouds.push(cl);
  }

  // ---- traffic loops: rectangles around blocks ----
  for (let ix = 0; ix < 7; ix += 2) {
    for (let iz = 0; iz < 7; iz += 2) {
      const x0 = -360 + ix * 90;
      const z0 = -360 + iz * 90;
      const x1 = x0 + 180;
      const z1 = z0 + 180;
      if (x1 > 300) continue;
      roadLoops.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    }
  }

  // ---- time of day ----
  function setHour(h) {
    G.hour = h;
    let a = SKY_KEYS[0];
    let b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const t = clamp((h - a.h) / Math.max(0.001, b.h - a.h), 0, 1);
    skyUniforms.topColor.value.copy(hexLerp(a.top, b.top, t));
    skyUniforms.horizonColor.value.copy(hexLerp(a.hor, b.hor, t));
    const day = clamp(Math.sin(((h - 6) / 12) * Math.PI), -1, 1); // 1 at noon, -1 at midnight
    const golden = clamp(1 - Math.abs(h - 17.5) / 2.5, 0, 1);
    const sunEl = Math.sin(((h - 6) / 12) * Math.PI);
    const sunAz = Math.cos(((h - 6) / 12) * Math.PI);
    const sunDir = new THREE.Vector3(sunAz * 0.85, Math.max(sunEl, -0.15), 0.4).normalize();
    skyUniforms.sunDir.value.copy(sunDir);
    skyUniforms.sunColor.value.setHex(golden > 0.4 ? 0xffc27a : 0xfff2cc);
    const night = clamp(-day, 0, 1);
    if (day > 0.05) {
      sun.intensity = 1.4 + 0.9 * day + golden * 0.7;
      sun.color.setHex(golden > 0.4 ? 0xffb36a : 0xfff2dd);
      sun.position.copy(sunDir).multiplyScalar(500);
      moon.intensity = 0;
    } else {
      sun.intensity = 0.06;
      moon.intensity = 0.55;
      moon.position.set(200, 300, 200);
      skyUniforms.sunDir.value.set(0.3, 0.7, 0.4).normalize();
      skyUniforms.sunColor.value.setHex(0xbfd4ff);
    }
    hemi.intensity = 0.75 + 0.5 * Math.max(day, 0);
    for (const m of windowMats) m.emissiveIntensity = 0.35 + night * 0.6;
    for (const p of pools) p.material.opacity = (0.35 + 0.65 * night) * 0.26;
    for (const m of neonMats) m.opacity = 0.55 + night * 0.45;
    const dusk = (h >= 18 && h <= 20) ? 1 : 0;
    if (night > 0.5) waterMat.color.setHex(0x0e2a44);
    else if (dusk) waterMat.color.setHex(0x7a4a5e); // sunset reflected in the harbour
    else waterMat.color.setHex(0x14506e);
    waterMat.specular.setHex(dusk ? 0xffaa88 : 0x88bbdd);
    cloudMat.opacity = dusk ? 0.14 : (golden > 0.4 ? 0.45 : (0.08 + 0.25 * Math.max(day, 0)));
    cloudMat.color.setHex(night > 0.5 ? 0x9a8ac8 : ((dusk || golden > 0.4) ? 0xffc8a8 : 0xffffff));
    G.nightFactor = night;
  }

  function update(dt) {
    for (const c of clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 800) c.position.x = -800;
    }
    const t = performance.now() * 0.001;
    for (let i = 0; i < buoys.length; i++) {
      buoys[i].position.y = 0.6 + Math.sin(t * 1.2 + i * 2) * 0.25;
      buoys[i].rotation.z = Math.sin(t * 0.8 + i) * 0.08;
    }
    waterMat.opacity = 0.9 + Math.sin(t * 0.5) * 0.04;
  }

  setHour(17.5);
  return { colliders, roadLoops, setHour, update, buoys };
}

// Circle (player / car) vs building AABBs: push out, return true if hit.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = clamp(pos.x, c.x0, c.x1);
    const nz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Point inside the box: push out through the nearest face.
        const dl = pos.x - c.x0;
        const dr = c.x1 - pos.x;
        const dn = pos.z - c.z0;
        const df = c.z1 - pos.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) pos.x = c.x0 - radius;
        else if (m === dr) pos.x = c.x1 + radius;
        else if (m === dn) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
      }
    }
  }
  return hit;
}

export function inWater(x, z) {
  return x > CITY.waterX && !(x < 430 && z > -115 && z < -85);
}

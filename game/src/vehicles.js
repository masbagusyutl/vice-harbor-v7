// Vice Harbor v7 — vehicles: car factory, traffic AI, police AI, helicopter, boat.
// Written fresh in-session for gta6-01.
import * as THREE from 'three';
import { clamp, lerp, angleDiff, TAU } from './util.js';
import { collideCircle, inWater } from './city.js';

const CAR_COLORS = [0xd83838, 0x2e6ad8, 0xe8c832, 0x38b878, 0xe8e8e8, 0x222228, 0x8a4ad8, 0xd86a2e];

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x888888 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18222e, shininess: 160, specular: 0xffffff });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.85, 2.1), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 1.9), glassMat);
  cabin.position.set(-0.25, 1.35, 0);
  g.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 2.0), bodyMat);
  hood.position.set(1.9, 1.0, 0);
  g.add(hood);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
  const wheels = [];
  for (const [wx, wz] of [[1.5, 1.0], [1.5, -1.0], [-1.5, 1.0], [-1.5, -1.0]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, toneMapped: false });
  for (const wz of [0.62, -0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.42), headMat);
    h.position.set(2.22, 0.72, wz);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false });
  for (const wz of [0.62, -0.62]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.42), tailMat);
    t.position.set(-2.22, 0.72, wz);
    g.add(t);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff, toneMapped: false }));
    bar.position.set(-0.25, 1.82, 0);
    g.add(bar);
    g.userData.lightbar = bar;
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffe83a, toneMapped: false }));
    sign.position.set(-0.25, 1.85, 0);
    g.add(sign);
  }
  g.userData.wheels = wheels;
  g.userData.bodyMat = bodyMat;
  return g;
}

export function makeBoatMesh() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.5, 3.2),
    new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 80 }));
  hull.position.y = 0.5;
  g.add(hull);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.7, 2.4),
    new THREE.MeshPhongMaterial({ color: 0xd83838, shininess: 80 }));
  cab.position.set(-0.8, 1.9, 0);
  g.add(cab);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.3, 3.3),
    new THREE.MeshBasicMaterial({ color: 0x2e6ad8 }));
  stripe.position.y = 1.15;
  g.add(stripe);
  return g;
}

// A drivable car (player or AI). heading 0 = +x, PI/2 = +z? We use heading with forward = (cos h, 0, sin h).
export class Car {
  constructor(G, mesh, x, z, heading) {
    this.G = G;
    this.mesh = mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.damage = 0;
    this.health = 100; // police cars only
    this.isPlayer = false;
    this.stalled = false;
    mesh.position.copy(this.pos);
    mesh.rotation.y = -heading;
    G.scene.add(mesh);
  }
  forward() {
    return { x: Math.cos(this.heading), z: Math.sin(this.heading) };
  }
  step(dt, throttle, steer) {
    if (this.stalled) throttle = 0;
    const accel = 16;
    const maxSpeed = this.isPlayer ? 34 : 24;
    const maxReverse = 10;
    if (throttle > 0) this.speed += accel * throttle * dt;
    else if (throttle < 0) this.speed += accel * 0.8 * throttle * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 8 * dt);
    this.speed = clamp(this.speed, -maxReverse, maxSpeed);
    if (Math.abs(this.speed) > 0.5) {
      this.heading += steer * 1.9 * dt * Math.sign(this.speed) * clamp(Math.abs(this.speed) / 12, 0.3, 1);
    }
    const f = this.forward();
    const nx = this.pos.x + f.x * this.speed * dt;
    const nz = this.pos.z + f.z * this.speed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx;
    this.pos.z = nz;
    if (inWater(this.pos.x, this.pos.z)) { this.pos.x = before.x; this.pos.z = before.z; this.speed *= 0.4; }
    if (collideCircle(this.pos, 2.4, this.G.city.colliders)) {
      if (Math.abs(this.speed) > 6) {
        this.damage += Math.abs(this.speed) * 0.9;
        this.G.onCarCrash?.(this, Math.abs(this.speed));
      }
      this.speed *= 0.35;
    }
    if (this.damage >= 100 && !this.stalled) {
      this.stalled = true;
      this.G.onCarStalled?.(this);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = -this.heading;
    const wheels = this.mesh.userData.wheels || [];
    for (const w of wheels) w.rotation.z -= this.speed * dt * 2;
  }
}

// Traffic: follows a rectangular road loop, yields to cars ahead.
export class TrafficCar extends Car {
  constructor(G, mesh, loop, speed) {
    const [sx, sz] = loop[0];
    super(G, mesh, sx, sz, 0);
    this.loop = loop;
    this.wp = 1;
    this.cruise = speed;
    this.wait = 0;
  }
  stepAI(dt, others) {
    const [tx, tz] = this.loop[this.wp];
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { this.wp = (this.wp + 1) % this.loop.length; return; }
    const target = Math.atan2(dz, dx);
    const diff = angleDiff(this.heading, target);
    // car ahead?
    let blocked = false;
    const f = this.forward();
    for (const o of others) {
      if (o === this) continue;
      const ox = o.pos.x - this.pos.x;
      const oz = o.pos.z - this.pos.z;
      const along = ox * f.x + oz * f.z;
      const side = Math.abs(ox * (-f.z) + oz * f.x);
      if (along > 0 && along < 9 && side < 3) { blocked = true; break; }
    }
    const throttle = blocked ? 0 : (this.speed < this.cruise ? 1 : 0.3);
    this.step(dt, throttle, clamp(diff * 1.6, -1, 1));
  }
}

// Police: pursues the player, rams, tries to box them in.
export class PoliceCar extends Car {
  constructor(G, mesh, x, z) {
    super(G, mesh, x, z, 0);
    this.health = 100;
    this.flashT = 0;
  }
  stepAI(dt, target) {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dz, dx);
    const diff = angleDiff(this.heading, want);
    const throttle = dist > 6 ? 1 : 0.4;
    this.step(dt, throttle, clamp(diff * 2.0, -1, 1));
    this.flashT += dt;
    if (this.mesh.userData.lightbar) {
      this.mesh.userData.lightbar.material.color.setHex(Math.floor(this.flashT * 4) % 2 === 0 ? 0x2244ff : 0xff2222);
    }
    return dist;
  }
}

// Helicopter with a sweeping searchlight.
export class Helicopter {
  constructor(G) {
    this.G = G;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    tail.position.set(-4, 0.4, 0);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1.4;
    g.add(rotor);
    this.rotor = rotor;
    const coneGeo = new THREE.ConeGeometry(7, 55, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = -27;
    cone.rotation.x = Math.PI;
    g.add(cone);
    this.cone = cone;
    const spot = new THREE.SpotLight(0xfff2b0, 60, 90, 0.16, 0.5, 1.2);
    spot.position.set(0, -1, 0);
    g.add(spot);
    this.spot = spot;
    this.spotTarget = new THREE.Object3D();
    G.scene.add(this.spotTarget);
    spot.target = this.spotTarget;
    this.mesh = g;
    this.pos = new THREE.Vector3(0, 55, 0);
    g.position.copy(this.pos);
    G.scene.add(g);
  }
  step(dt, target) {
    const t = performance.now() * 0.001;
    const ox = Math.sin(t * 0.35) * 14;
    const oz = Math.cos(t * 0.28) * 14;
    this.pos.set(target.x + ox, 55 + Math.sin(t * 0.5) * 3, target.z + oz);
    this.mesh.position.copy(this.pos);
    this.rotor.rotation.y += dt * 22;
    const lx = target.x + Math.sin(t * 0.9) * 6;
    const lz = target.z + Math.cos(t * 0.7) * 6;
    this.spotTarget.position.set(lx, 0, lz);
    this.cone.lookAt(lx, 0, lz);
    this.cone.rotateX(Math.PI / 2);
  }
}

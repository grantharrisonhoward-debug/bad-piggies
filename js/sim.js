// Physics simulation for a run: the cave, its props and the player's contraption.
// Has no DOM dependencies so it can also be exercised from Node.
'use strict';

(function (root) {
  const pl = root.planck || (typeof require !== 'undefined' ? require('../lib/planck.min.js') : null);
  const PARTS_ = typeof PARTS !== 'undefined' ? PARTS : root.PARTS;
  const V = (x, y) => new pl.Vec2(x, y);
  const DT = 1 / 120;
  const GROUP = -1; // contraption parts never collide with each other

  const isFrame = t => PARTS_[t] && PARTS_[t].kind === 'frame';

  class Sim {
    constructor(level, design, opts = {}) {
      this.level = level;
      this.breakable = opts.breakable !== false;
      this.found = opts.found || new Set();
      this.world = new pl.World({ gravity: V(0, -10) });
      this.time = 0;
      this.parts = [];
      this.joints = [];      // {joint, strength, stress, kind}
      this.wheelJoints = []; // {joint, part}
      this.ropes = [];       // {joint, balloon, anchorPart}
      this.crates = [];
      this.boulders = [];
      this.stars = [];
      this.particles = [];
      this.events = [];
      this.pending = [];     // deferred actions (outside world.step)
      this.rocketsOn = false;
      this.fansOn = false;
      this.won = false;
      this.maxX = 0;
      this.shake = 0;

      this.buildLevel();
      this.buildContraption(design);
      this.startX = this.center().x;
      this.hookContacts();
    }

    // ---------------------------------------------------------------- level
    buildLevel() {
      const L = this.level, w = this.world;
      const ground = w.createBody();
      ground.setUserData({ kind: 'ground' });
      ground.createFixture(new pl.ChainShape(L.outline.map(p => V(p.x, p.y)), true), { friction: 0.9 });
      for (const poly of L.statics) {
        const b = w.createBody();
        const spike = poly.length === 3 && poly[1].y < poly[0].y && poly[1].y < poly[2].y;
        b.setUserData({ kind: spike ? 'spike' : 'rock', poly });
        b.createFixture(new pl.PolygonShape(poly.map(p => V(p.x, p.y))), { friction: 0.8 });
      }
      for (const c of L.crates) this.addCrate(c.x, c.y);
      for (const bo of L.boulders) {
        const b = w.createBody({ type: 'dynamic', position: V(bo.x, bo.y), angularDamping: 0.2 });
        b.createFixture(new pl.CircleShape(bo.r), { density: 1.5, friction: 0.9, restitution: 0.05 });
        const o = { body: b, r: bo.r };
        b.setUserData({ kind: 'boulder', obj: o });
        this.boulders.push(o);
      }
      L.stars.forEach((s, i) => {
        const b = w.createBody({ position: V(s.x, s.y) });
        b.createFixture(new pl.CircleShape(0.65), { isSensor: true });
        const o = { body: b, x: s.x, y: s.y, i, taken: false, seenBefore: this.found.has(i) };
        b.setUserData({ kind: 'star', obj: o });
        this.stars.push(o);
      });
      const t = L.trophy;
      const tb = w.createBody({ position: V(t.x, t.y + 2) });
      tb.createFixture(new pl.BoxShape(1.5, 2.5), { isSensor: true });
      tb.setUserData({ kind: 'trophy' });
    }

    addCrate(x, y) {
      const b = this.world.createBody({ type: 'dynamic', position: V(x, y) });
      b.createFixture(new pl.BoxShape(0.48, 0.48), { density: 0.25, friction: 0.6 });
      const o = { body: b, alive: true };
      b.setUserData({ kind: 'crate', obj: o });
      this.crates.push(o);
    }

    // ---------------------------------------------------------- contraption
    buildContraption(design) {
      const { cols, rows, cells } = design;
      const at = (r, c) => (r >= 0 && c >= 0 && r < rows && c < cols) ? cells[r * cols + c] : null;
      let minC = cols, maxC = -1, maxR = -1;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (at(r, c)) {
        minC = Math.min(minC, c); maxC = Math.max(maxC, c); maxR = Math.max(maxR, r);
      }
      if (maxR < 0) return;
      const x0 = 4 - minC, y0 = this.level.floorAt(4) + 0.62;
      const posOf = (r, c) => V(x0 + c, y0 + (maxR - r));
      const grid = {};

      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cell = at(r, c);
        if (!cell) continue;
        const def = PARTS_[cell.t];
        const body = this.world.createBody({ type: 'dynamic', position: posOf(r, c), linearDamping: 0.03, angularDamping: 0.05 });
        const fix = { density: def.density, friction: def.friction || 0.6, restitution: 0.05, filterGroupIndex: GROUP };
        if (def.kind === 'wheel' || def.kind === 'balloon') body.createFixture(new pl.CircleShape(def.radius), fix);
        else if (def.thin) body.createFixture(new pl.BoxShape(0.5, 0.1), fix);
        else body.createFixture(new pl.BoxShape(0.5, 0.5), fix);
        const part = { type: cell.t, rot: cell.r || 0, body, r, c, alive: true, spin: 0 };
        body.setUserData({ kind: 'part', part });
        this.parts.push(part);
        grid[r + ',' + c] = part;
      }
      const g = (r, c) => grid[r + ',' + c];

      for (const p of this.parts) {
        const def = PARTS_[p.type];
        if (def.kind === 'frame') {
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const q = g(p.r + dr, p.c + dc);
            if (q && isFrame(q.type)) {
              const a = posOf(p.r, p.c), b = posOf(q.r, q.c);
              const j = this.world.createJoint(new pl.WeldJoint({}, p.body, q.body, V((a.x + b.x) / 2, (a.y + b.y) / 2)));
              this.joints.push({ joint: j, strength: 1.4 * Math.min(def.strength, PARTS_[q.type].strength), stress: 0, kind: 'weld' });
            }
          }
        } else if (def.kind === 'wheel') {
          const host = [[-1, 0], [0, -1], [0, 1], [1, 0]].map(([dr, dc]) => g(p.r + dr, p.c + dc)).find(q => q && isFrame(q.type));
          if (host) {
            const j = this.world.createJoint(new pl.RevoluteJoint({ enableMotor: false, maxMotorTorque: 0 }, host.body, p.body, p.body.getPosition()));
            this.joints.push({ joint: j, strength: 1.4 * Math.min(def.strength, PARTS_[host.type].strength) * 1.3, stress: 0, kind: 'axle' });
            this.wheelJoints.push({ joint: j, part: p });
          }
        } else if (def.kind === 'balloon') {
          const dirs = [[1, 0], [0, -1], [0, 1], [-1, 0]];
          for (const [dr, dc] of dirs) {
            const q = g(p.r + dr, p.c + dc);
            if (q && q.type !== 'balloon') {
              const la = V(-dc * 0.5 * (isFrame(q.type) ? 1 : 0), dr * 0.5 * (isFrame(q.type) ? 1 : 0)); // edge facing the balloon
              const j = this.world.createJoint(new pl.RopeJoint({ bodyA: q.body, bodyB: p.body, localAnchorA: la, localAnchorB: V(0, -def.radius), maxLength: 1.0 }));
              this.ropes.push({ joint: j, balloon: p, anchor: q, la });
              break;
            }
          }
        }
      }
      this.pilot = this.parts.find(p => p.type === 'pilot') || null;
      this.counts = {};
      for (const p of this.parts) this.counts[p.type] = (this.counts[p.type] || 0) + 1;
    }

    center() {
      if (this.pilot && this.pilot.alive) return this.pilot.body.getPosition();
      const live = this.parts.filter(p => p.alive && p.type !== 'balloon');
      if (!live.length) return V(4, 2);
      let x = 0, y = 0;
      for (const p of live) { const q = p.body.getPosition(); x += q.x; y += q.y; }
      return V(x / live.length, y / live.length);
    }

    velocity() {
      const p = (this.pilot && this.pilot.alive) ? this.pilot : this.parts.find(p => p.alive);
      return p ? p.body.getLinearVelocity() : V(0, 0);
    }

    // -------------------------------------------------------------- contacts
    hookContacts() {
      const ud = f => f.getBody().getUserData() || {};
      this.world.on('begin-contact', contact => {
        const a = ud(contact.getFixtureA()), b = ud(contact.getFixtureB());
        for (const [x, y] of [[a, b], [b, a]]) {
          if (y.kind !== 'part') continue;
          if (x.kind === 'star' && !x.obj.taken) { x.obj.taken = true; this.pending.push(() => this.collectStar(x.obj)); }
          if (x.kind === 'trophy' && !this.won) { this.won = true; this.events.push({ type: 'win' }); }
          if (x.kind === 'spike' && y.part.type === 'balloon') { const p = y.part; this.pending.push(() => this.popBalloon(p)); }
        }
      });
      this.world.on('post-solve', (contact, impulse) => {
        const a = ud(contact.getFixtureA()), b = ud(contact.getFixtureB());
        const n = impulse.normalImpulses;
        const imp = Math.max(n[0] || 0, n[1] || 0);
        for (const x of [a, b]) {
          if (x.kind === 'part' && x.part.type === 'tnt' && imp > 3.2 && !x.part.fused) {
            x.part.fused = true; const p = x.part; this.pending.push(() => this.explode(p));
          }
          if (x.kind === 'crate' && imp > 1.4 && x.obj.alive) {
            const o = x.obj; this.pending.push(() => this.smashCrate(o));
          }
        }
        if (imp > 1.5 && (a.kind === 'part' || b.kind === 'part')) this.events.push({ type: 'bump', power: imp });
      });
    }

    collectStar(s) {
      this.world.destroyBody(s.body);
      this.found.add(s.i);
      this.events.push({ type: 'star', star: s, first: !s.seenBefore });
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
        this.particles.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8, max: 0.8, color: '#ffe066', size: 0.14, g: 0 });
      }
    }

    smashCrate(o) {
      if (!o.alive) return;
      o.alive = false;
      const p = o.body.getPosition();
      this.world.destroyBody(o.body);
      this.debris(p.x, p.y, '#b07a3e', 10);
      this.events.push({ type: 'smash' });
    }

    debris(x, y, color, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 5;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, life: 1.2, max: 1.2, color, size: 0.12 + Math.random() * 0.12, g: 1, rot: Math.random() * 6 });
      }
    }

    removePart(p) {
      if (!p.alive) return;
      p.alive = false;
      const b = p.body;
      this.joints = this.joints.filter(j => j.joint.getBodyA() !== b && j.joint.getBodyB() !== b);
      this.wheelJoints = this.wheelJoints.filter(j => j.joint.getBodyA() !== b && j.joint.getBodyB() !== b);
      this.ropes = this.ropes.filter(j => j.joint.getBodyA() !== b && j.joint.getBodyB() !== b);
      this.world.destroyBody(b);
    }

    // --------------------------------------------------------------- actions
    toggleRockets() { if (this.counts.rocket) this.rocketsOn = !this.rocketsOn; return this.rocketsOn; }
    toggleFans() { if (this.counts.fan) this.fansOn = !this.fansOn; return this.fansOn; }

    popBalloon(p) {
      if (!p) p = this.parts.find(q => q.alive && q.type === 'balloon');
      if (!p || !p.alive) return;
      const pos = p.body.getPosition();
      this.removePart(p);
      this.debris(pos.x, pos.y, '#e8453c', 8);
      this.events.push({ type: 'pop' });
    }

    detonate() {
      const all = this.parts.filter(p => p.alive && p.type === 'tnt');
      all.forEach((p, i) => { p.fused = true; this.pending.push({ at: this.time + i * 0.08, fn: () => this.explode(p) }); });
    }

    explode(p) {
      if (!p.alive) return;
      const c = p.body.getPosition().clone();
      this.removePart(p);
      const R = 5.5, POWER = 14;
      for (let b = this.world.getBodyList(); b; b = b.getNext()) {
        if (!b.isDynamic()) continue;
        const d = pl.Vec2.sub(b.getWorldCenter(), c);
        const len = d.length();
        if (len > R) continue;
        const u = len > 0.01 ? pl.Vec2.mul(d, 1 / len) : V(0, 1);
        const k = POWER * (1 - len / R) * Math.min(1, 0.4 + b.getMass());
        b.applyLinearImpulse(pl.Vec2.mul(u, k), b.getWorldCenter(), true);
        const u2 = b.getUserData() || {};
        if (u2.kind === 'crate' && len < R * 0.55) { const o = u2.obj; this.pending.push(() => this.smashCrate(o)); }
        if (u2.kind === 'part' && u2.part.type === 'tnt' && !u2.part.fused) {
          u2.part.fused = true; const q = u2.part; this.pending.push({ at: this.time + 0.12, fn: () => this.explode(q) });
        }
        if (u2.kind === 'part' && u2.part.type === 'balloon' && len < R * 0.6) { const q = u2.part; this.pending.push(() => this.popBalloon(q)); }
      }
      // shock breaks nearby joints outright
      if (this.breakable) {
        this.joints = this.joints.filter(j => {
          const a = j.joint.getAnchorA();
          if (pl.Vec2.distance(a, c) < 1.6) { this.world.destroyJoint(j.joint); this.forgetJoint(j.joint); return false; }
          return true;
        });
      }
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 10;
        const hot = Math.random() < 0.6;
        this.particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, max: 0.7, color: hot ? '#ffb030' : '#5a5060', size: hot ? 0.35 : 0.5, g: hot ? 0 : -0.5, fire: hot });
      }
      this.debris(c.x, c.y, '#c9302a', 8);
      this.shake = 0.6;
      this.events.push({ type: 'boom', x: c.x, y: c.y });
    }

    forgetJoint(joint) {
      this.wheelJoints = this.wheelJoints.filter(w => w.joint !== joint);
      this.ropes = this.ropes.filter(r => r.joint !== joint);
    }

    // ------------------------------------------------------------------ step
    step(frameDt, input) {
      // fixed timestep: variable steps would make joint reaction forces spike
      this.acc = Math.min((this.acc || 0) + frameDt, DT * 8);
      while (this.acc >= DT) {
        this.substep(DT, input);
        this.acc -= DT;
      }
      // particles
      for (const q of this.particles) {
        q.life -= frameDt;
        q.vy -= 10 * (q.g || 0) * frameDt;
        q.vx *= 0.985; q.vy *= 0.985;
        q.x += q.vx * frameDt; q.y += q.vy * frameDt;
        if (q.rot !== undefined) q.rot += frameDt * 8;
      }
      this.particles = this.particles.filter(q => q.life > 0);
      if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
      this.shake = Math.max(0, this.shake - frameDt * 1.5);
      const cx = this.center().x;
      this.maxX = Math.max(this.maxX, cx - this.startX);
    }

    substep(dt, input) {
      const drive = input.drive || 0;
      const engines = this.parts.filter(p => p.alive && p.type === 'engine').length;
      for (const p of this.parts) if (p.type === 'engine') p.on = p.alive && drive !== 0;

      // wheels
      for (const w of this.wheelJoints) {
        const j = w.joint, r = PARTS_[w.part.type].radius;
        if (engines > 0 && drive !== 0) {
          const speed = Math.min(16, 9 + 2 * engines) / r;
          j.enableMotor(true);
          j.setMotorSpeed(-drive * speed);
          j.setMaxMotorTorque((3 + 5 * engines) * r / 0.46);
        } else {
          j.enableMotor(false);
        }
      }

      for (const p of this.parts) {
        if (!p.alive) continue;
        const b = p.body, def = PARTS_[p.type];
        if (p.type === 'rocket' && this.rocketsOn) {
          const a = p.rot * Math.PI / 2;
          const dir = b.getWorldVector(V(Math.cos(a), Math.sin(a)));
          b.applyForceToCenter(pl.Vec2.mul(dir, def.thrust), true);
          if (Math.random() < 0.5) {
            const q = b.getWorldPoint(V(-Math.cos(a) * 0.5, -Math.sin(a) * 0.5));
            this.particles.push({ x: q.x, y: q.y, vx: -dir.x * 6 + (Math.random() - 0.5) * 2, vy: -dir.y * 6 + (Math.random() - 0.5) * 2, life: 0.5, max: 0.5, color: '#ffa030', size: 0.25, g: -0.3, fire: true });
          }
        }
        if (p.type === 'fan') {
          if (this.fansOn) {
            const a = p.rot * Math.PI / 2;
            const dir = b.getWorldVector(V(Math.cos(a), Math.sin(a)));
            b.applyForceToCenter(pl.Vec2.mul(dir, def.thrust), true);
            p.spin += dt * 40;
          }
        }
        if (p.type === 'balloon') {
          b.applyForceToCenter(V(0, def.lift), true);
        }
        if (p.type === 'wing') {
          // flat-plate aerodynamics: resist motion across the wing's face
          const n = b.getWorldVector(V(0, 1));
          const v = b.getLinearVelocity();
          const vn = pl.Vec2.dot(v, n);
          const mag = Math.max(-40, Math.min(40, -vn * Math.abs(vn) * 0.55));
          b.applyForceToCenter(pl.Vec2.mul(n, mag), true);
        }
        if (p.type === 'pilot') {
          const v = b.getLinearVelocity().length();
          p.scared = v > 11 || this.rocketsOn;
        }
      }
      for (const w of this.wheelJoints) w.part.spin = w.part.body.getAngle();

      // lean: rotate the whole contraption about its centre of mass
      if (input.lean) {
        const live = this.parts.filter(p => p.alive && p.type !== 'balloon');
        let m = 0, cx = 0, cy = 0;
        for (const p of live) { const bm = p.body.getMass(), c = p.body.getWorldCenter(); m += bm; cx += c.x * bm; cy += c.y * bm; }
        if (m > 0) {
          cx /= m; cy /= m;
          const alpha = input.lean * 3.2;
          for (const p of live) {
            const b = p.body, c = b.getWorldCenter();
            const rx = c.x - cx, ry = c.y - cy;
            b.applyForceToCenter(V(-ry * alpha * b.getMass(), rx * alpha * b.getMass()), true);
            b.applyTorque(b.getInertia() * alpha, true);
          }
        }
      }

      this.world.step(dt, 10, 5);
      this.time += dt;

      // joint stress
      if (this.breakable) {
        const inv = 1 / dt;
        this.joints = this.joints.filter(j => {
          let f = j.joint.getReactionForce(inv).length();
          if (j.kind === 'weld') f += Math.abs(j.joint.getReactionTorque(inv)) * 1.5;
          j.stress = j.stress * 0.8 + f * 0.2;
          if (j.stress > j.strength) {
            const a = j.joint.getAnchorA();
            this.world.destroyJoint(j.joint);
            this.forgetJoint(j.joint);
            this.debris(a.x, a.y, '#d6b27a', 5);
            this.events.push({ type: 'snap' });
            return false;
          }
          return true;
        });
      }

      // deferred actions
      if (this.pending.length) {
        const now = this.pending, later = [];
        this.pending = [];
        for (const a of now) {
          if (typeof a === 'function') a();
          else if (a.at <= this.time) a.fn();
          else later.push(a);
        }
        this.pending.push(...later);
      }

      // parts that fell out of the world
      for (const p of this.parts) if (p.alive && p.body.getPosition().y < -200) this.removePart(p);
    }
  }

  Sim.DT = DT;
  root.Sim = Sim;
  if (typeof module !== 'undefined') module.exports = Sim;
})(typeof window !== 'undefined' ? window : globalThis);

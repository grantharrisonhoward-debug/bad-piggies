// Procedural (but seeded, so always the same) giant sandbox cave.
'use strict';

const Level = (() => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const smooth = t => t * t * (3 - 2 * t);

  // Smooth 1D value noise sampled at integer "knots" spaced `step` metres apart.
  function noise1d(rng, length, step, lo, hi) {
    const knots = [];
    for (let i = 0; i <= Math.ceil(length / step) + 1; i++) knots.push(lo + rng() * (hi - lo));
    return x => {
      const f = x / step, i = Math.max(0, Math.floor(f)), t = smooth(f - i);
      return knots[i] + (knots[Math.min(i + 1, knots.length - 1)] - knots[i]) * t;
    };
  }

  function generate(seed) {
    const rng = mulberry32(seed);
    const R = (a, b) => a + rng() * (b - a);
    const START = 36;          // flat launch pad
    const segTypes = ['rolling', 'hill', 'jump', 'bumps', 'valley', 'chamber', 'steps', 'pit', 'rolling', 'jump', 'chamber'];

    // --- Build the floor as a list of segments -----------------------------
    const segs = [];
    let x = 0, base = 0;
    segs.push({ type: 'flat', x0: -4, x1: START, b0: 0, b1: 0 });
    x = START;
    const order = ['rolling', 'bumps', 'hill'];
    for (let k = 0; k < 3; k++) {
      const shuffled = segTypes.slice().sort(() => rng() - 0.5);
      order.push(...shuffled);
    }
    for (const type of order) {
      const len = type === 'chamber' ? R(60, 80) : type === 'bumps' ? R(26, 36) : R(34, 52);
      let b1 = base + R(-7, 7);
      if (type === 'chamber' || type === 'jump' || type === 'pit') b1 = base + R(-4, 4);
      b1 = Math.max(-30, Math.min(30, b1));
      segs.push({ type, x0: x, x1: x + len, b0: base, b1, h: R(3, 7), k: 1 + Math.floor(R(1, 3)) });
      x += len; base = b1;
    }
    const END = x + 50;
    segs.push({ type: 'flat', x0: x, x1: END + 4, b0: base, b1: base });

    function floorAt(px) {
      let s = segs[0];
      for (const sg of segs) if (px >= sg.x0 && px < sg.x1) { s = sg; break; }
      if (px >= segs[segs.length - 1].x1) s = segs[segs.length - 1];
      const t = Math.max(0, Math.min(1, (px - s.x0) / (s.x1 - s.x0)));
      const b = s.b0 + (s.b1 - s.b0) * smooth(t);
      const S = Math.sin;
      switch (s.type) {
        case 'rolling': return b + s.h * 0.5 * S(Math.PI * s.k * t) * S(Math.PI * t);
        case 'hill': return b + s.h * 1.2 * Math.pow(S(Math.PI * t), 2);
        case 'valley': return b - s.h * Math.pow(S(Math.PI * t), 2);
        case 'bumps': return b + 0.45 * Math.abs(S(Math.PI * 14 * t));
        case 'steps': {
          // terraces joined by short steep ramps
          const f = t * 5, i = Math.min(4, Math.floor(f));
          const ramp = smooth(Math.max(0, Math.min(1, (f - i - 0.75) / 0.25)));
          return s.b0 + (s.b1 - s.b0) * Math.min(1, (i + ramp) / 5);
        }
        case 'pit': {
          // a deep hole with steep walls — rockets or balloons recommended
          const e = 0.3;
          const d = t < e ? smooth(t / e) : t > 1 - e ? smooth((1 - t) / e) : 1;
          return b - 8 * d;
        }
        default: return b;
      }
    }

    // --- Sample floor and ceiling -------------------------------------------
    const STEP = 1;
    const floor = [], ceil = [];
    const gapN = noise1d(rng, END + 10, 24, 11, 24);
    const roughN = noise1d(rng, END + 10, 5, -1.4, 1.4);
    const smoothFloor = px => {
      let sum = 0, n = 0;
      for (let d = -12; d <= 12; d += 3) { sum += floorAt(px + d); n++; }
      return sum / n;
    };
    const chamberBoost = px => {
      for (const s of segs) {
        if (s.type === 'chamber' && px > s.x0 - 12 && px < s.x1 + 12) {
          const t = (px - (s.x0 - 12)) / (s.x1 - s.x0 + 24);
          return 26 * Math.pow(Math.sin(Math.PI * t), 1.5);
        }
      }
      return 0;
    };
    for (let px = -4; px <= END + 4; px += STEP) {
      let fy = floorAt(px);
      // slight texture on floors
      fy += Math.sin(px * 1.7) * 0.06;
      floor.push({ x: px, y: fy });
      let cy = smoothFloor(px) + gapN(px) + chamberBoost(px) + roughN(px);
      if (px < START) cy = Math.max(cy, 13);
      cy = Math.max(cy, fy + 8);
      ceil.push({ x: px, y: cy });
    }
    // Close off the ends with walls.
    const outline = floor.concat(ceil.slice().reverse());

    // --- Decorations and objects --------------------------------------------
    const idxAt = px => Math.max(0, Math.min(floor.length - 1, Math.round(px + 4)));
    const fAt = px => floor[idxAt(px)].y;
    const cAt = px => ceil[idxAt(px)].y;

    const statics = [];   // convex polygons (world coords)
    const crates = [];    // {x,y}
    const boulders = [];  // {x,y,r}
    const stars = [];     // {x,y}
    const crystals = [];  // decoration {x,y,a,s,hue,ceil}
    const signs = [];

    for (const s of segs) {
      const mid = (s.x0 + s.x1) / 2;
      if (s.type === 'jump') {
        // launch ramp
        const rx = s.x0 + (s.x1 - s.x0) * 0.35, w = R(6, 9), h = R(1.8, 3.2);
        const y0 = fAt(rx) - 0.4, y1 = fAt(rx + w) - 0.4;
        statics.push([{ x: rx, y: y0 }, { x: rx + w, y: y1 }, { x: rx + w, y: y1 + h + 0.4 }]);
        statics.push([{ x: rx + w, y: y1 }, { x: rx + w + 0.8, y: y1 }, { x: rx + w + 0.8, y: y1 + h + 0.4 }, { x: rx + w, y: y1 + h + 0.4 }]);
        stars.push({ x: rx + w + 8, y: fAt(rx + w + 8) + h + 5 });
      }
      if (s.type === 'chamber') {
        // floating ledges to reach the roof of big chambers
        const n = 3 + Math.floor(R(0, 3));
        for (let i = 0; i < n; i++) {
          const px = s.x0 + (i + 0.5) * (s.x1 - s.x0) / n + R(-3, 3);
          const lo = fAt(px) + 6, hi = cAt(px) - 5;
          if (hi - lo < 3) continue;
          const py = lo + R(0.2, 0.9) * (hi - lo), w = R(3, 6);
          statics.push([{ x: px - w, y: py - 0.5 }, { x: px + w, y: py - 0.5 }, { x: px + w - 0.3, y: py + 0.4 }, { x: px - w + 0.3, y: py + 0.4 }]);
          stars.push({ x: px, y: py + 1.6 });
          if (rng() < 0.5) crates.push({ x: px + R(-1.5, 1.5), y: py + 1.0 });
        }
        stars.push({ x: mid, y: cAt(mid) - 3 });
      }
      if (s.type === 'pit') {
        stars.push({ x: mid, y: fAt(mid) + 1.5 });
        // a rickety crate bridge half-way
        for (let i = 0; i < 3; i++) crates.push({ x: mid - 1 + i, y: fAt(mid) + 0.5 });
      }
      if (s.type === 'hill') {
        stars.push({ x: mid, y: fAt(mid) + 3 });
        if (rng() < 0.7) boulders.push({ x: mid + 3, y: fAt(mid + 3) + 2, r: R(0.8, 1.4) });
      }
      if (s.type === 'valley' || s.type === 'rolling') {
        const px = s.x0 + R(0.3, 0.7) * (s.x1 - s.x0);
        stars.push({ x: px, y: fAt(px) + R(1.5, 5) });
        if (rng() < 0.5) {
          // stack of crates to crash through
          const cx = s.x0 + R(0.2, 0.8) * (s.x1 - s.x0);
          const hgt = 1 + Math.floor(R(0, 3));
          for (let r = 0; r < hgt; r++) for (let c = 0; c < 3 - (r > 1 ? 1 : 0); c++) crates.push({ x: cx + c * 1.02 + (r > 1 ? 0.5 : 0), y: fAt(cx) + 0.55 + r * 1.02 });
        }
      }
      if (s.type === 'steps') stars.push({ x: s.x1 - 3, y: fAt(s.x1 - 3) + 2 });
      if (s.type === 'bumps') stars.push({ x: mid, y: fAt(mid) + 1.6 });
    }

    // stalactites where there is headroom
    for (let px = START + 10; px < END - 10; px += R(6, 16)) {
      const gap = cAt(px) - fAt(px);
      if (gap < 14) continue;
      const w = R(0.8, 1.8), len = Math.min(R(2, 6), gap * 0.35);
      const c0 = cAt(px - w), c1 = cAt(px + w);
      statics.push([{ x: px - w, y: c0 + 1 }, { x: px + R(-0.3, 0.3), y: Math.min(c0, c1) - len }, { x: px + w, y: c1 + 1 }]);
    }
    // crystals (decoration)
    for (let px = 0; px < END; px += R(3, 9)) {
      const onCeil = rng() < 0.45;
      crystals.push({ x: px, y: onCeil ? cAt(px) : fAt(px), a: R(-0.5, 0.5) + (onCeil ? Math.PI : 0), s: R(0.5, 1.3), hue: [190, 280, 160, 320][Math.floor(rng() * 4)], ceil: onCeil });
    }

    // Keep stars inside the cave.
    for (const st of stars) {
      st.y = Math.max(fAt(st.x) + 1.2, Math.min(cAt(st.x) - 1.2, st.y));
    }

    signs.push({ x: 6, y: fAt(6), text: 'START' });
    const trophy = { x: END - 18, y: fAt(END - 18) };

    return { seed, floor, ceil, outline, statics, crates, boulders, stars, crystals, signs, trophy, START, END, floorAt: fAt, ceilAt: cAt };
  }

  return { generate };
})();

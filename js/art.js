// Part definitions and all hand-drawn part art.
// Art is drawn in a local, y-down unit space where a grid cell spans -0.5..0.5.
'use strict';

const PARTS = {
  pilot:   { name: 'Pilot',       key: '1', kind: 'frame', density: 0.9, strength: 1100, friction: 0.6 },
  wood:    { name: 'Wood Frame',  key: '2', kind: 'frame', density: 0.5, strength: 750, friction: 0.7 },
  metal:   { name: 'Metal Frame', key: '3', kind: 'frame', density: 1.6, strength: 2600, friction: 0.5 },
  wheel:   { name: 'Wheel',       key: '4', kind: 'wheel', density: 0.7, strength: 1300, radius: 0.46, friction: 1.4 },
  small:   { name: 'Small Wheel', key: '5', kind: 'wheel', density: 0.6, strength: 1000, radius: 0.3, friction: 1.2 },
  engine:  { name: 'Engine',      key: '6', kind: 'frame', density: 1.3, strength: 1300, friction: 0.5 },
  rocket:  { name: 'Rocket',      key: '7', kind: 'frame', density: 0.4, strength: 800, friction: 0.5, rotates: true, thrust: 30 },
  fan:     { name: 'Fan',         key: '8', kind: 'frame', density: 0.6, strength: 800, friction: 0.5, rotates: true, thrust: 11 },
  balloon: { name: 'Balloon',     key: '9', kind: 'balloon', density: 0.05, lift: 8.5, radius: 0.42 },
  wing:    { name: 'Wing',        key: '0', kind: 'frame', density: 0.25, strength: 650, friction: 0.4, thin: true },
  tnt:     { name: 'TNT',         key: '-', kind: 'frame', density: 0.6, strength: 700, friction: 0.6 },
};
const PART_ORDER = ['pilot', 'wood', 'metal', 'wheel', 'small', 'engine', 'rocket', 'fan', 'balloon', 'wing', 'tnt'];

const Art = (() => {
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function woodBox(ctx, light, dark) {
    rrect(ctx, -0.5, -0.5, 1, 1, 0.06);
    ctx.fillStyle = light; ctx.fill();
    ctx.lineWidth = 0.08; ctx.strokeStyle = dark; ctx.stroke();
    // planks
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.44, -0.16); ctx.lineTo(0.44, -0.16);
    ctx.moveTo(-0.44, 0.16); ctx.lineTo(0.44, 0.16);
    ctx.stroke();
    // cross brace
    ctx.lineWidth = 0.09;
    ctx.beginPath(); ctx.moveTo(-0.38, 0.38); ctx.lineTo(0.38, -0.38); ctx.stroke();
    ctx.fillStyle = '#3b2412';
    for (const [x, y] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
      ctx.beginPath(); ctx.arc(x, y, 0.035, 0, Math.PI * 2); ctx.fill();
    }
  }

  function metalBox(ctx) {
    rrect(ctx, -0.5, -0.5, 1, 1, 0.05);
    const g = ctx.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
    g.addColorStop(0, '#b9c3cc'); g.addColorStop(1, '#6d7883');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 0.08; ctx.strokeStyle = '#3c444d'; ctx.stroke();
    ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(40,48,56,.55)';
    rrect(ctx, -0.32, -0.32, 0.64, 0.64, 0.04); ctx.stroke();
    ctx.fillStyle = '#e4e9ee';
    for (const [x, y] of [[-0.39, -0.39], [0.39, -0.39], [-0.39, 0.39], [0.39, 0.39]]) {
      ctx.beginPath(); ctx.arc(x, y, 0.045, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Pip: a goggled, amber cave-mole who rides in the pilot crate. Original character.
  function pip(ctx, t, scared) {
    const bob = Math.sin(t * 3) * 0.015;
    ctx.save();
    ctx.translate(0, 0.05 + bob);
    // ears
    ctx.fillStyle = '#c9851c';
    ctx.beginPath(); ctx.arc(-0.24, -0.22, 0.08, 0, Math.PI * 2); ctx.arc(0.24, -0.22, 0.08, 0, Math.PI * 2); ctx.fill();
    // body/head blob
    ctx.fillStyle = '#f0b43c';
    ctx.beginPath(); ctx.ellipse(0, 0.02, 0.3, 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 0.03; ctx.strokeStyle = '#8a5510'; ctx.stroke();
    // belly patch
    ctx.fillStyle = '#fbe0a0';
    ctx.beginPath(); ctx.ellipse(0, 0.15, 0.17, 0.11, 0, 0, Math.PI * 2); ctx.fill();
    // leather cap
    ctx.fillStyle = '#6a3f22';
    ctx.beginPath(); ctx.ellipse(0, -0.14, 0.27, 0.14, 0, Math.PI, 0); ctx.fill();
    // goggle strap
    ctx.fillStyle = '#3d2a1c';
    ctx.fillRect(-0.3, -0.13, 0.6, 0.06);
    // goggles
    for (const x of [-0.11, 0.11]) {
      ctx.fillStyle = '#9aa6ae';
      ctx.beginPath(); ctx.arc(x, -0.1, 0.095, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9fe2ff';
      ctx.beginPath(); ctx.arc(x, -0.1, 0.068, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b24';
      const d = scared ? 0.018 : 0.03;
      ctx.beginPath(); ctx.arc(x + 0.012, -0.095, d, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 0.025, -0.125, 0.018, 0, Math.PI * 2); ctx.fill();
    }
    // snout + nose
    ctx.fillStyle = '#f6c865';
    ctx.beginPath(); ctx.ellipse(0, 0.03, 0.1, 0.065, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0607a';
    ctx.beginPath(); ctx.ellipse(0, 0.0, 0.045, 0.032, 0, 0, Math.PI * 2); ctx.fill();
    // mouth
    ctx.strokeStyle = '#5a2d0c'; ctx.lineWidth = 0.022;
    ctx.beginPath();
    if (scared) { ctx.ellipse(0, 0.08, 0.03, 0.025, 0, 0, Math.PI * 2); }
    else { ctx.arc(0, 0.055, 0.045, 0.2, Math.PI - 0.2); }
    ctx.stroke();
    // little paws on the crate rim
    ctx.fillStyle = '#e39d27';
    ctx.beginPath(); ctx.ellipse(-0.2, 0.27, 0.07, 0.045, 0, 0, Math.PI * 2); ctx.ellipse(0.2, 0.27, 0.07, 0.045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function pilot(ctx, t, st) {
    rrect(ctx, -0.5, -0.5, 1, 1, 0.06);
    ctx.fillStyle = '#3a2a1f'; ctx.fill();
    pip(ctx, t, st && st.scared);
    // front rim of crate
    ctx.fillStyle = '#c89556';
    ctx.fillRect(-0.5, 0.26, 1, 0.24);
    ctx.lineWidth = 0.03; ctx.strokeStyle = '#6e4520';
    ctx.beginPath(); ctx.moveTo(-0.5, 0.38); ctx.lineTo(0.5, 0.38); ctx.stroke();
    rrect(ctx, -0.5, -0.5, 1, 1, 0.06);
    ctx.lineWidth = 0.08; ctx.strokeStyle = '#6e4520'; ctx.stroke();
  }

  function wheel(ctx, r, hub) {
    ctx.fillStyle = '#26232a';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = r * 0.12; ctx.strokeStyle = '#3d3942';
    ctx.setLineDash([r * 0.18, r * 0.14]);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hub;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
    }
    ctx.stroke();
    ctx.fillStyle = '#ddd';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fill();
  }

  function engine(ctx, t, st) {
    const on = st && st.on;
    const shake = on ? Math.sin(t * 60) * 0.02 : 0;
    ctx.save(); ctx.translate(shake, 0);
    rrect(ctx, -0.5, -0.5, 1, 1, 0.06);
    ctx.fillStyle = '#4b4f58'; ctx.fill();
    ctx.lineWidth = 0.08; ctx.strokeStyle = '#26292f'; ctx.stroke();
    // cylinders
    for (const x of [-0.2, 0.2]) {
      const up = on ? Math.sin(t * 40 + x * 10) * 0.05 : 0;
      ctx.fillStyle = '#8d949e';
      rrect(ctx, x - 0.12, -0.36 + up, 0.24, 0.34, 0.03); ctx.fill();
      ctx.fillStyle = '#c8322e';
      rrect(ctx, x - 0.14, -0.42 + up, 0.28, 0.1, 0.03); ctx.fill();
    }
    ctx.fillStyle = '#2b2e34';
    rrect(ctx, -0.38, 0.02, 0.76, 0.36, 0.05); ctx.fill();
    ctx.strokeStyle = '#6f7580'; ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const y = 0.08 + i * 0.08; ctx.moveTo(-0.32, y); ctx.lineTo(0.32, y); }
    ctx.stroke();
    ctx.restore();
  }

  function rocket(ctx, t, st) {
    const on = st && st.on;
    if (on) {
      const f = 0.35 + Math.random() * 0.25;
      const g = ctx.createLinearGradient(-0.3, 0, -0.3 - f, 0);
      g.addColorStop(0, '#fff6b0'); g.addColorStop(0.4, '#ffae2a'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-0.32, -0.14); ctx.quadraticCurveTo(-0.32 - f, 0, -0.32, 0.14); ctx.fill();
    }
    // nozzle
    ctx.fillStyle = '#50545c';
    ctx.beginPath(); ctx.moveTo(-0.3, -0.12); ctx.lineTo(-0.44, -0.18); ctx.lineTo(-0.44, 0.18); ctx.lineTo(-0.3, 0.12); ctx.fill();
    // body
    rrect(ctx, -0.32, -0.2, 0.56, 0.4, 0.06);
    ctx.fillStyle = '#e8e2d6'; ctx.fill();
    ctx.lineWidth = 0.04; ctx.strokeStyle = '#6a5d50'; ctx.stroke();
    ctx.fillStyle = '#d63b2f';
    ctx.fillRect(-0.16, -0.2, 0.1, 0.4);
    // nose cone
    ctx.beginPath(); ctx.moveTo(0.22, -0.2); ctx.quadraticCurveTo(0.5, -0.12, 0.5, 0); ctx.quadraticCurveTo(0.5, 0.12, 0.22, 0.2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // fins
    ctx.fillStyle = '#d63b2f';
    ctx.beginPath(); ctx.moveTo(-0.3, -0.2); ctx.lineTo(-0.42, -0.4); ctx.lineTo(-0.12, -0.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.3, 0.2); ctx.lineTo(-0.42, 0.4); ctx.lineTo(-0.12, 0.2); ctx.fill();
  }

  function fan(ctx, t, st) {
    const on = st && st.on;
    // housing
    rrect(ctx, -0.12, -0.46, 0.5, 0.92, 0.08);
    ctx.fillStyle = '#7d8793'; ctx.fill();
    ctx.lineWidth = 0.05; ctx.strokeStyle = '#3c444d'; ctx.stroke();
    // blades, seen side-on: squashed ellipse spinning
    const a = (st && st.spin) || 0;
    ctx.save(); ctx.translate(-0.2, 0);
    ctx.fillStyle = '#e9edf0'; ctx.strokeStyle = '#4b535c'; ctx.lineWidth = 0.03;
    for (let i = 0; i < 3; i++) {
      const y = Math.sin(a + i * 2.094) * 0.4;
      const w = 0.05 + Math.abs(Math.cos(a + i * 2.094)) * 0.07;
      ctx.beginPath(); ctx.ellipse(0, y * 0.5, w, Math.abs(y) * 0.5 + 0.02, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#c8322e';
    ctx.beginPath(); ctx.arc(0, 0, 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // motor
    ctx.fillStyle = '#3a3f47';
    rrect(ctx, 0.06, -0.18, 0.28, 0.36, 0.05); ctx.fill();
    if (on) {
      ctx.strokeStyle = 'rgba(220,240,255,.35)'; ctx.lineWidth = 0.03;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const o = (t * 4 + i * 0.3) % 1;
        ctx.moveTo(-0.3 - o * 0.2, i * 0.22); ctx.lineTo(-0.45 - o * 0.2, i * 0.22);
      }
      ctx.stroke();
    }
  }

  function balloon(ctx, t) {
    const r = PARTS.balloon.radius;
    ctx.fillStyle = '#e8453c';
    ctx.beginPath(); ctx.ellipse(0, -0.02, r * 0.92, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 0.03; ctx.strokeStyle = '#8f1f1a'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(-0.14, -0.18, 0.07, 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f1f1a';
    ctx.beginPath(); ctx.moveTo(-0.05, r - 0.01); ctx.lineTo(0.05, r - 0.01); ctx.lineTo(0, r + 0.05); ctx.fill();
  }

  function wing(ctx) {
    ctx.fillStyle = '#e0c48a';
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.08);
    ctx.quadraticCurveTo(-0.35, -0.16, 0.1, -0.12);
    ctx.quadraticCurveTo(0.45, -0.08, 0.5, 0.06);
    ctx.lineTo(0.5, 0.1); ctx.lineTo(-0.5, 0.1); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.04; ctx.strokeStyle = '#7a5a28'; ctx.stroke();
    ctx.strokeStyle = 'rgba(122,90,40,.5)'; ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (const x of [-0.25, 0, 0.25]) { ctx.moveTo(x, -0.1); ctx.lineTo(x, 0.1); }
    ctx.stroke();
  }

  function tnt(ctx, t) {
    rrect(ctx, -0.5, -0.5, 1, 1, 0.06);
    ctx.fillStyle = '#c9302a'; ctx.fill();
    ctx.lineWidth = 0.08; ctx.strokeStyle = '#6d1410'; ctx.stroke();
    ctx.fillStyle = '#f3e3c2';
    ctx.fillRect(-0.42, -0.14, 0.84, 0.28);
    ctx.fillStyle = '#6d1410';
    ctx.font = 'bold 0.25px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TNT', 0, 0.015);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(0.2, -0.5); ctx.quadraticCurveTo(0.3, -0.62, 0.42, -0.58); ctx.stroke();
  }

  // Draw a part centered at the origin. rot: 0..3 quarter turns (counter-clockwise in world).
  function draw(ctx, type, rot, t, st) {
    ctx.save();
    if (rot) ctx.rotate(-rot * Math.PI / 2);
    switch (type) {
      case 'pilot': pilot(ctx, t, st); break;
      case 'wood': woodBox(ctx, '#c08a4b', '#6e4520'); break;
      case 'metal': metalBox(ctx); break;
      case 'wheel': wheel(ctx, PARTS.wheel.radius, '#d9a441'); break;
      case 'small': wheel(ctx, PARTS.small.radius, '#e2702f'); break;
      case 'engine': engine(ctx, t, st); break;
      case 'rocket': rocket(ctx, t, st); break;
      case 'fan': fan(ctx, t, st); break;
      case 'balloon': balloon(ctx, t); break;
      case 'wing': wing(ctx); break;
      case 'tnt': tnt(ctx, t); break;
    }
    ctx.restore();
  }

  function icon(type) {
    const c = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = 44 * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.translate(22, 22);
    ctx.scale(34, 34);
    if (type === 'eraser') {
      ctx.strokeStyle = '#ff6b5b'; ctx.lineWidth = 0.12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.3, -0.3); ctx.lineTo(0.3, 0.3); ctx.moveTo(0.3, -0.3); ctx.lineTo(-0.3, 0.3); ctx.stroke();
    } else {
      draw(ctx, type, 0, 0, { spin: 0.6 });
    }
    return c;
  }

  return { draw, icon, rrect, pip };
})();

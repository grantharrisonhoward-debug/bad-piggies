// Contraption Cave — workshop editor, renderer and input.
'use strict';

(() => {
  const COLS = 14, ROWS = 9;
  const SEED = 1337;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  const store = {
    get(k, d) { try { const v = localStorage.getItem('ccave.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ccave.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ------------------------------------------------------------ presets
  const PRESET_KEY = { P: 'pilot', w: 'wood', m: 'metal', O: 'wheel', o: 'small', E: 'engine', R: ['rocket', 0], U: ['rocket', 1], F: 'fan', H: ['fan', 1], B: 'balloon', W: 'wing', T: 'tnt' };
  const PRESETS = {
    'Starter Cart': ['wPEw', 'O..O'],
    'Rocket Racer': ['RwPEw', '.O..O'],
    'Monster Truck': ['.....U', 'mmPEmm', 'O.OO.O'],
    'Balloon Buggy': ['B.B.B', 'wPEwR', 'O...O'],
    'Cave Glider': ['WWWWW', 'RwPEwR', '.O...O'],
    'Rocket Lifter': ['U...U', 'wwPEww', 'O....O'],
    'Fan Boat': ['FwPEw', '.O..O'],
    'Demolition Dozer': ['T....', 'mwPEw', '.o..o'],
  };
  function presetDesign(rows) {
    const cells = new Array(COLS * ROWS).fill(null);
    const w = Math.max(...rows.map(r => r.length));
    const c0 = Math.floor((COLS - w) / 2), r0 = ROWS - 1 - rows.length;
    rows.forEach((s, i) => [...s].forEach((ch, j) => {
      const m = PRESET_KEY[ch];
      if (m) cells[(r0 + i) * COLS + c0 + j] = Array.isArray(m) ? { t: m[0], r: m[1] } : { t: m, r: 0 };
    }));
    return cells;
  }

  // -------------------------------------------------------------- state
  const level = Level.generate(SEED);
  let cells = store.get('design', null);
  if (!Array.isArray(cells) || cells.length !== COLS * ROWS) cells = presetDesign(PRESETS['Starter Cart']);
  const found = new Set(store.get('stars', []));
  let mode = 'build';
  let tool = 'wood';
  let sim = null;
  let W = 0, H = 0, DPR = 1;
  let hover = null;
  const cam = { x: 0, y: 0, zoom: 34, targetZoom: 34 };
  const keys = {};
  const held = { left: 0, right: 0, leanL: 0, leanR: 0 };
  let t0 = performance.now(), clock = 0;

  // -------------------------------------------------------------- audio
  let actx = null;
  function sfx(kind) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const now = actx.currentTime;
      const g = actx.createGain(); g.connect(actx.destination);
      if (kind === 'boom' || kind === 'snap' || kind === 'pop' || kind === 'smash') {
        const len = kind === 'boom' ? 0.7 : 0.15;
        const buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, kind === 'boom' ? 2 : 4);
        const src = actx.createBufferSource(); src.buffer = buf;
        const f = actx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.value = { boom: 600, snap: 2500, pop: 4000, smash: 1400 }[kind];
        src.connect(f); f.connect(g);
        g.gain.value = { boom: 0.6, snap: 0.25, pop: 0.3, smash: 0.2 }[kind];
        src.start();
      } else if (kind === 'star' || kind === 'win') {
        const notes = kind === 'win' ? [523, 659, 784, 1046] : [880, 1320];
        notes.forEach((hz, i) => {
          const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
          const og = actx.createGain(); og.gain.setValueAtTime(0.0001, now + i * 0.09);
          og.gain.exponentialRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
          og.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.3);
          o.connect(og); og.connect(actx.destination); o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.35);
        });
      } else if (kind === 'click') {
        const o = actx.createOscillator(); o.frequency.value = 520; o.type = 'square';
        g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        o.connect(g); o.start(); o.stop(now + 0.07);
      }
    } catch (e) { /* audio is optional */ }
  }

  // ------------------------------------------------------------- layout
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
  }
  window.addEventListener('resize', resize);
  resize();

  function gridLayout() {
    const top = 90, bottom = Math.min(120, H * 0.22);
    const cs = Math.max(18, Math.min(64, (W - 32) / COLS, (H - top - bottom - 20) / ROWS));
    const gw = cs * COLS, gh = cs * ROWS;
    return { cs, x: (W - gw) / 2, y: top + (H - top - bottom - gh) / 2, gw, gh };
  }
  function cellAt(px, py) {
    const g = gridLayout();
    const c = Math.floor((px - g.x) / g.cs), r = Math.floor((py - g.y) / g.cs);
    return (c >= 0 && r >= 0 && c < COLS && r < ROWS) ? { r, c } : null;
  }

  // ---------------------------------------------------------- build UI
  const palette = $('palette');
  const tools = PART_ORDER.concat(['eraser']);
  for (const t of tools) {
    const b = document.createElement('button');
    b.className = 'part-btn'; b.dataset.tool = t;
    b.title = t === 'eraser' ? 'Eraser' : PARTS[t].name + (PARTS[t].rotates ? ' (click again to rotate)' : '');
    b.appendChild(Art.icon(t));
    const label = document.createElement('span'); label.textContent = t === 'eraser' ? 'Eraser' : PARTS[t].name; b.appendChild(label);
    const k = document.createElement('span'); k.className = 'key'; k.textContent = t === 'eraser' ? 'Del' : PARTS[t].key; b.appendChild(k);
    b.addEventListener('click', () => selectTool(t));
    palette.appendChild(b);
  }
  function selectTool(t) {
    tool = t;
    for (const b of palette.children) b.classList.toggle('sel', b.dataset.tool === t);
  }
  selectTool(tool);

  const presetSel = $('presetSel');
  for (const name of Object.keys(PRESETS)) {
    const o = document.createElement('option'); o.value = name; o.textContent = name; presetSel.appendChild(o);
  }
  presetSel.addEventListener('change', () => {
    if (presetSel.value) { cells = presetDesign(PRESETS[presetSel.value]); save(); sfx('click'); }
    presetSel.value = '';
    presetSel.blur();
  });
  $('clearBtn').addEventListener('click', () => { cells = new Array(COLS * ROWS).fill(null); save(); });
  $('playBtn').addEventListener('click', startPlay);
  $('backBtn').addEventListener('click', toBuild);
  $('resetBtn').addEventListener('click', startPlay);
  $('helpBtn').addEventListener('click', () => $('help').classList.toggle('hidden'));
  $('helpClose').addEventListener('click', () => $('help').classList.add('hidden'));
  if (!store.get('seenHelp', false)) { $('help').classList.remove('hidden'); store.set('seenHelp', true); }

  function save() { store.set('design', cells); }

  let paintMode = null; // 'place' | 'erase'
  function applyTool(cell, action) {
    const i = cell.r * COLS + cell.c;
    const cur = cells[i];
    if (action === 'erase') { if (cur) { cells[i] = null; save(); } return; }
    if (tool === 'eraser') { if (cur) { cells[i] = null; save(); sfx('click'); } return; }
    if (tool === 'pilot' && !(cur && cur.t === 'pilot')) {
      // only one pilot: move it
      for (let k = 0; k < cells.length; k++) if (cells[k] && cells[k].t === 'pilot') cells[k] = null;
    }
    if (action === 'click' && cur && cur.t === tool && PARTS[tool].rotates) {
      cur.r = (cur.r + 1) % 4; save(); sfx('click'); return;
    }
    if (!cur || cur.t !== tool) { cells[i] = { t: tool, r: 0 }; save(); if (action === 'click') sfx('click'); }
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'build') return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 2 || tool === 'eraser') { paintMode = 'erase'; applyTool(cell, 'erase'); }
    else { paintMode = 'place'; applyTool(cell, 'click'); }
    lastPaint = cell.r + ',' + cell.c;
  });
  let lastPaint = null;
  canvas.addEventListener('pointermove', e => {
    if (mode !== 'build') return;
    hover = cellAt(e.clientX, e.clientY);
    if (paintMode && hover && lastPaint !== hover.r + ',' + hover.c) {
      lastPaint = hover.r + ',' + hover.c;
      applyTool(hover, paintMode === 'erase' ? 'erase' : 'paint');
    }
  });
  const endPaint = () => { paintMode = null; lastPaint = null; };
  canvas.addEventListener('pointerup', endPaint);
  canvas.addEventListener('pointercancel', endPaint);
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('wheel', e => {
    if (mode !== 'play') return;
    e.preventDefault();
    cam.targetZoom = Math.max(10, Math.min(80, cam.targetZoom * Math.exp(-e.deltaY * 0.0012)));
  }, { passive: false });

  // ----------------------------------------------------------- play UI
  const controls = $('controls');
  function makeCtrl(label, big, key, onDown, onUp, cls) {
    const b = document.createElement('button');
    b.className = 'ctrl' + (cls ? ' ' + cls : '');
    b.innerHTML = `<span class="big">${big}</span><span>${label}</span><span class="k">${key}</span>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); onDown(b); });
    if (onUp) {
      const up = () => onUp(b);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    }
    controls.appendChild(b);
    return b;
  }
  const ctrlRefs = {};
  function buildControls() {
    controls.innerHTML = '';
    const has = t => sim.counts[t] > 0;
    const hold = name => [b => { held[name] = 1; b.classList.add('held'); }, b => { held[name] = 0; b.classList.remove('held'); }];
    if (has('wheel') || has('small')) {
      makeCtrl('Back', '◀', 'A / ←', ...hold('left'));
      makeCtrl('Go', '▶', 'D / →', ...hold('right'));
    }
    makeCtrl('Lean', '↺', 'Q', ...hold('leanL'));
    makeCtrl('Lean', '↻', 'E', ...hold('leanR'));
    const gap = document.createElement('div'); gap.className = 'gap'; controls.appendChild(gap);
    ctrlRefs.rocket = has('rocket') ? makeCtrl('Rockets', '🚀', 'Space', () => toggle('rocket')) : null;
    ctrlRefs.fan = has('fan') ? makeCtrl('Fans', '✣', 'F', () => toggle('fan')) : null;
    if (has('balloon')) makeCtrl('Pop', '🎈', 'B', () => sim.popBalloon());
    if (has('tnt')) makeCtrl('Boom', '💥', 'X', () => sim.detonate());
  }
  function toggle(what) {
    if (!sim) return;
    if (what === 'rocket') { sim.toggleRockets(); if (ctrlRefs.rocket) ctrlRefs.rocket.classList.toggle('on', sim.rocketsOn); }
    if (what === 'fan') { sim.toggleFans(); if (ctrlRefs.fan) ctrlRefs.fan.classList.toggle('on', sim.fansOn); }
  }

  let toastTimer = 0;
  function toast(msg, ms = 1800) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function startPlay() {
    if (!cells.some(Boolean)) { toast('Add some parts first!'); return; }
    mode = 'play';
    sim = new Sim(level, { cols: COLS, rows: ROWS, cells }, { found });
    const c = sim.center();
    cam.x = c.x; cam.y = c.y + 2;
    $('buildUI').classList.add('hidden');
    $('playUI').classList.remove('hidden');
    buildControls();
    updateHud();
    if (!sim.pilot) toast('No pilot on board — flying solo!');
  }
  function toBuild() {
    mode = 'build'; sim = null;
    for (const k in held) held[k] = 0;
    $('playUI').classList.add('hidden');
    $('buildUI').classList.remove('hidden');
  }
  function updateHud() {
    $('starCount').textContent = `${found.size} / ${level.stars.length}`;
    $('distCount').textContent = `${Math.max(0, Math.round(sim ? sim.maxX : 0))} m`;
  }

  // -------------------------------------------------------------- keys
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (keys[k]) return;
    keys[k] = true;
    if (mode === 'build') {
      if (k === 'enter') startPlay();
      const part = PART_ORDER.find(p => PARTS[p].key === k);
      if (part) selectTool(part);
      if (k === 'delete') selectTool('eraser');
      if (k === 'r' && hover) { const cur = cells[hover.r * COLS + hover.c]; if (cur && PARTS[cur.t].rotates) { cur.r = (cur.r + 1) % 4; save(); } }
    } else {
      if (k === ' ') { toggle('rocket'); e.preventDefault(); }
      if (k === 'f') toggle('fan');
      if (k === 'b') sim.popBalloon();
      if (k === 'x') sim.detonate();
      if (k === 'escape') toBuild();
      if (k === 'backspace') { startPlay(); e.preventDefault(); }
      if (k === '+' || k === '=') cam.targetZoom = Math.min(80, cam.targetZoom * 1.2);
      if (k === '-' || k === '_') cam.targetZoom = Math.max(10, cam.targetZoom / 1.2);
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function input() {
    const right = keys['arrowright'] || keys['d'] || held.right;
    const left = keys['arrowleft'] || keys['a'] || held.left;
    const leanL = keys['q'] || held.leanL, leanR = keys['e'] || held.leanR;
    return { drive: (right ? 1 : 0) - (left ? 1 : 0), lean: (leanL ? 1 : 0) - (leanR ? 1 : 0) };
  }

  // ========================================================== RENDERING
  // Deterministic hash for decorative noise.
  const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

  function drawCaveBackdrop(x0, x1, y0, y1) {
    // interior: deep gradient anchored to screen
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d1428'); g.addColorStop(1, '#2d1f33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // far parallax rock columns
    for (const [par, col, sc] of [[0.25, '#23182f', 1.0], [0.5, '#2a1d36', 0.7]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      const ox = cam.x * cam.zoom * par, oy = cam.y * cam.zoom * par * 0.5;
      const span = 260 * sc;
      const first = Math.floor((ox - 200) / span);
      for (let i = first; i < first + W / span + 4; i++) {
        const cx = i * span - ox + W / 2, w = (60 + hash(i + par) * 90) * sc;
        const topH = (80 + hash(i * 3.1 + par) * 180) * sc, botH = (60 + hash(i * 7.7 + par) * 160) * sc;
        ctx.moveTo(cx - w, -10 + oy); ctx.lineTo(cx, topH + oy); ctx.lineTo(cx + w, -10 + oy);
        ctx.moveTo(cx - w * 1.2 + span / 2, H + 10 + oy); ctx.lineTo(cx + span / 2, H - botH + oy); ctx.lineTo(cx + w * 1.2 + span / 2, H + 10 + oy);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  function visibleRange() {
    const hw = W / 2 / cam.zoom + 3, hh = H / 2 / cam.zoom + 3;
    return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
  }

  function drawTerrain(v) {
    const F = level.floor, C = level.ceil;
    const i0 = Math.max(0, Math.floor(v.x0 + 4) - 1), i1 = Math.min(F.length - 1, Math.ceil(v.x1 + 4) + 1);
    // rock everywhere, then carve the cave interior
    ctx.fillStyle = '#3b2c43';
    ctx.fillRect(v.x0 - 5, v.y0 - 5, v.x1 - v.x0 + 10, v.y1 - v.y0 + 10);
    // rock speckles
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let x = Math.floor(v.x0); x < v.x1; x += 2) for (let y = Math.floor(v.y0 / 2) * 2; y < v.y1; y += 2) {
      const h1 = hash(x * 13.3 + y * 7.1);
      if (h1 < 0.5) continue;
      ctx.beginPath(); ctx.arc(x + hash(x + y) * 2, y + h1 * 2, 0.15 + h1 * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(F[i0].x, F[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(F[i].x, F[i].y);
    for (let i = i1; i >= i0; i--) ctx.lineTo(C[i].x, C[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.save(); drawCaveBackdrop(); ctx.restore();
    ctx.restore();
    // edges: a dark lip then a lit rim
    const edge = (P, rim, off) => {
      ctx.beginPath(); ctx.moveTo(P[i0].x, P[i0].y);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(P[i].x, P[i].y);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2a1f31'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.save(); ctx.translate(0, off);
      ctx.strokeStyle = rim; ctx.lineWidth = 0.28; ctx.stroke();
      ctx.restore();
    };
    edge(F, '#7d6a8a', -0.08);
    edge(C, '#58476a', 0.08);
    // walls at the ends
    ctx.fillStyle = '#3b2c43';
  }

  function drawStatics(v) {
    for (const poly of level.statics) {
      if (poly[0].x > v.x1 + 8 || poly[poly.length - 1].x < v.x0 - 8) continue;
      ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
      for (const p of poly) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = '#4a3a55'; ctx.fill();
      ctx.strokeStyle = '#7d6a8a'; ctx.lineWidth = 0.14; ctx.lineJoin = 'round'; ctx.stroke();
    }
  }

  function drawCrystals(v, glowPass) {
    for (const c of level.crystals) {
      if (c.x < v.x0 - 3 || c.x > v.x1 + 3) continue;
      const pulse = 0.75 + 0.25 * Math.sin(clock * 1.5 + c.x);
      if (glowPass) {
        const r = 2.4 * c.s;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0, `hsla(${c.hue},90%,70%,${0.35 * pulse})`); g.addColorStop(1, `hsla(${c.hue},90%,60%,0)`);
        ctx.fillStyle = g; ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
        continue;
      }
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.scale(c.s, c.s);
      for (const [dx, h, w, a] of [[-0.25, 0.9, 0.2, -0.35], [0, 1.4, 0.26, 0], [0.28, 0.8, 0.18, 0.4]]) {
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(dx - w, -0.1); ctx.lineTo(dx - w * 0.8, h * 0.75); ctx.lineTo(dx, h); ctx.lineTo(dx + w * 0.8, h * 0.75); ctx.lineTo(dx + w, -0.1); ctx.closePath();
        ctx.fillStyle = `hsl(${c.hue},80%,${55 + 15 * pulse}%)`; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.moveTo(dx - w * 0.2, 0); ctx.lineTo(dx - w * 0.1, h * 0.8); ctx.lineTo(dx, h); ctx.lineTo(dx, 0); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function withArt(x, y, ang, fn) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(1, -1); fn(); ctx.restore();
  }

  function drawStar(x, y, r, spin, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin); ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.strokeStyle = '#a86a00'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.restore();
  }

  function drawProps(v) {
    // start sign
    for (const s of level.signs) {
      withArt(s.x, s.y, 0, () => {
        ctx.fillStyle = '#6e4520'; ctx.fillRect(-0.08, -2, 0.16, 2);
        Art.rrect(ctx, -1.1, -2.7, 2.2, 0.9, 0.12); ctx.fillStyle = '#c08a4b'; ctx.fill();
        ctx.strokeStyle = '#6e4520'; ctx.lineWidth = 0.08; ctx.stroke();
        ctx.fillStyle = '#3b2412'; ctx.font = 'bold 0.5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.text, 0, -2.23);
      });
    }
    // distance markers every 100 m
    for (let m = 100; m < level.END; m += 100) {
      const x = 4 + m;
      if (x < v.x0 - 2 || x > v.x1 + 2) continue;
      const y = level.floorAt(x);
      withArt(x, y, 0, () => {
        ctx.fillStyle = '#5b4a66'; ctx.fillRect(-0.06, -1.4, 0.12, 1.4);
        ctx.fillStyle = '#e8d9b8'; ctx.font = 'bold 0.45px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(m + ' m', 0, -1.55);
      });
    }
    // trophy
    const t = level.trophy;
    if (t.x > v.x0 - 5 && t.x < v.x1 + 5) {
      withArt(t.x, t.y, 0, () => {
        ctx.fillStyle = '#6b5a78'; Art.rrect(ctx, -1.2, -0.9, 2.4, 0.9, 0.1); ctx.fill();
        const bob = Math.sin(clock * 2) * 0.1;
        ctx.translate(0, bob);
        ctx.fillStyle = '#ffcc33'; ctx.strokeStyle = '#a86a00'; ctx.lineWidth = 0.1;
        ctx.beginPath(); ctx.moveTo(-1, -3.6); ctx.lineTo(1, -3.6); ctx.quadraticCurveTo(1, -2, 0, -1.8); ctx.quadraticCurveTo(-1, -2, -1, -3.6); ctx.fill(); ctx.stroke();
        ctx.fillRect(-0.15, -1.9, 0.3, 0.6); ctx.fillRect(-0.6, -1.35, 1.2, 0.35);
        ctx.beginPath(); ctx.arc(-1.05, -3.0, 0.4, Math.PI * 0.5, Math.PI * 1.5, true); ctx.stroke();
        ctx.beginPath(); ctx.arc(1.05, -3.0, 0.4, Math.PI * 1.5, Math.PI * 0.5, true); ctx.stroke();
      });
    }
    // crates
    for (const c of sim.crates) {
      if (!c.alive) continue;
      const p = c.body.getPosition();
      if (p.x < v.x0 - 2 || p.x > v.x1 + 2) continue;
      withArt(p.x, p.y, c.body.getAngle(), () => { ctx.scale(0.96, 0.96); Art.draw(ctx, 'wood', 0, clock); });
    }
    for (const b of sim.boulders) {
      const p = b.body.getPosition();
      if (p.x < v.x0 - 3 || p.x > v.x1 + 3) continue;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(b.body.getAngle());
      ctx.fillStyle = '#6b5a78'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3b2c43'; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(b.r * 0.3, -b.r * 0.2, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawStars(v) {
    for (const s of sim.stars) {
      if (s.taken || s.x < v.x0 - 2 || s.x > v.x1 + 2) continue;
      const r = 0.55 + Math.sin(clock * 3 + s.i) * 0.05;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 1.6);
      g.addColorStop(0, 'rgba(255,220,90,.45)'); g.addColorStop(1, 'rgba(255,220,90,0)');
      ctx.fillStyle = g; ctx.fillRect(s.x - 1.6, s.y - 1.6, 3.2, 3.2);
      drawStar(s.x, s.y, r, Math.sin(clock * 2 + s.i) * 0.3, s.seenBefore ? 0.45 : 1);
    }
  }

  function drawContraption() {
    // ropes
    ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 0.04;
    for (const r of sim.ropes) {
      const a = r.joint.getAnchorA(), b = r.joint.getAnchorB();
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 + 0.1, (a.y + b.y) / 2, b.x, b.y); ctx.stroke();
    }
    const order = p => p.type === 'balloon' ? 2 : PARTS[p.type].kind === 'wheel' ? 1 : 0;
    const list = sim.parts.filter(p => p.alive).sort((a, b) => order(a) - order(b));
    for (const p of list) {
      const b = p.body, pos = b.getPosition();
      withArt(pos.x, pos.y, b.getAngle(), () => {
        Art.draw(ctx, p.type, p.rot, clock, { on: p.type === 'rocket' ? sim.rocketsOn : p.type === 'fan' ? sim.fansOn : p.on, spin: p.spin, scared: p.scared });
      });
    }
  }

  function drawParticles(glow) {
    for (const q of sim.particles) {
      if (!!q.fire !== glow) continue;
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      if (q.rot !== undefined) {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.size, -q.size / 3, q.size * 2, q.size / 1.5); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (glow ? 0.5 + a : 1), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function renderPlay(dt) {
    const c = sim.center(), vel = sim.velocity();
    const look = { x: c.x + vel.x * 0.35, y: c.y + vel.y * 0.2 + 1.5 };
    const k = 1 - Math.exp(-dt * 4);
    cam.x += (look.x - cam.x) * k; cam.y += (look.y - cam.y) * k;
    cam.zoom += (cam.targetZoom - cam.zoom) * (1 - Math.exp(-dt * 8));
    const sh = sim.shake * 0.5;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#3b2c43'; ctx.fillRect(0, 0, W, H);
    const z = cam.zoom * DPR;
    ctx.setTransform(z, 0, 0, -z, W * DPR / 2 - (cam.x + sx) * z, H * DPR / 2 + (cam.y + sy) * z);
    const v = visibleRange();
    drawTerrain(v);
    drawCrystals(v, false);
    drawStatics(v);
    drawProps(v);
    drawParticles(false);
    drawContraption();

    // darkness vignette around the contraption
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const px = W / 2 + (c.x - cam.x) * cam.zoom, py = H / 2 - (c.y - cam.y) * cam.zoom;
    const rad = Math.max(W, H) * 0.75;
    const g = ctx.createRadialGradient(px, py, rad * 0.18, px, py, rad);
    g.addColorStop(0, 'rgba(8,4,14,0)'); g.addColorStop(1, 'rgba(8,4,14,.72)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // light sources on top
    ctx.setTransform(z, 0, 0, -z, W * DPR / 2 - (cam.x + sx) * z, H * DPR / 2 + (cam.y + sy) * z);
    ctx.globalCompositeOperation = 'lighter';
    drawCrystals(v, true);
    drawParticles(true);
    ctx.globalCompositeOperation = 'source-over';
    drawStars(v);
  }

  // ------------------------------------------------------------ build view
  function renderBuild() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1f33'); bg.addColorStop(1, '#170f1e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // workshop planks in the background
    ctx.strokeStyle = 'rgba(255,255,255,.03)'; ctx.lineWidth = 2;
    for (let y = 0; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const g = gridLayout();
    // shadowed board
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    Art.rrect(ctx, g.x - 10, g.y - 10 + 6, g.gw + 20, g.gh + 20, 14); ctx.fill();
    ctx.fillStyle = '#3a2d45';
    Art.rrect(ctx, g.x - 10, g.y - 10, g.gw + 20, g.gh + 20, 14); ctx.fill();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = g.x + c * g.cs, y = g.y + r * g.cs;
      ctx.fillStyle = (r + c) % 2 ? '#463753' : '#4b3b59';
      ctx.fillRect(x + 1, y + 1, g.cs - 2, g.cs - 2);
    }
    // ground line under the grid
    ctx.strokeStyle = '#7d6a8a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(g.x - 10, g.y + g.gh + 10); ctx.lineTo(g.x + g.gw + 10, g.y + g.gh + 10); ctx.stroke();

    // connections (welds) for feedback
    const at = (r, c) => (r >= 0 && c >= 0 && r < ROWS && c < COLS) ? cells[r * COLS + c] : null;
    const frame = cell => cell && PARTS[cell.t].kind === 'frame';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = at(r, c);
      if (!cell) continue;
      ctx.save();
      ctx.translate(g.x + (c + 0.5) * g.cs, g.y + (r + 0.5) * g.cs);
      ctx.scale(g.cs * 0.94, g.cs * 0.94);
      Art.draw(ctx, cell.t, cell.r, clock, { spin: clock * 2 });
      ctx.restore();
      if (PARTS[cell.t].rotates) {
        // direction arrow
        const a = -cell.r * Math.PI / 2;
        const cx = g.x + (c + 0.5) * g.cs, cy = g.y + (r + 0.5) * g.cs;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,230,120,.9)';
        ctx.beginPath(); ctx.moveTo(g.cs * 0.48, 0); ctx.lineTo(g.cs * 0.34, -g.cs * 0.1); ctx.lineTo(g.cs * 0.34, g.cs * 0.1); ctx.fill();
        ctx.restore();
      }
    }
    // weld dots
    ctx.fillStyle = 'rgba(255,220,150,.55)';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!frame(at(r, c))) continue;
      if (frame(at(r, c + 1))) { ctx.beginPath(); ctx.arc(g.x + (c + 1) * g.cs, g.y + (r + 0.5) * g.cs, 3, 0, Math.PI * 2); ctx.fill(); }
      if (frame(at(r + 1, c))) { ctx.beginPath(); ctx.arc(g.x + (c + 0.5) * g.cs, g.y + (r + 1) * g.cs, 3, 0, Math.PI * 2); ctx.fill(); }
    }

    if (hover) {
      const x = g.x + hover.c * g.cs, y = g.y + hover.r * g.cs;
      const cur = cells[hover.r * COLS + hover.c];
      if (!cur && tool !== 'eraser') {
        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.translate(x + g.cs / 2, y + g.cs / 2); ctx.scale(g.cs * 0.94, g.cs * 0.94);
        Art.draw(ctx, tool, 0, clock, {}); ctx.restore();
      }
      ctx.strokeStyle = tool === 'eraser' ? '#ff6b5b' : '#ffb938'; ctx.lineWidth = 2.5;
      Art.rrect(ctx, x + 2, y + 2, g.cs - 4, g.cs - 4, 6); ctx.stroke();
    }

    // stats line
    const counts = {};
    for (const c of cells) if (c) counts[c.t] = (counts[c.t] || 0) + 1;
    const warn = [];
    if (!counts.pilot) warn.push('Tip: add a Pilot so the camera has someone to follow');
    if ((counts.wheel || counts.small) && !counts.engine) warn.push('Wheels need an Engine to drive');
    ctx.font = '600 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#bfae92';
    const info = `★ ${found.size} / ${level.stars.length} stars found in the cave`;
    ctx.fillText(warn.length ? warn[0] + '   ·   ' + info : info, W / 2, g.y + g.gh + 30);
  }

  // ------------------------------------------------------------- loop
  let lastHud = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now; clock += dt;
    if (mode === 'play' && sim) {
      sim.step(dt, input());
      for (const e of sim.events) {
        if (e.type === 'star') {
          store.set('stars', [...found]);
          sfx('star');
          toast(e.first ? `★ Star found! (${found.size}/${level.stars.length})` : '★ Already found', 1200);
        } else if (e.type === 'win') { sfx('win'); toast('🏆 You found the Golden Trophy at the end of the cave!', 4000); }
        else if (e.type === 'boom') sfx('boom');
        else if (e.type === 'snap') sfx('snap');
        else if (e.type === 'pop') sfx('pop');
        else if (e.type === 'smash') sfx('smash');
      }
      sim.events.length = 0;
      if (now - lastHud > 150) { updateHud(); lastHud = now; }
      if (ctrlRefs.rocket) ctrlRefs.rocket.classList.toggle('on', sim.rocketsOn);
      if (ctrlRefs.fan) ctrlRefs.fan.classList.toggle('on', sim.fansOn);
      renderPlay(dt);
    } else {
      renderBuild();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

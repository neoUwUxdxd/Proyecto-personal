'use strict';
/*
 * Escapa de Tung Tung Tung Sahur
 * Juego de huida en un laberinto nocturno. Todo se dibuja con Canvas 2D
 * (sin imágenes externas) y todo el sonido se sintetiza con Web Audio.
 */
(() => {
  // ================= Constantes y utilidades =================
  const T = 64;            // tamaño de una casilla en píxeles de mundo
  const FACE_H = 22;       // alto de la cara frontal de los muros (falso 3D)
  const PEN = 26;          // cuánto entra la luz en un muro para iluminar su cara
  const TAU = Math.PI * 2;
  const FLOOR = 0, HEDGE = 1, STONE = 2, LAMP = 3, GATE = 4;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const $ = s => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function angLerp(a, b, t) {
    const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * t;
  }
  function fmtTime(s) {
    s = Math.floor(s);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function ellipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };

  // ================= Lienzos =================
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
  const mini = $('#minimap'), mctx = mini.getContext('2d');
  const portrait = $('#portrait'), pctx = portrait.getContext('2d');
  let DPR = 1, VW = 0, VH = 0, zoom = 1, DS = 0.5;
  let vignette = null;

  function makeGlow(r, rgb, mid = 0.35) {
    const c = document.createElement('canvas');
    c.width = c.height = r * 2;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.25, `rgba(${rgb},${mid + 0.2})`);
    gr.addColorStop(0.6, `rgba(${rgb},${mid * 0.35})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  }
  const glow = {
    cut: makeGlow(64, '0,0,0', 0.6),
    gold: makeGlow(64, '255,205,70'),
    warm: makeGlow(64, '255,160,60'),
    green: makeGlow(24, '200,255,110'),
    red: makeGlow(24, '255,40,30', 0.5),
    pale: makeGlow(24, '255,225,150', 0.5),
    white: makeGlow(64, '255,245,215')
  };

  // Textura de niebla que se repite
  const fogTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = rand(0, 512), y = rand(0, 512), r = rand(60, 170);
      for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(170,180,220,${rand(0.05, 0.12)})`);
        gr.addColorStop(1, 'rgba(170,180,220,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    return c;
  })();

  function makeVignette() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(VW / 2));
    c.height = Math.max(1, Math.round(VH / 2));
    const g = c.getContext('2d');
    const r = Math.hypot(c.width, c.height) / 2;
    const gr = g.createRadialGradient(c.width / 2, c.height / 2, r * 0.35, c.width / 2, c.height / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,6,0.75)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth;
    VH = window.innerHeight;
    canvas.width = Math.round(VW * DPR);
    canvas.height = Math.round(VH * DPR);
    DS = Math.max(0.5, DPR * 0.5);
    dark.width = Math.ceil(VW * DS);
    dark.height = Math.ceil(VH * DS);
    const minSide = Math.min(VW, VH);
    zoom = clamp(minSide / ((minSide < 600 ? 7.5 : 9.5) * T), 0.6, 1.45);
    if (Math.max(VW, VH) / zoom > 22 * T) zoom = Math.max(VW, VH) / (22 * T);
    vignette = makeVignette();
    const mm = mini.getBoundingClientRect().width || 150;
    mini.width = mini.height = Math.round(mm * DPR);
    const pw = portrait.getBoundingClientRect();
    portrait.width = Math.round((pw.width || 260) * DPR);
    portrait.height = Math.round((pw.height || 300) * DPR);
  }

  // ================= Estado =================
  let state = 'menu';        // menu | playing | paused | caught | over | won
  let time = 0, levelTime = 0, jumpT = 0;
  let L = null, P = null, S = null;
  const cam = { x: 0, y: 0, shake: 0 };
  let particles = [], texts = [];
  let lastSpeak = -99;
  const input = { keys: new Set(), stickX: 0, stickY: 0, sprintTouch: false };
  const mouse = { x: 0, y: 0, t: -99 };
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ================= Generación de nivel =================
  function bfsDist(W, H, g, sx, sy) {
    const d = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
    let h = 0, tl = 0;
    const s = sy * W + sx;
    d[s] = 0; q[tl++] = s;
    while (h < tl) {
      const c = q[h++], cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (d[ni] !== -1 || g[ni] !== FLOOR) continue;
        d[ni] = d[c] + 1;
        q[tl++] = ni;
      }
    }
    return d;
  }

  function makeLevel(n) {
    const size = Math.min(17 + n * 4, 37) | 1;
    const W = size, H = size;
    const g = new Uint8Array(W * H).fill(HEDGE);
    const id = (x, y) => y * W + x;

    // Laberinto con "recursive backtracker"
    const stack = [[1, 1]];
    g[id(1, 1)] = FLOOR;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      let moved = false;
      for (const [dx, dy] of shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]])) {
        const nx = cx + dx, ny = cy + dy;
        if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[id(nx, ny)] !== FLOOR) {
          g[id(cx + dx / 2, cy + dy / 2)] = FLOOR;
          g[id(nx, ny)] = FLOOR;
          stack.push([nx, ny]);
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
    // Abrir algunos muros para crear bucles (se puede dar la vuelta a Sahur)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[id(x, y)] !== HEDGE) continue;
      const hz = g[id(x - 1, y)] === FLOOR && g[id(x + 1, y)] === FLOOR && g[id(x, y - 1)] !== FLOOR && g[id(x, y + 1)] !== FLOOR;
      const vt = g[id(x, y - 1)] === FLOOR && g[id(x, y + 1)] === FLOOR && g[id(x - 1, y)] !== FLOOR && g[id(x + 1, y)] !== FLOOR;
      if ((hz || vt) && Math.random() < 0.2) g[id(x, y)] = FLOOR;
    }
    // Plazas abiertas
    const plazas = 2 + Math.floor(n / 2);
    for (let i = 0; i < plazas; i++) {
      const cx = randi(2, W - 3), cy = randi(2, H - 3);
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) g[id(x, y)] = FLOOR;
    }
    // Muralla de piedra exterior
    for (let x = 0; x < W; x++) { g[id(x, 0)] = STONE; g[id(x, H - 1)] = STONE; }
    for (let y = 0; y < H; y++) { g[id(0, y)] = STONE; g[id(W - 1, y)] = STONE; }

    const start = { x: 1, y: 1 };
    const dist = bfsDist(W, H, g, start.x, start.y);
    let maxD = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];

    // Puerta de salida: en la muralla sur, lo más lejos posible del inicio
    let gx = W - 2, best = -1;
    for (let x = 1; x < W - 1; x++) {
      const d = dist[id(x, H - 2)];
      if (d > best) { best = d; gx = x; }
    }
    g[id(gx, H - 1)] = GATE;
    const gate = { tx: gx, ty: H - 1, open: false, anim: 0, poly: null };

    // Casillas útiles
    const floors = [], deadEnds = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[id(x, y)] !== FLOOR) continue;
      floors.push({ x, y });
      let nb = 0;
      for (const [dx, dy] of DIRS) if (g[id(x + dx, y + dy)] === FLOOR) nb++;
      if (nb === 1) deadEnds.push({ x, y });
    }

    // Llaves: preferimos callejones sin salida, bien repartidas
    const keyCount = Math.min(3 + n, 8);
    const keys = [];
    const addKey = t => keys.push({ tx: t.x, ty: t.y, x: (t.x + 0.5) * T, y: (t.y + 0.5) * T, taken: false, phase: rand(0, TAU) });
    for (const t of [...shuffle(deadEnds), ...shuffle(floors.slice())]) {
      if (keys.length >= keyCount) break;
      if (dist[id(t.x, t.y)] < 6) continue;
      if (Math.abs(t.x - gx) + Math.abs(t.y - (H - 1)) < 4) continue;
      if (keys.some(k => Math.abs(k.tx - t.x) + Math.abs(k.ty - t.y) < 6)) continue;
      addKey(t);
    }
    for (const t of shuffle(floors.slice())) {
      if (keys.length >= keyCount) break;
      if (dist[id(t.x, t.y)] < 3 || keys.some(k => k.tx === t.x && k.ty === t.y)) continue;
      addKey(t);
    }

    // Farolas sobre pilares de piedra
    const lampCount = Math.max(5, Math.round(size * 0.55) - n);
    const lampTiles = [];
    const cand = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[id(x, y)] !== HEDGE) continue;
      if (DIRS.some(([dx, dy]) => g[id(x + dx, y + dy)] === FLOOR)) cand.push({ x, y });
    }
    for (const c of shuffle(cand)) {
      if (lampTiles.length >= lampCount) break;
      if (lampTiles.some(l => Math.max(Math.abs(l.x - c.x), Math.abs(l.y - c.y)) < 5)) continue;
      g[id(c.x, c.y)] = LAMP;
      lampTiles.push(c);
    }

    // Hierba alta (escondites)
    const grass = new Uint8Array(W * H);
    const patches = Math.round(size * 0.45);
    for (let i = 0; i < patches; i++) {
      const c = pick(floors), r = randi(1, 2);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (g[id(x, y)] === FLOOR && dx * dx + dy * dy <= r * r + 1 && Math.random() < 0.85) grass[id(x, y)] = 1;
      }
    }
    for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) grass[id(x, y)] = 0;

    // Dónde aparece Sahur
    const far = floors.filter(t => dist[id(t.x, t.y)] >= maxD * 0.5 && Math.abs(t.x - gx) + Math.abs(t.y - (H - 1)) > 4);
    const sStart = pick(far.length ? far : floors);

    const lvl = {
      n, W, H, g, grass, floors,
      explored: new Uint8Array(W * H),
      prev: new Int32Array(W * H), queue: new Int32Array(W * H),
      start, gate, keys, keysTaken: 0,
      lamps: [], sahurStart: sStart, bg: null, fireflies: []
    };
    L = lvl;
    for (const t of lampTiles) {
      const x = (t.x + 0.5) * T, y = (t.y + 0.5) * T;
      lvl.lamps.push({ tx: t.x, ty: t.y, x, y, phase: rand(0, 100), poly: visPoly(x, y, 250, 0, TAU, 80) });
    }
    const ffCount = Math.round(W * H / 16);
    for (let i = 0; i < ffCount; i++) {
      const f = pick(floors);
      lvl.fireflies.push({ x: (f.x + Math.random()) * T, y: (f.y + Math.random()) * T, a: rand(0, TAU), p: rand(0, TAU), s: rand(8, 20) });
    }
    lvl.bg = renderBackground(lvl);
    return lvl;
  }

  // ================= Fondo pre-renderizado (suelo + muros) =================
  function renderBackground(lv) {
    const { W, H, g: grid, grass } = lv;
    const c = document.createElement('canvas');
    c.width = W * T;
    c.height = H * T;
    const g = c.getContext('2d');
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? STONE : grid[y * W + x]);
    const wall = (x, y) => at(x, y) !== FLOOR;

    // --- Suelo de césped ---
    g.fillStyle = '#1c3622';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (wall(x, y)) continue;
      g.fillStyle = `hsl(${rand(98, 122)},${rand(30, 40)}%,${rand(19, 24)}%)`;
      g.fillRect(x * T, y * T, T, T);
    }
    // Manchas suaves para romper la cuadrícula
    for (let i = 0; i < W * H * 0.9; i++) {
      const x = rand(0, c.width), y = rand(0, c.height), r = rand(25, 85);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const col = Math.random() < 0.5 ? '70,120,55' : Math.random() < 0.8 ? '8,26,18' : '105,85,55';
      gr.addColorStop(0, `rgba(${col},${rand(0.12, 0.25)})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Briznas de hierba, flores, piedras y setas
    g.lineCap = 'round';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (wall(x, y)) continue;
      const tall = grass[y * W + x] === 1;
      const px = x * T, py = y * T;
      if (tall) {
        g.fillStyle = 'rgba(10,40,25,0.45)';
        g.fillRect(px, py, T, T);
      }
      const nBlades = tall ? 46 : 22;
      for (let k = 0; k < nBlades; k++) {
        const bx = px + rand(1, T - 1), by = py + rand(4, T);
        const len = tall ? rand(10, 18) : rand(3, 7), lean = rand(-4, 4);
        g.strokeStyle = `hsla(${rand(85, 135)},${rand(35, 60)}%,${tall ? rand(18, 32) : rand(25, 38)}%,0.9)`;
        g.lineWidth = tall ? 2.2 : 1.4;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + lean * 0.2, by - len * 0.6, bx + lean, by - len);
        g.stroke();
      }
      if (!tall && Math.random() < 0.14) {
        const cols = ['#ffd1e8', '#fff6b0', '#c9b6ff', '#ffffff', '#ffb4a2'];
        const col = pick(cols);
        for (let k = randi(2, 5); k > 0; k--) {
          const fx = px + rand(8, T - 8), fy = py + rand(8, T - 8);
          g.fillStyle = col;
          for (let pI = 0; pI < 5; pI++) circle(g, fx + Math.cos(pI * 1.256) * 2.2, fy + Math.sin(pI * 1.256) * 2.2, 1.7);
          g.fillStyle = '#ffcc33';
          circle(g, fx, fy, 1.2);
        }
      }
      if (Math.random() < 0.1) {
        for (let k = randi(1, 3); k > 0; k--) {
          const sx = px + rand(8, T - 8), sy = py + rand(8, T - 8), r = rand(2.5, 5);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          ellipse(g, sx + 1, sy + 1.5, r, r * 0.7);
          g.fillStyle = `hsl(220,6%,${rand(40, 58)}%)`;
          ellipse(g, sx, sy, r, r * 0.7);
          g.fillStyle = 'rgba(255,255,255,0.18)';
          ellipse(g, sx - r * 0.3, sy - r * 0.25, r * 0.4, r * 0.25);
        }
      }
      if (Math.random() < 0.035) {
        const mx = px + rand(14, T - 14), my = py + rand(18, T - 10);
        g.fillStyle = '#e8dcc8';
        g.fillRect(mx - 1.5, my - 4, 3, 5);
        g.fillStyle = '#c8322b';
        g.beginPath(); g.ellipse(mx, my - 4, 5, 3.5, 0, Math.PI, 0); g.fill();
        g.fillStyle = '#fff';
        circle(g, mx - 2, my - 5.5, 0.8); circle(g, mx + 1.6, my - 6, 0.8);
      }
    }
    // Sombras de contacto que proyectan los muros
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (wall(x, y)) continue;
      const px = x * T, py = y * T;
      if (wall(x, y - 1)) {
        const gr = g.createLinearGradient(0, py, 0, py + 30);
        gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px, py, T, 30);
      }
      if (wall(x - 1, y)) {
        const gr = g.createLinearGradient(px, 0, px + 16, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px, py, 16, T);
      }
      if (wall(x + 1, y)) {
        const gr = g.createLinearGradient(px + T, 0, px + T - 16, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px + T - 16, py, 16, T);
      }
    }

    // --- Muros: primero bases y caras, luego el follaje encima ---
    const tiles = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y);
      if (t === FLOOR) continue;
      const hasFace = y + 1 < H && at(x, y + 1) === FLOOR;
      tiles.push({ x, y, t, hasFace, topH: hasFace ? T - FACE_H : T });
    }
    for (const w of tiles) {
      const px = w.x * T, py = w.y * T;
      if (w.t === HEDGE) {
        g.fillStyle = '#21522a';
        g.fillRect(px, py, T, w.topH);
        if (w.hasFace) {
          const fy = py + w.topH;
          const gr = g.createLinearGradient(0, fy, 0, fy + FACE_H);
          gr.addColorStop(0, '#1a4222'); gr.addColorStop(1, '#08160b');
          g.fillStyle = gr;
          g.fillRect(px, fy, T, FACE_H);
          for (let k = 0; k < 16; k++) {
            g.fillStyle = `hsla(${rand(110, 140)},45%,${rand(8, 20)}%,0.8)`;
            ellipse(g, px + rand(2, T - 2), fy + rand(2, FACE_H - 3), rand(3, 6), rand(2, 4));
          }
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(px, fy + FACE_H - 3, T, 3);
        }
      } else {
        drawStoneTile(g, px, py, w.topH, w.hasFace);
      }
    }
    for (const w of tiles) {
      if (w.t !== HEDGE) continue;
      const px = w.x * T, py = w.y * T;
      const nN = wall(w.x, w.y - 1), nW = wall(w.x - 1, w.y), nE = wall(w.x + 1, w.y);
      const x0 = nW ? px - 3 : px + 3, x1 = nE ? px + T + 3 : px + T - 3;
      const y0 = nN ? py - 3 : py + 3, y1 = py + w.topH - 2;
      for (let k = 0; k < 58; k++) {
        const lx = rand(x0, x1), ly = rand(y0, y1);
        const rel = clamp((ly - py) / w.topH, 0, 1);
        const light = 24 + (1 - rel) * 12 + rand(-5, 6);
        g.fillStyle = `hsl(${rand(102, 138)},${rand(38, 55)}%,${light}%)`;
        circle(g, lx, ly, rand(3, 7));
      }
      for (let k = 0; k < 10; k++) {
        g.fillStyle = `rgba(190,255,170,${rand(0.08, 0.2)})`;
        circle(g, rand(px + 4, px + T - 4), rand(py + 3, py + w.topH - 4), rand(1, 2.2));
      }
      if (Math.random() < 0.12) {
        const col = pick(['#ffd1e8', '#fff3b8', '#d8c6ff']);
        for (let k = 0; k < 4; k++) { g.fillStyle = col; circle(g, rand(px + 8, px + T - 8), rand(py + 6, py + w.topH - 6), 2); }
      }
      if (!nN) {
        g.fillStyle = 'rgba(200,255,190,0.12)';
        g.fillRect(px + 2, py + 1, T - 4, 3);
      }
    }
    return c;
  }

  function drawStoneTile(g, px, py, topH, hasFace) {
    g.fillStyle = '#2a2c36';
    g.fillRect(px, py, T, topH);
    const rows = topH > 50 ? 3 : 2, rh = topH / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * T / 4;
      for (let sx = -off; sx < T; sx += T / 2) {
        const x0 = Math.max(px, px + sx) + 1.5, x1 = Math.min(px + T, px + sx + T / 2) - 1.5;
        const y0 = py + r * rh + 1.5, y1 = py + (r + 1) * rh - 1.5;
        if (x1 - x0 < 3) continue;
        g.fillStyle = `hsl(${rand(220, 240)},${rand(6, 12)}%,${rand(33, 45)}%)`;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x0, y0, x1 - x0, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x0, y1 - 2, x1 - x0, 2);
      }
    }
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(${randi(60, 90)},${randi(120, 150)},${randi(60, 80)},${rand(0.25, 0.5)})`;
      circle(g, rand(px + 2, px + T - 2), rand(py + 2, py + topH - 2), rand(1.5, 4));
    }
    if (hasFace) {
      const fy = py + topH;
      const gr = g.createLinearGradient(0, fy, 0, fy + FACE_H);
      gr.addColorStop(0, '#3b3d4a'); gr.addColorStop(1, '#16171e');
      g.fillStyle = gr;
      g.fillRect(px, fy, T, FACE_H);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px, fy + FACE_H / 2); g.lineTo(px + T, fy + FACE_H / 2);
      for (let sx = 0; sx < T; sx += T / 3) {
        g.moveTo(px + sx + 10, fy); g.lineTo(px + sx + 10, fy + FACE_H / 2);
        g.moveTo(px + sx + 20, fy + FACE_H / 2); g.lineTo(px + sx + 20, fy + FACE_H);
      }
      g.stroke();
    }
  }

  // ================= Física y visibilidad =================
  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= L.W || ty >= L.H) return STONE;
    return L.g[ty * L.W + tx];
  }
  function solidAt(tx, ty, forSahur) {
    const t = tileAt(tx, ty);
    if (t === FLOOR) return false;
    if (t === GATE) return forSahur || !L.gate.open;
    return true;
  }
  function boxHits(x, y, r, fs) {
    const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r - 0.001) / T);
    const y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r - 0.001) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty, fs)) return true;
    return false;
  }
  // Centra suavemente al personaje en el pasillo para que no se atasque en las esquinas
  function nudge(e, axis, amt, fs) {
    const c = (Math.floor(e[axis] / T) + 0.5) * T, d = c - e[axis];
    if (Math.abs(d) < 0.5) return;
    const m = Math.sign(d) * Math.min(Math.abs(d), amt);
    if (axis === 'x') { if (!boxHits(e.x + m, e.y, e.r, fs)) e.x += m; }
    else if (!boxHits(e.x, e.y + m, e.r, fs)) e.y += m;
  }
  function moveBody(e, dx, dy, fs) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx) {
        if (!boxHits(e.x + sx, e.y, e.r, fs)) e.x += sx;
        else if (Math.abs(sy) < Math.abs(sx)) nudge(e, 'y', Math.abs(sx), fs);
      }
      if (sy) {
        if (!boxHits(e.x, e.y + sy, e.r, fs)) e.y += sy;
        else if (Math.abs(sx) < Math.abs(sy)) nudge(e, 'x', Math.abs(sy), fs);
      }
    }
  }
  function hasLOS(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 12);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (solidAt(Math.floor(lerp(ax, bx, t) / T), Math.floor(lerp(ay, by, t) / T), false)) return false;
    }
    return true;
  }
  // Rayo DDA por la cuadrícula: distancia hasta el primer muro
  function castRay(ox, oy, a, maxD) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let tx = Math.floor(ox / T), ty = Math.floor(oy / T);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = Math.abs(T / dx), tdy = Math.abs(T / dy);
    let tmx = dx > 0 ? ((tx + 1) * T - ox) / dx : dx < 0 ? (tx * T - ox) / dx : Infinity;
    let tmy = dy > 0 ? ((ty + 1) * T - oy) / dy : dy < 0 ? (ty * T - oy) / dy : Infinity;
    for (let i = 0; i < 64; i++) {
      let d;
      if (tmx < tmy) { d = tmx; tmx += tdx; tx += stepX; }
      else { d = tmy; tmy += tdy; ty += stepY; }
      if (d >= maxD) return maxD;
      if (solidAt(tx, ty, false)) return Math.min(maxD, d + PEN);
    }
    return maxD;
  }
  function visPoly(ox, oy, range, a0, a1, n) {
    const pts = new Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, d = castRay(ox, oy, a, range);
      pts[i * 2] = ox + Math.cos(a) * d;
      pts[i * 2 + 1] = oy + Math.sin(a) * d;
    }
    return pts;
  }
  function tileOf(p) { return { x: Math.floor(p.x / T), y: Math.floor(p.y / T) }; }

  // Siguiente casilla del camino más corto (BFS) para Sahur
  function nextStep(sx, sy, gx, gy) {
    if (sx === gx && sy === gy) return null;
    const W = L.W, prev = L.prev, q = L.queue;
    prev.fill(-1);
    const s = sy * W + sx, goal = gy * W + gx;
    let h = 0, tl = 0;
    prev[s] = s; q[tl++] = s;
    while (h < tl) {
      const c = q[h++];
      if (c === goal) break;
      const cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (solidAt(nx, ny, true)) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1) continue;
        prev[ni] = c;
        q[tl++] = ni;
      }
    }
    if (prev[goal] === -1) return null;
    let c = goal;
    while (prev[c] !== s) c = prev[c];
    return { x: c % W, y: (c / W) | 0 };
  }
  function randomFloorNear(cx, cy, r) {
    for (let i = 0; i < 40; i++) {
      const x = cx + randi(-r, r), y = cy + randi(-r, r);
      if (!solidAt(x, y, true)) return { x, y };
    }
    return pick(L.floors);
  }

  // ================= Sonido (Web Audio sintetizado) =================
  const Sound = {
    ctx: null, master: null, verb: null, noise: null, muted: store.get('ttsahur.muted', false),
    voice: null, cricketT: 2,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(c.destination);
      const len = c.sampleRate * 2.4, imp = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = imp.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      this.verb = c.createConvolver();
      this.verb.buffer = imp;
      const vg = c.createGain();
      vg.gain.value = 0.3;
      this.verb.connect(vg);
      vg.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.ambience();
    },
    ok() { return this.ctx && !this.muted; },
    out(vol, pan = 0, wet = true) {
      const c = this.ctx, g = c.createGain();
      g.gain.value = vol;
      let node = g;
      if (c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        g.connect(p);
        node = p;
      }
      node.connect(this.master);
      if (wet) node.connect(this.verb);
      return g;
    },
    env(param, t, peak, attack, decay) {
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(peak, t + attack);
      param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    },
    osc(type, f0, f1, dur, out, t, peak, attack, decay) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      this.env(g.gain, t, peak, attack, decay);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + attack + decay + 0.05);
    },
    burst(out, t, freq, q, peak, decay, type = 'bandpass') {
      const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      n.buffer = this.noise;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      this.env(g.gain, t, peak, 0.003, decay);
      n.connect(f); f.connect(g); g.connect(out);
      n.start(t, Math.random() * 0.5); n.stop(t + decay + 0.05);
    },
    // El "tung": golpe hueco de madera
    tung(vol = 1, pan = 0, pitch = 1, delay = 0) {
      if (!this.ok() || vol < 0.005) return;
      const t = this.ctx.currentTime + delay, out = this.out(vol, pan);
      this.osc('sine', 330 * pitch, 150 * pitch, 0.12, out, t, 0.9, 0.004, 0.32);
      this.osc('triangle', 780 * pitch, 520 * pitch, 0.08, out, t, 0.28, 0.003, 0.09);
      this.burst(out, t, 1900 * pitch, 1.3, 0.5, 0.045);
    },
    tungs(vol, pan) {
      const p = rand(0.96, 1.04);
      this.tung(vol, pan, p, 0);
      this.tung(vol, pan, p, 0.21);
      this.tung(vol * 1.05, pan, p * 0.94, 0.42);
    },
    step(vol) {
      if (!this.ok()) return;
      this.burst(this.out(vol, 0, false), this.ctx.currentTime, rand(500, 800), 0.8, 0.6, 0.06, 'lowpass');
    },
    heartbeat(vol) {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(vol, 0, false);
      this.osc('sine', 62, 45, 0.12, out, t, 1, 0.01, 0.16);
      this.osc('sine', 58, 42, 0.12, out, t + 0.2, 0.7, 0.01, 0.18);
    },
    pickup() {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(0.35);
      [880, 1108.7, 1318.5, 1760].forEach((f, i) => this.osc('triangle', f, f, 0.1, out, t + i * 0.07, 0.8, 0.005, 0.4));
      this.osc('sine', 2637, 2637, 0.1, out, t + 0.28, 0.3, 0.005, 0.6);
    },
    gateOpen() {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(0.3);
      [220, 277.2, 329.6, 440, 554.4].forEach((f, i) => this.osc('sine', f, f, 0.1, out, t + i * 0.09, 0.6, 0.4, 2.2));
      this.burst(out, t, 900, 0.7, 0.4, 1.2);
    },
    alert() {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(0.32);
      [110, 116.5, 155.6, 233].forEach(f => this.osc('sawtooth', f, f * 0.94, 0.6, out, t, 0.4, 0.01, 0.7));
    },
    jumpscare() {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(0.9);
      this.burst(out, t, 1200, 0.4, 1, 1.1, 'highpass');
      this.osc('sawtooth', 160, 38, 1, out, t, 0.7, 0.01, 1.2);
      this.osc('square', 92, 61, 1, out, t, 0.25, 0.01, 1.0);
      for (let i = 0; i < 6; i++) this.tung(1, rand(-0.4, 0.4), rand(0.85, 1.1), i * 0.09);
    },
    win() {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(0.35);
      [523.3, 659.3, 784, 1046.5, 784, 1046.5].forEach((f, i) => this.osc('triangle', f, f, 0.1, out, t + i * 0.12, 0.7, 0.01, 0.45));
      [261.6, 329.6, 392].forEach(f => this.osc('sine', f, f, 0.1, out, t + 0.72, 0.3, 0.05, 1.8));
    },
    cricket() {
      if (!this.ok()) return;
      const t = this.ctx.currentTime, out = this.out(0.03, rand(-0.9, 0.9), false), f = rand(4200, 5200);
      for (let i = 0; i < 3; i++) this.osc('sine', f, f, 0.05, out, t + i * 0.06, 1, 0.005, 0.035);
    },
    ambience() {
      const c = this.ctx, g = c.createGain();
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.06, c.currentTime + 3);
      g.connect(this.master);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      lp.connect(g);
      [55, 55.35, 82.4, 110.3].forEach((f, i) => {
        const o = c.createOscillator(), og = c.createGain();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        og.gain.value = i < 2 ? 0.5 : 0.2;
        o.connect(og); og.connect(lp); o.start();
      });
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.07; lg.gain.value = 180;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      const wind = c.createBufferSource(), wf = c.createBiquadFilter(), wg = c.createGain();
      wind.buffer = this.noise; wind.loop = true;
      wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.6;
      wg.gain.value = 0.35;
      wind.connect(wf); wf.connect(wg); wg.connect(g); wind.start();
      const wl = c.createOscillator(), wlg = c.createGain();
      wl.frequency.value = 0.11; wlg.gain.value = 160;
      wl.connect(wlg); wlg.connect(wf.frequency); wl.start();
    },
    setMuted(m) {
      this.muted = m;
      store.set('ttsahur.muted', m);
      if (this.master) this.master.gain.value = m ? 0 : 0.85;
      if (m && window.speechSynthesis) speechSynthesis.cancel();
    },
    speak(text, rate = 1) {
      if (this.muted || !window.speechSynthesis) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (!this.voice) {
          const vs = speechSynthesis.getVoices();
          this.voice = vs.find(v => /^id/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang)) || null;
        }
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'id-ID';
        u.rate = rate; u.pitch = 0.35; u.volume = 1;
        speechSynthesis.speak(u);
      } catch (e) { /* sin voz */ }
    }
  };

  // ================= Personajes: dibujo =================
  function drawPlayer(g, p) {
    const moving = p.moving, ph = p.walk;
    const bob = moving ? Math.abs(Math.sin(ph)) * 2.2 : Math.sin(time * 2.2) * 0.7;
    const fx = Math.cos(p.face), fy = Math.sin(p.face);
    const back = fy < -0.45;
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.38)';
    ellipse(g, 0, 1, 13, 5);
    if (p.hidden) g.globalAlpha = 0.6;
    // Piernas y zapatillas
    const s1 = moving ? Math.sin(ph) : 0, l1 = Math.max(0, s1) * 3, l2 = Math.max(0, -s1) * 3;
    g.fillStyle = '#2a2f52';
    roundRect(g, -7, -12 - l1, 5.5, 11, 2.5); g.fill();
    roundRect(g, 1.5, -12 - l2, 5.5, 11, 2.5); g.fill();
    g.fillStyle = '#f4f1ea';
    ellipse(g, -4.2, -1.5 - l1, 3.8, 2.2);
    ellipse(g, 4.2, -1.5 - l2, 3.8, 2.2);
    g.translate(0, -bob);

    const arm = () => {
      const hx = fx * 13, hy = -20 + fy * 6;
      g.save();
      g.translate(hx, hy);
      g.rotate(p.face);
      g.fillStyle = '#30343f';
      roundRect(g, -2, -3, 12, 6, 2); g.fill();
      g.fillStyle = p.light ? '#fff1b8' : '#55585f';
      g.fillRect(9, -4, 4, 8);
      g.restore();
      g.fillStyle = '#ffd3a8';
      circle(g, hx, hy, 3.6);
    };
    if (back) arm();
    // Sudadera
    const bg = g.createLinearGradient(-11, 0, 11, 0);
    bg.addColorStop(0, '#1f7c71'); bg.addColorStop(0.45, '#46d0bf'); bg.addColorStop(1, '#1b6a61');
    g.fillStyle = bg;
    roundRect(g, -11, -32, 22, 22, 8); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(g, -6, -20, 12, 6, 3); g.fill();
    g.fillStyle = '#1b6a61';
    ellipse(g, 0, -31, 10, 4);
    if (!back) arm();
    // Cabeza
    const hx = fx * 1.5, hy = -42;
    const sk = g.createRadialGradient(hx - 3, hy - 4, 2, hx, hy, 13);
    sk.addColorStop(0, '#ffe2c0'); sk.addColorStop(1, '#e5a776');
    g.fillStyle = sk;
    circle(g, hx, hy, 12);
    g.fillStyle = '#3b2416';
    if (back) {
      circle(g, hx, hy - 0.5, 12.3);
    } else {
      g.beginPath();
      g.arc(hx, hy, 12.6, Math.PI, 0);
      g.quadraticCurveTo(hx + 6 + fx * 3, hy - 2, hx + fx * 4, hy - 5);
      g.quadraticCurveTo(hx - 6 + fx * 3, hy - 2, hx - 12.6, hy);
      g.fill();
      const ex = hx + fx * 4, ey = hy + 2 + fy * 2;
      g.fillStyle = '#20140c';
      ellipse(g, ex - 4.2, ey, 1.9, p.scared ? 3.2 : 2.6);
      ellipse(g, ex + 4.2, ey, 1.9, p.scared ? 3.2 : 2.6);
      g.fillStyle = '#fff';
      circle(g, ex - 3.6, ey - 1, 0.7);
      circle(g, ex + 4.8, ey - 1, 0.7);
      g.fillStyle = 'rgba(255,110,110,0.35)';
      circle(g, ex - 7, ey + 4, 2.2);
      circle(g, ex + 7, ey + 4, 2.2);
      g.fillStyle = '#7a3524';
      if (p.scared) ellipse(g, ex, ey + 6, 1.8, 2.4);
      else { g.beginPath(); g.arc(ex, ey + 4.5, 2.4, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 1.3; g.strokeStyle = '#7a3524'; g.stroke(); }
    }
    g.restore();
  }

  // Tung Tung Tung Sahur: un tronco con ojos, piernas de palo y un bate
  function drawSahur(g, x, y, s, o) {
    const step = Math.sin(o.phase), w = o.walking || 0;
    const bob = o.bob || 0;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,0.42)';
    ellipse(g, 0, 2, 27, 8);
    // Piernas
    g.strokeStyle = '#3a2210';
    g.lineWidth = 5;
    g.lineCap = 'round';
    const l1 = step * 7 * w, lift1 = Math.max(0, -step) * 4 * w, lift2 = Math.max(0, step) * 4 * w;
    g.beginPath(); g.moveTo(-9, -28); g.lineTo(-10 + l1, -3 - lift1); g.stroke();
    g.beginPath(); g.moveTo(9, -28); g.lineTo(10 - l1, -3 - lift2); g.stroke();
    g.fillStyle = '#26150a';
    ellipse(g, -12 + l1, -2 - lift1, 6.5, 3);
    ellipse(g, 12 - l1, -2 - lift2, 6.5, 3);
    g.translate(0, -bob);
    // Brazo izquierdo
    const sw = Math.sin(o.phase + Math.PI) * 0.3 * w;
    g.strokeStyle = '#4a2c14';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(-21, -68); g.quadraticCurveTo(-31, -58, -32 + sw * 12, -42); g.stroke();
    g.fillStyle = '#5a3618';
    circle(g, -32 + sw * 12, -40, 4.5);
    // Tronco
    const bw = 24, top = -106, bot = -26;
    const gr = g.createLinearGradient(-bw, 0, bw, 0);
    gr.addColorStop(0, '#331c0b'); gr.addColorStop(0.18, '#6e4321'); gr.addColorStop(0.45, '#a8723f');
    gr.addColorStop(0.62, '#bb8551'); gr.addColorStop(0.85, '#6a401e'); gr.addColorStop(1, '#2e180a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-bw, top);
    g.lineTo(-bw, bot);
    g.quadraticCurveTo(0, bot + 12, bw, bot);
    g.lineTo(bw, top);
    g.ellipse(0, top, bw, 8, 0, 0, Math.PI, true);
    g.closePath();
    g.fill();
    // Vetas de la madera
    g.strokeStyle = 'rgba(45,22,6,0.45)';
    g.lineWidth = 1.4;
    for (const vx of [-17, -9, 2, 11, 18]) {
      g.beginPath();
      g.moveTo(vx, top + 7);
      g.bezierCurveTo(vx + Math.sin(vx) * 3, top + 30, vx - Math.cos(vx) * 3, bot - 30, vx + Math.sin(vx * 2) * 2, bot + 4);
      g.stroke();
    }
    g.strokeStyle = 'rgba(30,14,4,0.35)';
    g.beginPath(); g.ellipse(0, -40, bw, 5, 0, 0.1, Math.PI - 0.1); g.stroke();
    g.fillStyle = '#4a2a10';
    ellipse(g, 12, -36, 3.5, 5);
    g.strokeStyle = '#7a4a22';
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(12, -36, 5.5, 7.5, 0, 0, TAU); g.stroke();
    // Tapa con anillos
    g.fillStyle = '#d8a56a';
    ellipse(g, 0, top, bw, 8);
    g.strokeStyle = '#a87040';
    g.lineWidth = 1;
    for (const f of [0.72, 0.46, 0.2]) { g.beginPath(); g.ellipse(0, top, bw * f, 8 * f, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = '#5b3416';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, top, bw, 8, 0, 0, TAU); g.stroke();
    // Cara
    const lx = clamp(o.lookX || 0, -1, 1), ly = clamp(o.lookY || 0, -1, 1);
    for (const ex of [-9.5, 9.5]) {
      g.fillStyle = '#fffaf0';
      ellipse(g, ex, -77, 7.6, 9);
      g.strokeStyle = 'rgba(40,20,5,0.5)';
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(ex, -77, 7.6, 9, 0, 0, TAU); g.stroke();
      g.fillStyle = o.chasing ? '#d10f0f' : '#1a0d05';
      circle(g, ex + lx * 3, -76 + ly * 3, o.chasing ? 2.8 : 3.7);
      g.fillStyle = '#fff';
      circle(g, ex + lx * 3 - 1.2, -77.5 + ly * 3, 1);
    }
    g.strokeStyle = '#2a1406';
    g.lineWidth = 3.4;
    g.beginPath();
    if (o.chasing) { g.moveTo(-18, -92); g.lineTo(-4, -86); g.moveTo(18, -92); g.lineTo(4, -86); }
    else { g.moveTo(-16, -90); g.lineTo(-4, -91); g.moveTo(16, -90); g.lineTo(4, -91); }
    g.stroke();
    g.fillStyle = '#7a4a22';
    ellipse(g, 0, -66, 3, 4);
    if (o.chasing) {
      g.fillStyle = '#1d0a03';
      ellipse(g, 0, -53, 10, 7);
      g.fillStyle = '#f3ead8';
      g.fillRect(-6, -59, 4, 3.5);
      g.fillRect(2, -59, 4, 3.5);
    } else {
      g.strokeStyle = '#2a1406';
      g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(-8, -56); g.quadraticCurveTo(0, -50, 8, -56); g.stroke();
    }
    // Brazo derecho con el bate
    const swing = clamp(o.swing || 0, 0, 1);
    const hx = 30, hy = -58 - swing * 8;
    const batA = lerp(-1.75, -0.3, swing);
    g.strokeStyle = '#4a2c14';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(21, -68); g.lineTo(hx, hy); g.stroke();
    g.save();
    g.translate(hx, hy);
    g.rotate(batA);
    const bg = g.createLinearGradient(-6, 0, 56, 0);
    bg.addColorStop(0, '#c48a4e'); bg.addColorStop(0.5, '#f0d6a8'); bg.addColorStop(1, '#d9a86a');
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(-6, -2.2);
    g.lineTo(44, -6.5);
    g.quadraticCurveTo(56, 0, 44, 6.5);
    g.lineTo(-6, 2.2);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(90,50,15,0.6)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#3a1d0d';
    g.fillRect(-5, -2.6, 13, 5.2);
    g.fillStyle = '#a26a35';
    circle(g, -7, 0, 3.6);
    g.restore();
    g.fillStyle = '#5a3618';
    circle(g, hx, hy, 4.8);
    g.restore();
  }

  function sahurOpts(s) {
    return { phase: s.phase, walking: s.moving ? 1 : 0, chasing: s.state === 'chase', lookX: s.lookX, lookY: s.lookY, swing: s.swing, bob: s.bob };
  }

  function drawKey(g, k) {
    const bob = Math.sin(time * 2.5 + k.phase) * 4, y = k.y - 18 + bob;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    ellipse(g, k.x, k.y + 6, 11 - bob * 0.5, 4);
    g.save();
    g.translate(k.x, y);
    g.rotate(Math.sin(time * 1.7 + k.phase) * 0.25 - 0.5);
    const gr = g.createLinearGradient(-12, -8, 18, 8);
    gr.addColorStop(0, '#fff6c2'); gr.addColorStop(0.4, '#ffd23f'); gr.addColorStop(1, '#c08414');
    g.strokeStyle = gr;
    g.lineWidth = 4;
    g.beginPath(); g.arc(-8, 0, 6, 0, TAU); g.stroke();
    g.fillStyle = gr;
    g.fillRect(-2, -2, 21, 4);
    g.fillRect(12, 1.5, 3, 6);
    g.fillRect(17, 1.5, 3, 4.5);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    circle(g, -10, -3, 1.3);
    g.restore();
  }

  function lanternPos(lp) {
    const hasFace = tileAt(lp.tx, lp.ty + 1) === FLOOR;
    const topH = hasFace ? T - FACE_H : T;
    return { x: lp.tx * T + T / 2, y: lp.ty * T + topH * 0.55 };
  }
  function lampFlicker(lp) {
    return 0.88 + 0.08 * Math.sin(time * 7 + lp.phase) + 0.04 * Math.sin(time * 23 + lp.phase * 3);
  }
  function drawLantern(g, lp) {
    const { x, y } = lanternPos(lp);
    const f = lampFlicker(lp);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(g, x, y, 9, 3.5);
    g.fillStyle = '#1e2028';
    g.fillRect(x - 2, y - 26, 4, 26);
    g.fillStyle = `rgba(255,${Math.round(190 + 40 * f)},${Math.round(90 + 40 * f)},1)`;
    roundRect(g, x - 7, y - 44, 14, 18, 3); g.fill();
    g.strokeStyle = '#25272f';
    g.lineWidth = 2;
    roundRect(g, x - 7, y - 44, 14, 18, 3); g.stroke();
    g.beginPath(); g.moveTo(x, y - 44); g.lineTo(x, y - 26); g.stroke();
    g.fillStyle = '#25272f';
    g.beginPath(); g.moveTo(x - 10, y - 43); g.lineTo(x + 10, y - 43); g.lineTo(x, y - 53); g.closePath(); g.fill();
    circle(g, x, y - 54, 2.2);
  }

  function drawGate(g) {
    const gt = L.gate, px = gt.tx * T, py = gt.ty * T;
    const a = gt.open ? easeOut(clamp(gt.anim, 0, 1)) : 0;
    const ox0 = px + 9, ow = T - 18, oy0 = py + 2, oh = T - 6;
    g.fillStyle = '#07080c';
    g.fillRect(ox0, oy0, ow, oh);
    if (gt.open) {
      const lg = g.createLinearGradient(0, oy0, 0, oy0 + oh);
      lg.addColorStop(0, `rgba(255,246,205,${0.95 * a})`);
      lg.addColorStop(1, `rgba(255,190,90,${0.6 * a})`);
      g.fillStyle = lg;
      g.fillRect(ox0, oy0, ow, oh);
    }
    for (const sx of [px, px + T - 9]) {
      g.fillStyle = '#545869';
      g.fillRect(sx, py, 9, T);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(sx, py, 9, 2);
      g.fillStyle = '#6b7084';
      g.fillRect(sx - 1, py - 4, 11, 6);
    }
    g.save();
    g.beginPath(); g.rect(ox0, oy0, ow, oh); g.clip();
    g.translate(0, -a * oh);
    for (let i = 0; i < 5; i++) {
      const bx = ox0 + 4 + i * (ow - 8) / 4;
      g.fillStyle = '#2b2e3a';
      g.fillRect(bx - 1.7, oy0, 3.4, oh);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(bx - 1.7, oy0, 1, oh);
    }
    g.fillStyle = '#2b2e3a';
    g.fillRect(ox0, oy0 + 10, ow, 3.5);
    g.fillRect(ox0, oy0 + oh - 14, ow, 3.5);
    g.restore();
    if (!gt.open) {
      const cx = px + T / 2, cy = py + T / 2 + 4;
      g.strokeStyle = '#b8bccb';
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(cx, cy - 3, 5, Math.PI, 0); g.stroke();
      const lg = g.createLinearGradient(cx - 8, 0, cx + 8, 0);
      lg.addColorStop(0, '#b47d12'); lg.addColorStop(0.5, '#ffd34d'); lg.addColorStop(1, '#a8700e');
      g.fillStyle = lg;
      roundRect(g, cx - 8, cy - 3, 16, 13, 3); g.fill();
      g.fillStyle = '#3a2405';
      circle(g, cx, cy + 2.5, 1.8);
      g.fillRect(cx - 0.8, cy + 3, 1.6, 4);
    }
  }

  // Hierba que tapa los pies del jugador cuando se esconde
  function drawGrassFront(g, p) {
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const bx = p.x - 15 + i * 3.8, h = 10 + ((i * 7) % 5) * 2.5, lean = Math.sin(time * 2 + i) * 2;
      g.strokeStyle = i % 2 ? '#1f4a2a' : '#2a5e34';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(bx, p.y + 4);
      g.quadraticCurveTo(bx + lean * 0.3, p.y - h * 0.5, bx + lean, p.y - h);
      g.stroke();
    }
  }

  // ================= Partículas y textos flotantes =================
  function burst(x, y, rgb, n, speed = 160, glowy = true) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: rand(0.5, 1.1), max: 1.1, size: rand(1.5, 3.5), rgb, glow: glowy, grav: 120 });
    }
  }
  function dust(x, y) {
    for (let i = 0; i < 5; i++) {
      particles.push({ x: x + rand(-14, 14), y: y + rand(-3, 3), vx: rand(-30, 30), vy: rand(-25, -5), life: rand(0.4, 0.8), max: 0.8, size: rand(3, 6), rgb: '120,95,70', glow: false, grav: 0 });
    }
  }
  function addText(x, y, text, color = '#ffb347', size = 28) {
    texts.push({ x, y, text, color, size, life: 1.6, max: 1.6, rot: rand(-0.15, 0.15) });
  }

  // ================= HUD =================
  const KEY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M11.2 12H22M18.2 12v4.2M21.4 12v3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const hud = {
    el: $('#hud'), keys: $('#keys'), obj: $('#objective'), level: $('#level-label'), timer: $('#timer'),
    stamina: $('#stamina-fill'), alert: $('#alert'), danger: $('#danger'), mute: $('#btn-mute'),
    lastTimer: -1, miniT: 0
  };
  function buildKeysHUD() {
    hud.keys.innerHTML = L.keys.map(k => `<span class="key${k.taken ? ' got' : ''}">${KEY_SVG}</span>`).join('');
    hud.level.textContent = 'Nivel ' + L.n;
    updateObjective();
  }
  function updateObjective() {
    const left = L.keys.length - L.keysTaken;
    if (left > 0) {
      hud.obj.textContent = `Faltan ${left} llave${left === 1 ? '' : 's'}`;
      hud.obj.classList.remove('open');
    } else {
      hud.obj.textContent = '¡Puerta abierta! Corre al sur';
      hud.obj.classList.add('open');
    }
  }
  function markKeyHUD(i) {
    const el = hud.keys.children[i];
    if (el) el.classList.add('got');
    updateObjective();
  }
  function showAlert(text, kind = '') {
    const a = hud.alert;
    a.textContent = text;
    a.className = kind;
    void a.offsetWidth;
    a.classList.add('show');
  }
  function updateMuteIcon() { hud.mute.textContent = Sound.muted ? '🔇' : '🔊'; }

  function drawMinimap() {
    const w = mini.width, h = mini.height;
    mctx.clearRect(0, 0, w, h);
    const sc = Math.min(w, h) / Math.max(L.W, L.H);
    const ox = (w - L.W * sc) / 2, oy = (h - L.H * sc) / 2;
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const i = y * L.W + x;
      if (!L.explored[i]) continue;
      const t = L.g[i];
      mctx.fillStyle = t === FLOOR ? (L.grass[i] ? 'rgba(120,190,120,0.65)' : 'rgba(225,212,180,0.6)') : t === LAMP ? '#ffb347' : 'rgba(30,60,40,0.9)';
      mctx.fillRect(ox + x * sc, oy + y * sc, Math.ceil(sc), Math.ceil(sc));
    }
    for (const k of L.keys) {
      if (k.taken || !L.explored[k.ty * L.W + k.tx]) continue;
      mctx.fillStyle = '#ffd54a';
      mctx.beginPath(); mctx.arc(ox + (k.tx + 0.5) * sc, oy + (k.ty + 0.5) * sc, Math.max(2.5, sc * 0.6), 0, TAU); mctx.fill();
    }
    const gt = L.gate;
    mctx.fillStyle = gt.open ? '#8dffb0' : '#ff5a4a';
    mctx.fillRect(ox + gt.tx * sc - sc * 0.3, oy + gt.ty * sc, sc * 1.6, sc);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath(); mctx.arc(ox + P.x / T * sc, oy + P.y / T * sc, Math.max(3, sc * 0.7), 0, TAU); mctx.fill();
    mctx.strokeStyle = 'rgba(255,255,255,0.8)';
    mctx.lineWidth = Math.max(1.5, sc * 0.3);
    mctx.beginPath();
    mctx.moveTo(ox + P.x / T * sc, oy + P.y / T * sc);
    mctx.lineTo(ox + P.x / T * sc + Math.cos(P.face) * sc * 2, oy + P.y / T * sc + Math.sin(P.face) * sc * 2);
    mctx.stroke();
  }

  // ================= Flujo de juego =================
  const screens = { menu: $('#menu'), pause: $('#pause'), over: $('#gameover'), win: $('#win') };
  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
    const playingUI = name === null;
    hud.el.classList.toggle('hidden', !playingUI && state !== 'paused');
    $('#touch').classList.toggle('hidden', !(isTouch && playingUI));
  }

  function makeSahur(t) {
    return {
      x: (t.x + 0.5) * T, y: (t.y + 0.5) * T, r: 18, state: 'wander', next: null, repath: 0, lastTile: -1,
      wanderTarget: null, lastSeen: null, lostT: 0, roar: 0, grace: 3, phase: 0, moving: false,
      lookX: 0, lookY: 1, swing: 0.25, bob: 0, tungT: 2.5, hbT: 0, stuck: 0, dist: 9999, speed: 0
    };
  }

  function startLevel(n) {
    Sound.init();
    makeLevel(n);
    P = {
      x: (L.start.x + 0.5) * T, y: (L.start.y + 0.5) * T, r: 14, face: Math.PI / 4, walk: 0, moving: false,
      stamina: 1, exhausted: false, sprinting: false, hidden: false, light: true, scared: false, flicker: 0
    };
    S = makeSahur(L.sahurStart);
    cam.x = P.x; cam.y = P.y; cam.shake = 0;
    particles = []; texts = [];
    levelTime = 0;
    state = 'playing';
    buildKeysHUD();
    showScreen(null);
    hud.danger.style.opacity = 0;
    $('#btn-light').classList.toggle('off', !P.light);
    showAlert(`Nivel ${n}`, 'warn');
    setTimeout(() => { if (state === 'playing') Sound.tungs(0.35, 0); }, 900);
  }

  function goMenu() {
    state = 'menu';
    makeLevel(1);
    P = null;
    S = makeSahur(L.sahurStart);
    S.grace = 0;
    cam.x = S.x; cam.y = S.y;
    particles = []; texts = [];
    hud.danger.style.opacity = 0;
    const best = store.get('ttsahur.best', 0);
    $('#record').textContent = best > 0 ? `🏆 Récord: ${best} nivel${best === 1 ? '' : 'es'} superado${best === 1 ? '' : 's'}` : '';
    showScreen('menu');
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    input.keys.clear();
    showScreen('pause');
  }
  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    showScreen(null);
  }

  function spotted() {
    S.roar = 0.55;
    showAlert('¡TE VIO!');
    Sound.alert();
    Sound.tungs(1, clamp((S.x - P.x) / (6 * T), -1, 1));
    cam.shake = Math.max(cam.shake, 7);
    if (time - lastSpeak > 9) { lastSpeak = time; Sound.speak('tung tung tung sahur', 0.9); }
  }

  function collectKey(k, i) {
    k.taken = true;
    L.keysTaken++;
    Sound.pickup();
    burst(k.x, k.y - 18, '255,214,80', 36);
    addText(k.x, k.y - 44, '+1 llave', '#ffe08a', 22);
    markKeyHUD(i);
    cam.shake = Math.max(cam.shake, 3);
    if (L.keysTaken === L.keys.length) openGate();
    else if (Math.random() < 0.4 && S.state !== 'chase') {
      S.state = 'search';
      S.lastSeen = { x: k.x, y: k.y };
      S.next = null;
      showAlert('Sahur oyó algo…', 'warn');
    }
  }

  function openGate() {
    const gt = L.gate;
    gt.open = true;
    gt.anim = 0;
    gt.poly = visPoly((gt.tx + 0.5) * T, (gt.ty + 0.5) * T, 340, 0, TAU, 90);
    Sound.gateOpen();
    showAlert('¡La puerta se abrió!', 'good');
    burst((gt.tx + 0.5) * T, gt.ty * T, '255,240,180', 50, 220);
    if (S.state !== 'chase') { S.state = 'search'; S.lastSeen = { x: P.x, y: P.y }; S.next = null; }
  }

  function caught() {
    state = 'caught';
    jumpT = 0;
    input.keys.clear();
    hud.alert.className = '';
    hud.el.classList.add('hidden');
    hud.danger.style.opacity = 0;
    Sound.jumpscare();
    Sound.speak('tung tung tung tung sahur!', 1.15);
    $('#touch').classList.add('hidden');
  }

  function statHTML(items) {
    return items.map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join('');
  }

  function showGameOver() {
    state = 'over';
    const lines = [
      'Tung… tung… tung… sahur.',
      'No llegaste al sahur a tiempo.',
      'El bate de madera no perdona.',
      'Debiste esconderte en la hierba.',
      'Te encontró por el ruido de tus pasos.'
    ];
    $('#over-line').textContent = pick(lines);
    $('#over-stats').innerHTML = statHTML([[L.n, 'Nivel'], [`${L.keysTaken}/${L.keys.length}`, 'Llaves'], [fmtTime(levelTime), 'Tiempo']]);
    showScreen('over');
    hud.el.classList.add('hidden');
  }

  function winLevel() {
    state = 'won';
    Sound.win();
    const best = store.get('ttsahur.best', 0);
    if (L.n > best) store.set('ttsahur.best', L.n);
    const lines = ['El tambor se queda atrás… por ahora.', 'Sahur sigue golpeando, pero ya no te alcanza.', '¡Llegaste a tiempo para el sahur!'];
    $('#win-line').textContent = pick(lines) + (L.n > best ? ' ¡Nuevo récord!' : '');
    $('#win-stats').innerHTML = statHTML([[L.n, 'Nivel'], [`${L.keys.length}/${L.keys.length}`, 'Llaves'], [fmtTime(levelTime), 'Tiempo']]);
    showScreen('win');
    hud.el.classList.add('hidden');
    hud.danger.style.opacity = 0;
  }

  // ================= Actualización =================
  function screenToWorld(sx, sy) {
    return { x: (sx - VW / 2) / zoom + cam.x, y: (sy - VH / 2) / zoom + cam.y };
  }

  function updatePlayer(dt) {
    const k = input.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    mx += input.stickX;
    my += input.stickY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const amt = Math.min(1, len);
    const moving = amt > 0.12;
    const wantSprint = k.has('ShiftLeft') || k.has('ShiftRight') || input.sprintTouch;
    if (P.stamina <= 0) P.exhausted = true;
    if (P.exhausted && P.stamina > 0.35) P.exhausted = false;
    P.sprinting = wantSprint && moving && !P.exhausted;
    if (P.sprinting) P.stamina = Math.max(0, P.stamina - dt * 0.36);
    else P.stamina = Math.min(1, P.stamina + dt * (moving ? 0.15 : 0.24));
    const spd = P.sprinting ? 250 : 148;
    P.moving = moving;
    if (moving) {
      moveBody(P, mx * spd * dt, my * spd * dt, false);
      const before = P.walk;
      P.walk += dt * (P.sprinting ? 16 : 10.5) * Math.max(0.5, amt);
      if (Math.floor(P.walk / Math.PI) !== Math.floor(before / Math.PI)) Sound.step(P.sprinting ? 0.22 : 0.1);
    }
    let target = P.face;
    if (!isTouch && time - mouse.t < 2.5) {
      const w = screenToWorld(mouse.x, mouse.y);
      target = Math.atan2(w.y - (P.y - 20), w.x - P.x);
    } else if (moving) target = Math.atan2(my, mx);
    P.face = angLerp(P.face, target, 1 - Math.exp(-dt * 14));
    const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T);
    P.hidden = L.grass[ty * L.W + tx] === 1 && !P.sprinting;
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H) continue;
      if ((x - tx) ** 2 + (y - ty) ** 2 <= 10) L.explored[y * L.W + x] = 1;
    }
  }

  function updateSahur(dt, chaseAllowed) {
    const lvl = L.n;
    let canSee = false;
    let dist = 9999, dx = 0, dy = 0;
    if (P) { dx = P.x - S.x; dy = P.y - S.y; dist = Math.hypot(dx, dy); }
    S.dist = dist;
    if (S.grace > 0) S.grace -= dt;
    else if (chaseAllowed && P) {
      const sight = ((P.light ? 6.5 : 3.6) + lvl * 0.35) * T;
      const los = dist < sight && hasLOS(S.x, S.y - 30, P.x, P.y - 15);
      canSee = los && !(P.hidden && dist > 2.4 * T);
      if (!canSee && P.sprinting && dist < 4.5 * T) canSee = true;
      if (!canSee && los && dist < 1.4 * T) canSee = true;
    }
    if (canSee) {
      if (S.state !== 'chase') spotted();
      S.state = 'chase';
      S.lastSeen = { x: P.x, y: P.y };
      S.lostT = 0;
    } else if (S.state === 'chase') {
      S.lostT += dt;
      if (S.lostT > 0.6) { S.state = 'search'; S.next = null; }
    }

    // Objetivo y velocidad según el estado
    let target, spd;
    if (S.state === 'chase') {
      spd = 150 + lvl * 8 + L.keysTaken * 5;
      target = S.lastSeen;
    } else if (S.state === 'search') {
      spd = 118 + lvl * 6;
      target = S.lastSeen;
      if (Math.hypot(target.x - S.x, target.y - S.y) < 24) {
        S.state = 'wander';
        const t = tileOf(target);
        S.wanderTarget = randomFloorNear(t.x, t.y, 4);
      }
    } else {
      spd = 80 + lvl * 6;
      const st = tileOf(S);
      if (!S.wanderTarget || (st.x === S.wanderTarget.x && st.y === S.wanderTarget.y)) {
        if (P && chaseAllowed && Math.random() < 0.4) { const pt = tileOf(P); S.wanderTarget = randomFloorNear(pt.x, pt.y, 6); }
        else S.wanderTarget = pick(L.floors);
        S.next = null;
      }
      target = { x: (S.wanderTarget.x + 0.5) * T, y: (S.wanderTarget.y + 0.5) * T };
    }
    spd = Math.min(spd, 232);
    if (S.roar > 0) { S.roar -= dt; spd = 0; }
    S.speed = lerp(S.speed, spd, 1 - Math.exp(-dt * 6));

    // Camino: BFS por la cuadrícula; en línea recta si está muy cerca
    let wx, wy;
    if (S.state === 'chase' && canSee && dist < 1.6 * T) { wx = P.x; wy = P.y; }
    else {
      const st = tileOf(S), gt = tileOf(target), tk = st.y * L.W + st.x;
      S.repath -= dt;
      if (S.repath <= 0 || tk !== S.lastTile) {
        S.next = nextStep(st.x, st.y, gt.x, gt.y);
        S.repath = 0.25;
        S.lastTile = tk;
      }
      if (S.next) { wx = (S.next.x + 0.5) * T; wy = (S.next.y + 0.5) * T; }
      else { wx = target.x; wy = target.y; }
    }
    const ddx = wx - S.x, ddy = wy - S.y, dl = Math.hypot(ddx, ddy);
    if (dl > 2 && S.speed > 5) {
      const v = Math.min(S.speed * dt, dl), ox = S.x, oy = S.y;
      moveBody(S, ddx / dl * v, ddy / dl * v, true);
      S.moving = true;
      const moved = Math.hypot(S.x - ox, S.y - oy);
      if (moved < v * 0.2) S.stuck += dt; else S.stuck = 0;
      if (S.stuck > 0.7) { const st = tileOf(S); S.x = (st.x + 0.5) * T; S.y = (st.y + 0.5) * T; S.stuck = 0; }
      const before = S.phase;
      S.phase += dt * S.speed / 15;
      if (Math.floor(before / Math.PI) !== Math.floor(S.phase / Math.PI)) {
        const vol = Math.pow(clamp(1 - dist / (8 * T), 0, 1), 1.5) * 0.35;
        Sound.tung(vol, clamp((S.x - (P ? P.x : S.x)) / (6 * T), -1, 1), 0.5);
        if (S.state === 'chase') dust(S.x, S.y);
      }
      if (S.state !== 'chase') { S.lookX = lerp(S.lookX, ddx / dl, 0.1); S.lookY = lerp(S.lookY, ddy / dl, 0.1); }
    } else S.moving = false;
    if (S.state === 'chase' && dist > 0) { S.lookX = lerp(S.lookX, dx / dist, 0.2); S.lookY = lerp(S.lookY, dy / dist, 0.2); }
    S.bob = S.moving ? Math.abs(Math.cos(S.phase)) * 3 : 0;
    if (S.roar > 0) S.swing = lerp(S.swing, 0, 0.3);
    else if (S.state === 'chase') S.swing = 0.5 + 0.5 * Math.sin(time * 9);
    else S.swing = 0.22 + Math.sin(time * 1.3) * 0.08;

    // "Tung tung tung" periódico: delata dónde está
    S.tungT -= dt;
    if (S.tungT <= 0) {
      S.tungT = S.state === 'chase' ? rand(1.6, 2.4) : rand(3.2, 5.5);
      const vol = P ? Math.pow(clamp(1 - dist / (15 * T), 0, 1), 1.6) : 0.15;
      Sound.tungs(vol, P ? clamp((S.x - P.x) / (6 * T), -1, 1) : 0);
      if (!P || dist < 11 * T) addText(S.x + rand(-10, 10), S.y - 128, 'TUNG TUNG TUNG', '#ffb347', S.state === 'chase' ? 30 : 24);
    }

    if (!P || !chaseAllowed) return;
    // Latidos y viñeta roja según la cercanía
    const close = clamp(1 - dist / (7 * T), 0, 1);
    P.scared = close > 0.4;
    hud.danger.style.opacity = (close * (S.state === 'chase' ? 1 : 0.55)).toFixed(3);
    if (close > 0.12) {
      S.hbT -= dt;
      if (S.hbT <= 0) { Sound.heartbeat(0.2 + close * 0.6); S.hbT = lerp(1.1, 0.42, close); }
    }
    if (close > 0.5 && P.flicker <= 0 && Math.random() < 0.05 * close) P.flicker = rand(0.05, 0.18);
    // ¡Atrapado!
    if (S.grace <= 0 && dist < P.r + S.r + 6 && hasLOS(S.x, S.y, P.x, P.y)) caught();
  }

  function update(dt) {
    time += dt;
    if (L) {
      for (const f of L.fireflies) {
        f.a += rand(-2, 2) * dt;
        f.x += Math.cos(f.a) * f.s * dt;
        f.y += Math.sin(f.a) * f.s * dt;
        f.x = clamp(f.x, T, (L.W - 1) * T);
        f.y = clamp(f.y, T, (L.H - 1) * T);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97; p.vy *= 0.97;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    cam.shake = Math.max(0, cam.shake - dt * 18);

    Sound.cricketT -= dt;
    if (Sound.cricketT <= 0) { Sound.cricketT = rand(0.6, 2.6); if (!S || S.dist > 5 * T) Sound.cricket(); }

    if (state === 'menu') {
      updateSahur(dt, false);
      cam.x = lerp(cam.x, S.x, 1 - Math.exp(-dt * 2));
      cam.y = lerp(cam.y, S.y - 40, 1 - Math.exp(-dt * 2));
      return;
    }
    if (state === 'caught') {
      jumpT += dt;
      cam.shake = 10;
      if (jumpT > 1.7) showGameOver();
      return;
    }
    if (state !== 'playing') return;

    levelTime += dt;
    updatePlayer(dt);
    P.flicker = Math.max(0, P.flicker - dt);
    for (let i = 0; i < L.keys.length; i++) {
      const k = L.keys[i];
      if (!k.taken && Math.hypot(P.x - k.x, P.y - k.y) < 34) collectKey(k, i);
      if (!k.taken && Math.random() < dt * 3) {
        particles.push({ x: k.x + rand(-14, 14), y: k.y - 18 + rand(-12, 12), vx: 0, vy: rand(-22, -8), life: 0.9, max: 0.9, size: rand(1, 2.2), rgb: '255,230,140', glow: true, grav: 0 });
      }
    }
    const gt = L.gate;
    if (gt.open) {
      gt.anim = Math.min(1.5, gt.anim + dt * 0.8);
      if (Math.random() < dt * 10) {
        particles.push({ x: (gt.tx + rand(0.2, 0.8)) * T, y: gt.ty * T + rand(0, 30), vx: rand(-10, 10), vy: rand(-60, -25), life: 1.3, max: 1.3, size: rand(1.2, 2.8), rgb: '255,240,190', glow: true, grav: 0 });
      }
      if (Math.floor(P.y / T) >= gt.ty) { winLevel(); return; }
    }
    updateSahur(dt, true);
    if (state !== 'playing') return;

    // Cámara con un poco de anticipación hacia donde miras
    const look = 40;
    const tx = P.x + Math.cos(P.face) * look, ty = P.y - 20 + Math.sin(P.face) * look;
    cam.x = lerp(cam.x, tx, 1 - Math.exp(-dt * 6));
    cam.y = lerp(cam.y, ty, 1 - Math.exp(-dt * 6));

    // HUD
    const st = P.stamina;
    hud.stamina.style.transform = `scaleX(${st.toFixed(3)})`;
    hud.stamina.classList.toggle('tired', P.exhausted);
    const sec = Math.floor(levelTime);
    if (sec !== hud.lastTimer) { hud.lastTimer = sec; hud.timer.textContent = fmtTime(levelTime); }
    hud.miniT -= dt;
    if (hud.miniT <= 0) { hud.miniT = 0.15; drawMinimap(); }
  }

  // ================= Render =================
  function polyPath(g, pts, ox, oy, fan) {
    g.beginPath();
    if (fan) g.moveTo(ox, oy); else g.moveTo(pts[0], pts[1]);
    for (let i = fan ? 0 : 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }
  function lightFill(g, ox, oy, r, rgb, a) {
    const gr = g.createRadialGradient(ox, oy, 0, ox, oy, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.55, `rgba(${rgb},${a * 0.72})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fill();
  }
  function flashlight() {
    const fx = Math.cos(P.face), fy = Math.sin(P.face);
    const ox = P.x + fx * 8, oy = P.y - 6 + fy * 4;
    return {
      ox, oy,
      wide: visPoly(ox, oy, 360, P.face - 0.68, P.face + 0.68, 56),
      narrow: visPoly(ox, oy, 430, P.face - 0.38, P.face + 0.38, 44)
    };
  }

  function render() {
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, W, H);
    if (!L) return;

    const cx = cam.x + rand(-1, 1) * cam.shake, cy = cam.y + rand(-1, 1) * cam.shake;
    const k = DPR * zoom, ox = DPR * VW / 2 - cx * k, oy = DPR * VH / 2 - cy * k;
    const vl = cx - VW / 2 / zoom, vt = cy - VH / 2 / zoom, vw = VW / zoom, vh = VH / zoom;
    const inView = (x, y, m) => x > vl - m && x < vl + vw + m && y > vt - m && y < vt + vh + m;
    ctx.setTransform(k, 0, 0, k, ox, oy);

    // Fondo
    const sx = clamp(Math.floor(vl), 0, L.bg.width), sy = clamp(Math.floor(vt), 0, L.bg.height);
    const ex = clamp(Math.ceil(vl + vw), 0, L.bg.width), ey = clamp(Math.ceil(vt + vh), 0, L.bg.height);
    if (ex > sx && ey > sy) ctx.drawImage(L.bg, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);

    // Entidades ordenadas por profundidad (y)
    const ents = [];
    for (const kk of L.keys) if (!kk.taken && inView(kk.x, kk.y, 60)) ents.push({ y: kk.y, d: () => drawKey(ctx, kk) });
    for (const lp of L.lamps) if (inView(lp.x, lp.y, 80)) ents.push({ y: lp.y, d: () => drawLantern(ctx, lp) });
    ents.push({ y: (L.gate.ty + 1) * T, d: () => drawGate(ctx) });
    if (P) ents.push({ y: P.y, d: () => { drawPlayer(ctx, P); if (P.hidden) drawGrassFront(ctx, P); } });
    if (S && inView(S.x, S.y, 160)) ents.push({ y: S.y, d: () => drawSahur(ctx, S.x, S.y, 0.95, sahurOpts(S)) });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.d();
    for (const p of particles) {
      if (p.glow) continue;
      ctx.fillStyle = `rgba(${p.rgb},${(p.life / p.max) * 0.5})`;
      circle(ctx, p.x, p.y, p.size);
    }

    // ---- Oscuridad con luces que proyectan sombras ----
    const kd = DS * zoom, oxd = DS * VW / 2 - cx * kd, oyd = DS * VH / 2 - cy * kd;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.globalAlpha = 1;
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = state === 'menu' ? 'rgba(4,6,20,0.86)' : 'rgba(3,5,16,0.95)';
    dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.setTransform(kd, 0, 0, kd, oxd, oyd);
    dctx.globalCompositeOperation = 'destination-out';
    for (const lp of L.lamps) {
      if (!inView(lp.x, lp.y, 260)) continue;
      polyPath(dctx, lp.poly, lp.x, lp.y, false);
      lightFill(dctx, lp.x, lp.y, 250 * lampFlicker(lp), '0,0,0', 0.92);
    }
    for (const kk of L.keys) {
      if (kk.taken || !inView(kk.x, kk.y, 70)) continue;
      dctx.globalAlpha = 0.6;
      dctx.drawImage(glow.cut, kk.x - 55, kk.y - 73, 110, 110);
    }
    dctx.globalAlpha = 0.35;
    for (const f of L.fireflies) if (inView(f.x, f.y, 20)) dctx.drawImage(glow.cut, f.x - 14, f.y - 14, 28, 28);
    dctx.globalAlpha = 1;
    const gt = L.gate;
    if (gt.open && gt.poly) {
      polyPath(dctx, gt.poly, (gt.tx + 0.5) * T, (gt.ty + 0.5) * T, false);
      lightFill(dctx, (gt.tx + 0.5) * T, (gt.ty + 0.5) * T, 340 * Math.min(1, gt.anim), '0,0,0', 1);
    }
    let fl = null;
    if (P) {
      const amb = visPoly(P.x, P.y - 4, 130, 0, TAU, 48);
      polyPath(dctx, amb, P.x, P.y - 4, false);
      lightFill(dctx, P.x, P.y - 4, P.light ? 130 : 100, '0,0,0', 0.9);
      if (P.light) {
        fl = flashlight();
        const str = P.flicker > 0 ? 0.25 : 1;
        polyPath(dctx, fl.wide, fl.ox, fl.oy, true);
        lightFill(dctx, fl.ox, fl.oy, 360, '0,0,0', 0.55 * str);
        polyPath(dctx, fl.narrow, fl.ox, fl.oy, true);
        lightFill(dctx, fl.ox, fl.oy, 430, '0,0,0', 0.95 * str);
      }
    } else if (S) {
      const pl = visPoly(S.x, S.y - 10, 290, 0, TAU, 64);
      polyPath(dctx, pl, S.x, S.y - 10, false);
      lightFill(dctx, S.x, S.y - 10, 290, '0,0,0', 0.85);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0, W, H);

    // ---- Brillos aditivos ----
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    if (fl && P.flicker <= 0) {
      polyPath(ctx, fl.narrow, fl.ox, fl.oy, true);
      lightFill(ctx, fl.ox, fl.oy, 430, '255,226,170', 0.09);
    }
    for (const lp of L.lamps) {
      if (!inView(lp.x, lp.y, 260)) continue;
      const f = lampFlicker(lp);
      polyPath(ctx, lp.poly, lp.x, lp.y, false);
      lightFill(ctx, lp.x, lp.y, 240 * f, '255,150,60', 0.2);
      const lpos = lanternPos(lp);
      ctx.globalAlpha = 0.85 * f;
      ctx.drawImage(glow.warm, lpos.x - 46, lpos.y - 81, 92, 92);
      ctx.globalAlpha = 1;
    }
    for (const kk of L.keys) {
      if (kk.taken || !inView(kk.x, kk.y, 70)) continue;
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 3 + kk.phase);
      ctx.drawImage(glow.gold, kk.x - 40, kk.y - 58 + Math.sin(time * 2.5 + kk.phase) * 4, 80, 80);
    }
    ctx.globalAlpha = 1;
    for (const f of L.fireflies) {
      if (!inView(f.x, f.y, 20)) continue;
      ctx.globalAlpha = 0.35 + 0.55 * Math.max(0, Math.sin(time * 2 + f.p));
      ctx.drawImage(glow.green, f.x - 9, f.y - 9, 18, 18);
    }
    ctx.globalAlpha = 1;
    if (gt.open) {
      const a = Math.min(1, gt.anim);
      ctx.globalAlpha = 0.7 * a;
      ctx.drawImage(glow.white, (gt.tx + 0.5) * T - 110, gt.ty * T - 90, 220, 220);
      ctx.globalAlpha = 1;
    }
    if (S && (S.dist < 11 * T || !P)) {
      const a = P ? clamp(1 - S.dist / (11 * T), 0, 1) * 0.9 + 0.1 : 0.8;
      const sc = 0.95, eg = S.state === 'chase' ? glow.red : glow.pale;
      for (const exo of [-9.5, 9.5]) {
        const ex = S.x + (exo + S.lookX * 3) * sc, ey = S.y - (76 + S.bob - S.lookY * 3) * sc;
        ctx.globalAlpha = a;
        ctx.drawImage(eg, ex - 12, ey - 12, 24, 24);
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = S.state === 'chase' ? '#ff6a5a' : '#fff1c8';
        circle(ctx, ex, ey, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    for (const p of particles) {
      if (!p.glow) continue;
      ctx.fillStyle = `rgba(${p.rgb},${p.life / p.max})`;
      circle(ctx, p.x, p.y, p.size);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Textos flotantes ("TUNG TUNG TUNG")
    for (const t of texts) {
      const a = clamp(t.life / t.max * 1.6, 0, 1), sc = 1 + (1 - t.life / t.max) * 0.25;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      ctx.scale(sc, sc);
      ctx.globalAlpha = a;
      ctx.font = `${t.size}px Creepster, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(30,10,0,0.85)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }

    // ---- Niebla, viñeta e indicadores en pantalla ----
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    for (const [spd, par, alpha] of [[14, 0.6, 0.5], [-9, 0.85, 0.35]]) {
      const offx = ((-cam.x * zoom * par + time * spd) % 512 + 512) % 512 - 512;
      const offy = ((-cam.y * zoom * par + time * spd * 0.3) % 512 + 512) % 512 - 512;
      ctx.globalAlpha = alpha;
      for (let x = offx; x < VW; x += 512) for (let y = offy; y < VH; y += 512) ctx.drawImage(fogTex, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(vignette, 0, 0, VW, VH);

    if (P && gt.open && (state === 'playing' || state === 'paused')) drawGateArrow();
    if (state === 'caught' || state === 'over') drawJumpscare();
  }

  function drawGateArrow() {
    const gx = (L.gate.tx + 0.5) * T, gy = (L.gate.ty + 0.3) * T;
    const sx = (gx - cam.x) * zoom + VW / 2, sy = (gy - cam.y) * zoom + VH / 2;
    const m = 50;
    if (sx > m && sx < VW - m && sy > m && sy < VH - m) return;
    const a = Math.atan2(sy - VH / 2, sx - VW / 2);
    const ax = clamp(sx, m, VW - m), ay = clamp(sy, m + 30, VH - m - 30);
    const pulse = 1 + Math.sin(time * 6) * 0.12;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.scale(pulse, pulse);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glow.gold, -30, -30, 60, 60);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd54a';
    ctx.strokeStyle = '#3a2405';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawJumpscare() {
    const p = clamp(jumpT / 0.35, 0, 1), e = easeOut(p);
    ctx.fillStyle = `rgba(18,0,0,${0.55 + 0.35 * p})`;
    ctx.fillRect(0, 0, VW, VH);
    if (state === 'caught' && Math.random() < 0.35) {
      ctx.fillStyle = 'rgba(255,0,20,0.18)';
      ctx.fillRect(0, 0, VW, VH);
    }
    const sc = lerp(1.2, Math.min(VW, VH * 1.1) / 62, e);
    const sh = state === 'caught' ? 14 : 2;
    const jx = VW / 2 + rand(-1, 1) * sh, jy = VH / 2 + 74 * sc + rand(-1, 1) * sh;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, 0, VW / 2, VH / 2, Math.max(VW, VH) * 0.6);
    g.addColorStop(0, 'rgba(255,60,20,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    drawSahur(ctx, jx, jy, sc, { phase: 0, walking: 0, chasing: true, lookX: 0, lookY: 0.4, swing: 0.5 + 0.5 * Math.sin(time * 28), bob: 0 });
    if (state === 'caught') {
      ctx.save();
      ctx.translate(VW / 2 + rand(-4, 4), VH * 0.16);
      ctx.font = `${Math.min(VW / 9, 84)}px Creepster, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1a0000';
      ctx.strokeText('TUNG TUNG TUNG', 0, 0);
      ctx.fillStyle = '#ff3b2f';
      ctx.fillText('TUNG TUNG TUNG', 0, 0);
      ctx.restore();
    }
  }

  function renderPortrait() {
    const w = portrait.width, h = portrait.height;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, w, h);
    const s = h / 300;
    pctx.setTransform(s, 0, 0, s, 0, 0);
    const cw = w / s;
    const chasing = Math.sin(time * 0.8) > 0.55;
    const g = pctx.createRadialGradient(cw / 2, 160, 10, cw / 2, 160, Math.min(cw / 2, 140));
    g.addColorStop(0, chasing ? 'rgba(255,60,30,0.22)' : 'rgba(255,170,70,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, cw, 300);
    const lookX = Math.sin(time * 0.9) * 0.8, lookY = 0.3 + Math.cos(time * 0.6) * 0.3;
    drawSahur(pctx, cw / 2 - 26, 286 - Math.abs(Math.sin(time * 3)) * 4, 1.9, {
      phase: time * 3, walking: 0.6, chasing, lookX, lookY,
      swing: chasing ? 0.5 + 0.5 * Math.sin(time * 9) : 0.25 + Math.sin(time * 1.5) * 0.12, bob: 0
    });
  }

  // ================= Bucle principal =================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    if (state === 'menu') renderPortrait();
    requestAnimationFrame(frame);
  }

  // ================= Entrada =================
  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);
  window.addEventListener('keydown', e => {
    if (GAME_KEYS.has(e.code) && state === 'playing') e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame();
      return;
    }
    if (e.code === 'KeyM') { Sound.setMuted(!Sound.muted); updateMuteIcon(); return; }
    if (e.code === 'KeyF' && state === 'playing') { toggleLight(); return; }
    if (e.code === 'Enter' && !e.repeat) {
      if (state === 'menu') startLevel(1);
      else if (state === 'over') startLevel(L.n);
      else if (state === 'won') startLevel(L.n + 1);
      return;
    }
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', e => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = time; });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (state === 'playing') toggleLight(); });

  function toggleLight() {
    P.light = !P.light;
    $('#btn-light').classList.toggle('off', !P.light);
    Sound.step(0.3);
  }

  // Joystick táctil
  const zone = $('#stick-zone'), stickEl = $('#stick'), knob = $('#stick-knob');
  const stick = { id: null, ox: 0, oy: 0 };
  const STICK_R = 52;
  zone.addEventListener('pointerdown', e => {
    e.preventDefault();
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    stickEl.style.left = e.clientX + 'px';
    stickEl.style.top = e.clientY + 'px';
    stickEl.classList.add('on');
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    input.stickX = dx / STICK_R;
    input.stickY = dy / STICK_R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const endStick = e => {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    input.stickX = input.stickY = 0;
    knob.style.transform = '';
    stickEl.classList.remove('on');
    stickEl.style.left = '';
    stickEl.style.top = '';
  };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);

  const sprintBtn = $('#btn-sprint');
  sprintBtn.addEventListener('pointerdown', e => { e.preventDefault(); input.sprintTouch = true; sprintBtn.classList.add('active'); sprintBtn.setPointerCapture(e.pointerId); });
  const endSprint = () => { input.sprintTouch = false; sprintBtn.classList.remove('active'); };
  sprintBtn.addEventListener('pointerup', endSprint);
  sprintBtn.addEventListener('pointercancel', endSprint);
  $('#btn-light').addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'playing') toggleLight(); });

  // Botones de las pantallas
  $('#btn-play').addEventListener('click', () => startLevel(1));
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-restart').addEventListener('click', () => startLevel(L.n));
  $('#btn-retry').addEventListener('click', () => startLevel(L.n));
  $('#btn-next').addEventListener('click', () => startLevel(L.n + 1));
  for (const id of ['#btn-menu1', '#btn-menu2', '#btn-menu3']) $(id).addEventListener('click', goMenu);
  $('#btn-pause').addEventListener('click', () => (state === 'playing' ? pauseGame() : resumeGame()));
  hud.mute.addEventListener('click', () => { Sound.setMuted(!Sound.muted); updateMuteIcon(); });

  window.addEventListener('resize', resize);
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { Sound.voice = null; };

  // ================= Arranque =================
  resize();
  updateMuteIcon();
  goMenu();
  if (document.fonts && document.fonts.load) document.fonts.load('40px Creepster').catch(() => {});
  requestAnimationFrame(frame);

  // Acceso para depuración y pruebas automatizadas
  window.__ttsahur = { get state() { return state; }, get level() { return L; }, get player() { return P; }, get sahur() { return S; }, startLevel };
})();

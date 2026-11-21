// Whiteout's own signs, posters and notices, all drawn on one sheet: the evacuation order, the billboard, door numbers, the gate sign.
import { cv, woodTex } from '../../kit/surfaces.js';

export function makeSigns() {
  const W = 2048, H = 1024, c = cv(W, H), g = c.getContext('2d'), rects = {}; let x = 0, y = 0, row = 0;
  const add = (name, w, h, draw) => {
    if (x + w + 4 > W) { x = 0; y += row + 4; row = 0; }
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); draw(g, w, h); g.restore();
    rects[name] = [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]; x += w + 4; row = Math.max(row, h);
  };
  const F = (px, f = 'Impact, "Arial Narrow", Arial, sans-serif') => `bold ${px}px ${f}`;
  const grime = (g, w, h, a = 0.25, n = 40) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${20 + Math.random() * 30 | 0},${20 + Math.random() * 30 | 0},${24 + Math.random() * 30 | 0},${Math.random() * a})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 30, 0, 7); g.fill(); } };
  const frostEdge = (g, w, h, a = 0.5) => { const gr = g.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(220,235,250,0)'); gr.addColorStop(1, `rgba(220,235,250,${a})`); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
  const text = (g, s, x, y, font, col, align = 'center') => { g.font = font; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };

  add('evac', 300, 420, (g, w, h) => {
    g.fillStyle = '#d9d2bd'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3261c'; g.fillRect(0, 0, w, 78);
    text(g, 'EVACUATION', w / 2, 30, F(40), '#f1ead8'); text(g, 'ORDER 41', w / 2, 62, F(22), '#f1ead8');
    text(g, 'ALL RESIDENTS', w / 2, 116, F(30), '#22201c'); text(g, 'OF SECTOR 7', w / 2, 150, F(30), '#22201c');
    text(g, 'REPORT TO', w / 2, 196, F(24), '#22201c'); text(g, 'THE TOWER', w / 2, 240, F(54), '#a3261c');
    g.strokeStyle = '#22201c'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, 280); g.lineTo(w / 2, 340); g.moveTo(w / 2 - 22, 318); g.lineTo(w / 2, 342); g.lineTo(w / 2 + 22, 318); g.stroke();
    text(g, 'FOLLOW THE RED LIGHT', w / 2, 372, F(24), '#22201c'); text(g, 'Take only what you can carry.', w / 2, 400, 'italic 15px Georgia, serif', '#3a352c');
    grime(g, w, h, 0.18); frostEdge(g, w, h, 0.35);
  });
  add('billboard', 640, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#27405f'); gr.addColorStop(1, '#132033'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(w * 0.8, h * 0.42, 70, 0, 7); g.fill(); g.fillStyle = '#132033'; g.beginPath(); g.arc(w * 0.8, h * 0.42, 52, 0, 7); g.fill();
    g.fillStyle = '#e8b04a'; g.fillRect(w * 0.8 - 6, h * 0.42 - 40, 12, 80);
    text(g, 'STAY WARM.', 40, 96, F(74), '#e9eef5', 'left'); text(g, 'STAY TOGETHER.', 40, 176, F(74), '#e9eef5', 'left');
    text(g, 'THE TOWER HAS LIGHT FOR EVERYONE', 42, 250, F(26), '#e8b04a', 'left'); text(g, 'CITY COUNCIL  ·  WINTER EMERGENCY', 42, 286, F(18), '#8fa4bf', 'left');
    grime(g, w, h, 0.22, 70); frostEdge(g, w, h, 0.5);
    g.fillStyle = '#132033'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w - 120, 0); g.lineTo(w - 60, 46); g.lineTo(w, 110); g.fill();      // a torn corner
  });
  add('gate', 768, 150, (g, w, h) => {
    g.fillStyle = '#20252d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d7b24a'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    text(g, 'SECTOR 7  ·  TOWER DISTRICT', w / 2, 58, F(52), '#e9eef5'); text(g, 'SHELTER  ·  WARMTH  ·  LIGHT', w / 2, 112, F(30), '#d7b24a'); grime(g, w, h, 0.2, 50); frostEdge(g, w, h, 0.4);
  });
  add('graffiti', 560, 190, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = 'bold 62px "Comic Sans MS", "Marker Felt", "Segoe Print", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(232,176,74,0.9)'; g.lineWidth = 3; g.fillStyle = 'rgba(232,176,74,0.92)';
    g.fillText('FOLLOW THE LIGHT', w / 2, 62); g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2, 104); g.lineTo(w / 2, 170); g.moveTo(w / 2 - 28, 142); g.lineTo(w / 2, 174); g.lineTo(w / 2 + 28, 142); g.stroke();
  });
  for (const [n, s] of [['fl2', '2'], ['fl1', '1'], ['flG', 'G']]) add(n, 128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); text(g, s, w / 2, h / 2 + 6, F(120), 'rgba(28,30,34,0.85)'); });
  for (const n of ['31', '32', '33', '34', '35']) add('d' + n, 140, 300, (g, w, h) => {
    g.drawImage(woodTex([120, 84, 54], 70 + +n), 0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeRect(14, 16, w - 28, 118); g.strokeRect(14, 150, w - 28, 134);
    g.fillStyle = '#b9a35a'; g.fillRect(w / 2 - 20, 40, 40, 26); text(g, n, w / 2, 54, F(20), '#1d1a12'); g.fillStyle = '#8e8a80'; g.fillRect(w - 30, 150, 14, 8);
    frostEdge(g, w, h, 0.45);
  });
  add('mailboxes', 320, 256, (g, w, h) => {
    g.fillStyle = '#4b5560'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) { const x = q * 64 + 4, y = r * 64 + 4; g.fillStyle = (r * 5 + q) % 7 === 3 ? '#161a1f' : '#5f6b78'; g.fillRect(x, y, 56, 56); g.fillStyle = '#20252b'; g.fillRect(x + 8, y + 12, 40, 5); g.fillStyle = '#c8cdd2'; g.fillRect(x + 16, y + 30, 24, 12); text(g, String(11 + r * 5 + q), x + 28, y + 37, F(11), '#22262b'); }
    grime(g, w, h, 0.2); frostEdge(g, w, h, 0.4);
  });
  add('drawing', 220, 170, (g, w, h) => {
    g.fillStyle = '#efe9d8'; g.fillRect(0, 0, w, h); g.lineWidth = 5; g.lineCap = 'round';
    g.strokeStyle = '#e0a020'; g.beginPath(); g.arc(170, 46, 22, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g.beginPath(); g.moveTo(170 + Math.cos(a) * 30, 46 + Math.sin(a) * 30); g.lineTo(170 + Math.cos(a) * 40, 46 + Math.sin(a) * 40); g.stroke(); }
    g.strokeStyle = '#3d6fb3'; g.strokeRect(34, 80, 60, 56); g.beginPath(); g.moveTo(28, 82); g.lineTo(64, 50); g.lineTo(100, 82); g.stroke();
    g.strokeStyle = '#b3423d'; for (const x of [124, 150]) { g.beginPath(); g.arc(x, 104, 7, 0, 7); g.moveTo(x, 111); g.lineTo(x, 132); g.moveTo(x - 9, 120); g.lineTo(x + 9, 120); g.moveTo(x, 132); g.lineTo(x - 7, 146); g.moveTo(x, 132); g.lineTo(x + 7, 146); g.stroke(); }
    g.strokeStyle = '#4c9a4c'; g.beginPath(); g.moveTo(10, 150); g.lineTo(210, 150); g.stroke(); text(g, 'me and Ana', 62, 160, 'bold 13px "Comic Sans MS", cursive', '#444');
  });
  add('calendar', 180, 230, (g, w, h) => {
    g.fillStyle = '#e4dfd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#27405f'; g.fillRect(0, 0, w, 50); text(g, 'THE LONG NIGHT', w / 2, 26, F(22), '#e4dfd0');
    text(g, 'DAY', w / 2, 84, F(28), '#333'); text(g, '41', w / 2, 150, F(96), '#a3261c');
    g.strokeStyle = '#a3261c'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(16 + i * 20, 200); g.lineTo(26 + i * 20, 218); g.stroke(); }
    frostEdge(g, w, h, 0.3);
  });
  add('news', 300, 200, (g, w, h) => {
    g.fillStyle = '#d6d0c0'; g.fillRect(0, 0, w, h); text(g, 'THE DAILY SENTINEL', w / 2, 24, 'bold 24px Georgia, serif', '#1c1c1c'); g.fillStyle = '#1c1c1c'; g.fillRect(10, 40, w - 20, 3);
    text(g, 'SUN FAILS TO RISE', w / 2, 76, F(40), '#1c1c1c'); text(g, 'FOR TWELFTH DAY', w / 2, 116, F(40), '#1c1c1c');
    text(g, 'Council opens the Tower to all', w / 2, 150, 'italic 17px Georgia, serif', '#333'); g.fillStyle = '#8a8578'; for (let i = 0; i < 4; i++) g.fillRect(14, 166 + i * 8, w - 28 - (i === 3 ? 90 : 0), 3);
    frostEdge(g, w, h, 0.45);
  });
  add('quarantine', 360, 180, (g, w, h) => {
    g.fillStyle = '#d7b24a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; for (let i = -4; i < 12; i++) { g.beginPath(); g.moveTo(i * 44, 0); g.lineTo(i * 44 + 22, 0); g.lineTo(i * 44 + 22 - 30, 30); g.lineTo(i * 44 - 30, 30); g.fill(); g.beginPath(); g.moveTo(i * 44, h - 30); g.lineTo(i * 44 + 22, h - 30); g.lineTo(i * 44 + 22 - 30, h); g.lineTo(i * 44 - 30, h); g.fill(); }
    text(g, 'ROAD CLOSED', w / 2, 74, F(56), '#1b1b1b'); text(g, 'ICE BEYOND THIS POINT', w / 2, 124, F(26), '#1b1b1b'); grime(g, w, h, 0.2); frostEdge(g, w, h, 0.4);
  });
  add('checkpoint', 420, 130, (g, w, h) => {
    g.fillStyle = '#e4e0d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3261c'; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    text(g, 'CHECKPOINT 7', w / 2, 46, F(52), '#20252d'); text(g, 'TOWER 300 m  ↑', w / 2, 98, F(30), '#a3261c'); grime(g, w, h, 0.2); frostEdge(g, w, h, 0.4);
  });
  add('busdest', 300, 72, (g, w, h) => { g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, w, h); text(g, '7   THE TOWER', w / 2, h / 2 + 2, F(44, '"Courier New", monospace'), '#d79a2a'); });
  add('keypad', 96, 140, (g, w, h) => {
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h); g.fillStyle = '#0b1410'; g.fillRect(10, 8, w - 20, 24);
    for (let i = 0; i < 12; i++) { const x = 12 + (i % 3) * 26, y = 40 + (i / 3 | 0) * 24; g.fillStyle = '#596270'; g.fillRect(x, y, 20, 18); text(g, '123456789*0#'[i], x + 10, y + 10, F(13), '#e8edf2'); }
  });
  add('radio', 150, 90, (g, w, h) => {
    g.fillStyle = '#3b3229'; g.fillRect(0, 0, w, h); g.fillStyle = '#16130f'; g.fillRect(8, 10, 74, 70); g.fillStyle = '#2a251e'; for (let y = 14; y < 78; y += 6) g.fillRect(10, y, 70, 2);
    g.fillStyle = '#d9cfae'; g.fillRect(90, 12, 52, 26); g.fillStyle = '#a3261c'; g.fillRect(122, 12, 2, 26); g.fillStyle = '#8e8a80'; g.beginPath(); g.arc(102, 62, 10, 0, 7); g.arc(130, 62, 10, 0, 7); g.fill();
  });
  add('clock', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#d9d6cc'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = '#1e2126'; g.lineWidth = 6; g.stroke();
    g.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); g.stroke(); }
    g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26, 64 + 18); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 12, 64 - 44); g.stroke();
    g.fillStyle = 'rgba(220,235,250,0.4)'; g.beginPath(); g.arc(64, 64, 60, 0.3, 2.6); g.fill();
  });
  add('kiosk', 300, 110, (g, w, h) => { g.fillStyle = '#7a2a22'; g.fillRect(0, 0, w, h); text(g, 'NEWS · TEA · MAPS', w / 2, h / 2, F(40), '#eadfc4'); grime(g, w, h, 0.25); frostEdge(g, w, h, 0.5); });
  add('note', 96, 128, (g, w, h) => { g.fillStyle = '#e9e2cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a5648'; for (let i = 0; i < 9; i++) g.fillRect(10, 16 + i * 12, w - 20 - (i % 3) * 14, 2); });
  add('exit', 200, 80, (g, w, h) => { g.fillStyle = '#0c3a22'; g.fillRect(0, 0, w, h); text(g, 'EXIT', 74, h / 2 + 3, F(56), '#d6ffe6'); g.strokeStyle = '#d6ffe6'; g.lineWidth = 8; g.beginPath(); g.moveTo(136, 40); g.lineTo(184, 40); g.moveTo(166, 22); g.lineTo(186, 40); g.lineTo(166, 58); g.stroke(); });
  add('stripes', 256, 48, (g, w, h) => { g.fillStyle = '#d7b24a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 40, 0); g.lineTo(i * 40 + 20, 0); g.lineTo(i * 40 - 28, h); g.lineTo(i * 40 - 48, h); g.fill(); } grime(g, w, h, 0.25, 20); });
  add('metro', 160, 160, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#a3261c'; g.beginPath(); g.arc(80, 80, 74, 0, 7); g.fill(); text(g, 'M', 80, 88, F(120), '#eee6d2'); frostEdge(g, w, h, 0.5); });
  add('tvoff', 64, 64, (g, w, h) => { g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(120,150,190,0.25)'); gr.addColorStop(0.5, 'rgba(120,150,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return { canvas: c, rects };
}

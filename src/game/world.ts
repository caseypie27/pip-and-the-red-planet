import type { Landmark, Rect } from "./types";
import { SITES } from "./sim";

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const SKY_H = 360; // northern horizon band (not walkable)
export const SPAWN = { x: 1600, y: 1500 };

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

export interface Building { kind: "dome" | "hab" | "lab" | "greenhouse" | "lander" | "antenna" | "solar" | "rover" | "drill" | "shelter" | "storage"; x: number; y: number; w: number; h: number }

export const BUILDINGS: Building[] = [
  { kind: "lander", x: 1560, y: 1660, w: 170, h: 150 },
  { kind: "dome", x: 1350, y: 1050, w: 260, h: 200 },
  { kind: "hab", x: 1700, y: 1080, w: 240, h: 150 },
  { kind: "greenhouse", x: 1050, y: 1300, w: 220, h: 150 },
  { kind: "lab", x: 2050, y: 1350, w: 200, h: 150 },
  { kind: "antenna", x: 2450, y: 800, w: 120, h: 120 },
  { kind: "solar", x: 700, y: 800, w: 300, h: 180 },
  { kind: "solar", x: 2200, y: 1800, w: 300, h: 180 },
  { kind: "rover", x: 900, y: 1850, w: 140, h: 90 },
  { kind: "shelter", x: 2350, y: 1100, w: 170, h: 110 },
  { kind: "storage", x: 1230, y: 1650, w: 170, h: 110 },
  { kind: "drill", x: 2750, y: 1250, w: 130, h: 150 },
];

export const LANDMARKS: Landmark[] = [
  { id: "lander", name: "Landing Zone", x: 1645, y: 1735, r: 200, pip: "This is where we landed! Our lander brought supplies all the way from Earth." },
  { id: "dome", name: "Command Dome", x: 1480, y: 1150, r: 220, pip: "The Command Dome! Astronauts plan missions and keep the air safe in here." },
  { id: "greenhouse", name: "Greenhouse", x: 1160, y: 1375, r: 200, pip: "Plants grow in the Greenhouse. They make food AND oxygen for us!" },
  { id: "lab", name: "Research Lab", x: 2150, y: 1425, r: 200, pip: "In the Research Lab we study Martian rocks to learn about the planet's past." },
  { id: "antenna", name: "Comms Antenna", x: 2510, y: 860, r: 220, pip: "The antenna sends messages to Earth. Signals take up to 20 minutes to arrive!" },
  { id: "solar", name: "Solar Farm", x: 850, y: 890, r: 240, pip: "Solar panels turn sunlight into energy. Mars gets less sunlight than Earth!" },
  { id: "drill", name: "Ice Drill", x: 2815, y: 1330, r: 200, pip: "The Ice Drill digs up frozen water under the ground. Water is precious on Mars!" },
  { id: "shelter", name: "Radiation Shelter", x: 2435, y: 1155, r: 190, pip: "The Radiation Shelter has thick walls that block dangerous space radiation." },
  { id: "storage", name: "Storage Depot", x: 1315, y: 1705, r: 190, pip: "The Storage Depot keeps our oxygen, water and food tanks. Bigger tanks help us survive storms!" },
  { id: "crater", name: "Big Crater", x: 2600, y: 1950, r: 260, pip: "Whoa, a crater! It formed when a space rock crashed into Mars long ago." },
];

export interface Deco { rocks: { x: number; y: number; r: number }[]; craters: { x: number; y: number; r: number }[] }

let cachedDeco: Deco | null = null;
export function getDeco(): Deco {
  if (cachedDeco) return cachedDeco;
  const r = rng(42);
  const rocks: Deco["rocks"] = [];
  const craters: Deco["craters"] = [{ x: 2600, y: 1950, r: 170 }];
  for (let i = 0; i < 22; i++) craters.push({ x: r() * WORLD_W, y: SKY_H + 120 + r() * (WORLD_H - SKY_H - 200), r: 30 + r() * 80 });
  for (let i = 0; i < 140; i++) rocks.push({ x: r() * WORLD_W, y: SKY_H + 60 + r() * (WORLD_H - SKY_H - 80), r: 6 + r() * 20 });
  const clear = (x: number, y: number) => !BUILDINGS.some((b) => x > b.x - 60 && x < b.x + b.w + 60 && y > b.y - 60 && y < b.y + b.h + 80)
    && Math.hypot(x - SPAWN.x, y - SPAWN.y) > 120;
  cachedDeco = { rocks: rocks.filter((k) => clear(k.x, k.y)), craters: craters.filter((k, i) => i === 0 || clear(k.x, k.y)) };
  return cachedDeco;
}

/** Solid rectangles the astronaut cannot walk through. */
export function getObstacles(): Rect[] {
  const obs: Rect[] = BUILDINGS.map((b) => ({ x: b.x + 10, y: b.y + b.h * 0.1, w: b.w - 20, h: b.h * 0.85 }));
  for (const k of getDeco().rocks) if (k.r > 16) obs.push({ x: k.x - k.r * 0.8, y: k.y - k.r * 0.5, w: k.r * 1.6, h: k.r });
  return obs;
}

const ink = "#1e1b3a";
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
}

/** Renders the static world once into an offscreen canvas. */
export function renderStaticWorld(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = WORLD_W; cv.height = WORLD_H;
  const ctx = cv.getContext("2d")!;
  const r = rng(7);
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
  sky.addColorStop(0, "#120a3a"); sky.addColorStop(0.6, "#3b1f6e"); sky.addColorStop(1, "#c2507a");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_W, SKY_H);
  for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; ctx.fillRect(r() * WORLD_W, r() * SKY_H * 0.75, r() < 0.1 ? 3 : 1.5, r() < 0.1 ? 3 : 1.5); }
  // planets
  const planet = (x: number, y: number, rad: number, a: string, b: string, ring = false) => {
    const g = ctx.createRadialGradient(x - rad / 3, y - rad / 3, rad / 6, x, y, rad);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    if (ring) { ctx.strokeStyle = "rgba(255,220,160,0.8)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, rad * 1.8, rad * 0.4, -0.3, 0, 7); ctx.stroke(); }
  };
  planet(500, 110, 50, "#7dd3fc", "#1e40af");
  planet(2300, 90, 36, "#fde68a", "#d97706", true);
  planet(2900, 160, 14, "#e9d5ff", "#7c3aed");
  // mountains
  for (const [col, base, amp] of [["#6b2140", SKY_H - 40, 120], ["#9a3412", SKY_H, 70]] as const) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, SKY_H + 20);
    for (let x = 0; x <= WORLD_W; x += 80) ctx.lineTo(x, base - Math.abs(Math.sin(x * 0.004 + amp)) * amp - r() * 30);
    ctx.lineTo(WORLD_W, SKY_H + 20); ctx.fill();
  }
  // ground
  const gr = ctx.createLinearGradient(0, SKY_H, 0, WORLD_H);
  gr.addColorStop(0, "#d9532a"); gr.addColorStop(0.5, "#e86a32"); gr.addColorStop(1, "#c94a24");
  ctx.fillStyle = gr; ctx.fillRect(0, SKY_H, WORLD_W, WORLD_H - SKY_H);
  for (let i = 0; i < 70; i++) { // dunes / hills
    ctx.fillStyle = r() < 0.5 ? "rgba(255,160,90,0.18)" : "rgba(140,30,10,0.14)";
    ctx.beginPath(); ctx.ellipse(r() * WORLD_W, SKY_H + 50 + r() * (WORLD_H - SKY_H), 80 + r() * 200, 30 + r() * 70, r() * 3, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 1500; i++) { ctx.fillStyle = r() < 0.5 ? "rgba(255,200,140,0.35)" : "rgba(110,25,10,0.3)"; ctx.fillRect(r() * WORLD_W, SKY_H + r() * (WORLD_H - SKY_H), 3, 3); }
  // paths between buildings
  ctx.strokeStyle = "rgba(255,210,170,0.45)"; ctx.lineWidth = 34; ctx.lineCap = "round"; ctx.setLineDash([]);
  const hub = { x: 1645, y: 1400 };
  for (const l of LANDMARKS.slice(0, 6)) { ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(l.x, l.y); ctx.stroke(); }
  ctx.lineWidth = 2.5; ctx.lineCap = "butt"; ctx.strokeStyle = ink;
  const deco = getDeco();
  for (const c of deco.craters) {
    ctx.fillStyle = "#a83a1a"; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8a2c12"; ctx.beginPath(); ctx.ellipse(c.x + c.r * 0.08, c.y + c.r * 0.08, c.r * 0.8, c.r * 0.52, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,190,140,0.6)"; ctx.lineWidth = Math.max(3, c.r * 0.08);
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.7, 0, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
  for (const k of deco.rocks) {
    ctx.fillStyle = "rgba(60,15,0,0.3)"; ctx.beginPath(); ctx.ellipse(k.x + 4, k.y + k.r * 0.4, k.r, k.r * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = k.r > 16 ? "#7c2d12" : "#9a3412";
    ctx.beginPath(); ctx.moveTo(k.x - k.r, k.y); ctx.lineTo(k.x - k.r * 0.5, k.y - k.r * 0.8); ctx.lineTo(k.x + k.r * 0.4, k.y - k.r * 0.9); ctx.lineTo(k.x + k.r, k.y - k.r * 0.1); ctx.lineTo(k.x + k.r * 0.6, k.y + k.r * 0.35); ctx.lineTo(k.x - k.r * 0.6, k.y + k.r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,180,120,0.4)"; ctx.beginPath(); ctx.ellipse(k.x - k.r * 0.2, k.y - k.r * 0.5, k.r * 0.35, k.r * 0.15, -0.3, 0, 7); ctx.fill();
  }
  // landing pad
  ctx.fillStyle = "#4b5563"; ctx.beginPath(); ctx.arc(1645, 1745, 130, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#facc15"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(1645, 1745, 110, 0, 7); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.strokeStyle = ink;
  for (const b of BUILDINGS) drawBuilding(ctx, b);
  for (const site of SITES) drawSite(ctx, site.kind, site.x, site.y);
  return cv;
}

function drawSite(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number) {
  ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
  switch (kind) {
    case "ice":
      ctx.fillStyle = "#a83a1a"; ctx.beginPath(); ctx.ellipse(x, y, 110, 70, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#e0f2fe"; ctx.beginPath(); ctx.ellipse(x, y + 5, 70, 40, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#7dd3fc"; for (const [a, b] of [[-30, 0], [20, 10], [0, -12]] as const) { ctx.beginPath(); ctx.ellipse(x + a, y + b, 14, 6, 0.3, 0, 7); ctx.fill(); }
      break;
    case "layers":
      for (let i = 0; i < 5; i++) { ctx.fillStyle = ["#7c2d12", "#b45309", "#9a3412", "#d97706", "#78350f"][i] ?? "#7c2d12"; ctx.beginPath(); ctx.moveTo(x - 160 + i * 12, y - 60 + i * 22); ctx.lineTo(x + 160 - i * 12, y - 60 + i * 22); ctx.lineTo(x + 160 - i * 12, y - 38 + i * 22); ctx.lineTo(x - 160 + i * 12, y - 38 + i * 22); ctx.fill(); }
      ctx.strokeRect(x - 160, y - 60, 320, 110);
      break;
    case "soil":
      ctx.fillStyle = "#b91c1c"; ctx.beginPath(); ctx.ellipse(x, y, 90, 45, 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = "#fca5a5"; for (let i = 0; i < 25; i++) ctx.fillRect(x - 70 + ((i * 37) % 140), y - 30 + ((i * 23) % 60), 4, 4);
      break;
    case "dunes":
      ctx.strokeStyle = "rgba(255,200,140,0.8)"; ctx.lineWidth = 6;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); for (let k = -180; k <= 180; k += 20) ctx.lineTo(x + k, y - 70 + i * 26 + Math.sin(k * 0.04 + i) * 8); ctx.stroke(); }
      break;
    case "meteorite":
      ctx.fillStyle = "#8a2c12"; ctx.beginPath(); ctx.ellipse(x, y + 10, 70, 35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#6b7280"; ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e5e7eb"; ctx.beginPath(); ctx.arc(x - 8, y - 8, 7, 0, 7); ctx.fill();
      break;
    case "plain":
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.setLineDash([14, 10]); ctx.strokeRect(x - 120, y - 70, 240, 140); ctx.setLineDash([]);
      ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x, y - 50); ctx.stroke();
      ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.moveTo(x, y - 50); ctx.lineTo(x + 34, y - 40); ctx.lineTo(x, y - 30); ctx.fill(); ctx.stroke();
      break;
    case "weather":
      ctx.fillStyle = "#9a3412"; ctx.beginPath(); ctx.ellipse(x, y + 20, 120, 40, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x, y - 60); ctx.stroke();
      ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(x, y - 60, 8, 0, 7); ctx.fill(); ctx.stroke();
      break;
    case "cave":
      ctx.fillStyle = "#7c2d12"; ctx.beginPath(); ctx.ellipse(x, y, 130, 70, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1c0a05"; ctx.beginPath(); ctx.ellipse(x, y + 15, 60, 35, 0, Math.PI, 0); ctx.fill();
      break;
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building) {
  const { x, y, w, h } = b;
  ctx.fillStyle = "rgba(60,15,0,0.35)"; ctx.beginPath(); ctx.ellipse(x + w / 2 + 10, y + h - 5, w / 2, h / 6, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 3;
  switch (b.kind) {
    case "dome": {
      rr(ctx, x, y + h * 0.55, w, h * 0.4, 12, "#e5e7eb");
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.6, w / 2 - 6, h * 0.55, 0, Math.PI, 0); ctx.fillStyle = "#93e1f5"; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(30,27,58,0.4)"; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.6, (w / 2 - 6) * (i / 5), h * 0.55, 0, Math.PI, 0); ctx.stroke(); }
      ctx.strokeStyle = ink; ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.ellipse(x + w * 0.32, y + h * 0.3, 18, 30, 0.5, 0, 7); ctx.fill();
      rr(ctx, x + w / 2 - 22, y + h * 0.62, 44, h * 0.33, 8, "#ff8a1f");
      break;
    }
    case "hab":
      rr(ctx, x, y + 20, w, h - 25, 30, "#f3f4f6");
      ctx.fillStyle = "#22d3ee"; ctx.fillRect(x + 6, y + h * 0.55, w - 12, 10);
      for (let i = 0; i < 4; i++) rr(ctx, x + 22 + i * 52, y + 45, 30, 24, 10, "#38bdf8");
      rr(ctx, x + w - 50, y + h - 50, 34, 40, 6, "#ff8a1f");
      break;
    case "greenhouse":
      rr(ctx, x, y + 20, w, h - 25, 20, "rgba(167,243,208,0.85)");
      for (let i = 0; i < 6; i++) { ctx.fillStyle = "#16a34a"; ctx.beginPath(); ctx.arc(x + 25 + i * 34, y + 80, 13, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(x + 25 + i * 34, y + 76, 3, 0, 7); ctx.fill(); }
      ctx.strokeStyle = "rgba(30,27,58,0.3)"; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + (w / 6) * i, y + 22); ctx.lineTo(x + (w / 6) * i, y + h - 6); ctx.stroke(); }
      break;
    case "lab":
      rr(ctx, x, y + 30, w, h - 35, 14, "#e5e7eb");
      rr(ctx, x + 20, y, 70, 50, 10, "#c4b5fd");
      ctx.fillStyle = "#a855f7"; ctx.beginPath(); ctx.arc(x + 55, y + 25, 12, 0, 7); ctx.fill(); ctx.stroke();
      rr(ctx, x + 110, y + 60, 70, 26, 6, "#1e293b");
      ctx.fillStyle = "#4ade80"; ctx.fillRect(x + 116, y + 66, 40, 4); ctx.fillRect(x + 116, y + 74, 24, 4);
      rr(ctx, x + 30, y + 85, 40, 50, 6, "#ff8a1f");
      break;
    case "antenna":
      rr(ctx, x + w / 2 - 10, y + 40, 20, h - 40, 4, "#9ca3af");
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + 35, 55, 30, -0.4, 0, 7); ctx.fillStyle = "#f9fafb"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + 35, 35, 18, -0.4, 0, 7); ctx.fillStyle = "#d1d5db"; ctx.fill(); ctx.stroke();
      break;
    case "solar":
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const px = x + c * 100, py = y + r * 90;
        rr(ctx, px + 42, py + 50, 8, 30, 2, "#6b7280");
        rr(ctx, px, py, 92, 58, 4, "#1d4ed8");
        ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 1.5;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + i * 23, py + 2); ctx.lineTo(px + i * 23, py + 56); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(px + 2, py + 29); ctx.lineTo(px + 90, py + 29); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = 3;
      }
      break;
    case "lander":
      ctx.lineWidth = 5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + w / 2 + s * 30, y + 90); ctx.lineTo(x + w / 2 + s * 70, y + h - 5); ctx.stroke(); }
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 + 50, y + 70); ctx.lineTo(x + w / 2 + 45, y + 110); ctx.lineTo(x + w / 2 - 45, y + 110); ctx.lineTo(x + w / 2 - 50, y + 70); ctx.closePath(); ctx.fillStyle = "#f9fafb"; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff8a1f"; ctx.fillRect(x + w / 2 - 47, y + 85, 94, 12);
      ctx.beginPath(); ctx.arc(x + w / 2, y + 55, 14, 0, 7); ctx.fillStyle = "#38bdf8"; ctx.fill(); ctx.stroke();
      break;
    case "rover":
      for (const wx of [15, 60, 105]) for (const wy of [10, 70]) rr(ctx, x + wx, y + wy, 24, 16, 5, "#374151");
      rr(ctx, x + 5, y + 20, w - 10, 50, 10, "#facc15");
      rr(ctx, x + w - 50, y + 28, 34, 30, 6, "#38bdf8");
      ctx.beginPath(); ctx.moveTo(x + 30, y + 30); ctx.lineTo(x + 20, y - 5); ctx.stroke();
      break;
    case "shelter":
      rr(ctx, x, y + 30, w, h - 35, 40, "#9ca3af");
      ctx.fillStyle = "#6b7280"; for (let i = 0; i < 4; i++) { ctx.fillRect(x + 15 + i * 38, y + 40, 28, 12); }
      rr(ctx, x + w / 2 - 22, y + h - 50, 44, 45, 8, "#facc15");
      ctx.fillStyle = ink; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.fillText("☢", x + w / 2, y + h - 20);
      break;
    case "storage":
      for (let i = 0; i < 3; i++) { rr(ctx, x + 5 + i * 55, y + 10, 50, h - 15, 22, ["#7dd3fc", "#a7f3d0", "#fde68a"][i] ?? "#fff"); ctx.fillStyle = "rgba(30,27,58,0.25)"; ctx.fillRect(x + 12 + i * 55, y + 50, 36, 6); }
      break;
    case "drill":
      rr(ctx, x + 10, y + h - 50, w - 20, 45, 10, "#e5e7eb");
      ctx.beginPath(); ctx.moveTo(x + w / 2 - 30, y + h - 50); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 + 30, y + h - 50); ctx.closePath(); ctx.fillStyle = "#f59e0b"; ctx.fill(); ctx.stroke();
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + w / 2 - 30 * (i / 4), y + (h - 50) * (i / 4)); ctx.lineTo(x + w / 2 + 30 * (i / 4), y + (h - 50) * (i / 4)); ctx.stroke(); }
      rr(ctx, x + 20, y + h - 40, 34, 24, 6, "#7dd3fc");
      break;
  }
}

/** Animated bits drawn each frame on top of the static world. */
export function drawDynamic(ctx: CanvasRenderingContext2D, t: number, visited: Set<string>) {
  // antenna light
  ctx.fillStyle = Math.sin(t * 4) > 0 ? "#f43f5e" : "#7f1d1d";
  ctx.beginPath(); ctx.arc(2510, 820, 7, 0, 7); ctx.fill();
  // lab light
  ctx.fillStyle = `rgba(74,222,128,${0.5 + 0.5 * Math.sin(t * 3)})`; ctx.beginPath(); ctx.arc(2230, 1385, 5, 0, 7); ctx.fill();
  // solar shimmer
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  const sx = ((t * 120) % 400) - 50;
  for (const [bx, by] of [[700, 800], [2200, 1800]] as const) { ctx.save(); ctx.beginPath(); ctx.rect(bx, by, 300, 150); ctx.clip(); ctx.beginPath(); ctx.moveTo(bx + sx, by); ctx.lineTo(bx + sx + 30, by); ctx.lineTo(bx + sx - 30, by + 150); ctx.lineTo(bx + sx - 60, by + 150); ctx.fill(); ctx.restore(); }
  // drifting dust motes
  ctx.fillStyle = "rgba(255,210,170,0.35)";
  for (let i = 0; i < 90; i++) { const mx = ((i * 397 + t * (20 + (i % 5) * 8)) % WORLD_W), my = SKY_H + ((i * 733 + Math.sin(t + i) * 30) % (WORLD_H - SKY_H)); ctx.fillRect(mx, my, 3, 3); }
  // landmark beacons for unvisited spots
  for (const l of LANDMARKS) {
    if (visited.has(l.id)) continue;
    const yy = l.y - 140 + Math.sin(t * 3 + l.x) * 8;
    ctx.fillStyle = "#facc15"; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(l.x, yy + 22); ctx.lineTo(l.x - 14, yy); ctx.arc(l.x, yy, 14, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", l.x, yy + 6);
  }
}

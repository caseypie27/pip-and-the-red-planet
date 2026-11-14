/** Disaster effects + navigation arrow drawn on the game canvas. */
export interface Fx { weather: "clear" | "dust" | "flare" | "storm-flare"; approaching: "dust" | "radiation" | null; broken: { x: number; y: number } | null; meteor: { id: number; x: number; y: number; impact: boolean } | null }
export interface Nav { x: number; y: number; label: string; level: number }
export const newFx = (): Fx => ({ weather: "clear", approaching: null, broken: null, meteor: null });
const COLORS = ["#ef4444", "#ef4444", "#fb923c", "#facc15", "#22d3ee"];

const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 600;
const dust = Array.from({ length: small ? 70 : 140 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 1.4, l: 6 + Math.random() * 18, i }));
let meteorState: { id: number; impactT: number | null } | null = null;

/** World-space effects (call with world transform applied). */
export function drawWorldFx(ctx: CanvasRenderingContext2D, fx: Fx, t: number) {
  const dusty = fx.weather === "dust" || fx.weather === "storm-flare";
  if (dusty) { // tumbling dust swirls drifting across the base
    for (let i = 0; i < 6; i++) {
      const x = ((t * 140 + i * 620) % 3600) - 200, y = 700 + ((i * 397) % 1500);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i);
      ctx.strokeStyle = "rgba(214,150,90,0.55)"; ctx.lineWidth = 6;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, 18 + k * 16, k, k + 3.6); ctx.stroke(); }
      ctx.restore();
    }
  }
  if (fx.broken) { // sparks, smoke and a flashing ring around broken equipment
    const { x, y } = fx.broken;
    for (let i = 0; i < 5; i++) { const ph = (t * 0.6 + i / 5) % 1; ctx.fillStyle = `rgba(70,70,80,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.arc(x + Math.sin(i * 2 + t) * 20, y - 30 - ph * 110, 14 + ph * 26, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) { const a = Math.sin(i * 91 + Math.floor(t * 12)) * Math.PI, r = 20 + ((i * 37 + Math.floor(t * 12) * 13) % 40); if ((Math.floor(t * 12) + i) % 3) continue;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10 - 10); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r - 10); ctx.stroke(); }
    if (Math.floor(t * 3) % 2) { ctx.strokeStyle = "rgba(239,68,68,0.85)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 95, 0, 7); ctx.stroke(); }
  }
  const m = fx.meteor;
  if (!m) { meteorState = null; return; }
  if (!meteorState || meteorState.id !== m.id) meteorState = { id: m.id, impactT: null };
  if (m.impact && meteorState.impactT === null) meteorState.impactT = t;
  const since = meteorState.impactT === null ? -1 : t - meteorState.impactT;
  if (since < 0 || since < 0.4) { // falling: slow approach while deciding, fast finish after the choice
    const p = since < 0 ? 0.6 + Math.sin(t * 2) * 0.03 : 0.75 + (since / 0.4) * 0.25;
    const sx = m.x + 900 * (1 - p), sy = m.y - 1100 * (1 - p);
    const g = ctx.createLinearGradient(sx, sy, sx + 260, sy - 320); g.addColorStop(0, "rgba(255,220,150,0.95)"); g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.strokeStyle = g; ctx.lineWidth = 16; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 260, sy - 320); ctx.stroke();
    ctx.fillStyle = "#fff7d6"; ctx.beginPath(); ctx.arc(sx, sy, 14 + Math.sin(t * 20) * 2, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(239,68,68,0.7)"; ctx.lineWidth = 4; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.arc(m.x, m.y, 70 + Math.sin(t * 6) * 8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  } else if (since < 2.2) { // impact flash + debris
    const k = (since - 0.4) / 1.8;
    ctx.fillStyle = `rgba(255,200,120,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(m.x, m.y, 40 + k * 220, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(120,60,30,${1 - k})`;
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.28; ctx.beginPath(); ctx.arc(m.x + Math.cos(a) * k * 200, m.y + Math.sin(a) * k * 140 - Math.sin(k * 3.14) * 60, 7, 0, 7); ctx.fill(); }
  }
}

/** Screen-space overlays: dust haze, radiation glow, navigation arrow. */
export function drawScreenFx(ctx: CanvasRenderingContext2D, fx: Fx, t: number, vw: number, vh: number) {
  const dusty = fx.weather === "dust" || fx.weather === "storm-flare", rad = fx.weather === "flare" || fx.weather === "storm-flare";
  if (dusty || fx.approaching === "dust") {
    const strength = dusty ? 1 : 0.3;
    ctx.fillStyle = `rgba(190,110,60,${0.32 * strength + Math.sin(t * 0.8) * 0.05 * strength})`; ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = `rgba(235,180,120,${0.55 * strength})`; ctx.lineCap = "round";
    for (const d of dust) {
      const x = ((d.x * vw + t * 420 * d.s) % (vw + 60)) - 30, y = (d.y * vh + Math.sin(t * 2 + d.i) * 14 + t * 40 * d.s) % vh;
      ctx.lineWidth = d.s * 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d.l * d.s, y - d.l * 0.2); ctx.stroke();
    }
  }
  if (rad || fx.approaching === "radiation") {
    const a = (rad ? 0.35 : 0.12) + Math.sin(t * 3) * 0.08;
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    g.addColorStop(0, "rgba(163,230,53,0)"); g.addColorStop(1, `rgba(200,80,220,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    if (rad) { ctx.fillStyle = "rgba(190,255,120,0.7)"; for (let i = 0; i < 30; i++) { const x = (i * 211 + t * 30) % vw, y = (i * 137 + t * 90 * (1 + (i % 3))) % vh; ctx.fillRect(x, y, 2, 6); } }
  }
}

export function drawNav(ctx: CanvasRenderingContext2D, nav: Nav, t: number, vw: number, vh: number, toScreen: (x: number, y: number) => [number, number], player: [number, number]) {
  const [sx, sy] = toScreen(nav.x, nav.y), c: string = COLORS[nav.level] ?? "#22d3ee", pulse = 0.5 + Math.sin(t * 5) * 0.5;
  const top = vh < 640 ? 150 : 175, bottom = vh - 130, m = 40;
  const onScreen = sx > m && sx < vw - m && sy > top && sy < bottom;
  ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 12 + pulse * 14; ctx.fillStyle = c; ctx.strokeStyle = "#1e1b3a"; ctx.lineWidth = 3;
  const arrow = (x: number, y: number, ang: number, size: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.6, -size * 0.75); ctx.lineTo(-size * 0.25, 0); ctx.lineTo(-size * 0.6, size * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  };
  const label = (x: number, y: number) => {
    ctx.shadowBlur = 0; ctx.font = "bold 14px Nunito, sans-serif"; const w = ctx.measureText(nav.label).width + 16;
    const lx = Math.max(8, Math.min(vw - w - 8, x - w / 2)), ly = Math.max(top - 30, Math.min(bottom, y));
    ctx.fillStyle = "rgba(30,20,70,0.85)"; ctx.beginPath(); ctx.roundRect(lx, ly, w, 24, 12); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(nav.label, lx + 8, ly + 17);
  };
  if (onScreen) {
    const bob = Math.sin(t * 5) * 8; arrow(sx, sy - 30 + bob, Math.PI / 2, 22); label(sx, sy - 90 + bob);
    const [px, py] = player, ang = Math.atan2(sy - py, sx - px);
    if (Math.hypot(sx - px, sy - py) > 180) arrow(px + Math.cos(ang) * 72, py - 20 + Math.sin(ang) * 72, ang, 14);
  } else {
    const cx = vw / 2, cy = (top + bottom) / 2, ang = Math.atan2(sy - cy, sx - cx);
    const k = Math.min(Math.abs((vw / 2 - m) / Math.cos(ang) || 1e9), Math.abs(((bottom - top) / 2) / Math.sin(ang) || 1e9));
    const ex = cx + Math.cos(ang) * k, ey = cy + Math.sin(ang) * k;
    ctx.globalAlpha = 0.75 + pulse * 0.25; arrow(ex, ey, ang, 24 + pulse * 4); ctx.globalAlpha = 1;
    label(ex - Math.cos(ang) * 60, ey - Math.sin(ang) * 50 - 12);
  }
  ctx.restore();
}

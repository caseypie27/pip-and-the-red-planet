import type { Character, Dir } from "./types";

const PALETTE = {
  boy: { accent: "#ff8a1f", trim: "#22d3ee", hair: "#5a3214", skin: "#f2c094" },
  girl: { accent: "#ff7a2e", trim: "#2dd4bf", hair: "#2b1a12", skin: "#c98a5e" },
};

/** Draws the astronaut centred at (0,0) at its feet. t = seconds, moving = walking. */
export function drawAstronaut(
  ctx: CanvasRenderingContext2D, c: Character, dir: Dir, t: number, moving: boolean, scale = 1,
) {
  const p = PALETTE[c];
  const step = moving ? Math.sin(t * 12) : 0;
  const bob = moving ? Math.abs(Math.sin(t * 12)) * -3 : Math.sin(t * 2.5) * 1.2;
  ctx.save();
  ctx.scale(scale, scale);
  // shadow
  ctx.fillStyle = "rgba(60,15,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 0, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, bob);
  const side = dir === "left" || dir === "right";
  const flip = dir === "left" ? -1 : 1;
  ctx.scale(flip, 1);
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#1e1b3a"; ctx.lineJoin = "round";

  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  // legs
  if (side) {
    rr(-6 + step * 5, -18, 10, 18, 4, "#f4f6fb");
    rr(-6 - step * 5, -18, 10, 18, 4, "#e6e9f2");
    rr(-7 + step * 5, -5, 14, 6, 3, p.accent);
  } else {
    rr(-12, -18 + step * 2, 10, 18 - step * 2, 4, "#f4f6fb");
    rr(2, -18 - step * 2, 10, 18 + step * 2, 4, "#f4f6fb");
    rr(-13, -5 + step * 2, 12, 6, 3, p.accent);
    rr(1, -5 - step * 2, 12, 6, 3, p.accent);
  }
  // backpack
  if (dir === "up") rr(-16, -44, 32, 26, 6, "#cfd5e3");
  else if (side) rr(-20, -42, 10, 22, 4, "#cfd5e3");
  // torso
  rr(-15, -42, 30, 27, 9, "#ffffff");
  ctx.fillStyle = p.trim; ctx.fillRect(-15, -24, 30, 4); ctx.strokeRect(-15, -24, 30, 4);
  if (dir === "down") {
    rr(-7, -38, 14, 10, 3, p.accent);
    ctx.fillStyle = p.trim; ctx.beginPath(); ctx.arc(-2, -33, 2, 0, 7); ctx.fill();
    ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(3, -33, 2, 0, 7); ctx.fill();
  }
  if (dir === "up") { ctx.fillStyle = p.accent; ctx.fillRect(-10, -40, 20, 5); }
  // arms
  const swing = step * 6;
  if (side) rr(-4 - swing, -40, 9, 20, 4, "#f4f6fb");
  else { rr(-22, -40 - swing / 2, 9, 20, 4, "#f4f6fb"); rr(13, -40 + swing / 2, 9, 20, 4, "#f4f6fb");
    rr(-22, -24 - swing / 2, 9, 6, 3, p.accent); rr(13, -24 + swing / 2, 9, 6, 3, p.accent); }

  // helmet
  ctx.beginPath(); ctx.arc(0, -60, 22, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.trim; ctx.beginPath(); ctx.arc(0, -60, 22, Math.PI * 0.8, Math.PI * 0.2, true); ctx.lineTo(0, -60); ctx.closePath();
  ctx.globalAlpha = 0; ctx.fill(); ctx.globalAlpha = 1;
  // antenna on helmet
  ctx.beginPath(); ctx.moveTo(12, -78); ctx.lineTo(16, -88); ctx.stroke();
  ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(16, -89, 3.5, 0, 7); ctx.fill(); ctx.stroke();

  if (dir !== "up") {
    // visor with face
    ctx.save();
    ctx.beginPath();
    if (side) ctx.ellipse(6, -59, 13, 15, 0, 0, 7); else ctx.ellipse(0, -59, 17, 15, 0, 0, 7);
    ctx.fillStyle = "#bfeafc"; ctx.fill(); ctx.clip();
    const fx = side ? 7 : 0;
    // hair back (girl long)
    ctx.fillStyle = p.hair;
    if (c === "girl") { ctx.beginPath(); ctx.ellipse(fx - (side ? 6 : 0), -56, 15, 16, 0, 0, 7); ctx.fill(); }
    // face
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.ellipse(fx, -56, 11, 12, 0, 0, 7); ctx.fill();
    // hair front
    ctx.fillStyle = p.hair; ctx.beginPath();
    if (c === "boy") {
      ctx.ellipse(fx, -66, 12, 6, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx - 10, -66); ctx.lineTo(fx - 4, -60); ctx.lineTo(fx, -66); ctx.lineTo(fx + 5, -61); ctx.lineTo(fx + 11, -66); ctx.fill();
    } else {
      ctx.ellipse(fx, -66, 13, 6, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx + 4, -64, 9, 4, -0.3, 0, 7); ctx.fill();
    }
    // eyes
    const blink = Math.sin(t * 1.3) > 0.97 ? 0.3 : 1;
    ctx.fillStyle = "#1e1b3a";
    const eyes = side ? [fx + 5] : [fx - 4.5, fx + 4.5];
    for (const ex of eyes) { ctx.beginPath(); ctx.ellipse(ex, -56, 2, 2.6 * blink, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#fff"; for (const ex of eyes) ctx.fillRect(ex + 0.5, -58, 1, 1);
    // cheeks + smile
    ctx.fillStyle = "rgba(255,110,110,0.45)";
    if (!side) { ctx.beginPath(); ctx.arc(fx - 7, -51, 2.5, 0, 7); ctx.arc(fx + 7, -51, 2.5, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#7a2e1a"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(side ? fx + 4 : fx, -51, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();
    // visor shine
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath(); ctx.ellipse(fx - 8, -66, 4, 7, 0.5, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#1e1b3a"; ctx.lineWidth = 2.5;
    ctx.beginPath(); if (side) ctx.ellipse(6, -59, 13, 15, 0, 0, 7); else ctx.ellipse(0, -59, 17, 15, 0, 0, 7); ctx.stroke();
  } else {
    // back of helmet: girl ponytail hint visible through rear window
    ctx.fillStyle = p.trim; ctx.beginPath(); ctx.ellipse(0, -60, 10, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (c === "girl") { ctx.fillStyle = p.hair; ctx.beginPath(); ctx.ellipse(0, -48, 5, 8, 0, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  // helmet rim
  ctx.fillStyle = p.accent; ctx.beginPath(); ctx.roundRect(-14, -41, 28, 5, 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

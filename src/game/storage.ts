import { initialFacilities } from "./facilities";
import { newSim, type Sim } from "./sim";
import type { Character } from "./types";
const KEY = "mbb.character";
const SOL = "mbb.sol";
export function loadCharacter(): Character | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v === "boy" || v === "girl" ? v : null;
}
export function saveCharacter(c: Character) { localStorage.setItem(KEY, c); }
export function loadSol(): number {
  if (typeof window === "undefined") return 1;
  return Math.max(1, Number(localStorage.getItem(SOL)) || 1);
}
export function resetGame() { localStorage.removeItem(KEY); localStorage.removeItem(SOL); localStorage.removeItem(SIM); }
const SIM = "mbb.sim";
export function loadSim(): Sim | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(localStorage.getItem(SIM) || "null");
    if (!v || typeof v.sol !== "number") return null;
    const s: Sim = { ...newSim(), ...v };
    // Keep original base artwork and collision dimensions current while preserving player progress.
    const bases = initialFacilities();
    s.facilities = s.facilities.map((f) => {
      if (f.built) return f;
      const base = bases.find((b) => b.id === f.id);
      return base ? { ...f, x: base.x, y: base.y, w: base.w, h: base.h } : f;
    });
    return s;
  } catch { return null; }
}
export function saveSim(s: Sim) { localStorage.setItem(SIM, JSON.stringify(s)); localStorage.setItem(SOL, String(s.sol)); }

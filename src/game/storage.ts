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
  try { const v = JSON.parse(localStorage.getItem(SIM) || "null"); return v && typeof v.sol === "number" ? { ...newSim(), ...v } : null; } catch { return null; }
}
export function saveSim(s: Sim) { localStorage.setItem(SIM, JSON.stringify(s)); localStorage.setItem(SOL, String(s.sol)); }

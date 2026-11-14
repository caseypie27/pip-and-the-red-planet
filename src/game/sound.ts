/** Original synthesized sound effects (no recordings). Alerts have cooldowns and critical alerts take priority. */
export type SoundKind =
  | "ok" | "fail" | "open" | "goal" | "objective" | "milestone" | "discovery" | "research" | "repair" | "upgrade" | "collect" | "activate"
  | "win" | "lose" | "alert" | "critical" | "dust" | "radiation" | "meteor" | "malfunction";
const ALERTS: SoundKind[] = ["alert", "critical", "dust", "radiation", "meteor", "malfunction"];
export interface AudioSettings { muted: boolean; sfx: boolean; alerts: boolean; volume: number; nav: boolean }
const KEY = "mbb.audio";
let settings: AudioSettings = { muted: false, sfx: true, alerts: true, volume: 0.7, nav: true };
if (typeof window !== "undefined") { try { settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { /* ignore */ } }
export const getSettings = () => settings;
export function setSettings(p: Partial<AudioSettings>) { settings = { ...settings, ...p }; try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }

let ctx: AudioContext | null = null;
/** Browsers only allow audio after the player clicks or presses a key. */
export function unlockAudio() {
  const go = () => { try { ctx ??= new AudioContext(); void ctx.resume(); } catch { /* audio unavailable */ } };
  window.addEventListener("pointerdown", go, { once: true }); window.addEventListener("keydown", go, { once: true });
}

const last = new Map<string, number>();
let criticalAt = -1e9;
const COOLDOWN: Partial<Record<SoundKind, number>> = { alert: 12000, critical: 8000, dust: 15000, radiation: 15000, meteor: 4000, malfunction: 6000 };

type Tone = { f: number; to?: number; d: number; type: OscillatorType; at: number; g?: number };
const T = (type: OscillatorType, d: number, notes: number[], step = 0.09, g = 0.08): Tone[] => notes.map((f, i) => ({ f, d, type, at: i * step, g }));
const SOUNDS: Record<SoundKind, Tone[] | "noise"> = {
  ok: T("triangle", 0.15, [660, 880]), fail: T("sawtooth", 0.18, [220, 160], 0.09, 0.05), open: T("sine", 0.12, [520, 700], 0.06),
  goal: T("triangle", 0.2, [523, 659, 784, 1046]), objective: T("sine", 0.25, [440, 660], 0.15), milestone: T("triangle", 0.3, [392, 523, 659, 784, 1046], 0.12),
  discovery: T("sine", 0.3, [880, 1175, 1568], 0.08), research: T("square", 0.12, [600, 750, 900, 1200], 0.07, 0.04), repair: T("square", 0.06, [300, 300, 450], 0.1, 0.05),
  upgrade: T("triangle", 0.22, [400, 600, 800], 0.08), collect: T("sine", 0.1, [990, 1320], 0.06), activate: T("sine", 0.15, [330, 495], 0.07),
  win: T("triangle", 0.4, [523, 659, 784, 1046, 784, 1046], 0.16), lose: T("sawtooth", 0.5, [392, 330, 262, 196], 0.25, 0.05),
  alert: T("square", 0.16, [740, 0, 740], 0.18, 0.05), critical: [0, 1, 2].flatMap((i) => [{ f: 900, to: 600, d: 0.22, type: "sawtooth" as const, at: i * 0.26, g: 0.06 }]),
  dust: "noise", radiation: [0, 1, 2, 3, 4, 5].map((i) => ({ f: 2400 + (i % 2) * 800, d: 0.03, type: "square" as const, at: i * 0.07 + (i % 3) * 0.03, g: 0.05 })),
  meteor: [{ f: 1400, to: 120, d: 1.1, type: "sawtooth", at: 0, g: 0.05 }], malfunction: T("square", 0.05, [180, 0, 180, 0, 180], 0.08, 0.06),
};

/** Play a sound. `key` groups repeats so the same warning isn't replayed every second. */
export function play(kind: SoundKind, key: string = kind) {
  const alert = ALERTS.includes(kind);
  if (settings.muted || (alert ? !settings.alerts : !settings.sfx) || settings.volume <= 0) return;
  const now = performance.now();
  if (now - (last.get(key) ?? -1e9) < (COOLDOWN[kind] ?? 0)) return;
  if (kind !== "critical" && alert && now - criticalAt < 3000) return; // critical alerts dominate
  last.set(key, now); if (kind === "critical") criticalAt = now;
  try {
    ctx ??= new AudioContext();
    const c = ctx, t0 = c.currentTime, out = c.createGain(); out.gain.value = settings.volume; out.connect(c.destination);
    const s = SOUNDS[kind];
    if (s === "noise") { // wind whoosh for dust storms
      const len = c.sampleRate * 1.4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; f.type = "bandpass"; f.frequency.setValueAtTime(300, t0); f.frequency.linearRampToValueAtTime(1200, t0 + 1.4); g.gain.value = 0.25;
      src.connect(f).connect(g).connect(out); src.start(t0); return;
    }
    for (const n of s) {
      if (!n.f) continue;
      const o = c.createOscillator(), g = c.createGain(), t = t0 + n.at;
      o.type = n.type; o.frequency.setValueAtTime(n.f, t); if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
      g.gain.setValueAtTime(n.g ?? 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + n.d);
      o.connect(g).connect(out); o.start(t); o.stop(t + n.d + 0.02);
    }
  } catch { /* audio unavailable */ }
}
/** Back-compat helper used by existing code. */
export const beep = (kind: "ok" | "fail" | "open" | "goal") => play(kind);
export function soundForAction(id: string): SoundKind {
  if (id.startsWith("scan-")) return "discovery";
  if (id.startsWith("tech-")) return "research";
  if (id.startsWith("review-") || id === "clean" || id === "scavenge") return "collect";
  if (id.startsWith("toggle-") || id === "drill-mode") return "activate";
  if (id === "shield" || id === "storage") return "upgrade";
  if (id.includes("fix") || id.includes("repair")) return "repair";
  return "ok";
}

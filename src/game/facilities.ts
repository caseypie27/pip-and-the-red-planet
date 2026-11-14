import type { Rect } from "./types";

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const SKY_H = 360;
export const SPAWN = { x: 1600, y: 1500 };

export type BuildableKind = "solar" | "greenhouse" | "oxygen" | "drill" | "lab" | "storage" | "hab" | "shelter";
export type FacilityKind = BuildableKind | "rover" | "antenna" | "lander";
export type BaseBuildingKind = FacilityKind | "dome";

export interface BaseBuilding { kind: BaseBuildingKind; x: number; y: number; w: number; h: number }
export interface Facility {
  id: string;
  kind: FacilityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  /** Seconds of work left. Zero means construction is complete. */
  remaining: number;
  damaged: boolean;
  primary: boolean;
  built: boolean;
}

export interface ResourceCost { materials: number; energy: number }
export interface BuildDefinition {
  name: string;
  icon: string;
  description: string;
  w: number;
  h: number;
  cost: ResourceCost;
  duration: number;
  essential: boolean;
  controllable: boolean;
  warning?: string;
}

export const BUILDABLE_KINDS: BuildableKind[] = ["solar", "greenhouse", "drill", "oxygen", "lab", "storage", "hab", "shelter"];
export const BUILD_DEFS: Record<BuildableKind, BuildDefinition> = {
  solar: {
    name: "Solar Panel Array", icon: "☀️", description: "+36 energy per Sol in full sunlight.", w: 240, h: 130,
    cost: { materials: 25, energy: 10 }, duration: 5, essential: true, controllable: true,
    warning: "Solar arrays charge the batteries. Switching this off can leave life support without power.",
  },
  greenhouse: {
    name: "Greenhouse", icon: "🌱", description: "+15 food and +4 oxygen per Sol. Uses 10 energy + 10 water.", w: 220, h: 150,
    cost: { materials: 30, energy: 15 }, duration: 6, essential: true, controllable: true,
    warning: "The greenhouse grows the crew's food. Make sure you have enough food stored before switching it off.",
  },
  oxygen: {
    name: "Oxygen Generator", icon: "🫧", description: "+30 oxygen per Sol. Uses 15 energy + 5 water.", w: 180, h: 150,
    cost: { materials: 35, energy: 20 }, duration: 7, essential: true, controllable: true,
    warning: "This is essential life support! The crew cannot breathe Mars air. Check stored oxygen first.",
  },
  drill: {
    name: "Water Extraction Unit", icon: "💧", description: "+26 water per Sol. Uses 14 energy.", w: 150, h: 150,
    cost: { materials: 30, energy: 15 }, duration: 6, essential: true, controllable: true,
    warning: "Water is needed for drinking, oxygen and food. Check your water supply before switching this off.",
  },
  lab: {
    name: "Research Laboratory", icon: "🔬", description: "Enables research. Each extra active lab reduces research costs by 15% (up to 30%).", w: 200, h: 150,
    cost: { materials: 40, energy: 25 }, duration: 8, essential: false, controllable: true,
  },
  storage: {
    name: "Storage Unit", icon: "📦", description: "+30 capacity for oxygen, water and food. Always available once built.", w: 170, h: 110,
    cost: { materials: 25, energy: 10 }, duration: 5, essential: false, controllable: false,
  },
  hab: {
    name: "Habitat Module", icon: "🏠", description: "More living space: each extra module cuts crew supply use by 8% (up to 24%). Uses 4 energy.", w: 220, h: 140,
    cost: { materials: 35, energy: 20 }, duration: 7, essential: true, controllable: true,
    warning: "The habitat protects the crew's living space. Switching it off removes its supply-saving benefit.",
  },
  shelter: {
    name: "Radiation Shelter", icon: "🛡️", description: "+8% shielding per extra active shelter. Uses 3 energy.", w: 180, h: 120,
    cost: { materials: 35, energy: 20 }, duration: 7, essential: true, controllable: true,
    warning: "Shelters block dangerous space radiation, especially during solar flares.",
  },
};

export const BASE_BUILDINGS: BaseBuilding[] = [
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

export function initialFacilities(): Facility[] {
  const counts = new Map<string, number>();
  return BASE_BUILDINGS.map((b) => {
    const count = (counts.get(b.kind) ?? 0) + 1;
    counts.set(b.kind, count);
    return {
      id: `base-${b.kind}-${count}`,
      kind: b.kind === "dome" ? "oxygen" : b.kind,
      x: b.x, y: b.y, w: b.w, h: b.h,
      enabled: b.kind !== "drill",
      remaining: 0,
      damaged: false,
      primary: count === 1,
      built: false,
    };
  });
}

export const stationForFacility = (kind: FacilityKind) => kind === "oxygen" ? "dome" : kind;

export function facilityName(f: Facility): string {
  if (!f.built) {
    if (f.kind === "oxygen") return "Oxygen Generator / Life Support";
    if (f.kind === "drill") return "Water Extractor · Ice Drill";
    if (f.kind === "solar") return `Solar Power Station ${f.id.endsWith("-2") ? "2" : "1"}`;
    if (f.kind === "hab") return "Habitat";
    if (f.kind === "lab") return "Research Laboratory";
    if (f.kind === "storage") return "Storage Depot";
    if (f.kind === "rover") return "Rover";
    if (f.kind === "antenna") return "Comms Antenna";
    if (f.kind === "lander") return "Landing Craft";
  }
  return BUILD_DEFS[f.kind as BuildableKind]?.name ?? f.kind;
}

export function facilityIcon(kind: FacilityKind): string {
  if (kind in BUILD_DEFS) return BUILD_DEFS[kind as BuildableKind].icon;
  return kind === "rover" ? "🚙" : kind === "antenna" ? "📡" : "🚀";
}

export interface Deco { rocks: { x: number; y: number; r: number }[]; craters: { x: number; y: number; r: number }[] }
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
let cachedDeco: Deco | null = null;
export function getDeco(): Deco {
  if (cachedDeco) return cachedDeco;
  const r = rng(42);
  const rocks: Deco["rocks"] = [];
  const craters: Deco["craters"] = [{ x: 2600, y: 1950, r: 170 }];
  for (let i = 0; i < 22; i++) craters.push({ x: r() * WORLD_W, y: SKY_H + 120 + r() * (WORLD_H - SKY_H - 200), r: 30 + r() * 80 });
  for (let i = 0; i < 140; i++) rocks.push({ x: r() * WORLD_W, y: SKY_H + 60 + r() * (WORLD_H - SKY_H - 80), r: 6 + r() * 20 });
  const clear = (x: number, y: number) => !BASE_BUILDINGS.some((b) => x > b.x - 60 && x < b.x + b.w + 60 && y > b.y - 60 && y < b.y + b.h + 80)
    && Math.hypot(x - SPAWN.x, y - SPAWN.y) > 120;
  cachedDeco = { rocks: rocks.filter((k) => clear(k.x, k.y)), craters: craters.filter((k, i) => i === 0 || clear(k.x, k.y)) };
  return cachedDeco;
}

const PROTECTED_SITES = [
  { x: 330, y: 1250, r: 125 }, { x: 1750, y: 2230, r: 180 }, { x: 600, y: 1600, r: 110 },
  { x: 300, y: 2150, r: 190 }, { x: 520, y: 520, r: 130 }, { x: 3000, y: 2200, r: 100 },
  { x: 1500, y: 560, r: 140 }, { x: 3050, y: 520, r: 145 }, { x: 2950, y: 1650, r: 125 },
];

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const circleHitsRect = (cx: number, cy: number, r: number, rect: Rect) => {
  const x = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return Math.hypot(cx - x, cy - y) < r;
};

export function placementRect(kind: BuildableKind, x: number, y: number): Rect {
  const d = BUILD_DEFS[kind];
  return { x: x - d.w / 2, y: y - d.h / 2, w: d.w, h: d.h };
}

export interface PlacementResult { ok: boolean; reason: string }
/** Pure terrain and spacing validation shared by the canvas and construction action. */
export function canPlace(facilities: Facility[], kind: BuildableKind, x: number, y: number): PlacementResult {
  const d = BUILD_DEFS[kind];
  if (!d || !Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: "Choose a building and a location." };
  const rect = placementRect(kind, x, y);
  const gap = 44;
  const spaced = { x: rect.x - gap, y: rect.y - gap, w: rect.w + gap * 2, h: rect.h + gap * 2 };
  if (rect.x < 30 || rect.y < SKY_H + 60 || rect.x + rect.w > WORLD_W - 30 || rect.y + rect.h > WORLD_H - 30)
    return { ok: false, reason: "Build inside the open Martian plains, away from the horizon and map edge." };
  const existing = [
    ...BASE_BUILDINGS.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    ...facilities.filter((f) => f.built).map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })),
  ];
  if (existing.some((b) => overlaps(spaced, b))) return { ok: false, reason: "Too close to another structure. Leave room for astronauts to walk." };
  const deco = getDeco();
  if (deco.rocks.some((k) => circleHitsRect(k.x, k.y, k.r + 24, spaced))) return { ok: false, reason: "Rocks block this site. Choose clear, open ground." };
  if (deco.craters.some((c) => circleHitsRect(c.x, c.y, c.r * 0.9 + 20, spaced))) return { ok: false, reason: "This crater ground is uneven. Buildings need a flat plain." };
  if (PROTECTED_SITES.some((p) => circleHitsRect(p.x, p.y, p.r, spaced))) return { ok: false, reason: "This is a protected exploration site. Build somewhere else." };
  return { ok: true, reason: "Flat, open ground — ready to build!" };
}

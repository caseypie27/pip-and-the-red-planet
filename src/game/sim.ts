/** Mars survival simulation: pure state + tick + actions. All rates are "per Sol". */
export type EventKind = "clear" | "dust" | "flare" | "storm-flare";
export const SOL_EVENTS: EventKind[] = ["clear", "clear", "dust", "clear", "flare", "clear", "dust", "flare", "clear", "storm-flare"];
export const EVENT_INFO: Record<EventKind, { label: string; icon: string; tip: string }> = {
  clear: { label: "Clear skies", icon: "☀️", tip: "Great day for solar power. Store up energy!" },
  dust: { label: "Dust storm", icon: "🌪️", tip: "Dust blocks sunlight and covers the solar panels. Save energy and clean the panels!" },
  flare: { label: "Solar flare", icon: "☢️", tip: "A burst of radiation is coming. Upgrade shielding at the Research Lab!" },
  "storm-flare": { label: "Storm + flare", icon: "⚠️", tip: "The final test: dust AND radiation. Prepare shields, energy and supplies!" },
};
export const DAY_SECONDS = 90;
export const MAX_SOL = 10;

export type SystemId = "oxygen" | "greenhouse" | "drill";
export interface Sim {
  sol: number; time: number; status: "day" | "summary" | "won" | "lost";
  oxygen: number; water: number; food: number; energy: number;
  shield: number; condition: number; exposure: number;
  materials: number; lifeSupport: number; panels: number;
  systems: Record<SystemId, boolean>; scavenged: boolean;
  unpowered: SystemId[]; solar: number;
  usage: number; foodRate: number; waterRate: number;
  research: TechId[]; drillHigh: boolean; capacity: number; objective: number;
  seed: number; event: { kind: EventId; target?: Breakable } | null; eventSol: number; eventsHandled: number;
  broken: Breakable | null; discoveries: string[]; reviewed: string[]; extraSites: string[];
  achievements: string[]; foodMade: number; log: LogEntry[];
  waterMade: number; solarMade: number; energyUsed: number; peakExposure: number; powerOut: number; damage: Record<string, number>;
}
export interface LogEntry { sol: number; icon: string; text: string }
export type Breakable = "oxygen" | "greenhouse" | "drill" | "panels";
export const BREAK_NAMES: Record<Breakable, string> = { oxygen: "Oxygen generator", greenhouse: "Greenhouse pump", drill: "Ice drill", panels: "Solar panel wiring" };
export const BREAK_STATION: Record<Breakable, string> = { oxygen: "dome", greenhouse: "greenhouse", drill: "drill", panels: "solar" };
export function addLog(s: Sim, icon: string, text: string) { s.log = [{ sol: s.sol, icon, text }, ...s.log].slice(0, 60); }
export type TechId = "panels" | "irrigation" | "recycler" | "deepdrill" | "radmeds";
export const TECHS: Record<TechId, { name: string; energy: number; materials: number; desc: string }> = {
  panels: { name: "Better solar cells", energy: 20, materials: 15, desc: "+25% solar power" },
  irrigation: { name: "Drip irrigation", energy: 25, materials: 10, desc: "Greenhouse uses 40% less water" },
  recycler: { name: "Air recycler", energy: 30, materials: 20, desc: "Crew uses 20% less oxygen" },
  deepdrill: { name: "Deep ice drill", energy: 25, materials: 20, desc: "Ice drill makes 40% more water" },
  radmeds: { name: "Radiation medicine", energy: 30, materials: 25, desc: "Radiation dose heals twice as fast" },
};
const has = (s: Sim, t: TechId) => s.research.includes(t);

export function newSim(): Sim {
  return { sol: 1, time: 0, status: "day", oxygen: 80, water: 70, food: 60, energy: 70, shield: 30, condition: 100, exposure: 0,
    materials: 40, lifeSupport: 80, panels: 100, systems: { oxygen: true, greenhouse: true, drill: false }, scavenged: false, unpowered: [], solar: 0,
    usage: 0, foodRate: 0, waterRate: 0, research: [], drillHigh: false, capacity: 100, objective: 0,
    seed: Math.floor(Math.random() * 1000), event: null, eventSol: 1, eventsHandled: 0, broken: null, discoveries: [], reviewed: [], extraSites: [],
    achievements: [], foodMade: 0, waterMade: 0, solarMade: 0, energyUsed: 0, peakExposure: 0, powerOut: 0, damage: {}, log: [{ sol: 1, icon: "🚀", text: "Landed on Mars. Mission begins!" }] };
}

export const RATES = {
  crew: { oxygen: 24, water: 8, food: 10 },
  baseEnergy: 12,
  oxygenGen: { energy: 15, water: 5, oxygen: 30 },
  greenhouse: { energy: 10, water: 10, food: 15, oxygen: 4 },
  drill: { energy: 14, water: 26 },
  solarPeak: 72,
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const eventOf = (s: Sim) => SOL_EVENTS[s.sol - 1] ?? "clear";
export const daylight = (time: number) => Math.max(0.1, Math.sin((Math.PI * time) / DAY_SECONDS));
export const envRadiation = (e: EventKind) => (e === "flare" || e === "storm-flare" ? 5 : e === "dust" ? 0.8 : 1);

/** Advance the simulation by dt seconds (mutates a copy). */
export function tick(prev: Sim, dt: number): Sim {
  if (prev.status !== "day" || prev.event) return prev;
  const s: Sim = { ...prev, systems: { ...prev.systems } };
  const k = dt / DAY_SECONDS;
  const ev = weatherNow(s);
  const dusty = ev === "dust" || ev === "storm-flare";

  // Power: solar depends on daylight, weather and panel cleanliness
  s.solar = RATES.solarPeak * daylight(s.time) * (dusty ? 0.35 : 1) * (s.panels / 100) * (has(s, "panels") ? 1.25 : 1) * (s.broken === "panels" ? 0.5 : 1);
  s.energy = clamp(s.energy + s.solar * k); s.solarMade += s.solar * k;
  s.panels = clamp(s.panels - (dusty ? 35 : 10) * k);
  s.lifeSupport = clamp(s.lifeSupport - (dusty ? 14 : 9) * k);

  // Consumers, in priority order. Without enough energy a system stops working.
  const unpowered: SystemId[] = [];
  let usage = 0, food = 0, water = 0;
  const use = (e: number) => { usage += e; if (s.energy >= e * k) { s.energy -= e * k; return true; } s.energy = 0; return false; };
  const baseOk = use(RATES.baseEnergy);
  if (s.systems.oxygen && s.broken === "oxygen") unpowered.push("oxygen");
  else if (s.systems.oxygen) {
    if (s.water > 0 && use(RATES.oxygenGen.energy)) { s.water -= RATES.oxygenGen.water * k; water -= RATES.oxygenGen.water; s.oxygen += RATES.oxygenGen.oxygen * (s.lifeSupport / 100) * k; }
    else unpowered.push("oxygen");
  }
  if (s.systems.greenhouse && s.broken === "greenhouse") unpowered.push("greenhouse");
  else if (s.systems.greenhouse) {
    if (s.water > 0 && use(RATES.greenhouse.energy)) { const gw = RATES.greenhouse.water * (has(s, "irrigation") ? 0.6 : 1); s.water -= gw * k; water -= gw; food += RATES.greenhouse.food; s.foodMade += RATES.greenhouse.food * k; s.food += RATES.greenhouse.food * k; s.oxygen += RATES.greenhouse.oxygen * k; }
    else unpowered.push("greenhouse");
  }
  if (s.systems.drill && s.broken === "drill") unpowered.push("drill");
  else if (s.systems.drill) {
    const dw = RATES.drill.water * (s.drillHigh ? 1.7 : 1) * (has(s, "deepdrill") ? 1.4 : 1);
    if (use(RATES.drill.energy * (s.drillHigh ? 1.8 : 1))) { s.water += dw * k; s.waterMade += dw * k; water += dw; } else unpowered.push("drill");
  }
  s.unpowered = unpowered;

  // Crew needs
  const cap = s.capacity;
  s.oxygen = clamp(s.oxygen - RATES.crew.oxygen * (has(s, "recycler") ? 0.8 : 1) * k, 0, cap);
  s.water = clamp(s.water - RATES.crew.water * k, 0, cap);
  s.food = clamp(s.food - RATES.crew.food * k, 0, cap);
  s.usage = usage; s.energyUsed += usage * k; if (s.energy <= 0.5) s.powerOut += dt; s.foodRate = food - RATES.crew.food; s.waterRate = water - RATES.crew.water;

  // Radiation exposure grows when shielding is weak
  const rad = envRadiation(ev) * 12 * (1 - s.shield / 100) - (has(s, "radmeds") ? 8 : 4);
  s.exposure = clamp(s.exposure + rad * k); s.peakExposure = Math.max(s.peakExposure, s.exposure);

  // Base condition takes damage from shortages and hazards (gradual, never instant)
  let dmg = 0; s.damage = { ...s.damage };
  const hurt = (why: string, n: number) => { dmg += n; s.damage[why] = (s.damage[why] ?? 0) + n * k; };
  if (s.oxygen <= 0) hurt("oxygen", 30);
  if (s.water <= 0) hurt("water", 15);
  if (s.food <= 0) hurt("food", 15);
  if (s.exposure >= 100) hurt("radiation", 25);
  if (!baseOk) hurt("energy", 10);
  if (s.lifeSupport < 25) hurt("lifesupport", 8);
  if (dusty) hurt("storm", 4);
  s.condition = clamp(s.condition - dmg * k);

  s.time = Math.min(DAY_SECONDS, s.time + dt);
  // Random Martian event: at most one per Sol (from Sol 2), mid-day, seeded so it's fair
  if (s.sol >= 2 && s.eventSol < s.sol && s.time > 25 + rnd(s, 1) * 35 && stormPhase(s) !== "active") {
    s.eventSol = s.sol;
    if (rnd(s, 2) < 0.8) {
      const pool: EventId[] = ["malfunction", "water", "breakthrough", "radiation", "dustdevil", "meteor"];
      const kind = pool[Math.floor(rnd(s, 3) * pool.length)] ?? "water";
      const targets: Breakable[] = ["oxygen", "greenhouse", "drill", "panels"];
      s.event = kind === "malfunction" || kind === "meteor" ? { kind, target: targets[Math.floor(rnd(s, 4) * 4)] ?? "drill" } : { kind };
      addLog(s, EVENTS[kind].icon, `Event: ${EVENTS[kind].title}`);
    }
  }
  if (s.condition <= 0) { s.status = "lost"; addLog(s, "💥", "The base broke down."); }
  else if (s.time >= DAY_SECONDS) {
    s.exposure = clamp(s.exposure - 15); // rest at night
    s.status = s.sol >= MAX_SOL ? "won" : "summary";
    addLog(s, s.status === "won" ? "🏁" : "🌙", s.status === "won" ? "Survived all 10 Sols!" : `Sol ${s.sol} survived`);
  }
  return s;
}

export function nextSol(s: Sim): Sim {
  if (s.status !== "summary") return s;
  const n = { ...s, sol: s.sol + 1, time: 0, status: "day" as const, scavenged: false };
  addLog(n, "🌅", `Sol ${n.sol} begins: ${EVENT_INFO[eventOf(n)].label}`);
  return n;
}

export interface Action { id: string; label: string; cost?: string }
export function actionsFor(station: string, s: Sim): Action[] {
  const fix: Action[] = s.broken && BREAK_STATION[s.broken] === station ? [{ id: "fix-broken", label: `🔧 Repair ${BREAK_NAMES[s.broken]}`, cost: "10 🔩" }] : [];
  if (station.startsWith("site:")) {
    const site = SITES.find((x) => x.id === station.slice(5));
    if (!site || s.discoveries.includes(site.id)) return [];
    const c = scanCost(s);
    return [{ id: `scan-${site.id}`, label: `Scan ${site.name}`, cost: `${c.energy} ⚡ + ${c.oxygen} 🫧` }];
  }
  if (station === "lab") {
    const rev = s.discoveries.filter((d) => !s.reviewed.includes(d)).map((d) => { const x = SITES.find((y) => y.id === d)!; return { id: `review-${d}`, label: `📋 Study ${x.discovery}`, cost: x.rewardText }; });
    return [...rev, ...baseActions(station, s)];
  }
  return [...fix, ...baseActions(station, s)];
}
function baseActions(station: string, s: Sim): Action[] {
  switch (station) {
    case "solar": return [{ id: "clean", label: `Clean panels (${Math.round(s.panels)}% clean)`, cost: "5 💧" }];
    case "dome": return [
      { id: "toggle-oxygen", label: `Oxygen generator: ${s.systems.oxygen ? "ON" : "OFF"}` },
      { id: "repair-ls", label: `Fix life support (${Math.round(s.lifeSupport)}%)`, cost: "10 🔩" },
    ];
    case "greenhouse": return [{ id: "toggle-greenhouse", label: `Grow food: ${s.systems.greenhouse ? "ON" : "OFF"}` }];
    case "drill": return [{ id: "toggle-drill", label: `Ice drill: ${s.systems.drill ? "ON" : "OFF"}` }, { id: "drill-mode", label: `Speed: ${s.drillHigh ? "FAST (more water, much more energy)" : "NORMAL (saves energy)"}` }];
    case "lab": return (Object.keys(TECHS) as TechId[]).filter((t) => !has(s, t)).map((t) => ({ id: `tech-${t}`, label: `${TECHS[t].name}: ${TECHS[t].desc}`, cost: `${TECHS[t].materials} 🔩 + ${TECHS[t].energy} ⚡` }));
    case "shelter": return [{ id: "shield", label: `Upgrade shielding (${Math.round(s.shield)}%)`, cost: "25 🔩 + 20 ⚡" }];
    case "hab": return [
      { id: "repair-base", label: `Repair base (${Math.round(s.condition)}%)`, cost: "15 🔩 + 10 ⚡" },
      { id: "toggle-oxygen", label: `Oxygen generator: ${s.systems.oxygen ? "ON" : "OFF"}` },
      { id: "repair-ls", label: `Fix life support (${Math.round(s.lifeSupport)}%)`, cost: "10 🔩" },
    ];
    case "storage": return s.capacity >= 160 ? [] : [{ id: "storage", label: `Expand storage (max ${s.capacity} → ${s.capacity + 30})`, cost: "20 🔩" }];
    case "rover": return [{ id: "scavenge", label: s.scavenged ? "Already scavenged today" : "Drive out for materials", cost: "15 ⚡" }];
    default: return [];
  }
}

/** Perform an action. Returns the new state and a message for PIP. */
export function act(prev: Sim, id: string): { sim: Sim; msg: string } {
  const s: Sim = { ...prev, systems: { ...prev.systems } };
  const no = (m: string) => ({ sim: prev, msg: m });
  if (s.status === "won" || s.status === "lost") return no("The mission is over.");
  switch (id) {
    case "toggle-oxygen": case "toggle-greenhouse": case "toggle-drill": {
      const sys = id.slice(7) as SystemId; s.systems[sys] = !s.systems[sys];
      const names = { oxygen: "Oxygen generator", greenhouse: "Greenhouse", drill: "Ice drill" };
      return { sim: s, msg: `${names[sys]} switched ${s.systems[sys] ? "ON — it uses energy" : "OFF — saving energy"}.` };
    }
    case "drill-mode":
      s.drillHigh = !s.drillHigh; return { sim: s, msg: s.drillHigh ? "Fast drilling: lots more water, but it drinks almost twice the energy!" : "Normal drilling: less water, but we save energy." };
    case "storage":
      if (s.capacity >= 160) return no("Storage is as big as it can get!");
      if (s.materials < 20) return no("Not enough materials! Expanding storage needs 20 🔩 — try the rover.");
      s.materials -= 20; s.capacity += 30; return { sim: s, msg: `Bigger tanks! We can now store up to ${s.capacity} oxygen, water and food, so we can save extra for storms.` };
    case "fix-broken":
      if (!s.broken) return no("Nothing is broken.");
      if (s.materials < 10) return no("Repairs need 10 materials. Try the rover!");
      addLog(s, "🔧", `Repaired ${BREAK_NAMES[s.broken]}`);
      s.materials -= 10; s.broken = null; return { sim: s, msg: "Fixed! The system is working again." };
    case "clean":
      if (s.water < 5) return no("We need 5 water to wash the panels!");
      s.water -= 5; s.panels = 100; return { sim: s, msg: "Sparkly clean! Clean panels catch much more sunlight." };
    case "repair-ls":
      if (s.materials < 10) return no("We need 10 materials. Try the rover!");
      s.materials -= 10; s.lifeSupport = clamp(s.lifeSupport + 40); return { sim: s, msg: "Life support fixed! The oxygen generator works better now." };
    case "shield":
      if (s.shield >= 90) return no("Shielding is at maximum!");
      if (s.materials < 25 || s.energy < 20) return no("Shielding needs 25 materials and 20 energy. Without it, radiation keeps building up in our bodies!");
      s.materials -= 25; s.energy -= 20; s.shield = clamp(s.shield + 15, 0, 90); addLog(s, "🛡️", `Shielding upgraded to ${s.shield}%`);
      return { sim: s, msg: `Thicker walls! Shielding is now ${s.shield}%, so only ${100 - s.shield}% of space radiation gets through to the crew.` };
    case "repair-base":
      if (s.materials < 15 || s.energy < 10) return no("Repairs need 15 materials and 10 energy.");
      s.materials -= 15; s.energy -= 10; s.condition = clamp(s.condition + 20); return { sim: s, msg: "Base repaired. Good as new!" };
    case "scavenge":
      if (s.scavenged) return no("The rover needs to recharge. Try again next Sol!");
      if (s.energy < 15) return no("The rover needs 15 energy.");
      s.energy -= 15; s.materials += 25; s.scavenged = true; return { sim: s, msg: "The rover found 25 materials from old landers and rocks!" };
  }
  if (id.startsWith("scan-")) {
    const site = SITES.find((x) => x.id === id.slice(5)), c = scanCost(s);
    if (!site || s.discoveries.includes(site.id)) return no("Already scanned!");
    if (s.energy < c.energy || s.oxygen < c.oxygen) return no(`Scanning needs ${c.energy} energy and ${c.oxygen} oxygen for your suit.`);
    s.energy -= c.energy; s.oxygen -= c.oxygen; s.discoveries = [...s.discoveries, site.id];
    addLog(s, "🔍", `Discovered: ${site.discovery}`);
    return { sim: s, msg: `Discovery! ${site.fact} Bring it to the Research Lab to study it.` };
  }
  if (id.startsWith("review-")) {
    const site = SITES.find((x) => x.id === id.slice(7));
    if (!site || s.reviewed.includes(site.id)) return no("Already studied!");
    s.reviewed = [...s.reviewed, site.id]; const g = site.reward;
    if (g.water) s.water = clamp(s.water + g.water, 0, s.capacity);
    if (g.materials) s.materials += g.materials;
    if (g.food) s.food = clamp(s.food + g.food, 0, s.capacity);
    if (g.energy) s.energy = clamp(s.energy + g.energy);
    if (g.shield) s.shield = clamp(s.shield + g.shield, 0, 90);
    if (g.lifeSupport) s.lifeSupport = clamp(s.lifeSupport + g.lifeSupport);
    addLog(s, "🔬", `Studied ${site.discovery}: ${site.rewardText}`);
    return { sim: s, msg: `Science! ${site.lesson} (${site.rewardText})` };
  }
  if (id.startsWith("tech-")) {
    const t = id.slice(5) as TechId, T = TECHS[t];
    if (!T || has(s, t)) return no("Already researched!");
    if (s.materials < T.materials || s.energy < T.energy) return no(`Research needs ${T.materials} materials and ${T.energy} energy. Spending energy here means less for food and water!`);
    s.materials -= T.materials; s.energy -= T.energy; s.research = [...s.research, t]; addLog(s, "🧪", `Researched ${T.name}`);
    return { sim: s, msg: `Research complete: ${T.name}! ${T.desc}.` };
  }
  return no("");
}

export function warnings(s: Sim): string[] {
  const w: string[] = [];
  if (s.oxygen < 25) w.push(s.oxygen <= 0 ? "OUT OF OXYGEN!" : "Low oxygen");
  if (s.water < 20) w.push(s.water <= 0 ? "No water!" : "Low water");
  if (s.food < 20) w.push(s.food <= 0 ? "No food!" : "Low food");
  if (s.energy < 15) w.push("Power shortage");
  if (s.exposure > 60) w.push("High radiation dose");
  if (s.condition < 35) w.push("Base damaged");
  if (s.lifeSupport < 30) w.push("Life support failing");
  return w;
}

/** Readouts shown in a building's panel. */
export function infoFor(station: string, s: Sim): string[] {
  const r = Math.round, sign = (n: number) => (n >= 0 ? "+" : "") + r(n);
  switch (station) {
    case "solar": return [`Making ${r(s.solar)} ⚡/Sol right now`, `Using ${r(s.usage)} ⚡/Sol`, `Panels ${r(s.panels)}% clean · ${EVENT_INFO[weatherNow(s)].label}`];
    case "greenhouse": return [`Food ${sign(s.foodRate)}/Sol (crew eats ${RATES.crew.food})`, `Uses ${RATES.greenhouse.energy} ⚡ and ${r(RATES.greenhouse.water * (has(s, "irrigation") ? 0.6 : 1))} 💧 per Sol`, s.unpowered.includes("greenhouse") ? "⚠️ Not growing: no power or water" : s.systems.greenhouse ? "Growing ✅" : "Switched off"];
    case "drill": return [`Water ${sign(s.waterRate)}/Sol overall`, `Stored ${r(s.water)}/${s.capacity}`, s.unpowered.includes("drill") ? "⚠️ Stopped: no power" : s.systems.drill ? "Drilling ✅" : "Switched off"];
    case "hab": case "dome": return [`Oxygen ${r(s.oxygen)} · Life support ${r(s.lifeSupport)}%`, `Base condition ${r(s.condition)}% · Radiation dose ${r(s.exposure)}`];
    case "lab": return [`Researched ${s.research.length}/5 · Discoveries studied ${s.reviewed.length}/${s.discoveries.length}`, "Research uses energy and materials — less left for food and water."];
    case "shelter": return [`Shielding ${r(s.shield)}%: blocks ${r(s.shield)}% of radiation`, `Crew dose ${r(s.exposure)}/100 — at 100 the base gets damaged`, `Radiation right now: ${envRadiation(weatherNow(s))}x normal`];
    case "storage": return [`🫧 ${r(s.oxygen)} · 💧 ${r(s.water)} · 🥕 ${r(s.food)} (max ${s.capacity})`, `⚡ ${r(s.energy)} · 🔩 ${s.materials}`, `Water ${sign(s.waterRate)}/Sol · Food ${sign(s.foodRate)}/Sol`];
    case "rover": return [`Materials: ${s.materials} 🔩`, s.scavenged ? "Rover is recharging until next Sol" : "Rover is ready"];
  }
  return [];
}

export interface Objective { title: string; hint: string; done: (s: Sim) => boolean; station?: string }
export const OBJECTIVES: Objective[] = [
  { title: "Establish a working habitat", hint: "Fix life support to 90% at the Habitat or Dome", done: (s) => s.lifeSupport >= 90 , station: "dome" },
  { title: "Secure water", hint: "Store 80 water using the Ice Drill", done: (s) => s.water >= 80 , station: "drill" },
  { title: "Produce enough food", hint: "Grow food in the Greenhouse until you have 75", done: (s) => s.food >= 75 , station: "greenhouse" },
  { title: "Complete your first research", hint: "Research a technology at the Research Lab", done: (s) => s.research.length >= 1 , station: "lab" },
  { title: "Improve radiation protection", hint: "Get shielding to 60% at the Radiation Shelter", done: (s) => s.shield >= 60 , station: "shelter" },
  { title: "Reliable energy", hint: "End a Sol with 50+ energy", done: (s) => s.status === "summary" && s.energy >= 50 , station: "solar" },
  { title: "Expand storage", hint: "Build bigger tanks at the Storage Depot", done: (s) => s.capacity > 100 , station: "storage" },
  { title: "Survive the solar flare", hint: "Reach Sol 6 with radiation dose under 50", done: (s) => s.sol >= 6 && s.exposure < 50 , station: "shelter" },
  { title: "Master scientist", hint: "Research 4 technologies", done: (s) => s.research.length >= 4 , station: "lab" },
  { title: "Survive 10 Sols", hint: "Keep the colony alive to the end", done: (s) => s.status === "won" },
];
export const OBJECTIVE_REWARD = 10;
/** Completes the current objective if met (reward: materials). */
export function checkObjective(s: Sim): { sim: Sim; done?: Objective } {
  const o = OBJECTIVES[s.objective];
  if (!o || !o.done(s)) return { sim: s };
  const n = { ...s, objective: s.objective + 1, materials: s.materials + OBJECTIVE_REWARD };
  addLog(n, "🏆", `Objective complete: ${o.title}`);
  return { sim: n, done: o };
}

function rnd(s: Sim, salt: number) { const x = Math.sin(s.seed * 12.9898 + s.sol * 78.233 + salt * 37.719) * 43758.5453; return x - Math.floor(x); }
export function scanCost(s: Sim) { const w = weatherNow(s), d = w === "dust" || w === "storm-flare"; return { energy: d ? 12 : 6, oxygen: d ? 8 : 4 }; }

// ---------- Exploration sites ----------
export interface Site { id: string; name: string; x: number; y: number; kind: "ice" | "layers" | "soil" | "dunes" | "meteorite" | "plain" | "weather" | "cave"; discovery: string; fact: string; lesson: string; reward: Partial<Record<"water" | "materials" | "food" | "energy" | "shield" | "lifeSupport", number>>; rewardText: string; hidden?: boolean }
export const SITES: Site[] = [
  { id: "ice", name: "Frosty crater", x: 330, y: 1250, kind: "ice", discovery: "Underground water ice", fact: "There's frozen water hiding under the dust!", lesson: "Mars has lots of ice underground, especially near the poles. Future colonies could drink it!", reward: { water: 30 }, rewardText: "+30 💧" },
  { id: "layers", name: "Striped cliffs", x: 1750, y: 2230, kind: "layers", discovery: "Layered rock formation", fact: "These stripes are layers of rock laid down over millions of years.", lesson: "Rock layers can form in ancient lakes. Mars may once have had rivers and lakes!", reward: { materials: 20 }, rewardText: "+20 🔩" },
  { id: "soil", name: "Rusty soil patch", x: 600, y: 1600, kind: "soil", discovery: "Martian soil sample", fact: "Mars soil is red because it's full of rusty iron!", lesson: "Martian soil has salts that are bad for plants, so we wash it before growing food.", reward: { food: 15 }, rewardText: "+15 🥕" },
  { id: "dunes", name: "Ripple dunes", x: 300, y: 2150, kind: "dunes", discovery: "Wind-blown dust dunes", fact: "Wind shaped these sand ripples into waves.", lesson: "Knowing how dust moves helps us build filters that keep life support clean.", reward: { lifeSupport: 20 }, rewardText: "+20% life support" },
  { id: "weather", name: "Windy ridge", x: 520, y: 520, kind: "weather", discovery: "Weather measurements", fact: "It's about −60°C here and the air is super thin!", lesson: "Mars air is 100 times thinner than Earth's. Measuring sunlight helps us plan solar power.", reward: { energy: 25 }, rewardText: "+25 ⚡" },
  { id: "meteorite", name: "Shiny meteorite", x: 3000, y: 2200, kind: "meteorite", discovery: "Iron meteorite", fact: "A space rock made of metal fell here!", lesson: "Iron meteorites are great building materials for a colony.", reward: { materials: 25 }, rewardText: "+25 🔩" },
  { id: "plain", name: "Flat plain", x: 1500, y: 560, kind: "plain", discovery: "Future outpost site", fact: "This flat, safe ground is perfect for building more habitats one day.", lesson: "Good outpost sites are flat, close to ice and sunny. We'll store more supplies thanks to this plan.", reward: { materials: 10, water: 10 }, rewardText: "+10 🔩 +10 💧" },
  { id: "cave", name: "Lava tube cave", x: 3050, y: 520, kind: "cave", discovery: "Lava tube cave", fact: "An old lava tunnel! Its rock roof blocks radiation.", lesson: "Caves could protect future astronauts from radiation. We copied the idea for our walls.", reward: { shield: 5 }, rewardText: "+5% shielding" },
  { id: "ice2", name: "Ice signal", x: 2950, y: 1650, kind: "ice", discovery: "Buried ice sheet", fact: "A huge sheet of buried ice — just like the signal said!", lesson: "Radar from orbit can find ice hidden under the ground.", reward: { water: 40 }, rewardText: "+40 💧", hidden: true },
];
export const visibleSites = (s: Sim) => SITES.filter((x) => !x.hidden || s.extraSites.includes(x.id));

// ---------- Random events with choices ----------
export type EventId = "malfunction" | "water" | "breakthrough" | "radiation" | "dustdevil" | "meteor";
export interface Choice { label: string; pro: string; con: string; apply: (s: Sim) => Sim | string }
export const EVENTS: Record<EventId, { title: string; icon: string; text: (s: Sim) => string; choices: (s: Sim) => Choice[] }> = {
  malfunction: { title: "Equipment malfunction", icon: "🔧", text: (s) => `The ${BREAK_NAMES[s.event?.target ?? "drill"]} has broken down!`,
    choices: () => [
      { label: "Fix it right now", pro: "Works again immediately", con: "−15 🔩 (rush job)", apply: (s) => s.materials < 15 ? "Not enough materials for a rush repair!" : { ...s, materials: s.materials - 15, broken: null } },
      { label: "Fix it later", pro: "Keep your materials", con: "Stays broken until you repair it at its building (10 🔩)", apply: (s) => ({ ...s, broken: s.event?.target ?? null }) },
    ] },
  water: { title: "Ice signal detected", icon: "💧", text: () => "Our radar spotted buried ice far east of the base!",
    choices: () => [
      { label: "Send the rover", pro: "+30 💧 right away", con: "−20 ⚡", apply: (s) => s.energy < 20 ? "The rover needs 20 energy!" : { ...s, energy: s.energy - 20, water: clamp(s.water + 30, 0, s.capacity) } },
      { label: "Explore it yourself", pro: "Bigger reward (+40 💧) and a discovery", con: "Long walk and suit oxygen to scan it", apply: (s) => ({ ...s, extraSites: [...s.extraSites, "ice2"] }) },
    ] },
  breakthrough: { title: "Scientific breakthrough", icon: "💡", text: () => "Scientists on Earth sent us a clever new idea!",
    choices: (s) => {
      const t = (Object.keys(TECHS) as TechId[]).find((x) => !s.research.includes(x));
      return [
        t ? { label: `Build ${TECHS[t].name}`, pro: `Free upgrade: ${TECHS[t].desc}`, con: "−10 ⚡ to set it up", apply: (x: Sim) => x.energy < 10 ? "Need 10 energy to set it up!" : { ...x, energy: x.energy - 10, research: [...x.research, t] } }
          : { label: "Improve all systems", pro: "+20% life support", con: "None", apply: (x: Sim) => ({ ...x, lifeSupport: clamp(x.lifeSupport + 20) }) },
        { label: "Trade the idea to Earth", pro: "+20 🔩 materials", con: "No upgrade", apply: (x: Sim) => ({ ...x, materials: x.materials + 20 }) },
      ];
    } },
  radiation: { title: "Radiation spike", icon: "☢️", text: () => "A sudden burst of solar radiation is hitting the base!",
    choices: (s) => [
      { label: "Everyone to the shelter", pro: "No extra radiation", con: "−10 ⚡ −5 🥕 (work stops)", apply: (x) => ({ ...x, energy: clamp(x.energy - 10), food: clamp(x.food - 5, 0, x.capacity) }) },
      { label: "Keep working", pro: "Lose nothing", con: `+${Math.round(40 * (1 - s.shield / 100))} radiation dose (better shields = less)`, apply: (x) => ({ ...x, exposure: clamp(x.exposure + 40 * (1 - x.shield / 100)) }) },
    ] },
  meteor: { title: "Meteor detected", icon: "☄️", text: (s) => `A small meteor is falling towards the ${BREAK_NAMES[s.event?.target ?? "drill"]}! Mars has thin air, so space rocks don't burn up like on Earth.`,
    choices: () => [
      { label: "Reinforce the base", pro: "Only a scratch (−3 🏠)", con: "−12 🔩 for extra plating", apply: (s) => s.materials < 12 ? "Reinforcing needs 12 materials!" : { ...s, materials: s.materials - 12, condition: clamp(s.condition - 3) } },
      { label: "Let it hit", pro: "Keep your materials", con: "−12 🏠 and the hit equipment breaks", apply: (s) => ({ ...s, condition: clamp(s.condition - 12), broken: s.event?.target ?? null }) },
    ] },
  dustdevil: { title: "Dust devil", icon: "🌪️", text: () => "A spinning dust devil is heading for the solar farm!",
    choices: () => [
      { label: "Fold the panels", pro: "Panels stay clean", con: "−10 ⚡ (no power while folded)", apply: (x) => ({ ...x, energy: clamp(x.energy - 10) }) },
      { label: "Let it pass", pro: "Free", con: "Panels get dusty (30% clean)", apply: (x) => ({ ...x, panels: Math.min(x.panels, 30) }) },
    ] },
};
export function resolveEvent(prev: Sim, i: number): { sim: Sim; msg: string } {
  if (!prev.event) return { sim: prev, msg: "" };
  const ev = EVENTS[prev.event.kind], c = ev.choices(prev)[i];
  if (!c) return { sim: prev, msg: "" };
  const r = c.apply({ ...prev, systems: { ...prev.systems } });
  if (typeof r === "string") return { sim: prev, msg: r };
  const n = { ...r, event: null, eventsHandled: prev.eventsHandled + 1 };
  addLog(n, "🗳️", `Decision: ${c.label} (${c.pro}; ${c.con})`);
  return { sim: n, msg: `${c.label}! ${c.pro}, but ${c.con.charAt(0).toLowerCase() + c.con.slice(1)}.` };
}

// ---------- Achievements ----------
export const ACHIEVEMENTS: { id: string; icon: string; title: string; done: (s: Sim) => boolean }[] = [
  { id: "harvest", icon: "🥕", title: "First harvest", done: (s) => s.foodMade >= 15 },
  { id: "discovery", icon: "🔍", title: "First discovery", done: (s) => s.discoveries.length >= 1 },
  { id: "lifesupport", icon: "🫧", title: "Stable life support", done: (s) => s.lifeSupport >= 95 },
  { id: "shield", icon: "🛡️", title: "Radiation protection upgrade", done: (s) => s.shield > 30 },
  { id: "scientist", icon: "🔬", title: "Lab scientist (study 3 discoveries)", done: (s) => s.reviewed.length >= 3 },
  { id: "crisis", icon: "🧭", title: "Crisis manager (handle 3 events)", done: (s) => s.eventsHandled >= 3 },
  { id: "storm", icon: "🌪️", title: "Storm survivor", done: (s) => s.sol >= 4 && s.condition >= 50 },
  { id: "flare", icon: "☢️", title: "Flare survivor", done: (s) => s.sol >= 6 && s.exposure < 60 },
  { id: "explorer", icon: "🗺️", title: "Mars explorer (8 discoveries)", done: (s) => s.discoveries.length >= 8 },
  { id: "hero", icon: "🏅", title: "Mars hero", done: (s) => s.status === "won" },
];
export function checkAchievements(s: Sim): { sim: Sim; unlocked: typeof ACHIEVEMENTS } {
  const unlocked = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.done(s));
  if (!unlocked.length) return { sim: s, unlocked };
  const n = { ...s, achievements: [...s.achievements, ...unlocked.map((a) => a.id)] };
  for (const a of unlocked) addLog(n, "⭐", `Achievement: ${a.title}`);
  return { sim: n, unlocked };
}

// ---------- Education + evaluation ----------
export const CAUSES: Record<string, { title: string; lesson: string }> = {
  oxygen: { title: "Oxygen ran out", lesson: "Mars air is mostly carbon dioxide — astronauts need machines and plants to make oxygen every day." },
  water: { title: "Water ran out", lesson: "Water is needed for drinking, plants AND making oxygen. Mars water is frozen underground, so we must drill for it." },
  food: { title: "Food ran out", lesson: "Food from Earth takes months to arrive. A greenhouse lets the crew grow their own." },
  radiation: { title: "Too much radiation", lesson: "Mars has no thick air or magnetic field to block space radiation. Shielding keeps astronauts safe." },
  energy: { title: "The power failed", lesson: "Every machine needs electricity. Without power, life support stops working." },
  lifesupport: { title: "Life support broke down", lesson: "Machines on Mars wear out. Regular repairs keep the crew alive." },
  storm: { title: "Storm damage", lesson: "Dust storms on Mars can last for weeks. Strong, repaired buildings survive them." },
};
export const WARNING_TIPS: Record<string, string> = {
  "Low oxygen": "Turn on the oxygen generator in the Dome or Habitat — we can't breathe Mars air!",
  "OUT OF OXYGEN!": "The base is getting damaged! Turn on the oxygen generator and fix life support now.",
  "Low water": "Switch on the Ice Drill. Water makes oxygen and grows food too.",
  "No water!": "The base is getting damaged! Run the Ice Drill — maybe turn off the greenhouse to save water.",
  "Low food": "Turn on the greenhouse. Plants need water and light to grow.",
  "No food!": "The base is getting damaged! Grow food in the greenhouse.",
  "Power shortage": "Turn off a machine or clean the solar panels. Without power, nothing works!",
  "High radiation dose": "Upgrade shielding at the Radiation Shelter. Thick walls block radiation.",
  "Base damaged": "Repair the base at the Habitat before it breaks down!",
  "Life support failing": "Fix life support in the Dome or Habitat with materials.",
};
export interface Rating { label: string; icon: string; value: string; stars: number; note: string }
export function report(s: Sim) {
  const r = Math.round;
  const solsSurvived = s.status === "won" ? MAX_SOL : Math.max(0, s.sol - 1) + s.time / DAY_SECONDS;
  const supplies = (s.oxygen + s.water + s.food) / 3;
  const star = (v: number, a: number, b: number) => (v >= b ? 3 : v >= a ? 2 : 1);
  const ratings: Rating[] = [
    { label: "Radiation protection", icon: "🛡️", value: `Shield ${r(s.shield)}% · highest dose ${r(s.peakExposure)}`, stars: s.peakExposure < 40 ? 3 : s.peakExposure < 75 ? 2 : 1, note: s.peakExposure < 40 ? "The crew stayed safe from radiation." : "Radiation got high — upgrade shields before flares." },
    { label: "Energy management", icon: "⚡", value: `${r(s.solarMade)} made · ${r(s.energyUsed)} used · ${r(s.powerOut)}s blackout`, stars: s.powerOut < 5 ? 3 : s.powerOut < 40 ? 2 : 1, note: s.powerOut < 5 ? "The lights never went out!" : "Power ran out sometimes — clean panels and switch off machines you don't need." },
    { label: "Food production", icon: "🥕", value: `${r(s.foodMade)} food grown · ${r(s.food)} left`, stars: star(s.foodMade, 40, 100), note: s.foodMade >= 40 ? "The greenhouse fed the crew well." : "Grow more food — the greenhouse is your farm on Mars." },
    { label: "Water production", icon: "💧", value: `${r(s.waterMade)} water drilled · ${r(s.water)} left`, stars: star(s.waterMade, 40, 120), note: s.waterMade >= 40 ? "Great ice drilling!" : "Use the Ice Drill more — water is used for everything." },
    { label: "Life support", icon: "🫧", value: `Oxygen ${r(s.oxygen)} · life support ${r(s.lifeSupport)}%`, stars: star(s.oxygen + s.lifeSupport, 80, 140), note: s.oxygen > 40 ? "The crew could breathe easy." : "Keep the oxygen generator running and repaired." },
    { label: "Science", icon: "🔬", value: `${s.discoveries.length} discoveries · ${s.research.length} upgrades`, stars: star(s.discoveries.length + s.research.length, 4, 8), note: s.discoveries.length >= 3 ? "A true Mars scientist!" : "Explore beyond the base to make discoveries." },
  ];
  const total = ratings.reduce((a, x) => a + x.stars, 0) + (s.status === "won" ? 3 : 0) + Math.floor(s.objective / 3);
  const grade = s.status !== "won" ? (total >= 12 ? "Brave try" : "Training mission") : supplies >= 40 && s.condition >= 60 && s.objective >= 7 ? "Sustainable outpost ⭐⭐⭐" : s.condition >= 40 && s.objective >= 4 ? "Working outpost ⭐⭐" : "Survived, just barely ⭐";
  const strengths = ratings.filter((x) => x.stars === 3).map((x) => `${x.icon} ${x.note}`);
  const improve = ratings.filter((x) => x.stars === 1).map((x) => `${x.icon} ${x.note}`);
  const worst = Object.entries(s.damage).sort((a, b) => b[1] - a[1])[0]?.[0];
  const cause = s.status === "lost" && worst ? CAUSES[worst] : undefined;
  const decisions = s.log.filter((l) => l.icon === "🗳️").map((l) => l.text.replace("Decision: ", ""));
  return { solsSurvived, ratings, grade, strengths, improve, cause, decisions, supplies };
}


// ---------- Dynamic storms (random, on clear Sols only, seeded so they are fair) ----------
export interface Storm { kind: "dust" | "radiation"; start: number; end: number }
export const STORM_WARNING = 10;
export function stormOf(s: Sim): Storm | null {
  if (s.sol < 2 || eventOf(s) !== "clear" || rnd(s, 7) > 0.6) return null;
  const start = 15 + rnd(s, 9) * 35;
  return { kind: rnd(s, 8) < 0.5 ? "dust" : "radiation", start, end: start + 15 + rnd(s, 10) * 20 };
}
export function stormPhase(s: Sim): "approaching" | "active" | null {
  const st = stormOf(s); if (!st || s.status !== "day") return null;
  if (s.time >= st.start && s.time < st.end) return "active";
  if (s.time >= st.start - STORM_WARNING && s.time < st.start) return "approaching";
  return null;
}
/** Weather right now: the Sol's scheduled weather plus any passing storm. */
export function weatherNow(s: Sim): EventKind {
  const ev = eventOf(s); if (ev !== "clear") return ev;
  const st = stormOf(s);
  return st && stormPhase(s) === "active" ? (st.kind === "dust" ? "dust" : "flare") : "clear";
}

// ---------- Priorities: what needs attention first ----------
export type Level = 1 | 2 | 3 | 4;
export const LEVEL_NAMES: Record<Level, string> = { 1: "CRITICAL", 2: "HIGH", 3: "MEDIUM", 4: "TASK" };
export interface Priority { id: string; level: Level; score: number; icon: string; title: string; guide: string; why: string; action: string; station: string | null }
export function priorities(s: Sim): Priority[] {
  const p: Priority[] = [], w = weatherNow(s);
  const add = (x: Priority) => p.push(x);
  const radStorm = w === "flare" || w === "storm-flare", dusty = w === "dust" || w === "storm-flare";
  if (s.oxygen < 25) add({ id: "oxygen", level: s.oxygen <= 10 ? 1 : 2, score: 100 - s.oxygen, icon: "🫧", title: s.oxygen <= 0 ? "Out of oxygen!" : "Low oxygen", guide: "Check your life-support system!", why: "The crew can't breathe Mars air. No oxygen damages the base fastest.", action: "Turn on the oxygen generator or fix life support in the Command Dome.", station: "dome" });
  if (s.exposure >= 80 || (radStorm && s.shield < 60 && s.exposure > 45)) add({ id: "radiation", level: 1, score: 50 + s.exposure, icon: "☢️", title: "Dangerous radiation", guide: "Improve your radiation protection!", why: "At 100 dose the base takes radiation damage.", action: "Upgrade shielding at the Radiation Shelter.", station: "shelter" });
  else if (radStorm && s.shield < 60) add({ id: "radiation", level: 2, score: 60 - s.shield, icon: "☢️", title: "Radiation storm", guide: "Improve your radiation protection!", why: "Radiation is 5x stronger right now and our shields are thin.", action: "Upgrade shielding at the Radiation Shelter.", station: "shelter" });
  else if (s.exposure > 60) add({ id: "radiation", level: 2, score: s.exposure - 40, icon: "☢️", title: "High radiation dose", guide: "Improve your radiation protection!", why: "Radiation keeps building up in the crew.", action: "Upgrade shielding at the Radiation Shelter.", station: "shelter" });
  if (s.condition < 35) add({ id: "base", level: s.condition < 20 ? 1 : 2, score: 100 - s.condition, icon: "🏠", title: "Base badly damaged", guide: "Repair the base!", why: "If base condition reaches 0, the mission fails.", action: "Repair the base at the Habitat.", station: "hab" });
  if (s.broken) add({ id: "broken", level: s.broken === "oxygen" ? 1 : 2, score: 40, icon: "🔧", title: `${BREAK_NAMES[s.broken]} broken`, guide: "Equipment needs repair!", why: s.broken === "panels" ? "Broken wiring halves our solar power." : "This machine has stopped working.", action: `Repair it for 10 🔩 at the ${s.broken === "oxygen" ? "Command Dome" : s.broken === "panels" ? "Solar Farm" : s.broken === "drill" ? "Ice Drill" : "Greenhouse"}.`, station: BREAK_STATION[s.broken] });
  if (s.energy < 15) add({ id: "energy", level: 2, score: 60 - s.energy * 2, icon: "⚡", title: "Low energy", guide: "Restore your energy supply!", why: "Without power the oxygen generator, greenhouse and drill stop.", action: "Clean the solar panels or switch off machines you don't need.", station: "solar" });
  else if (dusty && s.panels < 60) add({ id: "energy", level: 3, score: 60 - s.panels, icon: "🌪️", title: "Dusty solar panels", guide: "Restore your energy supply!", why: "Dust blocks sunlight, so the panels make less power.", action: "Clean the solar panels (5 💧).", station: "solar" });
  if (s.water < 20) add({ id: "water", level: 2, score: 50 - s.water * 2, icon: "💧", title: "Low water", guide: "Collect more water!", why: "Water is needed to drink, make oxygen and grow food.", action: "Switch on the Ice Drill.", station: "drill" });
  if (s.food < 20) add({ id: "food", level: 2, score: 45 - s.food * 2, icon: "🥕", title: "Low food", guide: "Restore food production!", why: "The crew needs food every Sol.", action: "Turn on the Greenhouse.", station: "greenhouse" });
  if (s.lifeSupport < 30) add({ id: "lifesupport", level: 2, score: 30 - s.lifeSupport, icon: "🫧", title: "Life support failing", guide: "Check your life-support system!", why: "Worn-out life support makes less oxygen.", action: "Fix life support (10 🔩) in the Command Dome.", station: "dome" });
  const goal = OBJECTIVES[s.objective];
  if (goal) add({ id: `obj-${s.objective}`, level: 4, score: 1, icon: "🎯", title: goal.title, guide: goal.title, why: "Mission objectives earn 10 bonus materials.", action: goal.hint, station: goal.station ?? null });
  if (s.discoveries.some((d) => !s.reviewed.includes(d))) add({ id: "review", level: 4, score: 0, icon: "🔬", title: "Study your discovery", guide: "Study it at the Research Lab", why: "Discoveries give the colony useful rewards.", action: "Open the Research Lab and study it.", station: "lab" });
  return p.sort((a, b) => a.level - b.level || b.score - a.score);
}
/** Choose the one problem to guide toward; keep the current one unless something more urgent appears. */
export function pickPrimary(list: Priority[], prevId: string | null): Priority | null {
  const top = list[0]; if (!top) return null;
  const prev = prevId ? list.find((x) => x.id === prevId) : undefined;
  return prev && prev.level === top.level ? prev : top;
}

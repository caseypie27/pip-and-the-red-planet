import { useEffect, useRef, useState } from "react";
import { GameCanvas, type InputState } from "./GameCanvas";
import { Joystick } from "./Joystick";
import { PipPortrait } from "./Pip";
import { CharacterSelect } from "./CharacterSelect";
import { BUILDINGS, LANDMARKS } from "@/game/world";
import { loadCharacter, loadSim, resetGame, saveCharacter, saveSim } from "@/game/storage";
import { beep, play, soundForAction, unlockAudio, getSettings, setSettings, type AudioSettings } from "@/game/sound";
import { newFx, type Nav } from "@/game/fx";
import { report, ACHIEVEMENTS, BREAK_NAMES, checkAchievements, EVENTS, resolveEvent, SITES, visibleSites, checkObjective, infoFor, OBJECTIVES, act, actionsFor, DAY_SECONDS, EVENT_INFO, eventOf, MAX_SOL, newSim, nextSol, SOL_EVENTS, tick, type Sim, priorities, pickPrimary, LEVEL_NAMES, stormPhase, stormOf, weatherNow, BREAK_STATION, type Priority } from "@/game/sim";
import type { Character, Landmark } from "@/game/types";

const WELCOME = "Welcome to Mars, astronaut! I'm PIP, your colony buddy. Let's explore our new home!";
const STATION_NAMES: Record<string, string> = { solar: "Solar Farm", dome: "Command Dome · Life Support", greenhouse: "Greenhouse", drill: "Ice Drill", lab: "Research Lab · Science", hab: "Habitat · Living Conditions", rover: "Rover", shelter: "Radiation Shelter", storage: "Storage Depot" };
const STATION_ICON: Record<string, string> = { solar: "☀️", dome: "🫧", greenhouse: "🌱", drill: "💧", lab: "🔬", hab: "🏠", rover: "🚙", shelter: "🛡️", storage: "📦" };

function nearestStation(x: number, y: number, s: Sim): string | null {
  for (const site of visibleSites(s)) if (!s.discoveries.includes(site.id) && Math.hypot(x - site.x, y - site.y) < 120) return `site:${site.id}`;
  for (const b of BUILDINGS) {
    if (b.kind === "lander" || b.kind === "antenna") continue;
    if (Math.hypot(x - (b.x + b.w / 2), y - (b.y + b.h / 2)) < Math.max(b.w, b.h) / 2 + 90) return b.kind;
  }
  return null;
}

function stationPoint(st: string): { x: number; y: number; top: number } | null {
  if (st.startsWith("site:")) { const site = SITES.find((x) => x.id === st.slice(5)); return site ? { x: site.x, y: site.y, top: site.y - 110 } : null; }
  const b = BUILDINGS.find((x) => x.kind === st); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, top: b.y - 20 } : null;
}

/** Point for guidance; for the Solar Farm pick whichever panel field is closer. */
function targetPoint(st: string, from: { x: number; y: number }) {
  if (st !== "solar") return stationPoint(st);
  const b = BUILDINGS.filter((x) => x.kind === "solar").sort((a, c) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(c.x - from.x, c.y - from.y))[0];
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, top: b.y - 20 } : null;
}

function hitStation(x: number, y: number, st: string): boolean {
  if (st.startsWith("site:")) { const p = stationPoint(st); return !!p && Math.hypot(x - p.x, y - p.y) < 80; }
  return BUILDINGS.some((b) => b.kind === st && x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 40 && y < b.y + b.h + 20);
}

function FacilityButton({ station, view, label, onOpen }: { station: string; view: React.MutableRefObject<{ cx: number; cy: number; zoom: number }>; label: React.ReactNode; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const p = stationPoint(station), el = ref.current, v = view.current;
      if (p && el) {
        const vw = window.innerWidth, vh = window.innerHeight;
        const sx = vw / 2 + (p.x - v.cx) * v.zoom, sy = vh / 2 + (p.top - v.cy) * v.zoom;
        const w = el.offsetWidth, h = el.offsetHeight;
        const x = Math.max(8, Math.min(vw - w - 8, sx - w / 2));
        const y = Math.max(vh * 0.28, Math.min(vh - h - 150, sy - h));
        el.style.transform = `translate(${x}px, ${y}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [station, view]);
  return (
    <button ref={ref} onClick={onOpen} className="hud-panel start-btn pointer-events-auto absolute left-0 top-0 z-10 flex items-center gap-2 rounded-2xl px-5 py-3 text-base font-bold sm:text-lg" style={{ transform: "translate(-9999px,0)" }}>
      {label}
    </button>
  );
}

export function MarsGame() {
  const [ready, setReady] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sim, setSim] = useState<Sim>(newSim);
  const [pip, setPip] = useState(WELCOME);
  const [found, setFound] = useState<string[]>([]);
  const [station, setStation] = useState<string | null>(null);
  const [banner, setBanner] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [flash, setFlash] = useState<{ id: number; ok: boolean } | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const input = useRef<InputState>({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const simRef = useRef(sim);
  const toastRef = useRef(0);
  const markers = useRef<{ x: number; y: number }[]>([]);
  const speed = useRef(1);
  const view = useRef({ cx: 0, cy: 0, zoom: 1 });
  const toastN = useRef(0);
  const [briefing, setBriefing] = useState(false);
  const briefRef = useRef(false);
  briefRef.current = briefing;
  const fx = useRef(newFx());
  const nav = useRef<Nav | null>(null);
  const primaryRef = useRef<string | null>(null);
  const meteorN = useRef(0);
  const [primary, setPrimary] = useState<Priority | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audio, setAudio] = useState<AudioSettings>(getSettings);
  const updAudio = (p: Partial<AudioSettings>) => { setSettings(p); setAudio(getSettings()); };
  useEffect(() => { unlockAudio(); }, []);
  const [logOpen, setLogOpen] = useState<"" | "log" | "ach">("");
  simRef.current = sim;

  useEffect(() => { const c = loadCharacter(); setCharacter(c); setPlaying(!!c); const ls = loadSim() ?? newSim(); toastRef.current = ls.objective; setSim(ls); setReady(true); }, []);

  // Simulation clock + station proximity
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), saved = 0;
    const id = setInterval(() => {
      const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
      const prev = simRef.current, next = briefRef.current ? prev : reward(tick(prev, dt));
      if (next !== prev) {
        simRef.current = next; setSim(next);
        if (next.status !== prev.status) {
          play(next.status === "won" ? "win" : next.status === "lost" ? "lose" : "milestone");
          if (next.status === "summary") setPip(`Sol ${next.sol} is over! Check our supplies and get ready for tomorrow.`);
          if (next.status === "won") setPip("We survived 10 Sols on Mars! You're a true Mars Base Buddy!");
          if (next.status === "lost") setPip(`Oh no! ${report(next).cause?.title ?? "The base broke down"}. Let's learn from it and try again!`);
        }
        const ph = stormPhase(next), pph = stormPhase(prev), st = stormOf(next);
        if (st && ph !== pph) {
          const dust = st.kind === "dust";
          if (ph === "approaching") { play(dust ? "dust" : "radiation"); setToast({ id: ++toastN.current, text: dust ? "🌪️ Dust storm approaching!" : "☢️ Radiation storm detected!" }); setPip(dust ? "A dust storm is coming! Solar power will drop — save energy and clean the panels after." : "A radiation storm is coming! Our shielding will protect the crew — upgrade it at the Radiation Shelter."); }
          if (ph === "active") { play(dust ? "dust" : "radiation", "storm-on"); setPip(dust ? "🌪️ The dust storm is here! Less sunlight means less solar power." : "☢️ Radiation storm! Radiation is 5x stronger right now."); }
          if (!ph && pph === "active") setPip("The storm has passed. Conditions are back to normal!");
        }
        if ((saved += dt) > 3 || next.status !== prev.status) { saved = 0; saveSim(next); }
      }
      const cur = simRef.current, e = eventOf(cur);
      markers.current = visibleSites(cur).filter((x) => !cur.discoveries.includes(x.id));
      const wn = weatherNow(cur);
      speed.current = cur.status === "day" && (wn === "dust" || wn === "storm-flare") ? 0.65 : 1;
      void e;
      // Priorities drive the alert sound, PIP warning and the one guidance arrow
      const list = cur.status === "day" && !briefRef.current ? priorities(cur) : [];
      const top = pickPrimary(list, primaryRef.current);
      if ((top?.id ?? null) !== primaryRef.current) {
        primaryRef.current = top?.id ?? null; setPrimary(top);
        if (top && top.level <= 2) { play(top.level === 1 ? "critical" : "alert", top.id); setPip(`⚠️ ${top.title}! ${top.action}`); }
        else if (top && top.level === 4 && top.id.startsWith("obj-")) play("objective");
      } else if (top) setPrimary(top);
      const bp = cur.broken ? stationPoint(BREAK_STATION[cur.broken]) : null;
      fx.current.weather = cur.status === "day" ? wn : "clear";
      fx.current.approaching = stormPhase(cur) === "approaching" ? stormOf(cur)!.kind : null;
      fx.current.broken = bp ? { x: bp.x, y: bp.y } : null;
      if (cur.event?.kind === "meteor" && !fx.current.meteor) { const mp = stationPoint(BREAK_STATION[cur.event.target ?? "drill"]); if (mp) fx.current.meteor = { id: ++meteorN.current, x: mp.x, y: mp.y, impact: false }; }
      const tp = top?.station ? targetPoint(top.station, pos.current) : null;
      const nearT = top?.station && nearestStation(pos.current.x, pos.current.y, cur) === top.station;
      nav.current = getSettings().nav && tp && top && !nearT && !cur.event ? { x: tp.x, y: tp.top + 20, label: `${top.icon} ${top.guide}`, level: top.level } : null;
      if (next.event && !prev.event) { play(next.event.kind === "meteor" ? "meteor" : next.event.kind === "malfunction" ? "malfunction" : "alert", "event"); setPip(`${EVENTS[next.event.kind].icon} ${EVENTS[next.event.kind].title}! We need to decide what to do.`); }
      const st = nearestStation(pos.current.x, pos.current.y, cur);
      setStation((o) => { if (o !== st) setOpen(false); return st; });
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  function reward(s: Sim): Sim {
    const r = checkObjective(s);
    if (r.done && r.sim.objective > toastRef.current) { toastRef.current = r.sim.objective; play("goal"); setToast({ id: ++toastN.current, text: `🏆 Objective complete: ${r.done.title}! +10 🔩` }); setPip(`Great job! "${r.done.title}" done. Here are 10 bonus materials!`); }
    const a = checkAchievements(r.sim);
    for (const x of a.unlocked) { beep("goal"); setToast({ id: ++toastN.current, text: `⭐ Achievement unlocked: ${x.icon} ${x.title}` }); }
    return a.sim;
  }
  const choose = (i: number) => {
    const r = resolveEvent(simRef.current, i), ok = r.sim !== simRef.current;
    const wasMeteor = simRef.current.event?.kind === "meteor";
    play(ok ? "ok" : "fail"); if (r.msg) setPip(ok ? r.msg : `❌ ${r.msg}`);
    if (ok && wasMeteor && fx.current.meteor) { fx.current.meteor.impact = true; const m = fx.current.meteor; setTimeout(() => { if (fx.current.meteor === m) fx.current.meteor = null; }, 2500); }
    if (ok) { const n = reward(r.sim); simRef.current = n; setSim(n); saveSim(n); }
  };
  const doAction = (aid: string) => {
    const r = act(simRef.current, aid), ok = r.sim !== simRef.current;
    play(ok ? soundForAction(aid) : "fail"); setFlash({ id: Date.now(), ok });
    const n = reward(r.sim); simRef.current = n; setSim(n); saveSim(n); if (r.msg) setPip(ok ? r.msg : `❌ ${r.msg}`);
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase();
      if (simRef.current.event && /^[12]$/.test(k)) { choose(Number(k) - 1); return; }
      if (!station) return;
      if (k === "escape") setOpen(false);
      else if (open && /^[1-9]$/.test(k)) { const a = actionsFor(station, simRef.current)[Number(k) - 1]; if (a) doAction(a.id); } };
    window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
  }, [station, open]);

  if (!ready) return <div className="space-bg fixed inset-0" />;
  if (!playing || !character)
    return <CharacterSelect initial={character} onStart={(c) => { saveCharacter(c); const s = newSim(); toastRef.current = 0; saveSim(s); setSim(s); setCharacter(c); setFound([]); setPip(WELCOME); setBriefing(true); setPlaying(true); }} />;

  const onDiscover = (l: Landmark) => setFound((f) => { const n = [...f, l.id]; setPip(`${l.name}: ${l.pip}`); return n; });
  const ev = eventOf(sim), info = EVENT_INFO[ev];
  const alertList = sim.status === "day" ? priorities(sim) : [];
  const urgent = alertList.filter((x) => x.level <= 3);
  const beginSol = () => { const s = nextSol(sim); setSim(s); saveSim(s); setBanner((b) => b + 1); const i = EVENT_INFO[eventOf(s)]; setPip(`Sol ${s.sol}: ${i.label}! ${i.tip}`); };
  const goal = OBJECTIVES[sim.objective];
  const restart = () => { const s = newSim(); toastRef.current = 0; setBriefing(true); setSim(s); saveSim(s); setPip(WELCOME); setBanner((b) => b + 1); };
  const res = [
    { name: "Oxygen", icon: "🫧", value: (sim.oxygen / sim.capacity) * 100, raw: sim.oxygen, cls: "bg-res-oxygen", low: 25 },
    { name: "Water", icon: "💧", value: (sim.water / sim.capacity) * 100, raw: sim.water, cls: "bg-res-water", low: 20 },
    { name: "Food", icon: "🥕", value: (sim.food / sim.capacity) * 100, raw: sim.food, cls: "bg-res-food", low: 20 },
    { name: "Energy", icon: "⚡", value: sim.energy, cls: "bg-res-energy", low: 15 },
    { name: "Shield", icon: "🛡️", value: sim.shield, cls: "bg-res-shield", low: -1 },
    { name: "Base", icon: "🏠", value: sim.condition, cls: "bg-res-condition", low: 35 },
  ];
  const resBar = (
    <>
      {res.map((r) => <Res key={r.name} {...r} />)}
      <div className={`flex items-center gap-1 text-xs font-bold ${sim.exposure > 60 ? "text-destructive animate-pulse" : ""}`} title="Radiation dose (lower is better)">☢️ {Math.round(sim.exposure)}</div>
      <div className="flex items-center gap-1 text-xs font-bold" title="Building materials">🔩 {sim.materials}</div>
    </>
  );
  const actions = station ? actionsFor(station, sim) : [];
  const site = station?.startsWith("site:") ? SITES.find((x) => x.id === station.slice(5)) : undefined;
  const stName = site ? `${site.name} · Exploration site` : station ? STATION_NAMES[station] : "";
  const stIcon = site ? "🔍" : station ? STATION_ICON[station] : "";
  const evDef = sim.event ? EVENTS[sim.event.kind] : null;
  const off = sim.unpowered.length > 0;

  return (
    <div className="game-root fixed inset-0 overflow-hidden">
      <GameCanvas character={character} input={input} onDiscover={onDiscover} posRef={pos} markersRef={markers} speedRef={speed} viewRef={view} fxRef={fx} navRef={nav} onWorldClick={(x, y) => { if (station && !open && !sim.event && !briefing && hitStation(x, y, station)) { beep("open"); setOpen(true); } }} />
      <div className="pointer-events-none absolute inset-0 p-2 text-hud-fg sm:p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="hud-panel pointer-events-auto rounded-2xl px-3 py-2">
            <div className="font-display text-base font-bold leading-tight sm:text-xl">🪐 Mars Base Buddies</div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="whitespace-nowrap rounded-full bg-primary px-2 font-bold text-primary-foreground">SOL {sim.sol}/{MAX_SOL}</span>
              <span className="whitespace-nowrap" title={info.tip}>{info.icon} {info.label}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-hud-ink/60" title="Time of day"><div className="h-full bg-accent" style={{ width: `${(sim.time / DAY_SECONDS) * 100}%` }} /></div>
            <button onClick={() => { resetGame(); setPlaying(false); }} className="mt-1 text-xs underline decoration-dotted hover:text-accent">Restart / switch astronaut</button>
            <div className="mt-1 flex gap-1">
              <button onClick={() => setLogOpen((v) => (v === "log" ? "" : "log"))} className="rounded-lg bg-hud-ink/50 px-2 py-0.5 text-xs font-bold hover:bg-hud-ink">📜 Log</button>
              <button onClick={() => setSettingsOpen((v) => !v)} aria-label="Sound and guidance settings" className="rounded-lg bg-hud-ink/50 px-2 py-0.5 text-xs font-bold hover:bg-hud-ink">{audio.muted ? "🔇" : "🔊"}</button>
              <button onClick={() => setLogOpen((v) => (v === "ach" ? "" : "ach"))} className="rounded-lg bg-hud-ink/50 px-2 py-0.5 text-xs font-bold hover:bg-hud-ink">⭐ {sim.achievements.length}/{ACHIEVEMENTS.length}</button>
            </div>
            {settingsOpen && (
              <div className="mt-1 w-56 space-y-1 text-xs">
                <label className="flex items-center justify-between gap-2">🔇 Mute all <input type="checkbox" checked={audio.muted} onChange={(e) => updAudio({ muted: e.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2">🎵 Sound effects <input type="checkbox" checked={audio.sfx} onChange={(e) => updAudio({ sfx: e.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2">🚨 Alert sounds <input type="checkbox" checked={audio.alerts} onChange={(e) => updAudio({ alerts: e.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2">🔉 Volume <input type="range" min={0} max={1} step={0.1} value={audio.volume} onChange={(e) => updAudio({ volume: Number(e.target.value) })} className="w-24" /></label>
                <label className="flex items-center justify-between gap-2">🧭 Guide arrows <input type="checkbox" checked={audio.nav} onChange={(e) => updAudio({ nav: e.target.checked })} /></label>
              </div>
            )}
            {logOpen === "log" && <ul className="mt-1 max-h-[40vh] w-64 space-y-0.5 overflow-y-auto pr-1 text-xs">{sim.log.map((l, i) => <li key={i}><span className="text-hud-muted">S{l.sol}</span> {l.icon} {l.text}</li>)}</ul>}
            {logOpen === "ach" && <ul className="mt-1 max-h-[40vh] w-64 space-y-0.5 overflow-y-auto text-xs">{ACHIEVEMENTS.map((a) => { const got = sim.achievements.includes(a.id); return <li key={a.id} className={got ? "font-bold text-accent" : "text-hud-muted"}>{got ? a.icon : "🔒"} {a.title}</li>; })}</ul>}
          </div>
          <div className="hud-panel order-last hidden flex-wrap items-center gap-3 rounded-2xl px-3 py-2 lg:flex lg:order-none">{resBar}</div>
          <div className="hud-panel w-[min(48vw,26rem)] shrink-0 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 md:w-[26rem] lg:w-[min(26rem,30vw)] xl:w-[28rem]">
            <div className="text-[11px] font-bold uppercase tracking-widest text-accent sm:text-xs">🎯 Mission</div>
            <button onClick={() => setShowGoals((v) => !v)} className="pointer-events-auto mt-1 block w-full text-left">
              <div className="font-display text-base font-bold leading-snug sm:text-lg md:text-xl">{goal ? goal.title : "All objectives complete! 🏆"}</div>
              {goal && <div className="mt-1 text-xs leading-snug text-hud-muted sm:text-sm">{goal.hint}</div>}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-hud-ink/60"><div className="h-full bg-res-food transition-all" style={{ width: `${(sim.objective / OBJECTIVES.length) * 100}%` }} /></div>
              <div className="mt-1.5 text-xs text-hud-muted sm:text-sm">Objectives {sim.objective}/{OBJECTIVES.length} · Places {found.length}/{LANDMARKS.length} · 🔍 {sim.discoveries.length} <span className="underline">{showGoals ? "hide" : "list"}</span></div>
            </button>
            {showGoals && <ol className="mt-2 max-h-[40vh] space-y-1 overflow-y-auto border-t border-hud-fg/15 pt-2 text-xs sm:text-sm">{OBJECTIVES.map((o, i) => <li key={o.title} className={i < sim.objective ? "text-res-food" : i === sim.objective ? "font-bold" : "text-hud-muted"}>{i < sim.objective ? "✅" : i === sim.objective ? "▶️" : "🔒"} {o.title}</li>)}</ol>}
            {sim.broken && <div className="mt-2 text-xs sm:text-sm font-bold text-destructive">🔧 Broken: {BREAK_NAMES[sim.broken]}</div>}
            {off && <div className="mt-2 text-xs sm:text-sm font-bold text-destructive">⚡ No power: {sim.unpowered.join(", ")}</div>}
          </div>
        </div>
        <div className="hud-panel mx-auto mt-2 flex w-fit max-w-full flex-wrap justify-center gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 lg:hidden">{resBar}</div>
        {sim.status === "day" && !briefing && (primary || alertList.length > 0) && (
          <div className="mx-auto mt-2 w-fit max-w-[min(94vw,30rem)]">
            {primary && (
              <button onClick={() => setAlertsOpen((v) => !v)} className={`pointer-events-auto flex w-full items-center gap-2 rounded-full px-3 py-1 text-left text-xs font-bold sm:text-sm ${primary.level === 1 ? "animate-pulse bg-destructive text-destructive-foreground" : primary.level === 2 ? "bg-primary text-primary-foreground" : "hud-panel"}`}>
                <span className="rounded-full bg-hud-ink/40 px-1.5 text-[10px] text-hud-fg">{LEVEL_NAMES[primary.level]}</span>
                <span className="truncate">{primary.icon} {primary.level === 4 ? `Next: ${primary.title}` : primary.guide}</span>
                <span className="ml-auto whitespace-nowrap text-[11px] underline">{urgent.length > 1 ? `+${urgent.length - 1} more` : "details"}</span>
              </button>
            )}
            {alertsOpen && (
              <ul className="hud-panel pointer-events-auto mt-1 max-h-[40dvh] space-y-1.5 overflow-y-auto rounded-2xl p-2 text-xs">
                {alertList.map((a) => (
                  <li key={a.id} className={`rounded-lg bg-hud-ink/40 px-2 py-1 ${a.id === primary?.id ? "ring-2 ring-accent" : ""}`}>
                    <div className="font-bold"><span className={a.level === 1 ? "text-destructive" : a.level === 2 ? "text-primary" : "text-accent"}>{LEVEL_NAMES[a.level]}</span> {a.icon} {a.title}</div>
                    <div className="text-hud-muted">Why: {a.why}</div>
                    <div>👉 {a.action}{a.station ? ` (${STATION_NAMES[a.station]?.split(" · ")[0] ?? a.station})` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {sim.status === "day" && banner > 0 && (
          <div key={banner} className="sol-banner absolute inset-x-0 top-1/3 text-center">
            <div className="font-display text-4xl font-bold drop-shadow-lg sm:text-6xl">SOL {sim.sol}</div>
            <div className="text-lg font-bold">{info.icon} {info.label}</div>
          </div>
        )}

        {briefing && sim.status === "day" && (
          <div className="event-pop hud-panel pointer-events-auto absolute left-1/2 top-1/2 max-h-[85dvh] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-4">
            <div className="text-center text-[10px] font-bold uppercase tracking-widest text-accent">Junior Astronaut Mission Briefing</div>
            <div className="text-center font-display text-2xl font-bold">Build a home on Mars 🚀</div>
            <p className="mt-1 text-center text-sm">Keep your crew alive for <b>10 Sols</b> (Martian days). Every machine is connected — choose wisely!</p>
            <ul className="mt-2 space-y-1 text-xs sm:text-sm">
              <li>🫧 <b>Oxygen</b> — Mars air can't be breathed. The generator makes oxygen from water + energy.</li>
              <li>💧 <b>Water</b> — frozen underground. The Ice Drill digs it up using energy.</li>
              <li>🥕 <b>Food</b> — the Greenhouse grows it with water + energy.</li>
              <li>⚡ <b>Energy</b> — solar panels. Less sun in dust storms and when panels are dusty!</li>
              <li>🛡️ <b>Shielding</b> — blocks space radiation. Upgrade it before solar flares.</li>
              <li>🏠 <b>Base</b> — shortages slowly damage the base. If it reaches 0, the mission fails.</li>
              <li>🔍 <b>Explore</b> blue <b>?</b> sites for discoveries, then study them at the Research Lab.</li>
            </ul>
            <p className="mt-2 text-center text-xs text-hud-muted">Walk up to a building, then click its button or the building itself to use it.</p>
            <div className="text-center"><button onClick={() => { beep("goal"); setBriefing(false); setBanner((b) => b + 1); }} className="start-btn mt-3 rounded-xl px-6 py-2 font-bold">Start mission!</button></div>
          </div>
        )}
        {sim.status !== "day" && (
          <div className={`hud-panel pointer-events-auto absolute left-1/2 top-1/2 max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-4 text-center ${sim.status === "summary" ? "w-[min(92vw,360px)]" : "event-pop w-[min(94vw,560px)]"}`}>
            {sim.status === "summary" && <>
              <div className="font-display text-2xl font-bold">Sol {sim.sol} complete! 🌙</div>
              <p className="mt-1 text-sm text-hud-muted">Time is paused. Walk to buildings to switch systems, repair or upgrade before tomorrow.</p>
              <div className="mt-3 rounded-xl bg-hud-ink/40 p-2 text-sm"><b>Tomorrow: {EVENT_INFO[SOL_EVENTS[sim.sol] ?? "clear"].icon} {EVENT_INFO[SOL_EVENTS[sim.sol] ?? "clear"].label}</b><div className="text-xs">{EVENT_INFO[SOL_EVENTS[sim.sol] ?? "clear"].tip}</div></div>
              <button onClick={beginSol} className="start-btn mt-3 rounded-xl px-5 py-2 font-bold">Begin Sol {sim.sol + 1}</button>
            </>}
            {sim.status !== "summary" && <MissionReport sim={sim} onRestart={restart} />}
          </div>
        )}

        {evDef && sim.event && sim.status === "day" && (
          <div className="event-pop hud-panel pointer-events-auto absolute left-1/2 top-1/2 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-3 text-center">
            <div className="text-4xl">{evDef.icon}</div>
            <div className="font-display text-xl font-bold">{evDef.title}</div>
            <p className="text-sm">{evDef.text(sim)}</p>
            <p className="mt-0.5 text-[11px] text-hud-muted">Time is paused. Choose wisely:</p>
            {evDef.choices(sim).map((c, i) => (
              <button key={c.label} onClick={() => choose(i)} className="mt-2 block w-full rounded-xl bg-primary px-3 py-2 text-left text-primary-foreground active:scale-95">
                <div className="text-sm font-bold">{i + 1}. {c.label}</div>
                <div className="text-xs">👍 {c.pro}</div><div className="text-xs">👎 {c.con}</div>
              </button>
            ))}
          </div>
        )}
        {toast && <div key={toast.id} className="sol-banner absolute inset-x-0 top-[22%] text-center"><span className="hud-panel inline-block rounded-2xl px-4 py-2 text-base font-bold text-accent sm:text-lg">{toast.text}</span></div>}

        {station && !open && !sim.event && !briefing && (
          <FacilityButton station={station} view={view} onOpen={() => { beep("open"); setOpen(true); }} label={<><span className="text-2xl">{stIcon}</span><span>Open {stName}</span></>} />
        )}
        {station && open && (
          <div key={flash?.id} className={`hud-panel pointer-events-auto absolute bottom-[34%] left-1/2 max-h-[55dvh] w-[min(94vw,470px)] -translate-x-1/2 overflow-y-auto rounded-2xl p-3 sm:bottom-28 sm:p-4 ${flash ? (flash.ok ? "panel-ok" : "panel-fail") : ""}`}>
            <div className="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wider text-accent sm:text-base">
              <span>{stIcon} {stName}</span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded px-2 py-0.5 text-lg text-hud-fg hover:bg-hud-ink/40">✕</button>
            </div>
            {site && <div className="mb-2 rounded-xl bg-hud-ink/40 px-3 py-2 text-sm">{sim.discoveries.includes(site.id) ? `✅ Scanned: ${site.discovery}` : "Something interesting is here! Scanning uses suit power and oxygen — more during dust storms."}</div>}
            <ul className="space-y-0.5 rounded-xl bg-hud-ink/40 px-3 py-2 text-sm leading-relaxed sm:text-base">{infoFor(station, sim).map((l) => <li key={l}>{l}</li>)}</ul>
            {actions.length === 0 && <div className="mt-2 text-center text-sm text-hud-muted">Nothing left to build here!</div>}
            {actions.map((a, i) => (
              <button key={a.id} onClick={() => doAction(a.id)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-primary px-4 py-2.5 text-left text-sm font-bold text-primary-foreground active:scale-95 sm:text-base">
                <span><span className="desktop-only mr-1 rounded bg-hud-ink/40 px-1 text-xs">{i + 1}</span>{a.label}</span>{a.cost && <span className="whitespace-nowrap text-sm">{a.cost}</span>}
              </button>
            ))}
          </div>
        )}

        <div className={`absolute inset-x-2 bottom-2 flex ${sim.status === "won" || sim.status === "lost" || briefing ? "hidden" : ""} items-end justify-between gap-2 sm:inset-x-3 sm:bottom-3`}>
          <div className="touch-only"><Joystick input={input} /></div>
          <div className="desktop-only hud-panel rounded-xl px-3 py-1.5 text-xs">Move: WASD / Arrows · Open: click building · Choose: 1–5</div>
          <div className="hud-panel pointer-events-auto flex max-w-[60vw] items-end gap-2 rounded-2xl p-2 sm:max-w-sm">
            <div className="shrink-0 rounded-xl bg-hud-ink/40 p-1"><PipPortrait size={56} /></div>
            <div>
              <div className="font-display text-sm font-bold text-accent">PIP</div>
              <p key={pip} className="pip-text text-xs leading-snug sm:text-sm">{pip}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Res({ name, icon, value, raw, cls, low }: { name: string; icon: string; value: number; raw?: number; cls: string; low: number }) {
  const v = Math.round(raw ?? value), w = Math.min(100, Math.round(value)), danger = value < low;
  return (
    <div className={`flex items-center gap-1 ${danger ? "animate-pulse" : ""}`} title={name}>
      <span className="text-sm">{icon}</span>
      <div className="hidden text-[10px] font-bold uppercase 2xl:block">{name}</div>
      <div className="h-2 w-7 overflow-hidden rounded-full bg-hud-ink/60 sm:w-12"><div className={`h-full ${danger ? "bg-destructive" : cls}`} style={{ width: `${w}%` }} /></div>
      <span className={`text-xs font-bold ${danger ? "text-destructive" : ""}`}>{v}</span>
    </div>
  );
}

function Stars({ n }: { n: number }) { return <span className="whitespace-nowrap text-accent" aria-label={`${n} of 3 stars`}>{"★".repeat(n)}<span className="text-hud-muted">{"★".repeat(3 - n)}</span></span>; }

function MissionReport({ sim, onRestart }: { sim: Sim; onRestart: () => void }) {
  const r = report(sim), won = sim.status === "won";
  return (
    <div className="text-left">
      <div className="text-center text-[10px] font-bold uppercase tracking-widest text-accent">Final Mission Report</div>
      <div className="text-center font-display text-2xl font-bold sm:text-3xl">{won ? "Mission complete! 🎉" : "Mission failed 💥"}</div>
      <div className="text-center text-sm font-bold">{r.grade}</div>
      {r.cause && <div className="mt-2 rounded-xl bg-destructive/30 p-2 text-sm"><b>{r.cause.title}.</b> {r.cause.lesson}</div>}
      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
        <div className="rounded-lg bg-hud-ink/40 p-1"><div className="text-lg font-bold">{r.solsSurvived.toFixed(1).replace(".0", "")}</div>Sols survived</div>
        <div className="rounded-lg bg-hud-ink/40 p-1"><div className="text-lg font-bold">{sim.objective}/{OBJECTIVES.length}</div>Objectives</div>
        <div className="rounded-lg bg-hud-ink/40 p-1"><div className="text-lg font-bold">{sim.discoveries.length}</div>Discoveries</div>
      </div>
      <div className="mt-2 text-xs">Final supplies: 🫧 {Math.round(sim.oxygen)} · 💧 {Math.round(sim.water)} · 🥕 {Math.round(sim.food)} · ⚡ {Math.round(sim.energy)} · 🛡️ {Math.round(sim.shield)}% · 🏠 {Math.round(sim.condition)}%</div>
      <ul className="mt-2 space-y-1">
        {r.ratings.map((x) => (
          <li key={x.label} className="rounded-lg bg-hud-ink/40 px-2 py-1 text-xs">
            <div className="flex justify-between gap-2 font-bold"><span>{x.icon} {x.label}</span><Stars n={x.stars} /></div>
            <div className="text-hud-muted">{x.value}</div>
          </li>
        ))}
      </ul>
      {r.strengths.length > 0 && <div className="mt-2 text-xs"><b className="text-res-food">💪 Strengths</b><ul>{r.strengths.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      {r.improve.length > 0 && <div className="mt-2 text-xs"><b className="text-accent">🎯 Next time</b><ul>{r.improve.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      {r.decisions.length > 0 && <div className="mt-2 text-xs"><b>🗳️ Your big decisions</b><ul className="text-hud-muted">{r.decisions.slice(0, 6).map((t, i) => <li key={i}>• {t}</li>)}</ul></div>}
      {sim.discoveries.length > 0 && <div className="mt-2 text-xs"><b>🔬 Discoveries:</b> {sim.discoveries.map((d) => SITES.find((x) => x.id === d)?.discovery).join(", ")}</div>}
      <div className="text-center"><button onClick={onRestart} className="start-btn mt-3 rounded-xl px-6 py-2 font-bold">Play again</button></div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { drawAstronaut } from "@/game/astronaut";
import { drawDynamic, drawFacilities, drawPlacementGhost, drawValidSiteMarker, getObstacles, renderStaticWorld, SKY_H, SPAWN, WORLD_H, WORLD_W, LANDMARKS } from "@/game/world";
import { drawNav, drawScreenFx, drawWorldFx, type Fx, type Nav } from "@/game/fx";
import { canPlace, type BuildableKind, type Facility } from "@/game/facilities";
import type { Character, Dir, Landmark } from "@/game/types";

export interface InputState { x: number; y: number }

export interface PlacementCursor { kind: BuildableKind; x: number; y: number; focusX: number; focusY: number }
interface Props { character: Character; input: React.MutableRefObject<InputState>; onDiscover: (l: Landmark) => void; posRef?: React.MutableRefObject<{ x: number; y: number }>; markersRef?: React.MutableRefObject<{ x: number; y: number }[]>; speedRef?: React.MutableRefObject<number>; viewRef?: React.MutableRefObject<{ cx: number; cy: number; zoom: number }>; onWorldClick?: (x: number, y: number) => void; fxRef?: React.MutableRefObject<Fx>; navRef?: React.MutableRefObject<Nav | null>; facilitiesRef?: React.MutableRefObject<Facility[]>; placementRef?: React.MutableRefObject<PlacementCursor | null>; onPlacement?: (x: number, y: number) => void; solarRef?: React.MutableRefObject<{ cleanliness: number; progress: number | null }> }

const SPEED = 260;
const R = 16;

export function GameCanvas({ character, input, onDiscover, posRef, markersRef, speedRef, viewRef, onWorldClick, fxRef, navRef, facilitiesRef, placementRef, onPlacement, solarRef }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clickRef = useRef(onWorldClick);
  clickRef.current = onWorldClick;
  const discoverRef = useRef(onDiscover);
  discoverRef.current = onDiscover;
  const placementCallbackRef = useRef(onPlacement);
  placementCallbackRef.current = onPlacement;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const world = renderStaticWorld();
    let obstacles = getObstacles(facilitiesRef?.current);
    let obstacleKey = "";
    const visited = new Set<string>();
    const p = { x: SPAWN.x, y: SPAWN.y, dir: "down" as Dir, moving: false };
    const cam = { x: p.x, y: p.y };
    const keys = new Set<string>();
    let raf = 0, last = performance.now(), t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k)) { keys.add(k); e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", blur);

    const worldPoint = (e: PointerEvent) => {
      const vw = window.innerWidth, vh = window.innerHeight, v = viewRef?.current;
      return v ? { x: v.cx + (e.clientX - vw / 2) / v.zoom, y: v.cy + (e.clientY - vh / 2) / v.zoom } : null;
    };
    const click = (e: PointerEvent) => {
      const p = worldPoint(e); if (!p) return;
      if (placementRef?.current) {
        placementRef.current.x = p.x; placementRef.current.y = p.y; placementRef.current.focusX = p.x; placementRef.current.focusY = p.y;
        placementCallbackRef.current?.(p.x, p.y);
        return;
      }
      clickRef.current?.(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!placementRef?.current || e.pointerType === "touch") return;
      const p = worldPoint(e); if (!p) return;
      placementRef.current.x = p.x; placementRef.current.y = p.y;
    };
    canvas.addEventListener("pointerdown", click);
    canvas.addEventListener("pointermove", move);
    const blocked = (x: number, y: number) =>
      x < R || x > WORLD_W - R || y < SKY_H + 40 || y > WORLD_H - R ||
      obstacles.some((o) => x + R > o.x && x - R < o.x + o.w && y > o.y && y - 10 < o.y + o.h);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const facilities = facilitiesRef?.current ?? [];
      const nextObstacleKey = facilities.filter((f) => f.built).map((f) => f.id).join("|");
      if (nextObstacleKey !== obstacleKey) { obstacleKey = nextObstacleKey; obstacles = getObstacles(facilities); }
      let dx = input.current.x, dy = input.current.y;
      if (!placementRef?.current) {
        if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
        if (keys.has("d") || keys.has("arrowright")) dx += 1;
        if (keys.has("w") || keys.has("arrowup")) dy -= 1;
        if (keys.has("s") || keys.has("arrowdown")) dy += 1;
      } else { dx = 0; dy = 0; }
      const mag = Math.hypot(dx, dy);
      const moveSpeed = SPEED * (speedRef?.current ?? 1);
      p.moving = mag > 0.15 && moveSpeed > 0;
      if (p.moving) {
        if (mag > 1) { dx /= mag; dy /= mag; }
        const nx = p.x + dx * moveSpeed * dt, ny = p.y + dy * moveSpeed * dt;
        if (!blocked(nx, p.y)) p.x = nx;
        if (!blocked(p.x, ny)) p.y = ny;
        p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
      }
      if (posRef) { posRef.current.x = p.x; posRef.current.y = p.y; }
      for (const l of LANDMARKS) if (!visited.has(l.id) && Math.hypot(p.x - l.x, p.y - l.y) < l.r) { visited.add(l.id); discoverRef.current(l); }

      const vw = window.innerWidth, vh = window.innerHeight;
      const zoom = Math.max(0.55, Math.min(1.15, Math.min(vw, vh) / 720));
      const hw = vw / 2 / zoom, hh = vh / 2 / zoom;
      const cameraTarget = placementRef?.current;
      cam.x += ((cameraTarget?.focusX ?? p.x) - cam.x) * Math.min(1, dt * 6); cam.y += ((cameraTarget?.focusY ?? (p.y - 40)) - cam.y) * Math.min(1, dt * 6);
      const cx = Math.max(hw, Math.min(WORLD_W - hw, cam.x)), cy = Math.max(hh, Math.min(WORLD_H - hh, cam.y));
      if (viewRef) { viewRef.current.cx = cx; viewRef.current.cy = cy; viewRef.current.zoom = zoom; }
      const dpr = canvas.width / vw;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#120a3a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (vw / 2 - cx * zoom), dpr * (vh / 2 - cy * zoom));
      ctx.drawImage(world, 0, 0);
      drawFacilities(ctx, facilities, t, solarRef?.current.cleanliness ?? 100, solarRef?.current.progress ?? null);
      const placing = placementRef?.current;
      if (placing) {
        const step = 200;
        const minX = Math.max(step, Math.floor((cx - hw) / step) * step), maxX = Math.min(WORLD_W - step, cx + hw);
        const minY = Math.max(SKY_H + step, Math.floor((cy - hh) / step) * step), maxY = Math.min(WORLD_H - step, cy + hh);
        for (let gx = minX; gx <= maxX; gx += step) for (let gy = minY; gy <= maxY; gy += step) {
          if (canPlace(facilities, placing.kind, gx, gy).ok) drawValidSiteMarker(ctx, gx, gy);
        }
      }
      drawDynamic(ctx, t, visited);
      for (const m of markersRef?.current ?? []) {
        const pulse = 1 + Math.sin(t * 4) * 0.15;
        ctx.strokeStyle = "rgba(34,211,238,0.9)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(m.x, m.y, 50 * pulse, 0, 7); ctx.stroke();
        ctx.fillStyle = "#22d3ee"; ctx.strokeStyle = "#1e1b3a"; ctx.lineWidth = 3; const yy = m.y - 90 + Math.sin(t * 3) * 6;
        ctx.beginPath(); ctx.moveTo(m.x, yy - 16); ctx.lineTo(m.x + 14, yy); ctx.lineTo(m.x, yy + 16); ctx.lineTo(m.x - 14, yy); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1e1b3a"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText("?", m.x, yy + 6);
      }
      if (fxRef) drawWorldFx(ctx, fxRef.current, t);
      if (placing) drawPlacementGhost(ctx, placing.kind, placing.x, placing.y, canPlace(facilities, placing.kind, placing.x, placing.y).ok, t);
      ctx.save(); ctx.translate(p.x, p.y); drawAstronaut(ctx, character, p.dir, t, p.moving); ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (fxRef) drawScreenFx(ctx, fxRef.current, t, vw, vh);
      const nav = navRef?.current;
      if (nav) { const ts = (x: number, y: number): [number, number] => [vw / 2 + (x - cx) * zoom, vh / 2 + (y - cy) * zoom]; drawNav(ctx, nav, t, vw, vh, ts, ts(p.x, p.y)); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", click); canvas.removeEventListener("pointermove", move); window.removeEventListener("resize", resize); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); };
  }, [character, input, posRef, markersRef, speedRef, viewRef, fxRef, navRef, facilitiesRef, placementRef, solarRef]);

  return <canvas ref={ref} className="absolute inset-0 block h-full w-full" aria-label="Mars colony game world" />;
}

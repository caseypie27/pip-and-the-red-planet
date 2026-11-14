import { useEffect, useRef, useState } from "react";
import { drawAstronaut } from "@/game/astronaut";
import type { Character, Dir } from "@/game/types";
import { PipPortrait } from "./Pip";

function Preview({ c }: { c: Character }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    let raf = 0; const start = performance.now();
    const dirs: Dir[] = ["down", "right", "up", "left"];
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.translate(cv.width / 2, cv.height - 20);
      const d = dirs[Math.floor(t / 2.5) % 4] ?? "down";
      drawAstronaut(ctx, c, d, t, d !== "down", 2.2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [c]);
  return <canvas ref={ref} width={220} height={240} className="h-40 w-auto sm:h-56" />;
}

export function CharacterSelect({ initial, onStart }: { initial: Character | null; onStart: (c: Character) => void }) {
  const [sel, setSel] = useState<Character | null>(initial);
  const opts: { id: Character; name: string; desc: string }[] = [
    { id: "boy", name: "Boy Astronaut", desc: "Orange & cyan suit" },
    { id: "girl", name: "Girl Astronaut", desc: "Orange & turquoise suit" },
  ];
  return (
    <div className="space-bg fixed inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto p-4 text-hud-fg">
      <p className="font-display text-sm uppercase tracking-[0.3em] text-accent">Mars Base Buddies · Explore. Manage. Survive.</p>
      <h1 className="font-display text-4xl font-bold sm:text-6xl">Choose Your Astronaut</h1>
      <div className="flex flex-wrap justify-center gap-4">
        {opts.map((o) => (
          <button key={o.id} onClick={() => setSel(o.id)} aria-pressed={sel === o.id}
            className={`select-card flex w-44 flex-col items-center rounded-3xl p-3 transition sm:w-60 ${sel === o.id ? "is-selected scale-105" : "opacity-85 hover:scale-[1.02]"}`}>
            <Preview c={o.id} />
            <span className="font-display text-xl font-bold">{o.name}</span>
            <span className="text-sm text-hud-muted">{o.desc}</span>
            <span className={`mt-2 rounded-full px-3 py-0.5 text-xs font-bold ${sel === o.id ? "bg-primary text-primary-foreground" : "bg-hud-ink/40"}`}>{sel === o.id ? "✓ Selected" : "Tap to choose"}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <PipPortrait size={48} />
        <p className="hud-panel max-w-xs rounded-2xl px-3 py-2 text-sm">{sel ? "Great choice! Ready for launch?" : "Hi! I'm PIP. Pick who'll explore Mars with me!"}</p>
      </div>
      <button disabled={!sel} onClick={() => sel && onStart(sel)}
        className="start-btn font-display rounded-full px-10 py-3 text-2xl font-bold disabled:opacity-40">
        🚀 Start Mission
      </button>
    </div>
  );
}

import { useRef, useState } from "react";
import type { InputState } from "./GameCanvas";

export function Joystick({ input }: { input: React.MutableRefObject<InputState> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const max = r.width / 2;
    let x = e.clientX - (r.left + max), y = e.clientY - (r.top + max);
    const m = Math.hypot(x, y); if (m > max) { x = (x / m) * max; y = (y / m) * max; }
    setKnob({ x, y }); input.current = { x: x / max, y: y / max };
  };
  const end = () => { id.current = null; setKnob({ x: 0, y: 0 }); input.current = { x: 0, y: 0 }; };
  return (
    <div
      ref={base}
      className="hud-panel pointer-events-auto relative size-32 touch-none rounded-full sm:size-36"
      onPointerDown={(e) => { id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end} onPointerCancel={end}
      aria-label="Movement joystick"
    >
      {["▲", "▼", "◀", "▶"].map((a, i) => (
        <span key={a} className="absolute text-xs text-hud-muted" style={{ left: ["50%", "50%", "10%", "90%"][i], top: ["10%", "90%", "50%", "50%"][i], transform: "translate(-50%,-50%)" }}>{a}</span>
      ))}
      <div className="absolute left-1/2 top-1/2 size-14 rounded-full border-4 border-hud-ink bg-primary shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}

"use client";
import { Eraser, Pen, Send, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHALK_HEX, type ChalkColour } from "@/lib/whiteboard";

const PEN_COLOURS: ChalkColour[] = ["white", "yellow", "blue", "pink", "green"];
const W = 1000;
const H = 600;
type Stroke = { color: string; width: number; erase: boolean; points: [number, number][] };

/** The student's own chalkboard. Pen, eraser, undo, clear; mouse, finger or stylus. */
export function StudentCanvas({ onSend, disabled }: { onSend: (dataUrl: string) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState<ChalkColour>("white");
  const [erase, setErase] = useState(false);

  const redraw = useCallback((list: Stroke[]) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1f3a2f";
    ctx.fillRect(0, 0, W, H);
    for (const s of list) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.erase ? "#1f3a2f" : s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (const p of s.points.slice(1)) ctx.lineTo(p[0], p[1]);
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
      ctx.stroke();
    }
  }, []);

  useEffect(() => redraw(strokes), [strokes, redraw]);

  const toBoard = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { color: CHALK_HEX[color], width: erase ? 36 : e.pointerType === "pen" ? 4 + 4 * e.pressure : 5, erase, points: [toBoard(e)] };
    redraw([...strokes, current.current]);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    current.current.points.push(toBoard(e));
    redraw([...strokes, current.current]);
  };
  const onUp = () => {
    if (!current.current) return;
    const done = current.current;
    current.current = null;
    setStrokes((s) => [...s, done]);
  };

  const send = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    // A smaller JPEG keeps the request light.
    const out = document.createElement("canvas");
    out.width = 800;
    out.height = 480;
    out.getContext("2d")?.drawImage(canvas, 0, 0, 800, 480);
    onSend(out.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border-[6px] border-board-edge bg-board">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="Your chalkboard. Draw your working here."
          className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {strokes.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center font-chalk text-lg text-[#f4f1e8]/60">
            Draw your working here, then ask Akash Master about it.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Chalk colour">
          {PEN_COLOURS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={!erase && color === c}
              aria-label={`${c} chalk`}
              onClick={() => { setColor(c); setErase(false); }}
              className={`h-8 w-8 rounded-full border-2 ${!erase && color === c ? "border-foreground" : "border-transparent"}`}
              style={{ background: CHALK_HEX[c] }}
            />
          ))}
        </div>
        <ToolButton label={erase ? "Pen" : "Eraser"} onClick={() => setErase((e) => !e)} active={erase}>
          {erase ? <Pen size={16} /> : <Eraser size={16} />}
        </ToolButton>
        <ToolButton label="Undo" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length}>
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton label="Clear" onClick={() => setStrokes([])} disabled={!strokes.length}>
          <Trash2 size={16} />
        </ToolButton>
        <button
          onClick={send}
          disabled={disabled || strokes.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-akash px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          <Send size={15} /> Ask Akash Master about this
        </button>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-border disabled:opacity-40 ${active ? "bg-surface-2" : "hover:bg-surface-2"}`}
    >
      {children}
    </button>
  );
}

"use client";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/whiteboard";
import { BoardCanvas } from "./BoardCanvas";

const STEP_MS = 2600;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Akash Master's chalkboard: steps play automatically; Previous, Play/Replay, Next and full screen. */
export function Whiteboard({ boards, activeIndex, onSelect }: { boards: Board[]; activeIndex: number; onSelect: (i: number) => void }) {
  const board = boards[activeIndex];
  // Keyed so a new board starts from the first step and plays.
  return <BoardPlayer key={`${activeIndex}:${board?.title ?? ""}`} boards={boards} activeIndex={activeIndex} onSelect={onSelect} />;
}

function BoardPlayer({ boards, activeIndex, onSelect }: { boards: Board[]; activeIndex: number; onSelect: (i: number) => void }) {
  const board = boards[activeIndex];
  const [step, setStep] = useState(0);
  const [playRequested, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState<"off" | "native" | "css">("off");
  const frameRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const total = board?.steps.length ?? 0;

  const playing = playRequested && step < total - 1;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, total - 1)), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, step, total]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current ? "native" : "off");
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = frameRef.current;
    if (!el) return;
    if (fullscreen === "css") {
      setFullscreen("off");
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await el.requestFullscreen();
        // Landscape is the readable way to see a board on a phone.
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        await orientation.lock?.("landscape").catch(() => {});
      }
    } catch {
      setFullscreen("css"); // CSS fallback where the Fullscreen API is unavailable (iOS Safari).
    }
  }, [fullscreen]);

  if (!board) {
    return (
      <div className="flex h-full flex-col">
        <div className="relative flex-1 overflow-hidden rounded-xl border-[6px] border-board-edge bg-board">
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center font-chalk text-xl text-[#f4f1e8]/70">
            Akash Master&apos;s board.
            <br />
            When a drawing helps, it appears here.
          </div>
        </div>
      </div>
    );
  }

  const atEnd = step >= total - 1;
  const cssFull = fullscreen === "css";
  const isFull = fullscreen !== "off";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {boards.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Boards in this class">
          {boards.map((b, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === activeIndex}
              onClick={() => onSelect(i)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${i === activeIndex ? "border-akash bg-akash-soft text-akash" : "border-border text-muted hover:bg-surface-2"}`}
            >
              {b.title}
            </button>
          ))}
        </div>
      )}
      <div
        ref={frameRef}
        className={`flex min-h-0 flex-col bg-board ${cssFull ? "fixed inset-0 z-50" : "flex-1 rounded-xl border-[6px] border-board-edge"} ${isFull ? "p-2" : ""}`}
      >
        <div className="flex items-center justify-between px-3 pt-2 text-[#f4f1e8]">
          <h2 className="truncate font-chalk text-lg">{board.title}</h2>
          <span className="shrink-0 text-xs opacity-70" aria-live="polite">
            Step {step + 1} of {total}
          </span>
        </div>
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="aspect-[5/3] max-h-full w-full">
              <BoardCanvas steps={board.steps} upTo={step} boardKey={`${activeIndex}`} animate={!reduced} />
            </div>
          </div>
        </div>
        <p className="min-h-[2.5rem] px-3 pb-1 text-sm text-[#f4f1e8]/90">{board.steps[step]?.caption}</p>
        <div className="flex items-center justify-center gap-1 border-t border-white/10 px-2 py-1.5 text-[#f4f1e8]">
          <BoardButton label="Previous step" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>
            <ChevronLeft size={18} />
          </BoardButton>
          <BoardButton
            label={playing ? "Pause" : atEnd ? "Replay" : "Play"}
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                if (atEnd) setStep(0);
                setPlaying(true);
              }
            }}
          >
            {playing ? <Pause size={18} /> : atEnd ? <RotateCcw size={18} /> : <Play size={18} />}
          </BoardButton>
          <BoardButton label="Next step" onClick={() => { setPlaying(false); setStep((s) => Math.min(total - 1, s + 1)); }} disabled={atEnd}>
            <ChevronRight size={18} />
          </BoardButton>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <BoardButton label={isFull ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {isFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </BoardButton>
        </div>
      </div>
    </div>
  );
}

function BoardButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

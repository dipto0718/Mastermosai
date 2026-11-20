"use client";
import { ImagePlus, NotebookPen, Plus, Send, Square, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Logo, PERSONA, PersonaAvatar } from "@/components/Persona";
import { StudentCanvas } from "@/components/whiteboard/StudentCanvas";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";
import { decodeEvents, type GuideEvent } from "@/lib/events";
import { guestStore, type StoredTurn } from "@/lib/guest-store";
import { mergeMemories } from "@/lib/memory";
import { MODE_LABELS, TEACHING_MODES, type ChatTurn, type LearnerMemory, type LearnerProfile, type TeachingMode } from "@/lib/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Board } from "@/lib/whiteboard";
import { useIsClient } from "@/lib/use-is-client";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function suggestions(profile: LearnerProfile | null): string[] {
  const out: string[] = [];
  const hard = profile?.difficultSubjects[0];
  if (hard) out.push(`I find ${hard} difficult. Where should I start?`);
  if (profile?.exam) out.push(`Make me a plan for ${profile.exam.name}${profile.exam.date ? ` by ${profile.exam.date}` : ""}`);
  out.push("Explain Pythagoras' theorem with a drawing");
  if (profile?.goals.includes("Learn to code")) out.push("Teach me what a loop is in Python");
  out.push("Give me 3 practice questions on fractions");
  return out.slice(0, 4);
}

export default function ClassroomPage() {
  // Guest data lives in this browser, so the classroom renders after hydration.
  return useIsClient() ? <Classroom /> : <div className="flex-1" aria-busy="true" />;
}

function Classroom() {
  const [initialRoom] = useState(() => guestStore.getClassroom());
  const [profile, setProfile] = useState<LearnerProfile | null>(() => guestStore.getProfile());
  const [memories, setMemories] = useState<LearnerMemory[]>(() => guestStore.getMemories());
  const [signedIn, setSignedIn] = useState(false);
  const [turns, setTurns] = useState<StoredTurn[]>(initialRoom.turns);
  const [conversationId, setConversationId] = useState<string | null>(initialRoom.conversationId);
  const loaded = true;
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [mode, setMode] = useState<TeachingMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [activeBoard, setActiveBoard] = useState(0);
  const [boardPane, setBoardPane] = useState<"teacher" | "mine">("teacher");
  const [mobileTab, setMobileTab] = useState<"chat" | "board">("chat");
  const [newBoardDot, setNewBoardDot] = useState(false);
  const mobileTabRef = useRef(mobileTab);
  useEffect(() => {
    mobileTabRef.current = mobileTab;
  }, [mobileTab]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Signed-in students: load their profile and AI Brain from the server.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase?.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setSignedIn(true);
      const res = await fetch("/api/profile").catch(() => null);
      if (res?.ok) {
        const body = (await res.json()) as { profile: LearnerProfile | null; memories: LearnerMemory[] };
        if (body.profile) setProfile(body.profile);
        setMemories(body.memories);
      }
    });
  }, []);

  useEffect(() => {
    guestStore.setClassroom({ turns, conversationId });
  }, [turns, conversationId]);

  const boards = useMemo(() => turns.flatMap((t) => t.boards ?? []), [turns]);

  // Keep the newest message, notes chip included, in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const updateLast = useCallback((speaker: StoredTurn["speaker"], fn: (t: StoredTurn) => StoredTurn) => {
    setTurns((ts) => {
      for (let i = ts.length - 1; i >= 0; i--) {
        if (ts[i].speaker === speaker) {
          const copy = [...ts];
          copy[i] = fn(ts[i]);
          return copy;
        }
      }
      return ts;
    });
  }, []);

  const handleEvent = useCallback(
    (e: GuideEvent, boardCount: { n: number }) => {
      switch (e.type) {
        case "little_master":
          setTurns((ts) => [...ts, { id: uid(), speaker: "little_master", text: e.text }]);
          break;
        case "akash_start":
          setTurns((ts) => [...ts, { id: uid(), speaker: "akash_master", text: "", boards: [] }]);
          break;
        case "akash_delta":
          updateLast("akash_master", (t) => ({ ...t, text: t.text + e.text }));
          break;
        case "board":
          updateLast("akash_master", (t) => ({ ...t, boards: [...(t.boards ?? []), e.board] }));
          setActiveBoard(boardCount.n++);
          setBoardPane("teacher");
          if (mobileTabRef.current === "chat") setNewBoardDot(true);
          break;
        case "akash_end":
          updateLast("akash_master", (t) => ({ ...t, text: e.text, boardTitles: e.boardTitles }));
          break;
        case "notes":
          updateLast("akash_master", (t) => ({ ...t, notes: e.notes.summary }));
          if (!signedIn) {
            setMemories((m) => {
              const merged = mergeMemories(m, e.notes.memories);
              guestStore.setMemories(merged);
              return merged;
            });
          }
          break;
        case "saved":
          setConversationId(e.conversationId);
          break;
        case "error":
          setTurns((ts) => [...ts, { id: uid(), speaker: "little_master", text: `Oh no, ${e.message}` }]);
          break;
      }
    },
    [signedIn, updateLast],
  );

  async function send(text: string, attached: string | null = image) {
    const message = text.trim() || (attached ? "Please check my working on the board." : "");
    if (!message || busy) return;
    const history: ChatTurn[] = turns.map((t) => ({ speaker: t.speaker, text: t.text, boardTitles: t.boardTitles }));
    setTurns((ts) => [...ts, { id: uid(), speaker: "student", text: message, imageThumb: attached ?? undefined }]);
    setInput("");
    setImage(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const boardCount = { n: boards.length };
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, mode, profile, memories: signedIn ? [] : memories, image: attached, conversationId }),
        signal: controller.signal,
      });
      setDemo(res.headers.get("X-Mastermosai-Demo") === "1");
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        handleEvent({ type: "error", message: err?.error ?? "I couldn't reach the classroom. Please try again." }, boardCount);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;
        events.forEach((ev) => handleEvent(ev, boardCount));
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        handleEvent({ type: "error", message: "the connection dropped. Please try again." }, boardCount);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function newClass() {
    abortRef.current?.abort();
    setTurns([]);
    setConversationId(null);
    setActiveBoard(0);
    guestStore.clearClassroom();
  }

  function onPickFile(file: File | undefined) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      setImage(c.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  const boardPanel = (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm" role="tablist" aria-label="Board">
        {(["teacher", "mine"] as const).map((p) => (
          <button key={p} role="tab" aria-selected={boardPane === p} onClick={() => setBoardPane(p)} className={`flex-1 rounded-md px-3 py-1.5 ${boardPane === p ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
            {p === "teacher" ? "Akash Master's board" : "My board"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {boardPane === "teacher" ? (
          <Whiteboard boards={boards} activeIndex={Math.min(activeBoard, Math.max(0, boards.length - 1))} onSelect={setActiveBoard} />
        ) : (
          <StudentCanvas
            disabled={busy}
            onSend={(url) => {
              setMobileTab("chat");
              void send(input, url);
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Link href="/" aria-label="Mastermosai home">
          <Logo className="text-lg" />
        </Link>
        {demo && <span className="whitespace-nowrap rounded-full bg-little-soft px-2 py-0.5 text-xs text-little" title="Scripted personas, no API key">Demo</span>}
        <div className="ml-auto flex items-center gap-1">
          {busy && (
            <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-sm">
              <Square size={14} /> Stop
            </button>
          )}
          <button onClick={newClass} className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2">
            <Plus size={14} /> New class
          </button>
          {!signedIn && (
            <Link href="/login?next=/classroom" className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="flex shrink-0 border-b border-border md:hidden" role="tablist" aria-label="Classroom view">
        {(["chat", "board"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={mobileTab === t}
            onClick={() => {
              setMobileTab(t);
              if (t === "board") setNewBoardDot(false);
            }}
            className={`relative flex-1 py-2 text-sm ${mobileTab === t ? "border-b-2 border-akash font-medium" : "text-muted"}`}
          >
            {t === "chat" ? "Chat" : "Whiteboard"}
            {t === "board" && newBoardDot && <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-little" aria-label="New drawing" />}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <section className={`${mobileTab === "chat" ? "flex" : "hidden"} min-h-0 w-full flex-col md:flex md:w-[46%] md:border-r md:border-border`}>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-live="polite">
            {loaded && turns.length === 0 && (
              <div className="flex gap-3">
                <PersonaAvatar speaker="little_master" />
                <div className="rounded-2xl rounded-tl-sm bg-little-soft px-4 py-3">
                  <p className="text-xs font-semibold text-little">Little Master</p>
                  <p className="mt-0.5">
                    {profile ? `Welcome back, ${profile.name}!` : "Welcome to class!"} Ask anything you&apos;re studying, or draw your working on
                    &ldquo;My board&rdquo;. I&apos;ll bring Akash Master in.
                    {!profile && (
                      <>
                        {" "}
                        <Link href="/onboarding" className="font-medium text-little underline">
                          Tell me about yourself
                        </Link>{" "}
                        so he can teach you better.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <Turn key={t.id} turn={t} streaming={busy && i === turns.length - 1 && t.speaker === "akash_master"} onBoard={(title) => {
                const idx = boards.findIndex((b) => b.title === title);
                if (idx >= 0) {
                  setActiveBoard(idx);
                  setBoardPane("teacher");
                  setMobileTab("board");
                  setNewBoardDot(false);
                }
              }} />
            ))}
            {busy && turns[turns.length - 1]?.speaker === "student" && (
              <div className="flex items-center gap-2 pl-12 text-muted" aria-label="Little Master is thinking">
                <span className="typing-dot h-2 w-2 rounded-full bg-little" />
                <span className="typing-dot h-2 w-2 rounded-full bg-little" />
                <span className="typing-dot h-2 w-2 rounded-full bg-little" />
              </div>
            )}
            {loaded && turns.length === 0 && (
              <div className="flex flex-wrap gap-2 pl-12">
                {suggestions(profile).map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-sm hover:bg-surface-2">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-border p-2">
            <div className="no-scrollbar mb-2 flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Teaching mode">
              <ModeChip label="Auto" on={mode === null} onClick={() => setMode(null)} title="Little Master decides" />
              {TEACHING_MODES.map((m) => (
                <ModeChip key={m} label={MODE_LABELS[m]} on={mode === m} onClick={() => setMode(m)} />
              ))}
            </div>
            {image && (
              <div className="mb-2 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Attached drawing" className="h-14 rounded-md border border-border" />
                <button onClick={() => setImage(null)} aria-label="Remove attachment" className="rounded-md p-1 hover:bg-surface-2">
                  <X size={16} />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2"
            >
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a photo" title="Attach a photo of your work" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-surface-2">
                <ImagePlus size={18} />
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={8000}
                placeholder="Ask Little Master anything..."
                aria-label="Your message"
                className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5"
              />
              <button type="submit" disabled={busy || (!input.trim() && !image)} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-akash text-white disabled:opacity-40">
                <Send size={18} />
              </button>
            </form>
          </div>
        </section>

        <section className={`${mobileTab === "board" ? "flex" : "hidden"} min-h-0 w-full flex-col p-3 md:flex md:flex-1`}>{boardPanel}</section>
      </div>
    </div>
  );
}

function ModeChip({ label, on, onClick, title }: { label: string; on: boolean; onClick: () => void; title?: string }) {
  return (
    <button role="radio" aria-checked={on} onClick={onClick} title={title} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${on ? "border-akash bg-akash-soft font-medium text-akash" : "border-border text-muted hover:bg-surface-2"}`}>
      {label}
    </button>
  );
}

function Turn({ turn, streaming, onBoard }: { turn: StoredTurn; streaming: boolean; onBoard: (title: string) => void }) {
  if (turn.speaker === "student") {
    return (
      <div className="flex flex-col items-end gap-1">
        {turn.imageThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={turn.imageThumb} alt="Your drawing" className="max-h-32 rounded-lg border border-border" />
        )}
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-student-soft px-4 py-2.5">{turn.text}</div>
      </div>
    );
  }
  const p = PERSONA[turn.speaker];
  const boards: Board[] = turn.boards ?? [];
  return (
    <div className="flex gap-3">
      <PersonaAvatar speaker={turn.speaker} />
      <div className="min-w-0 max-w-[90%] space-y-2">
        <div className={`rounded-2xl rounded-tl-sm ${p.soft} px-4 py-2.5`}>
          <p className={`text-xs font-semibold ${p.text}`}>{p.name}</p>
          {turn.text ? <Markdown text={turn.text} /> : streaming ? <p className="text-muted">Preparing the lesson...</p> : null}
        </div>
        {boards.map((b, i) => (
          <button key={i} onClick={() => onBoard(b.title)} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2">
            <span className="h-3 w-4 rounded-sm bg-board" aria-hidden /> On the board: {b.title}
          </button>
        ))}
        {turn.notes && (
          <p className="flex items-center gap-1.5 rounded-full bg-little-soft px-3 py-1 text-xs text-little" title={turn.notes}>
            <NotebookPen size={13} /> Little Master took class notes
          </p>
        )}
      </div>
    </div>
  );
}

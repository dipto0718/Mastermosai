"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo, PersonaAvatar } from "@/components/Persona";
import { guestStore } from "@/lib/guest-store";
import { LearnerProfile, type Language } from "@/lib/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useIsClient } from "@/lib/use-is-client";

const LEVELS = ["Class 6-8", "Class 9-10", "Class 11-12", "Exam aspirant", "College student", "Working professional"];
const COURSES: Record<string, string[]> = {
  "Class 6-8": ["CBSE", "ICSE", "State board"],
  "Class 9-10": ["CBSE", "ICSE", "State board"],
  "Class 11-12": ["Science (PCM)", "Science (PCB)", "Commerce", "Arts / Humanities"],
  "Exam aspirant": ["JEE", "NEET", "UPSC", "CAT", "GATE", "SSC", "Banking"],
  "College student": ["Engineering", "Medical", "Pharmacy", "Commerce", "Arts", "Law"],
  "Working professional": ["Upskilling", "Career change", "Competitive exam"],
};
const GOALS = ["Understand concepts deeply", "Score better in exams", "Crack an entrance exam", "Finish homework with confidence", "Learn to code", "Plan my career", "Improve English and communication"];
const LANGS: { id: Language; label: string }[] = [
  { id: "english", label: "English" },
  { id: "hindi", label: "हिन्दी (Hindi)" },
  { id: "bengali", label: "বাংলা (Bengali)" },
  { id: "hinglish", label: "Hinglish" },
  { id: "banglish", label: "Banglish" },
];
const STYLES = [
  { id: "step_by_step", label: "Step by step" },
  { id: "visual", label: "Pictures and diagrams" },
  { id: "examples_first", label: "Examples first" },
  { id: "practice_heavy", label: "Lots of practice" },
  { id: "story", label: "Stories and real life" },
] as const;
const TIMES = [15, 30, 60, 90, 120, 180];
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Hindi", "Bengali", "History", "Geography", "Economics", "Accounts", "Computer Science", "Reasoning", "General Studies"];
const EXAMS = ["Board exams", "JEE", "NEET", "UPSC", "CAT", "GATE", "SSC", "Banking", "School test"];

type Draft = {
  name: string;
  level: string;
  course: string;
  goals: string[];
  language: Language;
  learningStyle: (typeof STYLES)[number]["id"];
  dailyStudyMinutes: number;
  strongSubjects: string[];
  difficultSubjects: string[];
  examName: string;
  examDate: string;
};

const EMPTY: Draft = {
  name: "",
  level: "",
  course: "",
  goals: [],
  language: "english",
  learningStyle: "step_by_step",
  dailyStudyMinutes: 60,
  strongSubjects: [],
  difficultSubjects: [],
  examName: "",
  examDate: "",
};

const TOTAL = 9;

export default function OnboardingPage() {
  return useIsClient() ? <Onboarding /> : <div className="flex-1" aria-busy="true" />;
}

function initialDraft(): Draft {
  const existing = guestStore.getProfile();
  if (!existing) return EMPTY;
  return { ...EMPTY, ...existing, examName: existing.exam?.name ?? "", examDate: existing.exam?.date ?? "" };
}

function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), [step]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (k: "goals" | "strongSubjects" | "difficultSubjects", v: string) =>
    setD((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((g) => g !== v) : [...x[k], v] }));

  const first = d.name.trim().split(/\s+/)[0] || "friend";
  const prompts = useMemo(
    () => [
      "Namaste! I'm Little Master. I was Akash Master's student once, and now I help everyone who joins his class. What should I call you?",
      `Lovely to meet you, ${first}! Where are you in your studies right now?`,
      "What do you most want from your classes here? Pick as many as you like.",
      "Which language should we teach you in? You can always mix and switch later.",
      "How do you learn best?",
      "How much time can you give to study each day? Be honest, small and steady beats big and rare.",
      "Which subjects do you enjoy, and which ones feel difficult right now?",
      "Is there an exam coming up? Akash Master will plan around it.",
      `Thank you, ${first}. Now let me introduce you to Akash Master.`,
    ],
    [first],
  );

  const canNext = [
    d.name.trim().length > 0,
    d.level.length > 0,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ][step];

  async function finish() {
    setSaving(true);
    const profile = LearnerProfile.parse({
      name: d.name.trim().slice(0, 60),
      level: d.level,
      course: d.course,
      goals: d.goals,
      language: d.language,
      learningStyle: d.learningStyle,
      dailyStudyMinutes: d.dailyStudyMinutes,
      strongSubjects: d.strongSubjects,
      difficultSubjects: d.difficultSubjects.filter((s) => !d.strongSubjects.includes(s)),
      exam: d.examName ? { name: d.examName, date: d.examDate || undefined } : null,
    });
    guestStore.setProfile(profile);
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }).catch(() => {});
      }
    }
    router.push("/classroom");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-4">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Logo className="text-lg" />
        </Link>
        <span className="text-sm text-muted">
          Step {step + 1} of {TOTAL}
        </span>
      </header>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-little transition-all" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
      </div>

      <section className="mt-8 flex gap-3">
        <PersonaAvatar speaker="little_master" size={44} />
        <div className="rounded-2xl rounded-tl-sm bg-little-soft px-4 py-3">
          <p className="text-xs font-semibold text-little">Little Master</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-0.5 outline-none">
            {prompts[step]}
          </h1>
        </div>
      </section>

      <section className="mt-6 flex-1">
        {step === 0 && (
          <input
            autoFocus
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)}
            maxLength={60}
            placeholder="Your first name"
            aria-label="Your first name"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-lg"
          />
        )}
        {step === 1 && (
          <div className="space-y-5">
            <Chips options={LEVELS} selected={[d.level]} onPick={(v) => setD((x) => ({ ...x, level: v, course: "" }))} label="Level" />
            {d.level && <Chips options={COURSES[d.level] ?? []} selected={[d.course]} onPick={(v) => set("course", v)} label="Course or board" />}
          </div>
        )}
        {step === 2 && <Chips options={GOALS} selected={d.goals} onPick={(v) => toggle("goals", v)} label="Goals" multi />}
        {step === 3 && (
          <Chips options={LANGS.map((l) => l.label)} selected={[LANGS.find((l) => l.id === d.language)!.label]} onPick={(v) => set("language", LANGS.find((l) => l.label === v)!.id)} label="Language" />
        )}
        {step === 4 && (
          <Chips options={STYLES.map((s) => s.label)} selected={[STYLES.find((s) => s.id === d.learningStyle)!.label]} onPick={(v) => set("learningStyle", STYLES.find((s) => s.label === v)!.id)} label="Learning style" />
        )}
        {step === 5 && (
          <Chips options={TIMES.map((t) => (t < 60 ? `${t} minutes` : `${t / 60} hour${t > 60 ? "s" : ""}`))} selected={[TIMES.indexOf(d.dailyStudyMinutes)].map((i) => (TIMES[i] < 60 ? `${TIMES[i]} minutes` : `${TIMES[i] / 60} hour${TIMES[i] > 60 ? "s" : ""}`))} onPick={(_v, i) => set("dailyStudyMinutes", TIMES[i])} label="Daily study time" />
        )}
        {step === 6 && (
          <div className="space-y-5">
            <Chips options={SUBJECTS} selected={d.strongSubjects} onPick={(v) => toggle("strongSubjects", v)} label="I enjoy" multi />
            <Chips options={SUBJECTS.filter((s) => !d.strongSubjects.includes(s))} selected={d.difficultSubjects} onPick={(v) => toggle("difficultSubjects", v)} label="I find difficult" multi />
          </div>
        )}
        {step === 7 && (
          <div className="space-y-4">
            <Chips options={["No exam soon", ...EXAMS]} selected={[d.examName || "No exam soon"]} onPick={(v) => set("examName", v === "No exam soon" ? "" : v)} label="Upcoming exam" />
            {d.examName && (
              <label className="block text-sm">
                <span className="text-muted">Exam date (optional)</span>
                <input type="date" value={d.examDate} onChange={(e) => set("examDate", e.target.value)} className="mt-1 block rounded-xl border border-border bg-surface px-3 py-2" />
              </label>
            )}
          </div>
        )}
        {step === 8 && (
          <div className="rounded-2xl bg-akash-soft p-5">
            <div className="flex items-center gap-3">
              <PersonaAvatar speaker="akash_master" size={48} />
              <div>
                <p className="font-semibold">Akash Master</p>
                <p className="text-sm text-muted">Your teacher, for every subject</p>
              </div>
            </div>
            <p className="mt-3">
              He is patient, rigorous and warm, and he teaches from first principles. He will draw on the chalkboard when a picture helps, and
              you can draw your own working for him to check. I&apos;ll be right there too, taking notes after every class so he remembers what
              you&apos;ve learned. And it&apos;s all free, {first}.
            </p>
          </div>
        )}
      </section>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 bg-background py-4">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-xl px-4 py-3 text-muted disabled:opacity-0">
          Back
        </button>
        {step < TOTAL - 1 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="rounded-xl bg-little px-6 py-3 font-medium text-white disabled:opacity-40">
            {[2, 6, 7].includes(step) && !(step === 2 ? d.goals.length : step === 6 ? d.strongSubjects.length + d.difficultSubjects.length : d.examName) ? "Skip" : "Next"}
          </button>
        ) : (
          <button onClick={finish} disabled={saving} className="rounded-xl bg-akash px-6 py-3 font-medium text-white disabled:opacity-60">
            {saving ? "Opening the classroom..." : "Enter the classroom"}
          </button>
        )}
      </footer>
    </main>
  );
}

function Chips({ options, selected, onPick, label, multi }: { options: string[]; selected: string[]; onPick: (v: string, i: number) => void; label: string; multi?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-muted">
        {label}
        {multi ? " (choose any)" : ""}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o, i)}
              className={`rounded-full border px-4 py-2 text-sm transition ${on ? "border-little bg-little-soft font-medium text-foreground" : "border-border bg-surface hover:bg-surface-2"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

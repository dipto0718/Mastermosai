import Link from "next/link";
import { BoardCanvas } from "@/components/whiteboard/BoardCanvas";
import { Logo, PersonaAvatar } from "@/components/Persona";
import { PYTHAGORAS_BOARD } from "@/lib/personas/demo";

const STEPS = [
  { title: "You ask", body: "Type a doubt in English, Hindi, Bengali, Hinglish or Banglish, or draw your working." },
  { title: "Little Master listens", body: "He understands what you need and brings you to Akash Master with a short briefing." },
  { title: "Akash Master teaches", body: "Step by step, from first principles, drawing on the chalkboard when a picture helps." },
  { title: "Notes are taken", body: "Little Master writes class notes so every next lesson knows you a little better." },
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo className="text-xl" />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-surface-2">
            Sign in
          </Link>
          <Link href="/onboarding" className="rounded-lg bg-akash px-3 py-2 font-medium text-white">
            Start learning
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 md:grid-cols-2 md:pt-16">
        <div>
          <p className="mb-3 inline-block rounded-full bg-little-soft px-3 py-1 text-sm font-medium text-little">
            Free for every student. Always.
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Your Personal AI Mentor for Lifelong Learning
          </h1>
          <p className="mt-4 text-lg text-muted">
            Learn with Akash Master, a patient, rigorous and warm teacher for every subject, from Class 6 to JEE, NEET, UPSC and beyond.
            No student should stop learning because of money, language or location.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/onboarding" className="rounded-xl bg-akash px-5 py-3 font-medium text-white">
              Meet Little Master
            </Link>
            <Link href="/classroom" className="rounded-xl border border-border px-5 py-3 font-medium hover:bg-surface-2">
              Go straight to class
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">No account needed. Sign in later to keep your progress on any device.</p>
        </div>
        <div className="rounded-2xl border-[8px] border-board-edge bg-board p-2 shadow-xl">
          <div className="aspect-[5/3]">
            <BoardCanvas steps={PYTHAGORAS_BOARD.steps} upTo={PYTHAGORAS_BOARD.steps.length - 1} boardKey="hero" animate />
          </div>
          <p className="px-2 pb-1 font-chalk text-[#f4f1e8]/80">Akash Master explains Pythagoras&apos; theorem</p>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
          <article className="rounded-2xl bg-akash-soft p-6">
            <div className="flex items-center gap-3">
              <PersonaAvatar speaker="akash_master" size={48} />
              <div>
                <h2 className="text-xl font-semibold">Akash Master</h2>
                <p className="text-sm text-muted">The teacher, for every subject</p>
              </div>
            </div>
            <p className="mt-4">
              Patient, rigorous, warm and honest. He explains from first principles, solves with you, sets practice, draws on the
              whiteboard and checks that you truly understood. &ldquo;Akash&rdquo; means sky.
            </p>
          </article>
          <article className="rounded-2xl bg-little-soft p-6">
            <div className="flex items-center gap-3">
              <PersonaAvatar speaker="little_master" size={48} />
              <div>
                <h2 className="text-xl font-semibold">Little Master</h2>
                <p className="text-sm text-muted">Your guide, at every step</p>
              </div>
            </div>
            <p className="mt-4">
              Akash Master&apos;s own former student, now the bright, kind senior who welcomes you, understands what you need, takes your
              class notes and keeps you going.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold">How a class works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-surface p-5">
              <span className="text-sm font-semibold text-akash">Step {i + 1}</span>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-border px-4 py-6 text-center text-sm text-muted">
        Mastermosai is free for every student. Need someone to talk to? Tele-MANAS: 14416 (free, 24x7).
      </footer>
    </main>
  );
}

# Mastermosai AI

Your Personal AI Mentor for Lifelong Learning. **Free for every student**: no plans, no payments.

Students meet two characters: **Little Master**, the guide who talks to them first and takes class notes, and **Akash Master**, the teacher who explains, solves and draws on a chalkboard.

## Run it

```bash
npm install
cp .env.example .env.local   # optional; with no keys it runs in demo mode
npm run dev
```

Open http://localhost:3000. With no `ANTHROPIC_API_KEY`, demo mode runs scripted personas and a sample Pythagoras lesson.

## Checks

```bash
npm run typecheck
npm run lint
npm test          # unit tests + mediator flow against a simulated Claude API
npm run build
```

## How a turn works (`POST /api/guide`, NDJSON stream)

1. **Route**: Little Master (Claude Opus 5.5, low effort, structured output) reads the message, the last 12 turns and the learner profile, and either answers or briefs Akash Master.
2. **Teach**: Akash Master (Claude Opus 5.5, high effort, streamed) teaches; the `draw_on_whiteboard` tool is validated with zod before anything is shown, and an invalid board is returned to him as an error (up to 4 rounds).
3. **Take notes**: Little Master writes a one-line summary and up to 3 AI Brain memories, merged by kind + subject + topic.
4. **Save**: signed-in turns go to Supabase; guest turns stay in the browser.

Persona prompts carry no per-student data, so they cache across students; the learner context is a second cached block; the per-turn briefing is a mid-conversation system message. Refusals fall back server-side (`fallbacks: "default"`).

## Layout

- `src/lib/personas/`: prompts, mediator (Claude calls), demo mode
- `src/lib/whiteboard.ts`: board schema, validation, tool description
- `src/components/whiteboard/`: teacher board player, student canvas
- `src/app/`: landing, `/onboarding`, `/classroom`, `/login`, API routes, `/auth/callback`
- `supabase/migrations/0001_init.sql`: ten tables, Row Level Security on all, ownership triggers

## Supabase setup

Create a project, run `supabase/migrations/0001_init.sql`, enable Google and email (magic link) providers, add `http://localhost:3000/auth/callback` (and your production URL) to the redirect allow-list, then set the two `NEXT_PUBLIC_SUPABASE_*` variables.

## Still to do before a public launch

- Akash Master's personal touches (his sayings, values, story) in `src/lib/personas/prompts.ts`
- Per-IP rate limiting, privacy policy, parental consent for under-18s
- First live run with a real API key; check `cache_read_input_tokens` once live

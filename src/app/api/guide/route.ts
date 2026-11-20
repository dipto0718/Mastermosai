import Anthropic from "@anthropic-ai/sdk";
import { getFairUseDailyLimit, isDemoMode } from "@/lib/config";
import { encodeEvent, type GuideEvent } from "@/lib/events";
import { runDemoTurn } from "@/lib/personas/demo";
import { runClassroomTurn } from "@/lib/personas/mediator";
import { GuideRequest, type ClassNotes } from "@/lib/schemas";
import { countTodayTurns, loadMemories, loadProfile, saveTurn } from "@/lib/supabase/store";
import { getVerifiedUser } from "@/lib/supabase/server";
import type { Board } from "@/lib/whiteboard";

export const maxDuration = 300;

/** One classroom turn, streamed back as newline-delimited JSON events. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = GuideRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const req = parsed.data;

  // Signed-in students: identity is verified on the server and their data comes from the database, not the client.
  const { supabase, userId } = await getVerifiedUser();
  if (supabase && userId) {
    const [profile, memories] = await Promise.all([loadProfile(supabase, userId), loadMemories(supabase, userId)]);
    req.profile = profile ?? req.profile;
    req.memories = memories;
    const limit = getFairUseDailyLimit();
    if (limit && (await countTodayTurns(supabase, userId)) >= limit) {
      return Response.json(
        { error: `You've had ${limit} classes today. Mastermosai stays free for everyone. Come back tomorrow!` },
        { status: 429 },
      );
    }
  }

  const demo = isDemoMode();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: GuideEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      let littleText: string | null = null;
      let akashText: string | null = null;
      const boards: Board[] = [];
      let notes: ClassNotes | null = null;
      try {
        const turn = demo ? runDemoTurn(req, abort.signal) : runClassroomTurn(req, abort.signal);
        for await (const event of turn) {
          if (event.type === "little_master") littleText = littleText ? `${littleText}\n${event.text}` : event.text;
          if (event.type === "board") boards.push(event.board);
          if (event.type === "akash_end") akashText = event.text;
          if (event.type === "notes") notes = event.notes;
          send(event);
        }
        if (supabase && userId) {
          try {
            const conversationId = await saveTurn(supabase, userId, {
              conversationId: req.conversationId,
              mode: req.mode,
              studentText: req.message,
              littleText,
              akashText,
              boards,
              notes,
            });
            send({ type: "saved", conversationId });
          } catch (err) {
            console.error("Saving the class failed", err);
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("Classroom turn failed", err);
          send({ type: "error", message: friendlyError(err) });
        }
      } finally {
        try {
          send({ type: "done" });
          controller.close();
        } catch {
          // Client already went away.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Mastermosai-Demo": demo ? "1" : "0",
    },
  });
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "The classroom is very busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The teachers aren't connected yet (API key problem). Please tell the Mastermosai team.";
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return "Akash Master stepped out for a moment. Please try again.";
  return "Something went wrong in class. Please try again.";
}

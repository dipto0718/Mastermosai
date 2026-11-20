import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getModelConfig } from "../config";
import type { GuideEvent } from "../events";
import { buildLearnerContext, historyToMessages } from "../learner-context";
import { ClassNotes, MODE_LABELS, RouterDecision, type GuideRequest } from "../schemas";
import { Board, validateBoard, WHITEBOARD_TOOL_DESCRIPTION, type Board as BoardT } from "../whiteboard";
import { AKASH_MASTER_PROMPT, LITTLE_MASTER_NOTES_PROMPT, LITTLE_MASTER_PROMPT } from "./prompts";

type Msg = Anthropic.Beta.BetaMessageParam;
type SystemBlocks = Anthropic.Beta.BetaTextBlockParam[];

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_BOARD_ROUNDS = 4;

const WHITEBOARD_TOOL: Anthropic.Beta.BetaTool = {
  name: "draw_on_whiteboard",
  description: WHITEBOARD_TOOL_DESCRIPTION,
  eager_input_streaming: true,
  input_schema: z.toJSONSchema(Board, { io: "input", target: "draft-2020-12" }) as Anthropic.Beta.BetaTool.InputSchema,
};

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

function fallbackParams() {
  return getModelConfig().refusalFallback
    ? { betas: [FALLBACK_BETA] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const }
    : {};
}

/** Persona prompt then learner context: two cache breakpoints, identical across turns for a student. */
function systemBlocks(persona: string, learnerContext: string): SystemBlocks {
  return [
    { type: "text", text: persona, cache_control: { type: "ephemeral" } },
    { type: "text", text: learnerContext, cache_control: { type: "ephemeral" } },
  ];
}

function studentContent(req: GuideRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.image) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(req.image);
    if (match) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: match[1] as "image/png" | "image/jpeg" | "image/webp", data: match[2] },
      });
    }
  }
  blocks.push({ type: "text", text: req.image ? `${req.message}\n\n[The student attached a drawing from their canvas.]` : req.message });
  return blocks;
}

function baseMessages(req: GuideRequest): Msg[] {
  const msgs: Msg[] = historyToMessages(req.history);
  const content = studentContent(req);
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user") {
    last.content = [{ type: "text", text: last.content as string }, ...content];
  } else {
    msgs.push({ role: "user", content });
  }
  return msgs;
}

const DEFAULT_BRIEFING = (req: GuideRequest): NonNullable<RouterDecision["briefing"]> => ({
  mode: req.mode ?? "concept",
  topic: req.message.slice(0, 120),
  studentNeeds: "Little Master could not brief this one. Read the student's message carefully and respond with full care.",
  focus: "If anything sounds sensitive or distressing, put the student's wellbeing first.",
  shouldDraw: false,
});

/** Step 1: Little Master routes the message. */
async function route(req: GuideRequest, learnerContext: string): Promise<RouterDecision | null> {
  const cfg = getModelConfig().little;
  const messages = baseMessages(req);
  if (req.mode) {
    messages.push({ role: "system", content: `The student picked the ${MODE_LABELS[req.mode]} teaching mode.` });
  }
  const response = await getClient().beta.messages.parse({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    output_config: { effort: cfg.effort, format: betaZodOutputFormat(RouterDecision) },
    system: systemBlocks(LITTLE_MASTER_PROMPT, learnerContext),
    messages,
    ...fallbackParams(),
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  const decision = response.parsed_output;
  if (decision.route === "akash_master" && !decision.briefing) return { ...decision, briefing: DEFAULT_BRIEFING(req) };
  return decision;
}

function briefingText(b: NonNullable<RouterDecision["briefing"]>): string {
  return [
    "Briefing from Little Master for this lesson:",
    `- Mode: ${MODE_LABELS[b.mode]}`,
    `- Topic: ${b.topic}`,
    `- What the student needs: ${b.studentNeeds}`,
    `- Focus: ${b.focus}`,
    `- Whiteboard: ${b.shouldDraw ? "a drawing would help here" : "only draw if it clearly helps"}`,
  ].join("\n");
}

const REFUSED_LESSON =
  "I am sorry, beta, I can't help with that one here. If something is troubling you, please talk to someone you trust, or call Tele-MANAS on 14416 any time. It is free. Shall we pick up a different question together?";

/** Step 2: Akash Master teaches, streaming text and drawing boards (up to 4 rounds). */
async function* teach(
  req: GuideRequest,
  learnerContext: string,
  briefing: NonNullable<RouterDecision["briefing"]>,
  signal: AbortSignal,
): AsyncGenerator<GuideEvent, { text: string; boards: BoardT[] }> {
  const cfg = getModelConfig().akash;
  const messages: Msg[] = [...baseMessages(req), { role: "system", content: briefingText(briefing) }];
  const boards: BoardT[] = [];
  let text = "";
  let jsonRetries = 0;

  for (let round = 0; round < MAX_BOARD_ROUNDS + 1; round++) {
    const allowTools = round < MAX_BOARD_ROUNDS;
    const stream = getClient().beta.messages.stream(
      {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        output_config: { effort: cfg.effort },
        system: systemBlocks(AKASH_MASTER_PROMPT, learnerContext),
        tools: [WHITEBOARD_TOOL],
        tool_choice: allowTools ? { type: "auto" } : { type: "none" },
        messages,
        ...fallbackParams(),
      },
      { signal },
    );

    let message: Anthropic.Beta.BetaMessage;
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          yield { type: "akash_delta", text: event.delta.text };
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Re-issue only for unparseable tool input or a dropped connection; API errors propagate.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      if (!text.trim()) {
        text = REFUSED_LESSON;
        yield { type: "akash_delta", text };
      }
      break;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0 || message.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const checked = use.name === WHITEBOARD_TOOL.name ? validateBoard(use.input) : { ok: false as const, error: `Unknown tool ${use.name}` };
      if (checked.ok) {
        boards.push(checked.board);
        yield { type: "board", board: checked.board };
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `Shown to the student: "${checked.board.title}" (${checked.board.steps.length} steps). Now explain it in the chat.`,
        });
      } else {
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: checked.error });
      }
    }
    messages.push({ role: "user", content: results });
    if (text && !text.endsWith("\n")) {
      text += "\n\n";
      yield { type: "akash_delta", text: "\n\n" };
    }
  }
  return { text: text.trim(), boards };
}

/** Step 3: Little Master takes class notes. */
async function takeNotes(
  req: GuideRequest,
  learnerContext: string,
  lessonText: string,
  boards: BoardT[],
): Promise<ClassNotes | null> {
  const cfg = getModelConfig().little;
  const exchange = [
    `Student: ${req.message}`,
    `Akash Master: ${lessonText}`,
    boards.length ? `Boards drawn: ${boards.map((b) => b.title).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await getClient().beta.messages.parse({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    output_config: { effort: cfg.effort, format: betaZodOutputFormat(ClassNotes) },
    system: systemBlocks(LITTLE_MASTER_NOTES_PROMPT, learnerContext),
    messages: [{ role: "user", content: exchange }],
    ...fallbackParams(),
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}

/** One classroom turn: route, teach, take notes. */
export async function* runClassroomTurn(req: GuideRequest, signal: AbortSignal): AsyncGenerator<GuideEvent> {
  const learnerContext = buildLearnerContext(req.profile, req.memories);

  let decision: RouterDecision | null = null;
  try {
    decision = await route(req, learnerContext);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw err;
    console.error("Little Master routing failed; sending to Akash Master", err);
  }

  if (decision?.route === "little_master") {
    yield { type: "little_master", text: decision.reply };
    return;
  }

  // Routing failed or was refused: Akash Master handles it with full care.
  const briefing = decision?.briefing ?? DEFAULT_BRIEFING(req);
  if (decision?.reply) yield { type: "little_master", text: decision.reply };
  yield { type: "handover", briefing };
  yield { type: "akash_start" };

  const gen = teach(req, learnerContext, briefing, signal);
  let lesson: { text: string; boards: BoardT[] };
  for (;;) {
    const step = await gen.next();
    if (step.done) {
      lesson = step.value;
      break;
    }
    yield step.value;
  }
  yield { type: "akash_end", text: lesson.text, boardTitles: lesson.boards.map((b) => b.title) };

  if (signal.aborted || !lesson.text) return;
  try {
    const notes = await takeNotes(req, learnerContext, lesson.text, lesson.boards);
    if (notes) yield { type: "notes", notes };
  } catch (err) {
    console.error("Class notes failed", err);
  }
}

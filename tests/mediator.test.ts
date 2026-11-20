import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GuideEvent } from "@/lib/events";
import { PYTHAGORAS_BOARD } from "@/lib/personas/demo";
import { GuideRequest } from "@/lib/schemas";

/**
 * Runs the real mediator and the real Anthropic SDK against a simulated Claude API,
 * so request shapes (models, effort, fallbacks, tools, system messages) are checked end to end.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed recorded request bodies
type Recorded = { headers: http.IncomingHttpHeaders; body: Record<string, any> };
let requests: Recorded[] = [];
let routeTo: "little_master" | "akash_master" = "akash_master";
let akashRounds = 0;
let server: http.Server;

function sse(res: http.ServerResponse, events: Record<string, unknown>[]) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const start = { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage } };

function toolUseStream(input: unknown) {
  const json = JSON.stringify(input);
  return [
    start,
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: `toolu_${akashRounds}`, name: "draw_on_whiteboard", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: json.slice(0, 20) } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: json.slice(20) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 50 } },
    { type: "message_stop" },
  ];
}

function textStream(text: string) {
  return [
    start,
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, 10) } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(10) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } },
    { type: "message_stop" },
  ];
}

function jsonMessage(res: http.ServerResponse, obj: unknown) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "msg_p",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify(obj) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage,
    }),
  );
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push({ headers: req.headers, body });
      const system = body.system?.[0]?.text ?? "";
      if (!body.stream) {
        if (system.includes("taking class notes")) {
          return jsonMessage(res, {
            summary: "Pythagoras with a 3-4-5 triangle",
            memories: [{ kind: "progress", subject: "Maths", topic: "Pythagoras", fact: "Understands a^2+b^2=c^2", confidence: 0.7 }],
          });
        }
        return jsonMessage(
          res,
          routeTo === "little_master"
            ? { route: "little_master", reply: "Hello! What shall we study today?", briefing: null }
            : {
                route: "akash_master",
                reply: "Let me take this to Akash Master.",
                briefing: { mode: "concept", topic: "Pythagoras", studentNeeds: "intuition", focus: "3-4-5", shouldDraw: true },
              },
        );
      }
      akashRounds++;
      if (akashRounds === 1) return sse(res, toolUseStream({ title: "Broken", steps: [{ caption: "x", elements: [{ type: "point", x: 5000, y: 1 }] }] }));
      if (akashRounds === 2) return sse(res, toolUseStream(PYTHAGORAS_BOARD));
      return sse(res, textStream("See the yellow formula: $a^2+b^2=c^2$."));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterAll(() => server.close());

beforeEach(() => {
  requests = [];
  akashRounds = 0;
});

async function run(message: string) {
  const { runClassroomTurn } = await import("@/lib/personas/mediator");
  const events: GuideEvent[] = [];
  for await (const e of runClassroomTurn(GuideRequest.parse({ message, profile: { name: "Riya", level: "Class 9-10" } }), new AbortController().signal)) events.push(e);
  return events;
}

describe("mediator flow against a simulated Claude API", () => {
  it("routes, teaches with a board (returning an invalid board as an error first), and takes notes", async () => {
    routeTo = "akash_master";
    const events = await run("Explain Pythagoras");
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("little_master");
    expect(types).toContain("handover");
    expect(events.filter((e) => e.type === "board")).toHaveLength(1); // the broken board never reached the student
    expect(events.find((e) => e.type === "akash_end")).toMatchObject({ boardTitles: ["Pythagoras' theorem"] });
    expect(events.at(-1)).toMatchObject({ type: "notes", notes: { summary: "Pythagoras with a 3-4-5 triangle" } });

    const [router, teach1, teach2, teach3, notes] = requests;
    expect(requests).toHaveLength(5);

    // Little Master: low effort, structured output, cached persona + learner context, refusal fallback.
    expect(router.body).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" }, fallbacks: "default" });
    expect(router.body.output_config.format.type).toBe("json_schema");
    expect(router.body.system).toHaveLength(2);
    expect(router.body.system.every((b: { cache_control?: { type: string } }) => b.cache_control?.type === "ephemeral")).toBe(true);
    expect(String(router.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(router.body.thinking).toBeUndefined();

    // Akash Master: high effort, streamed, eager whiteboard tool, briefing as a mid-conversation system message.
    expect(teach1.body).toMatchObject({ model: "claude-opus-5-5", stream: true, output_config: { effort: "high" }, max_tokens: 64000 });
    expect(teach1.body.tools[0]).toMatchObject({ name: "draw_on_whiteboard", eager_input_streaming: true });
    expect(teach1.body.tool_choice).toEqual({ type: "auto" });
    expect(teach1.body.messages.at(-1)).toMatchObject({ role: "system" });
    expect(teach1.body.messages.at(-1).content).toContain("Mode: Concept");
    expect(teach1.body.system[0].text).toMatch(/^You are Akash Master/);
    expect(teach1.body.system[1].text).toBe(router.body.system[1].text); // same learner context block: shared cache prefix

    const err = teach2.body.messages.at(-1).content[0];
    expect(err).toMatchObject({ type: "tool_result", is_error: true });
    expect(err.content).toMatch(/Invalid board/);
    expect(teach3.body.messages.at(-1).content[0]).toMatchObject({ type: "tool_result" });
    expect(teach3.body.messages.at(-1).content[0].is_error).toBeUndefined();

    expect(notes.body.output_config).toMatchObject({ effort: "low" });
  });

  it("lets Little Master answer small talk without calling Akash Master", async () => {
    routeTo = "little_master";
    const events = await run("hi");
    expect(events).toEqual([{ type: "little_master", text: "Hello! What shall we study today?" }]);
    expect(requests).toHaveLength(1);
  });
});

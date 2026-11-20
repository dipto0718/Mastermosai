import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normaliseDisplayMath } from "@/components/Markdown";
import { smoothPath } from "@/components/whiteboard/BoardCanvas";
import { decodeEvents, encodeEvent } from "@/lib/events";
import { buildLearnerContext, historyToMessages } from "@/lib/learner-context";
import { mergeMemories } from "@/lib/memory";
import { PYTHAGORAS_BOARD } from "@/lib/personas/demo";
import { safeNextPath } from "@/lib/safe-redirect";
import { GuideRequest, LearnerProfile, type LearnerMemory } from "@/lib/schemas";
import { Board, validateBoard } from "@/lib/whiteboard";

describe("whiteboard validation", () => {
  it("accepts the demo board", () => {
    expect(validateBoard(PYTHAGORAS_BOARD).ok).toBe(true);
  });

  it("rejects off-board coordinates and too many steps with a readable error", () => {
    const bad = { title: "x", steps: [{ caption: "c", elements: [{ type: "point", x: 1200, y: 10 }] }] };
    const r = validateBoard(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/steps\.0\.elements\.0\.x/);
    const tooMany = { title: "x", steps: Array.from({ length: 13 }, () => ({ caption: "c", elements: [] })) };
    expect(validateBoard(tooMany).ok).toBe(false);
  });

  it("fills defaults (colour) and produces a JSON schema for the tool", () => {
    const r = validateBoard({ title: "t", steps: [{ caption: "c", elements: [{ type: "text", x: 10, y: 10, text: "hi" }] }] });
    expect(r.ok && r.board.steps[0].elements[0]).toMatchObject({ color: "white", size: 28 });
    const schema = z.toJSONSchema(Board, { io: "input" }) as { type: string; required: string[] };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["title", "steps"]);
  });

  it("draws smooth curves that start at the first point", () => {
    expect(smoothPath([[0, 0], [50, 50], [100, 0]], false)).toMatch(/^M 0 0 C /);
  });
});

describe("AI Brain memory merge", () => {
  it("updates one row for a repeat fact about the same topic", () => {
    const existing: LearnerMemory[] = [{ kind: "weakness", subject: "Maths", topic: "Fractions", fact: "Confuses numerator", confidence: 0.5 }];
    const merged = mergeMemories(existing, [{ kind: "weakness", subject: "maths ", topic: "fractions", fact: "Now adds unlike denominators wrongly", confidence: 0.8 }], "2026-11-20T00:00:00Z");
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ fact: "Now adds unlike denominators wrongly", confidence: 0.8 });
  });

  it("keeps different kinds separate", () => {
    const merged = mergeMemories([], [
      { kind: "strength", subject: "Maths", topic: "Algebra", fact: "a", confidence: 1 },
      { kind: "weakness", subject: "Maths", topic: "Algebra", fact: "b", confidence: 1 },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("learner context and history", () => {
  const profile = LearnerProfile.parse({ name: "Riya", level: "Class 9-10", language: "bengali", exam: { name: "Board exams" } });

  it("is deterministic and puts the most confident memories first", () => {
    const mems: LearnerMemory[] = Array.from({ length: 50 }, (_, i) => ({ kind: "progress", subject: "S", topic: `t${i}`, fact: `f${i}`, confidence: i / 50 }));
    const a = buildLearnerContext(profile, mems);
    const b = buildLearnerContext(profile, [...mems].reverse());
    expect(a).toBe(b);
    expect(a).toContain("Preferred language: bengali");
    expect(a.indexOf("t49")).toBeLessThan(a.indexOf("t48"));
    expect(a).not.toContain(": f9\n"); // only the top 40 are kept
  });

  it("keeps the last 12 turns, starts with the user, and shows boards as titles", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      speaker: i % 2 ? ("akash_master" as const) : ("student" as const),
      text: `m${i}`,
      boardTitles: i === 19 ? ["Circles"] : undefined,
    }));
    const msgs = historyToMessages(history);
    expect(msgs[0].role).toBe("user");
    expect(msgs.length).toBeLessThanOrEqual(12);
    expect(msgs.at(-1)?.content).toContain("[Drew on the whiteboard: Circles]");
  });
});

describe("request validation and helpers", () => {
  it("rejects non-image data URLs and empty messages", () => {
    expect(GuideRequest.safeParse({ message: "hi", image: "data:text/html;base64,AAAA" }).success).toBe(false);
    expect(GuideRequest.safeParse({ message: "   " }).success).toBe(false);
    expect(GuideRequest.safeParse({ message: "hi" }).success).toBe(true);
  });

  it("only allows same-site redirects", () => {
    expect(safeNextPath("/classroom?x=1")).toBe("/classroom?x=1");
    expect(safeNextPath("//evil.example")).toBe("/classroom");
    expect(safeNextPath("https://evil.example")).toBe("/classroom");
    expect(safeNextPath("/\\evil.example")).toBe("/classroom");
  });

  it("round-trips NDJSON events across chunk boundaries", () => {
    const wire = encodeEvent({ type: "akash_delta", text: "a\nb" }) + encodeEvent({ type: "done" });
    const first = decodeEvents(wire.slice(0, 10));
    const second = decodeEvents(first.rest + wire.slice(10));
    expect([...first.events, ...second.events]).toEqual([{ type: "akash_delta", text: "a\nb" }, { type: "done" }]);
  });

  it("puts one-line display equations on their own lines", () => {
    expect(normaliseDisplayMath("So $$a^2+b^2=c^2$$ holds")).toContain("\n$$\na^2+b^2=c^2\n$$\n");
  });
});

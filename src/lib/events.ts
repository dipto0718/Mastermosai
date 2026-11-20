import type { Board } from "./whiteboard";
import type { ClassNotes, RouterDecision } from "./schemas";

/** Events streamed from POST /api/guide as newline-delimited JSON. */
export type GuideEvent =
  | { type: "little_master"; text: string }
  | { type: "handover"; briefing: NonNullable<RouterDecision["briefing"]> }
  | { type: "akash_start" }
  | { type: "akash_delta"; text: string }
  | { type: "board"; board: Board }
  | { type: "akash_end"; text: string; boardTitles: string[] }
  | { type: "notes"; notes: ClassNotes }
  | { type: "saved"; conversationId: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function encodeEvent(e: GuideEvent): string {
  return JSON.stringify(e) + "\n";
}

/** Parse an NDJSON buffer, returning complete events and the leftover partial line. */
export function decodeEvents(buffer: string): { events: GuideEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: GuideEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as GuideEvent);
    } catch {
      // Skip a malformed line rather than breaking the class.
    }
  }
  return { events, rest };
}

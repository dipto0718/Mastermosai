import type { ClassNotes, LearnerMemory } from "./schemas";

export function memoryKey(m: Pick<LearnerMemory, "kind" | "subject" | "topic">) {
  return `${m.kind}|${m.subject.trim().toLowerCase()}|${m.topic.trim().toLowerCase()}`;
}

/** Merge new notes into the AI Brain: one memory per kind + subject + topic, updated rather than duplicated. */
export function mergeMemories(
  existing: LearnerMemory[],
  incoming: ClassNotes["memories"],
  now = new Date().toISOString(),
): LearnerMemory[] {
  const byKey = new Map(existing.map((m) => [memoryKey(m), m]));
  for (const m of incoming) {
    byKey.set(memoryKey(m), {
      kind: m.kind,
      subject: m.subject.trim(),
      topic: m.topic.trim(),
      fact: m.fact.trim(),
      confidence: Math.max(0, Math.min(1, m.confidence)),
      updatedAt: now,
    });
  }
  return [...byKey.values()];
}

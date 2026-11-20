import type { ChatTurn, LearnerMemory, LearnerProfile } from "./schemas";

const MAX_MEMORIES = 40;
export const HISTORY_TURNS = 12;

/** Most confident first, then most recent; at most 40. Deterministic so the cache prefix stays stable. */
export function selectMemories(memories: LearnerMemory[]): LearnerMemory[] {
  return [...memories]
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
        `${a.kind}|${a.subject}|${a.topic}`.localeCompare(`${b.kind}|${b.subject}|${b.topic}`),
    )
    .slice(0, MAX_MEMORIES);
}

/** The second, cacheable system block: who this learner is. */
export function buildLearnerContext(profile: LearnerProfile | null, memories: LearnerMemory[]): string {
  const lines: string[] = ["# Learner context"];
  if (!profile) {
    lines.push("A guest who has not finished onboarding. Preferred language unknown: follow how they write.");
  } else {
    lines.push(
      `Name: ${profile.name}`,
      `Level: ${profile.level}${profile.course ? `, ${profile.course}` : ""}${profile.institution ? ` (${profile.institution})` : ""}`,
      `Preferred language: ${profile.language}`,
      `Learning style: ${profile.learningStyle.replace(/_/g, " ")}`,
      `Daily study time: ${profile.dailyStudyMinutes} minutes`,
    );
    if (profile.goals.length) lines.push(`Goals: ${profile.goals.join("; ")}`);
    if (profile.strongSubjects.length) lines.push(`Strong subjects: ${profile.strongSubjects.join(", ")}`);
    if (profile.difficultSubjects.length) lines.push(`Finds difficult: ${profile.difficultSubjects.join(", ")}`);
    if (profile.exam) lines.push(`Upcoming exam: ${profile.exam.name}${profile.exam.date ? ` on ${profile.exam.date}` : ""}`);
  }
  const chosen = selectMemories(memories);
  lines.push("", "# AI Brain (what we know from earlier classes)");
  if (chosen.length === 0) lines.push("Nothing yet: this is an early class.");
  for (const m of chosen) {
    lines.push(`- [${m.kind}] ${m.subject || "general"} / ${m.topic || "general"}: ${m.fact}`);
  }
  return lines.join("\n");
}

/** History is rebuilt from text each turn; boards appear only as their titles. */
export function renderTurn(turn: ChatTurn): string {
  const who = turn.speaker === "student" ? "" : turn.speaker === "akash_master" ? "[Akash Master] " : "[Little Master] ";
  const boards = turn.boardTitles?.length ? `\n[Drew on the whiteboard: ${turn.boardTitles.join("; ")}]` : "";
  return `${who}${turn.text}${boards}`;
}

/**
 * Convert recent history to alternating user/assistant messages.
 * Both personas' turns become assistant text so the transcript reads naturally.
 */
export function historyToMessages(history: ChatTurn[]): { role: "user" | "assistant"; content: string }[] {
  const recent = history.slice(-HISTORY_TURNS);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of recent) {
    const role = turn.speaker === "student" ? "user" : "assistant";
    const text = renderTurn(turn);
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  // The API requires the first message to be from the user.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

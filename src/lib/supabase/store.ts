import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LearnerMemory, LearnerProfile, type ClassNotes, type TeachingMode } from "../schemas";
import type { Board } from "../whiteboard";

/** Every row read back from the database is validated before use. */
const ProfileRow = z.object({
  name: z.string(),
  level: z.string(),
  course: z.string(),
  institution: z.string(),
  language: z.string(),
  learning_style: z.string(),
  daily_study_minutes: z.number(),
});
const MemoryRow = z.object({
  kind: z.string(),
  subject: z.string(),
  topic: z.string(),
  fact: z.string(),
  confidence: z.number(),
  updated_at: z.string(),
});

export async function loadProfile(db: SupabaseClient, userId: string): Promise<LearnerProfile | null> {
  const [p, goals, subjects, exams] = await Promise.all([
    db.from("learner_profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("learner_goals").select("goal").eq("user_id", userId).order("created_at"),
    db.from("learner_subjects").select("subject, kind").eq("user_id", userId),
    db.from("exam_goals").select("exam_name, exam_date").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
  ]);
  const row = ProfileRow.safeParse(p.data);
  if (!row.success) return null;
  const parsed = LearnerProfile.safeParse({
    name: row.data.name,
    level: row.data.level,
    course: row.data.course,
    institution: row.data.institution,
    language: row.data.language,
    learningStyle: row.data.learning_style,
    dailyStudyMinutes: row.data.daily_study_minutes,
    goals: (goals.data ?? []).map((g) => g.goal),
    strongSubjects: (subjects.data ?? []).filter((s) => s.kind === "strong").map((s) => s.subject),
    difficultSubjects: (subjects.data ?? []).filter((s) => s.kind === "difficult").map((s) => s.subject),
    exam: exams.data?.[0] ? { name: exams.data[0].exam_name, date: exams.data[0].exam_date ?? undefined } : null,
  });
  return parsed.success ? parsed.data : null;
}

export async function saveProfile(db: SupabaseClient, userId: string, profile: LearnerProfile) {
  const up = await db.from("learner_profiles").upsert({
    user_id: userId,
    name: profile.name,
    level: profile.level,
    course: profile.course,
    institution: profile.institution,
    language: profile.language,
    learning_style: profile.learningStyle,
    daily_study_minutes: profile.dailyStudyMinutes,
    updated_at: new Date().toISOString(),
  });
  if (up.error) throw up.error;

  await db.from("learner_goals").delete().eq("user_id", userId);
  await db.from("learner_subjects").delete().eq("user_id", userId);
  await db.from("exam_goals").delete().eq("user_id", userId);
  if (profile.goals.length) await db.from("learner_goals").insert(profile.goals.map((goal) => ({ user_id: userId, goal })));
  const subjects = [
    ...new Set(profile.strongSubjects),
  ].map((subject) => ({ user_id: userId, subject, kind: "strong" }))
    .concat([...new Set(profile.difficultSubjects)].map((subject) => ({ user_id: userId, subject, kind: "difficult" })));
  if (subjects.length) await db.from("learner_subjects").insert(subjects);
  if (profile.exam) {
    const date = profile.exam.date && /^\d{4}-\d{2}-\d{2}$/.test(profile.exam.date) ? profile.exam.date : null;
    await db.from("exam_goals").insert({ user_id: userId, exam_name: profile.exam.name, exam_date: date });
  }
  await db.from("profiles").update({ onboarded: true, display_name: profile.name, updated_at: new Date().toISOString() }).eq("user_id", userId);
}

export async function loadMemories(db: SupabaseClient, userId: string): Promise<LearnerMemory[]> {
  const { data } = await db
    .from("learner_memories")
    .select("kind, subject, topic, fact, confidence, updated_at")
    .eq("user_id", userId)
    .order("confidence", { ascending: false })
    .limit(200);
  const out: LearnerMemory[] = [];
  for (const raw of data ?? []) {
    const row = MemoryRow.safeParse(raw);
    if (!row.success) continue;
    const m = LearnerMemory.safeParse({ ...row.data, updatedAt: row.data.updated_at });
    if (m.success) out.push(m.data);
  }
  return out;
}

/** Turns used today, for the optional fair-use cap. */
export async function countTodayTurns(db: SupabaseClient, userId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("speaker", "student")
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function saveTurn(
  db: SupabaseClient,
  userId: string,
  input: {
    conversationId: string | null;
    mode: TeachingMode | null;
    studentText: string;
    littleText: string | null;
    akashText: string | null;
    boards: Board[];
    notes: ClassNotes | null;
  },
): Promise<string> {
  let conversationId = input.conversationId;
  if (conversationId) {
    const owned = await db.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (!owned.data) conversationId = null;
  }
  if (!conversationId) {
    const created = await db
      .from("conversations")
      .insert({ user_id: userId, title: input.studentText.slice(0, 80), last_mode: input.mode })
      .select("id")
      .single();
    if (created.error) throw created.error;
    conversationId = created.data.id as string;
  } else {
    await db.from("conversations").update({ last_mode: input.mode, updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  const base = { conversation_id: conversationId, user_id: userId };
  const ins = await db.from("messages").insert({ ...base, speaker: "student", content: input.studentText });
  if (ins.error) throw ins.error;
  if (input.littleText) await db.from("messages").insert({ ...base, speaker: "little_master", content: input.littleText });
  if (input.akashText) {
    const akash = await db.from("messages").insert({ ...base, speaker: "akash_master", content: input.akashText }).select("id").single();
    if (akash.error) throw akash.error;
    if (input.boards.length) {
      const boards = await db
        .from("whiteboards")
        .insert(input.boards.map((b) => ({ ...base, message_id: akash.data.id, title: b.title, scene: b })));
      if (boards.error) throw boards.error;
    }
  }
  if (input.notes) {
    await db.from("class_notes").insert({ ...base, summary: input.notes.summary });
    for (const m of input.notes.memories) {
      const existing = await db
        .from("learner_memories")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", m.kind)
        .ilike("subject", escapeLike(m.subject.trim()))
        .ilike("topic", escapeLike(m.topic.trim()))
        .maybeSingle();
      const row = {
        user_id: userId,
        kind: m.kind,
        subject: m.subject.trim(),
        topic: m.topic.trim(),
        fact: m.fact.trim().slice(0, 400),
        confidence: Math.max(0, Math.min(1, m.confidence)),
        updated_at: new Date().toISOString(),
      };
      if (existing.data) await db.from("learner_memories").update(row).eq("id", existing.data.id);
      else await db.from("learner_memories").insert(row);
    }
  }
  return conversationId;
}

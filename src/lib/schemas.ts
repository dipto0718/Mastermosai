import { z } from "zod";

/** Teaching modes: the ten mentors from PRD v1.0, now Akash Master's modes. */
export const TEACHING_MODES = [
  "concept",
  "practice",
  "exam",
  "revision",
  "coding",
  "research",
  "career",
  "project",
  "motivation",
  "communication",
] as const;
export const TeachingMode = z.enum(TEACHING_MODES);
export type TeachingMode = z.infer<typeof TeachingMode>;

export const MODE_LABELS: Record<TeachingMode, string> = {
  concept: "Concept",
  practice: "Practice",
  exam: "Exam",
  revision: "Revision",
  coding: "Coding",
  research: "Research",
  career: "Career",
  project: "Project",
  motivation: "Motivation",
  communication: "Communication",
};

export const LANGUAGES = ["english", "hindi", "bengali", "hinglish", "banglish"] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;

export const LEARNING_STYLES = ["visual", "step_by_step", "examples_first", "practice_heavy", "story"] as const;
export const LearningStyle = z.enum(LEARNING_STYLES);

/** What Little Master learns in onboarding. */
export const LearnerProfile = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.string().trim().min(1).max(80),
  course: z.string().trim().max(120).default(""),
  institution: z.string().trim().max(120).default(""),
  goals: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  language: Language.default("english"),
  learningStyle: LearningStyle.default("step_by_step"),
  dailyStudyMinutes: z.number().int().min(0).max(1440).default(60),
  strongSubjects: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  difficultSubjects: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  exam: z
    .object({ name: z.string().trim().min(1).max(80), date: z.string().max(20).optional() })
    .nullable()
    .default(null),
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;

export const MEMORY_KINDS = ["strength", "weakness", "mistake", "preference", "goal", "progress"] as const;
export const MemoryKind = z.enum(MEMORY_KINDS);

/** One AI Brain memory. Unique by kind + subject + topic. */
export const LearnerMemory = z.object({
  kind: MemoryKind,
  subject: z.string().trim().max(60),
  topic: z.string().trim().max(120),
  fact: z.string().trim().min(1).max(400),
  confidence: z.number().min(0).max(1),
  updatedAt: z.string().optional(),
});
export type LearnerMemory = z.infer<typeof LearnerMemory>;

/** Little Master's routing decision for one student message. */
export const RouterDecision = z.object({
  route: z.enum(["little_master", "akash_master"]),
  reply: z
    .string()
    .describe(
      "What Little Master says to the student now. When routing to Akash Master, a one-line handover; otherwise the full reply.",
    ),
  briefing: z
    .object({
      mode: TeachingMode,
      topic: z.string(),
      studentNeeds: z.string().describe("What the student actually needs from this lesson"),
      focus: z.string().describe("What Akash Master should focus on or avoid"),
      shouldDraw: z.boolean().describe("Whether a whiteboard drawing would genuinely help"),
    })
    .nullable()
    .describe("Required when route is akash_master; null otherwise"),
});
export type RouterDecision = z.infer<typeof RouterDecision>;

/** Little Master's class notes after a lesson. */
export const ClassNotes = z.object({
  summary: z.string().describe("One line describing what was covered"),
  memories: z
    .array(
      z.object({
        kind: MemoryKind,
        subject: z.string(),
        topic: z.string(),
        fact: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3),
});
export type ClassNotes = z.infer<typeof ClassNotes>;

export const Speaker = z.enum(["student", "little_master", "akash_master"]);
export type Speaker = z.infer<typeof Speaker>;

/** A chat turn as the client keeps it. Boards are referenced by title only in history. */
export const ChatTurn = z.object({
  speaker: Speaker,
  text: z.string().max(40_000),
  boardTitles: z.array(z.string().max(200)).max(8).optional(),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Body of POST /api/guide. */
export const GuideRequest = z.object({
  message: z.string().trim().min(1).max(8_000),
  history: z.array(ChatTurn).max(200).default([]),
  mode: TeachingMode.nullable().default(null),
  profile: LearnerProfile.nullable().default(null),
  memories: z.array(LearnerMemory).max(200).default([]),
  image: z
    .string()
    .max(3_000_000)
    .regex(IMAGE_DATA_URL, "image must be a base64 PNG, JPEG or WebP data URL")
    .nullable()
    .default(null),
  conversationId: z.string().uuid().nullable().default(null),
});
export type GuideRequest = z.infer<typeof GuideRequest>;

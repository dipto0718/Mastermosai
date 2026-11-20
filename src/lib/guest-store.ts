"use client";
import { z } from "zod";
import { ChatTurn, LearnerMemory, LearnerProfile } from "./schemas";
import { Board } from "./whiteboard";

/** Guests keep their profile, AI Brain and current class in the browser only. Never sent to be stored on the server. */

const KEYS = {
  profile: "mm.profile.v1",
  memories: "mm.memories.v1",
  classroom: "mm.classroom.v1",
} as const;

export const StoredTurn = ChatTurn.extend({
  id: z.string(),
  boards: z.array(Board).optional(),
  notes: z.string().optional(),
  imageThumb: z.string().optional(),
});
export type StoredTurn = z.infer<typeof StoredTurn>;

const Classroom = z.object({
  turns: z.array(StoredTurn).max(400),
  conversationId: z.string().nullable().default(null),
});
export type Classroom = z.infer<typeof Classroom>;

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the class still works, it just won't be remembered.
  }
}

export const guestStore = {
  getProfile: () => read(KEYS.profile, LearnerProfile),
  setProfile: (p: LearnerProfile) => write(KEYS.profile, p),
  getMemories: () => read(KEYS.memories, z.array(LearnerMemory)) ?? [],
  setMemories: (m: LearnerMemory[]) => write(KEYS.memories, m.slice(-200)),
  getClassroom: () => read(KEYS.classroom, Classroom) ?? { turns: [], conversationId: null },
  setClassroom: (c: Classroom) => write(KEYS.classroom, { ...c, turns: c.turns.slice(-400) }),
  clearClassroom: () => write(KEYS.classroom, { turns: [], conversationId: null }),
};

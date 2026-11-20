import "server-only";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

function effort(value: string | undefined, fallback: Effort): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : fallback;
}

/** Model settings, changeable without code through environment variables. */
export function getModelConfig() {
  return {
    akash: {
      model: process.env.AKASH_MASTER_MODEL || "claude-opus-5-5",
      effort: effort(process.env.AKASH_MASTER_EFFORT, "high"),
      maxTokens: 64_000,
    },
    little: {
      model: process.env.LITTLE_MASTER_MODEL || "claude-opus-5-5",
      effort: effort(process.env.LITTLE_MASTER_EFFORT, "low"),
      maxTokens: 16_000,
    },
    /** Server-side refusal fallback. Set MASTERMOSAI_REFUSAL_FALLBACK=off to disable. */
    refusalFallback: process.env.MASTERMOSAI_REFUSAL_FALLBACK !== "off",
  };
}

/** Demo mode runs scripted personas with no API calls. On automatically when no API key is set. */
export function isDemoMode() {
  if (process.env.MASTERMOSAI_DEMO_MODE === "1" || process.env.MASTERMOSAI_DEMO_MODE === "true") return true;
  return !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Mastermosai is free for every student: there are no plans and no payments.
 * Optional fair-use cap per student per day, to keep the service affordable for everyone.
 * Unset or 0 = unlimited.
 */
export function getFairUseDailyLimit(): number {
  const n = Number(process.env.FAIR_USE_DAILY_TURNS ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

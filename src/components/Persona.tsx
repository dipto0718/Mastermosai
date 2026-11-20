import type { Speaker } from "@/lib/schemas";

export const PERSONA = {
  akash_master: { name: "Akash Master", initials: "AM", bg: "bg-akash", soft: "bg-akash-soft", text: "text-akash" },
  little_master: { name: "Little Master", initials: "LM", bg: "bg-little", soft: "bg-little-soft", text: "text-little" },
} as const;

export function PersonaAvatar({ speaker, size = 36 }: { speaker: Exclude<Speaker, "student">; size?: number }) {
  const p = PERSONA[speaker];
  return (
    <div
      aria-hidden
      className={`${p.bg} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {p.initials}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      Master<span className="text-akash">mosai</span>
    </span>
  );
}

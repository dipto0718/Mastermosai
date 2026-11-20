import { LearnerProfile } from "@/lib/schemas";
import { getVerifiedUser } from "@/lib/supabase/server";
import { loadMemories, loadProfile, saveProfile } from "@/lib/supabase/store";

/** Read the signed-in learner's profile and AI Brain. */
export async function GET() {
  const { supabase, userId } = await getVerifiedUser();
  if (!supabase || !userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  const [profile, memories] = await Promise.all([loadProfile(supabase, userId), loadMemories(supabase, userId)]);
  return Response.json({ profile, memories }, { headers: { "Cache-Control": "no-store" } });
}

/** Save the signed-in learner's profile. */
export async function PUT(request: Request) {
  const { supabase, userId } = await getVerifiedUser();
  if (!supabase || !userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = LearnerProfile.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid profile.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  try {
    await saveProfile(supabase, userId, parsed.data);
  } catch (err) {
    console.error("Saving profile failed", err);
    return Response.json({ error: "Could not save your profile." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

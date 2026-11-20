import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "../config";

/** Server-side Supabase client bound to the request's cookies. Null when Supabase isn't configured (guest mode only). */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a context that can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Verified identity: getClaims() checks the sign-in token's signature. */
export async function getVerifiedUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, userId: null as string | null };
  const { data, error } = await supabase.auth.getClaims();
  const sub = !error && typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId: sub };
}

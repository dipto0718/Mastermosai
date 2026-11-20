"use client";
import Link from "next/link";
import { useState } from "react";
import { useIsClient } from "@/lib/use-is-client";
import { Logo } from "@/components/Persona";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseBrowserClient, isSupabaseEnabled } from "@/lib/supabase/client";

export default function LoginPage() {
  return useIsClient() ? <Login /> : <div className="flex-1" aria-busy="true" />;
}

function Login() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const next = safeNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(() => (params.get("error") ? "error" : "idle"));
  const [message, setMessage] = useState(() => (params.get("error") ? "Sign-in didn't complete. Please try again." : ""));
  const enabled = isSupabaseEnabled();

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) {
      setState("error");
      setMessage(error.message);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-center">
        <Logo className="text-2xl" />
      </Link>
      <h1 className="text-center text-2xl font-semibold">Sign in to keep your progress</h1>
      <p className="mt-2 text-center text-sm text-muted">Free for every student. Your classes and AI Brain follow you to any device.</p>

      {!enabled ? (
        <p className="mt-8 rounded-xl bg-little-soft p-4 text-sm">
          Accounts aren&apos;t switched on yet. You can still learn as a guest: everything is kept in this browser.
        </p>
      ) : state === "sent" ? (
        <p className="mt-8 rounded-xl bg-akash-soft p-4 text-sm">Check your email for a sign-in link. You can close this tab.</p>
      ) : (
        <div className="mt-8 space-y-4">
          <button onClick={google} className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-medium hover:bg-surface-2">
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={emailLink} className="space-y-2">
            <label className="block text-sm">
              <span className="text-muted">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2.5"
              />
            </label>
            <button disabled={state === "sending"} className="w-full rounded-xl bg-akash px-4 py-3 font-medium text-white disabled:opacity-60">
              {state === "sending" ? "Sending..." : "Email me a sign-in link"}
            </button>
          </form>
          {state === "error" && <p className="text-sm text-red-600 dark:text-red-400">{message}</p>}
        </div>
      )}
      <Link href={next} className="mt-6 text-center text-sm text-muted underline">
        Continue as guest
      </Link>
    </main>
  );
}

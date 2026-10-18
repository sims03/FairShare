import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Browser Supabase client. Only call when `isSupabaseConfigured` is true. */
export function getSupabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured (see .env.local.example)");
  client ??= createClient(url, key);
  return client;
}

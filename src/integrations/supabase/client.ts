import { createClient } from "@supabase/supabase-js";

// External Supabase project — env vars with safe publishable fallbacks so
// production builds work even when .env isn't present at build time.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) || "https://tcvwysqgwlnvpmidupqi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ||
  "sb_publishable_G_OVo3KxlUOqeUgRImKIRQ_ZFFAZvKv";


const isBrowser = typeof window !== "undefined";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: isBrowser ? window.localStorage : undefined,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
  },
});

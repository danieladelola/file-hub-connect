import { createClient } from "@supabase/supabase-js";
import { settleExpiredStakes } from "../src/lib/settle-stakes";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://tcvwysqgwlnvpmidupqi.supabase.co";
  const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PUBLISHABLE =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_G_OVo3KxlUOqeUgRImKIRQ_ZFFAZvKv";

  if (!SERVICE_ROLE) return json({ error: "Missing SERVICE_ROLE_KEY secret." }, 500);

  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, PUBLISHABLE, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", auth.user.id);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");

  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const scopeAll = isAdmin && body?.all === true;
  const result = await settleExpiredStakes(admin, scopeAll ? {} : { userId: auth.user.id });

  return json(result);
}

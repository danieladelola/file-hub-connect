import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const config = { runtime: "nodejs" };

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b0f19;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="100%" style="max-width:600px;background:#111827;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px;background:#f59e0b;color:#111;font-size:20px;font-weight:700">Haratrading</td></tr>
<tr><td style="padding:28px;color:#e5e7eb"><h2 style="margin:0 0 14px;color:#fff">${esc(title)}</h2>
<div style="font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(body)}</div></td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #1f2937;color:#9ca3af;font-size:12px">
Haratrading · support@haratrading.com · © ${new Date().getFullYear()}</td></tr>
</table></td></tr></table></body></html>`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const URL = process.env.VITE_SUPABASE_URL || "https://tcvwysqgwlnvpmidupqi.supabase.co";
  const SR = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SR) return res.status(500).json({ error: "Missing SERVICE_ROLE_KEY" });
  const admin = createClient(URL, SR, { auth: { persistSession: false } });

  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return res.status(401).json({ error: "Unauthorized" });
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", auth.user.id);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) return res.status(403).json({ error: "Admins only" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const { segment = "all", title, message = "", target_user } = body;
  if (!title) return res.status(400).json({ error: "Title required" });

  let q: any = admin.from("profiles").select("email");
  if (segment === "active") q = q.eq("banned", false);
  if (segment === "banned") q = q.eq("banned", true);
  if (segment === "email_unverified") q = q.eq("email_verified", false);
  if (segment === "mobile_unverified") q = q.eq("mobile_verified", false);
  if (segment === "kyc_pending") q = q.eq("kyc_status", "pending");
  if (segment === "kyc_unverified") q = q.in("kyc_status", ["none", "unverified"]);
  if (segment === "single") q = q.eq("id", target_user);
  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const emails = [...new Set((rows ?? []).map((r: any) => r.email).filter(Boolean))] as string[];

  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "support@haratrading.com";
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "mail.spacemail.com",
    port,
    secure: port === 465,
    auth: { user, pass: process.env.SMTP_PASS || "" },
  });
  const from = `${process.env.SMTP_FROM_NAME || "Haratrading"} <${process.env.SMTP_FROM || user}>`;
  const html = layout(title, message);

  let sent = 0, failed = 0;
  for (const to of emails) {
    try {
      await transport.sendMail({ from, to, subject: title, html, text: `${title}\n\n${message}` });
      sent++;
    } catch (e) {
      failed++;
      console.error("mail failed", to, e);
    }
  }
  return res.status(200).json({ ok: true, total: emails.length, sent, failed });
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://creator-bridge-nu.vercel.app";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "CreatorBridge <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInr(amount: unknown) {
  const value = Number(amount) || 0;
  return `&#8377;${value.toLocaleString("en-IN")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const missingSecrets = [
      { name: "RESEND_API_KEY", value: RESEND_API_KEY },
      { name: "SUPABASE_URL", value: SUPABASE_URL },
      { name: "SUPABASE_SERVICE_ROLE_KEY", value: SUPABASE_SERVICE_ROLE_KEY },
    ]
      .filter(({ value }) => !value)
      .map(({ name }) => name);

    if (missingSecrets.length > 0) {
      console.error("Missing Edge Function secrets:", missingSecrets.join(", "));
      return jsonResponse(
        {
          error: "Notification service not configured",
          missing: missingSecrets,
        },
        500,
      );
    }

    let payload: { type?: string; toUserId?: string; data?: unknown };
    try {
      const rawPayload = await req.json();
      if (!rawPayload || typeof rawPayload !== "object") {
        return jsonResponse({ error: "JSON body must be an object" }, 400);
      }
      payload = rawPayload as { type?: string; toUserId?: string; data?: unknown };
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { type, toUserId } = payload;
    const data =
      payload.data && typeof payload.data === "object"
        ? payload.data as Record<string, unknown>
        : {};
    console.log(`Received ${type ?? "unknown"} notification request for user ${toUserId ?? "missing"}`);

    if (!type || !toUserId) {
      return jsonResponse({ error: "Missing required fields: type, toUserId" }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(toUserId);

    if (userError) {
      console.error("Supabase admin lookup failed:", userError.message);
      return jsonResponse(
        { error: "Recipient lookup failed", details: userError.message },
        500,
      );
    }

    if (!userData?.user?.email) {
      console.error("Recipient email not found for user:", toUserId);
      return jsonResponse({ error: "Recipient email not found" }, 404);
    }

    const toEmail = userData.user.email;
    console.log(`Resolved recipient email: ${toEmail}`);

    const projectTitle = escapeHtml(data.projectTitle || "your project");
    const senderName = escapeHtml(data.senderName || "someone");
    const freelancerName = escapeHtml(data.freelancerName || "A freelancer");
    const creatorName = escapeHtml(data.creatorName || "A creator");
    const message = escapeHtml(data.message || "");
    const messageContent = escapeHtml(data.messageContent || "");
    const rate = escapeHtml(data.rate || "Not specified");
    const budget = escapeHtml(data.budget || "Not specified");
    const platform = escapeHtml(data.platform || "Not specified");
    const paymentId = escapeHtml(data.paymentId || "");

    const subjects: Record<string, string> = {
      proposal: `New proposal on your project: ${String(data.projectTitle || "your project")}`,
      message: `New message from ${String(data.senderName || "someone")} on CreatorBridge`,
      payment: `Payment of INR ${Number(data.amount) || 0} received on CreatorBridge`,
      project: "A new project matches your skills on CreatorBridge",
    };

    const bodies: Record<string, string> = {
      proposal: `
        <h2 style="margin:0 0 16px; font-size:20px; color:#F0A500;">You have a new proposal!</h2>
        <p><strong>${freelancerName}</strong> sent a proposal for your project <strong>${projectTitle}</strong>.</p>
        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
          <tr><td style="padding:8px 0; color:#888; font-size:14px;">Rate</td><td style="padding:8px 0; font-size:14px; font-weight:600; text-align:right;">${rate}</td></tr>
        </table>
        <div style="background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; margin:16px 0;">
          <p style="margin:0; font-size:13px; color:#ccc; line-height:1.6;">&quot;${message}&quot;</p>
        </div>
        <a href="${APP_URL}" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">View proposal &rarr;</a>
      `,
      message: `
        <h2 style="margin:0 0 16px; font-size:20px; color:#F0A500;">New message from ${senderName}</h2>
        <div style="background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; margin:16px 0;">
          <p style="margin:0; font-size:14px; color:#ccc; line-height:1.6;">${messageContent}</p>
        </div>
        <a href="${APP_URL}" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">Reply now &rarr;</a>
      `,
      payment: `
        <h2 style="margin:0 0 16px; font-size:20px; color:#4ade80;">Payment received!</h2>
        <p>You received a payment for project <strong>${projectTitle}</strong>.</p>
        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
          <tr><td style="padding:8px 0; color:#888; font-size:14px;">Amount</td><td style="padding:8px 0; font-size:18px; font-weight:700; color:#4ade80; text-align:right;">${formatInr(data.amount)}</td></tr>
          <tr><td style="padding:8px 0; color:#888; font-size:14px;">Payment ID</td><td style="padding:8px 0; font-size:13px; color:#ccc; text-align:right; font-family:monospace;">${paymentId}</td></tr>
        </table>
        <a href="${APP_URL}" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">View dashboard &rarr;</a>
      `,
      project: `
        <h2 style="margin:0 0 16px; font-size:20px; color:#F0A500;">A new project matches your skills!</h2>
        <p><strong>${creatorName}</strong> posted a new project that matches your profile.</p>
        <table style="width:100%; border-collapse:collapse; margin:16px 0;">
          <tr><td style="padding:8px 0; color:#888; font-size:14px;">Project</td><td style="padding:8px 0; font-size:14px; font-weight:600; text-align:right;">${projectTitle}</td></tr>
          <tr><td style="padding:8px 0; color:#888; font-size:14px;">Budget</td><td style="padding:8px 0; font-size:14px; font-weight:600; color:#F0A500; text-align:right;">${budget}</td></tr>
          <tr><td style="padding:8px 0; color:#888; font-size:14px;">Platform</td><td style="padding:8px 0; font-size:14px; text-align:right;">${platform}</td></tr>
        </table>
        <a href="${APP_URL}" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">Send a proposal &rarr;</a>
      `,
    };

    const subject = subjects[type] || "Notification from CreatorBridge";
    const body = bodies[type] || "<p>You have a new notification.</p>";

    const emailPayload = {
      from: FROM_EMAIL,
      to: [toEmail],
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #0d0d0d; color: #e0e0e0;">
          <div style="margin-bottom: 32px;">
            <span style="font-size: 22px; font-weight: 800; color: #fff;">Creator</span><span style="font-size: 22px; font-weight: 800; color: #F0A500;">Bridge</span>
          </div>
          ${body}
          <hr style="border: none; border-top: 1px solid #333; margin: 32px 0 16px;" />
          <p style="color: #666; font-size: 11px; line-height: 1.5;">
            You're receiving this because you have an account on CreatorBridge.<br/>
            <a href="${APP_URL}" style="color: #888;">creator-bridge-nu.vercel.app</a>
          </p>
        </div>
      `,
    };

    console.log(`Sending ${type} email to ${toEmail}...`);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await res.text();
    let resData: unknown = {};
    try {
      resData = responseText ? JSON.parse(responseText) : {};
    } catch {
      resData = { raw: responseText };
    }

    if (!res.ok) {
      console.error("Resend API error:", JSON.stringify(resData));
      return jsonResponse(
        { error: "Failed to send email", details: resData },
        res.status,
      );
    }

    console.log("Email sent successfully:", JSON.stringify(resData));
    return jsonResponse({ success: true, resend: resData });
  } catch (err) {
    console.error("Unhandled error:", err);
    return jsonResponse(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

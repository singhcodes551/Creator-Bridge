import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

export default {
  fetch: withSupabase(
    { auth: ["publishable", "secret"] },
    async (req, ctx) => {
      // Only accept POST
      if (req.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }

      if (!RESEND_API_KEY) {
        console.error("RESEND_API_KEY is not set");
        return Response.json(
          { error: "Email service not configured" },
          { status: 500 }
        );
      }

      const { type, toUserId, data } = await req.json();

      if (!type || !toUserId) {
        return Response.json(
          { error: "Missing required fields: type, toUserId" },
          { status: 400 }
        );
      }

      // ── Look up recipient email from Supabase Auth ──
      const { data: userData, error: userError } =
        await ctx.supabaseAdmin.auth.admin.getUserById(toUserId);

      if (userError || !userData?.user?.email) {
        console.error("Could not find user email for:", toUserId, userError);
        return Response.json(
          { error: "Recipient email not found" },
          { status: 404 }
        );
      }

      const toEmail = userData.user.email;

      // ── Build email subject ──
      const subjects: Record<string, string> = {
        proposal: `New proposal on your project: ${data?.projectTitle || "your project"}`,
        message: `New message from ${data?.senderName || "someone"} on CreatorBridge`,
        payment: `Payment of ₹${data?.amount || 0} received on CreatorBridge`,
        project: `A new project matches your skills on CreatorBridge`,
      };

      // ── Build email HTML body ──
      const bodies: Record<string, string> = {
        proposal: `
          <h2 style="margin:0 0 16px; font-size:20px; color:#F0A500;">You have a new proposal!</h2>
          <p><strong>${data?.freelancerName || "A freelancer"}</strong> sent a proposal for your project <strong>${data?.projectTitle || ""}</strong>.</p>
          <table style="width:100%; border-collapse:collapse; margin:16px 0;">
            <tr><td style="padding:8px 0; color:#888; font-size:14px;">Rate</td><td style="padding:8px 0; font-size:14px; font-weight:600; text-align:right;">${data?.rate || "Not specified"}</td></tr>
          </table>
          <div style="background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; margin:16px 0;">
            <p style="margin:0; font-size:13px; color:#ccc; line-height:1.6;">"${data?.message || ""}"</p>
          </div>
          <a href="https://creator-bridge-nu.vercel.app" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">View proposal →</a>
        `,

        message: `
          <h2 style="margin:0 0 16px; font-size:20px; color:#F0A500;">New message from ${data?.senderName || "someone"}</h2>
          <div style="background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:16px; margin:16px 0;">
            <p style="margin:0; font-size:14px; color:#ccc; line-height:1.6;">${data?.messageContent || ""}</p>
          </div>
          <a href="https://creator-bridge-nu.vercel.app" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">Reply now →</a>
        `,

        payment: `
          <h2 style="margin:0 0 16px; font-size:20px; color:#4ade80;">Payment received! 🎉</h2>
          <p>You received a payment for project <strong>${data?.projectTitle || ""}</strong>.</p>
          <table style="width:100%; border-collapse:collapse; margin:16px 0;">
            <tr><td style="padding:8px 0; color:#888; font-size:14px;">Amount</td><td style="padding:8px 0; font-size:18px; font-weight:700; color:#4ade80; text-align:right;">₹${(data?.amount || 0).toLocaleString()}</td></tr>
            <tr><td style="padding:8px 0; color:#888; font-size:14px;">Payment ID</td><td style="padding:8px 0; font-size:13px; color:#ccc; text-align:right; font-family:monospace;">${data?.paymentId || ""}</td></tr>
          </table>
          <a href="https://creator-bridge-nu.vercel.app" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">View dashboard →</a>
        `,

        project: `
          <h2 style="margin:0 0 16px; font-size:20px; color:#F0A500;">A new project matches your skills!</h2>
          <p><strong>${data?.creatorName || "A creator"}</strong> posted a new project that matches your profile.</p>
          <table style="width:100%; border-collapse:collapse; margin:16px 0;">
            <tr><td style="padding:8px 0; color:#888; font-size:14px;">Project</td><td style="padding:8px 0; font-size:14px; font-weight:600; text-align:right;">${data?.projectTitle || ""}</td></tr>
            <tr><td style="padding:8px 0; color:#888; font-size:14px;">Budget</td><td style="padding:8px 0; font-size:14px; font-weight:600; color:#F0A500; text-align:right;">${data?.budget || "Not specified"}</td></tr>
            <tr><td style="padding:8px 0; color:#888; font-size:14px;">Platform</td><td style="padding:8px 0; font-size:14px; text-align:right;">${data?.platform || "Not specified"}</td></tr>
          </table>
          <a href="https://creator-bridge-nu.vercel.app" style="display:inline-block; background:#F0A500; color:#0d0d0d; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:8px;">Send a proposal →</a>
        `,
      };

      const subject = subjects[type] || "Notification from CreatorBridge";
      const body = bodies[type] || "<p>You have a new notification.</p>";

      // ── Send via Resend ──
      const emailPayload = {
        from: "CreatorBridge <onboarding@resend.dev>",
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
              <a href="https://creator-bridge-nu.vercel.app" style="color: #888;">creator-bridge-nu.vercel.app</a>
            </p>
          </div>
        `,
      };

      console.log(`Sending ${type} notification to ${toEmail}`);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailPayload),
      });

      const resData = await res.json();

      if (!res.ok) {
        console.error("Resend API error:", resData);
        return Response.json(
          { error: "Failed to send email", details: resData },
          { status: res.status }
        );
      }

      console.log(`Email sent successfully:`, resData);
      return Response.json({ success: true, ...resData });
    }
  ),
};

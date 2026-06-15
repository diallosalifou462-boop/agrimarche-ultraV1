"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
// app/api/send-email/route.ts
const server_1 = require("next/server");
const resend_1 = require("resend");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
// ── HTML Template ──────────────────────────────────────────────────────────
function buildHtml(subject, message) {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:linear-gradient(135deg,#111317,#0a0c10);border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981,#059669);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                🌾 AgriMarché
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">
                Plateforme agricole du Sénégal
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:18px;font-weight:600;">
                ${subject}
              </h2>
              <div style="color:#d1d5db;font-size:14px;line-height:1.7;white-space:pre-wrap;">
                ${message.replace(/\n/g, '<br/>')}
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:12px;line-height:1.6;">
                Vous recevez cet email car vous êtes inscrit sur AgriMarché.<br/>
                © ${new Date().getFullYear()} AgriMarché · Sénégal
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
// ── Handler ────────────────────────────────────────────────────────────────
async function POST(req) {
    var _a;
    try {
        const body = await req.json();
        const { to, subject, message, senderName } = body;
        // Validation
        if (!to || !subject || !message) {
            return server_1.NextResponse.json({ error: 'Champs requis manquants : to, subject, message' }, { status: 400 });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return server_1.NextResponse.json({ error: `Adresse email invalide : ${to}` }, { status: 400 });
        }
        const fromName = senderName !== null && senderName !== void 0 ? senderName : 'AgriMarché';
        const fromEmail = (_a = process.env.RESEND_FROM_EMAIL) !== null && _a !== void 0 ? _a : 'onboarding@resend.dev';
        const { data, error } = await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to,
            subject,
            html: buildHtml(subject, message),
            text: message, // fallback plain-text
        });
        if (error) {
            console.error('[send-email] Resend error:', error);
            return server_1.NextResponse.json({ error: error.message }, { status: 500 });
        }
        return server_1.NextResponse.json({ success: true, id: data === null || data === void 0 ? void 0 : data.id }, { status: 200 });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('[send-email] Unexpected error:', message);
        return server_1.NextResponse.json({ error: message }, { status: 500 });
    }
}

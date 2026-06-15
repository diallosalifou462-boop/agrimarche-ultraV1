// app/api/send-email/route.ts  (Next.js App Router)
// OU pages/api/send-email.ts   (Pages Router — voir commentaire en bas)
//
// Dépendance : npm install resend
// Variable d'env requise : RESEND_API_KEY=re_xxxxxxx
// (obtenez votre clé sur https://resend.com/api-keys)

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Expéditeur ─────────────────────────────────────────────────────────────
// Remplacez par votre domaine vérifié sur Resend.
// Si vous n'avez pas encore de domaine vérifié, utilisez onboarding@resend.dev
// (uniquement pour vos propres tests — vous ne pouvez pas envoyer à d'autres adresses).
const FROM = process.env.RESEND_FROM_EMAIL ?? 'AgriMarché <noreply@agrimarche.sn>';

// ── Template HTML ──────────────────────────────────────────────────────────
function buildHtml(params: {
  icon: string;
  title: string;
  message: string;
  deepLink?: string;
  urgent?: boolean;
}): string {
  const { icon, title, message, deepLink, urgent } = params;
  const urgentBanner = urgent
    ? `<div style="background:#ef4444;color:#fff;text-align:center;padding:8px;font-size:13px;font-weight:600;">⚡ MESSAGE URGENT</div>`
    : '';
  const ctaButton = deepLink
    ? `<div style="text-align:center;margin-top:24px;">
         <a href="${deepLink}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">
           Voir maintenant →
         </a>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:16px;overflow:hidden;border:1px solid #1f2127;">
        ${urgentBanner}
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#111317,#1a1d23);padding:28px 32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">${icon}</div>
            <div style="font-size:22px;font-weight:700;color:#ffffff;">${title}</div>
            <div style="margin-top:6px;font-size:12px;color:#6b7280;">AgriMarché · Plateforme agricole du Sénégal</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#111317;padding:28px 32px;">
            <p style="color:#d1d5db;font-size:15px;line-height:1.7;margin:0;">${message.replace(/\n/g, '<br/>')}</p>
            ${ctaButton}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#0d0f14;padding:18px 32px;text-align:center;border-top:1px solid #1f2127;">
            <p style="color:#4b5563;font-size:11px;margin:0;">
              © ${new Date().getFullYear()} AgriMarché — Sénégal<br/>
              Vous recevez ce message car vous êtes inscrit sur AgriMarché.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler App Router ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, message, title, icon = '🔔', deepLink, urgent, userId } = body;

    if (!to || !subject || !message) {
      return NextResponse.json({ error: 'Champs requis manquants : to, subject, message' }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html: buildHtml({ icon, title: title ?? subject, message, deepLink, urgent }),
      // text fallback (clients sans HTML)
      text: `${title ?? subject}\n\n${message}${deepLink ? `\n\nVoir : ${deepLink}` : ''}`,
      tags: [
        { name: 'source', value: 'agrimarche-admin' },
        ...(userId ? [{ name: 'userId', value: String(userId).slice(0, 32) }] : []),
      ],
    });

    if (error) {
      console.error('[send-email] Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: any) {
    console.error('[send-email] Unexpected error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erreur interne' }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   VERSION PAGES ROUTER (si vous utilisez pages/ au lieu de app/)
   Remplacez tout le fichier par ceci :

import type { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? 'AgriMarché <noreply@agrimarche.sn>';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { to, subject, message, title, icon = '🔔', deepLink, urgent, userId } = req.body;
  if (!to || !subject || !message) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html: buildHtml({ icon, title: title ?? subject, message, deepLink, urgent }),
      text: `${title ?? subject}\n\n${message}${deepLink ? `\n\n${deepLink}` : ''}`,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, id: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Erreur interne' });
  }
}
────────────────────────────────────────────────────────────────────────────── */

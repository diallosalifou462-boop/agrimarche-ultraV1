import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

const resend = apiKey ? new Resend(apiKey) : null;

const FROM =
  process.env.RESEND_FROM_EMAIL ??
  "AgriMarché <onboarding@resend.dev>";

function buildHtml({
  icon,
  title,
  message,
  deepLink,
  urgent,
}: {
  icon: string;
  title: string;
  message: string;
  deepLink?: string;
  urgent?: boolean;
}) {
  const urgentBanner = urgent
    ? `<div style="background:#ef4444;color:#fff;padding:8px;text-align:center;font-weight:bold;">⚡ MESSAGE URGENT</div>`
    : "";

  const button = deepLink
    ? `<p style="text-align:center;margin-top:20px;">
         <a href="${deepLink}"
         style="background:#16a34a;color:white;padding:12px 25px;text-decoration:none;border-radius:8px;">
         Voir maintenant
         </a>
       </p>`
    : "";

  return `
  <!DOCTYPE html>
  <html lang="fr">
  <body style="font-family:Arial;background:#f5f5f5;padding:30px;">
    <div style="max-width:600px;margin:auto;background:white;border-radius:12px;padding:30px;">
      ${urgentBanner}
      <h1 style="text-align:center;">${icon}</h1>
      <h2 style="color:#166534;text-align:center;">${title}</h2>

      <p style="line-height:1.8;">
      ${message.replace(/\n/g, "<br>")}
      </p>

      ${button}

      <hr>

      <p style="font-size:12px;color:#888;text-align:center;">
      © ${new Date().getFullYear()} AgriMarché
      </p>

    </div>
  </body>
  </html>
  `;
}

export async function POST(req: NextRequest) {
  if (!resend) {
    return NextResponse.json(
      {
        success: false,
        error: "RESEND_API_KEY absente.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    const {
      to,
      subject,
      message,
      title,
      icon = "🔔",
      deepLink,
      urgent,
      userId,
    } = body;

    if (!to || !subject || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "Paramètres manquants.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html: buildHtml({
        icon,
        title: title ?? subject,
        message,
        deepLink,
        urgent,
      }),
      text: message,
      tags: [
        {
          name: "source",
          value: "agrimarche",
        },
        ...(userId
          ? [
              {
                name: "userId",
                value: String(userId),
              },
            ]
          : []),
      ],
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data?.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e.message,
      },
      { status: 500 }
    );
  }
}
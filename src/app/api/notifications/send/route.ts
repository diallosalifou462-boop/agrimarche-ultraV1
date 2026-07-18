// src/app/api/notifications/send/route.ts
//
// Envoie simultanément 3 types de notifications à l'utilisateur :
//   1. 🔔 Push FCM      → Android/Capacitor (token stocké dans users/{uid}.fcmToken)
//   2. 📧 Email Resend  → adresse email de l'utilisateur
//   3. 📱 SMS Infobip   → numéro de téléphone de l'utilisateur
//
// VARIABLES .env.local REQUISES :
//   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   ← clé Firebase Admin
//   RESEND_API_KEY=re_xxxxxxxxxxxx                                  ← dashboard resend.com
//   INFOBIP_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx                        ← dashboard infobip.com
//   INFOBIP_BASE_URL=xxxxx.api.infobip.com                         ← dans ton dashboard Infobip
//   INFOBIP_SENDER=AgriMarche                                       ← nom expéditeur SMS (11 car. max)
//   RESEND_FROM=AgriMarché <noreply@agrimarche.sn>                  ← domaine vérifié sur Resend

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';
import { getMessaging }                  from 'firebase-admin/messaging';
import { Resend }                        from 'resend';

// ── Firebase Admin (singleton) ───────────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json || json.trim() === "") {
    throw new Error("Firebase Admin non configuré");
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(json);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalide");
  }
  if (!serviceAccount.project_id) {
    throw new Error("project_id manquant");
  }
  return initializeApp({
    credential: cert(serviceAccount),
  });
}

// ── Resend (singleton) avec vérification ────────────────────────────────────
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/send
//
// Body attendu :
// {
//   userId  : string           ← UID Firestore de l'utilisateur
//   title   : string           ← Titre de la notification
//   body    : string           ← Corps du message
//   link?   : string           ← Lien à ouvrir (défaut: /account/orders)
//   channels?: ('push'|'email'|'sms')[]   ← canaux à utiliser (défaut: tous)
// }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { userId, title, body, link = '/account/orders', channels, icon = '🔔', priority = 'medium', urgent = false, type = 'order' } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json(
        { success: false, error: 'userId, title et body sont requis' },
        { status: 400 }
      );
    }

    // Canaux actifs (tous par défaut)
    const activeChannels: string[] = channels || ['push', 'email', 'sms'];

    // ── Récupérer le profil utilisateur depuis Firestore ─────────────────────
    const adminApp  = getAdminApp();
    const db        = getFirestore(adminApp);
    const userSnap  = await db.collection('users').doc(userId).get();
    const userData  = userSnap.data();

    if (!userData) {
      return NextResponse.json({ success: false, error: 'Utilisateur introuvable' }, { status: 404 });
    }

    const userEmail  : string | undefined = userData.email;
    const userPhone  : string | undefined = userData.phone;

    // ── Résultats par canal ──────────────────────────────────────────────────
    const results: Record<string, any> = {};

    // ── 1. PUSH FCM ──────────────────────────────────────────────────────────
    // ⚠️ Les tokens sont enregistrés par useFCMToken.tsx dans la sous-collection
    // users/{uid}/tokens/{token} — PAS dans un champ userData.fcmToken (qui
    // n'existe jamais). C'était la cause du "push jamais envoyé" : la route
    // trouvait toujours 0 token et répondait 200 OK silencieusement.
    // On envoie maintenant à TOUS les appareils enregistrés pour l'utilisateur
    // (un même compte peut être connecté sur plusieurs téléphones).
    if (activeChannels.includes('push')) {
      const tokensSnap = await db.collection('users').doc(userId).collection('tokens').get();
      const deviceTokens = tokensSnap.docs.map((d) => d.id); // doc ID = valeur du token

      if (deviceTokens.length === 0) {
        results.push = { sent: false, reason: 'no_token' };
      } else {
        try {
          const multicast = await getMessaging(adminApp).sendEachForMulticast({
            tokens: deviceTokens,
            notification: { title, body },
            data: {
              link,
              timestamp: Date.now().toString(),
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                channelId: 'agrimarche_orders',
              },
            },
            webpush: {
              notification: {
                icon:  '/icons/icon-192.png',
                badge: '/icons/badge-72.png',
              },
              fcmOptions: { link },
            },
          });

          // Nettoyer les tokens invalides / désinstallés (même sous-collection)
          const invalidTokens: string[] = [];
          multicast.responses.forEach((res, idx) => {
            if (!res.success) {
              const code = res.error?.code;
              if (
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered'
              ) {
                invalidTokens.push(deviceTokens[idx]);
              }
            }
          });
          if (invalidTokens.length > 0) {
            const batch = db.batch();
            invalidTokens.forEach((t) =>
              batch.delete(db.collection('users').doc(userId).collection('tokens').doc(t))
            );
            await batch.commit();
          }

          results.push = {
            sent: multicast.successCount > 0,
            successCount: multicast.successCount,
            failureCount: multicast.failureCount,
            invalidTokensRemoved: invalidTokens.length,
          };
        } catch (err: any) {
          results.push = { sent: false, error: err.message };
        }
      }
    }

    // ── 2. EMAIL (Resend) ────────────────────────────────────────────────────
    if (activeChannels.includes('email')) {
      if (!userEmail) {
        results.email = { sent: false, reason: 'no_email' };
      } else if (!resend) {
        results.email = {
          sent: false,
          reason: 'resend_not_configured',
        };
      } else {
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agrimarche.vercel.app';
          const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || 'AgriMarché <noreply@agrimarche.sn>',
            to:   [userEmail],
            subject: title,
            html: buildEmailHtml({ title, body, link, appUrl }),
          });

          if (error) {
            results.email = { sent: false, error: error.message };
          } else {
            results.email = { sent: true, emailId: data?.id };
          }
        } catch (err: any) {
          results.email = { sent: false, error: err.message };
        }
      }
    }

    // ── 3. SMS (Infobip) ─────────────────────────────────────────────────────
    if (activeChannels.includes('sms')) {
      if (!userPhone) {
        results.sms = { sent: false, reason: 'no_phone' };
      } else {
        try {
          // Normaliser le numéro → format international +221XXXXXXXXX
          const normalizedPhone = normalizePhone(userPhone);

          const infobipBaseUrl = process.env.INFOBIP_BASE_URL;
          const infobipApiKey  = process.env.INFOBIP_API_KEY;
          const senderName     = process.env.INFOBIP_SENDER || 'AgriMarche';

          if (!infobipBaseUrl || !infobipApiKey) {
            results.sms = { sent: false, reason: 'infobip_not_configured' };
          } else {
            const smsResponse = await fetch(
              `https://${infobipBaseUrl}/sms/2/text/advanced`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `App ${infobipApiKey}`,
                  'Content-Type':  'application/json',
                  'Accept':        'application/json',
                },
                body: JSON.stringify({
                  messages: [{
                    from: senderName,
                    destinations: [{ to: normalizedPhone }],
                    // SMS court : titre + corps tronqué à 160 caractères total
                    text: `${title}\n${body}`.slice(0, 160),
                  }],
                }),
              }
            );

            const smsData = await smsResponse.json();

            if (!smsResponse.ok) {
              results.sms = { sent: false, error: smsData };
            } else {
              const msgStatus = smsData?.messages?.[0]?.status?.name;
              results.sms = {
                sent:      msgStatus === 'PENDING_ENROUTE' || msgStatus === 'MESSAGE_ACCEPTED',
                messageId: smsData?.messages?.[0]?.messageId,
                status:    msgStatus,
              };
            }
          }
        } catch (err: any) {
          results.sms = { sent: false, error: err.message };
        }
      }
    }

    // ── Historique dans Firestore (notifications in-app) ─────────────────────
    // ⚠️ FIX cohérence avec admin-page.tsx : le panneau admin lit `notif.icon`,
    // `notif.priority` (StatusBadge), `notif.urgent`, et surtout trie avec
    // `orderBy('createdAt', 'desc')` — un doc SANS `createdAt` n'est même pas
    // renvoyé par cette requête (Firestore n'inclut pas dans un orderBy() les
    // documents où le champ trié est absent). Avant ce fix, cette route
    // écrivait `sentAt` (string) au lieu de `createdAt` (Timestamp) : chaque
    // notification envoyée depuis seller-orders-page.tsx était donc invisible
    // dans le panneau admin, silencieusement.
    await db.collection('notifications').add({
      userId,
      type,
      title,
      body,
      icon,
      deepLink: link,
      link, // conservé pour compat si un autre consommateur lit encore 'link'
      urgent,
      priority,
      read:      false,
      createdAt: FieldValue.serverTimestamp(),
      sentAt:    new Date().toISOString(), // conservé : horodatage d'envoi multi-canal
      channels:  activeChannels,
      results,
    });

    console.log(`[notifications] userId=${userId}`, results);

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error('[notifications] Erreur globale:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur interne' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normaliser un numéro sénégalais en format international
// ─────────────────────────────────────────────────────────────────────────────
function normalizePhone(phone: string): string {
  // Supprimer tout sauf les chiffres
  const digits = phone.replace(/\D/g, '');

  // Déjà en format international
  if (digits.startsWith('221') && digits.length === 11) return `+${digits}`;

  // Numéro local 9 chiffres → ajouter préfixe Sénégal
  if (digits.length === 9) return `+221${digits}`;

  // Fallback
  return `+${digits}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template email HTML (propre, mobile-friendly)
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailHtml({
  title, body, link, appUrl,
}: { title: string; body: string; link: string; appUrl: string }) {
  const fullLink = link.startsWith('http') ? link : `${appUrl}${link}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:#1A1A1A;padding:28px 36px;text-align:center;">
              <span style="font-size:22px;font-weight:300;color:#C9A96E;letter-spacing:0.08em;">🌿 AgriMarché</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#1A1A1A;">${title}</h2>
              <p style="margin:0 0 28px;font-size:15px;color:#4A4A4A;line-height:1.6;">${body}</p>

              <!-- CTA -->
              <a href="${fullLink}"
                 style="display:inline-block;background:#1A1A1A;color:#C9A96E;text-decoration:none;
                        padding:14px 32px;border-radius:12px;font-size:14px;font-weight:600;
                        letter-spacing:0.06em;">
                Voir ma commande →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #F0EDE8;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9A9A9A;letter-spacing:0.04em;">
                AgriMarché Sénégal · Marché agricole en ligne<br/>
                <a href="${appUrl}" style="color:#C9A96E;text-decoration:none;">${appUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function GET() {
  return NextResponse.json({ message: 'API notifications en ligne. Utilisez POST.' });
}
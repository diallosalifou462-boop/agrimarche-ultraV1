import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";

// ============================================================
// INITIALISATION FIREBASE ADMIN (singleton)
// ============================================================
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Les retours à la ligne sont échappés (\n) dans les variables d'env
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminDb = getFirestore();
const messaging = getMessaging();

// ============================================================
// POST /api/send-push
// Envoie une notification push à une liste de tokens FCM
// Body attendu :
// {
//   tokens: string[],
//   title: string,
//   body: string,
//   deepLink?: string,
//   urgent?: boolean,
//   icon?: string
// }
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null);

    if (!payload) {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { tokens, title, body, deepLink, urgent, icon } = payload as {
      tokens?: string[];
      title?: string;
      body?: string;
      deepLink?: string;
      urgent?: boolean;
      icon?: string;
    };

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: "Aucun token FCM fourni" }, { status: 400 });
    }
    if (tokens.length > 500) {
      return NextResponse.json({ error: "Maximum 500 tokens par requête (limite FCM multicast)" }, { status: 400 });
    }
    if (!title || !body) {
      return NextResponse.json({ error: "Titre et message requis" }, { status: 400 });
    }

    // ── Construction du message multicast ──────────────────
    const message = {
      tokens,
      notification: {
        title,
        body,
        ...(icon ? { imageUrl: undefined } : {}), // imageUrl optionnel, désactivé par défaut
      },
      data: {
        deepLink: deepLink || "/",
        urgent: urgent ? "true" : "false",
        click_action: "FLUTTER_NOTIFICATION_CLICK", // compat Android/WebView
      },
      android: {
        priority: (urgent ? "high" : "normal") as "high" | "normal",
        notification: {
          sound: "default",
          channelId: urgent ? "agrimarche_urgent" : "agrimarche_default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            ...(urgent ? { "interruption-level": "time-sensitive" } : {}),
          },
        },
      },
      webpush: {
        notification: {
          icon: "/icons/icon-192x192.png",
          badge: "/icons/badge-72x72.png",
          requireInteraction: !!urgent,
        },
        fcmOptions: {
          link: deepLink || "/",
        },
      },
    };

    // ── Envoi multicast ──────────────────────────────────────
    const response = await messaging.sendEachForMulticast(message);

    // ── Nettoyage des tokens invalides / désinstallés ────────
    const invalidTokens: string[] = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await cleanupInvalidTokens(invalidTokens).catch((err) =>
        console.warn("Erreur nettoyage tokens FCM:", err)
      );
    }

    return NextResponse.json({
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokensRemoved: invalidTokens.length,
    });
  } catch (error: any) {
    console.error("Erreur send-push:", error);
    return NextResponse.json(
      { error: error?.message ?? "Erreur serveur lors de l'envoi push" },
      { status: 500 }
    );
  }
}

// ============================================================
// Supprime les tokens FCM invalides des documents utilisateurs
// ============================================================
async function cleanupInvalidTokens(invalidTokens: string[]) {
  const usersRef = adminDb.collection("users");

  // Firestore 'array-contains-any' limite à 30 valeurs par requête
  for (let i = 0; i < invalidTokens.length; i += 30) {
    const chunk = invalidTokens.slice(i, i + 30);
    const snap = await usersRef.where("fcmTokens", "array-contains-any", chunk).get();

    const batch = adminDb.batch();
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const currentTokens: string[] = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
      const cleaned = currentTokens.filter((t) => !chunk.includes(t));
      batch.update(docSnap.ref, { fcmTokens: cleaned });
    });

    if (!snap.empty) await batch.commit();
  }
}


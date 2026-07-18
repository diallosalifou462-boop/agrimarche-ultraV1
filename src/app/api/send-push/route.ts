import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

// ============================================================
// FIREBASE ADMIN - Initialisation différée
// ============================================================
function getAdminApp() {
  if (getApps().length) return getApps()[0];

  // ⚠️ FIX cohérence : /api/notifications/send (l'autre route de ce projet)
  // exige FIREBASE_SERVICE_ACCOUNT_JSON (un seul bloc JSON), alors que cette
  // route exigeait 3 variables séparées (FIREBASE_PROJECT_ID/CLIENT_EMAIL/
  // PRIVATE_KEY). Si .env.local ne contient que la première convention (la
  // plus probable, vu que l'autre route la documente explicitement), cette
  // route levait "Firebase Admin n'est pas configuré." → 500 systématique.
  // On accepte maintenant les deux formats, et l'app Admin (singleton
  // process-wide via getApps()) reste cohérente peu importe laquelle des
  // deux routes s'initialise en premier dans ce process Next.js.
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson && serviceAccountJson.trim() !== "") {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON malformé).");
    }
    if (!serviceAccount.project_id) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON : project_id manquant.");
    }
    return initializeApp({ credential: cert(serviceAccount) });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin n'est pas configuré : définis soit FIREBASE_SERVICE_ACCOUNT_JSON, " +
      "soit FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY dans .env.local."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

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
    // Initialisation différée - uniquement au runtime
    const app = getAdminApp();
    const adminDb = getFirestore(app);
    const messaging = getMessaging(app);

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
      await cleanupInvalidTokens(adminDb, invalidTokens).catch((err) =>
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
// Supprime les tokens FCM invalides des sous-collections utilisateurs
// ⚠️ Les tokens vivent dans users/{uid}/tokens/{token} (voir useFCMToken.tsx),
// pas dans un champ fcmTokens sur le document utilisateur — d'où la requête
// collectionGroup, identique à celle utilisée côté admin pour les récupérer.
// ============================================================
async function cleanupInvalidTokens(
  adminDb: Firestore,
  invalidTokens: string[]
) {
  const invalidSet = new Set(invalidTokens);
  const snap = await adminDb.collectionGroup('tokens').get();

  const batch = adminDb.batch();
  let count = 0;
  snap.docs.forEach((docSnap) => {
    if (invalidSet.has(docSnap.id)) {
      batch.delete(docSnap.ref);
      count++;
    }
  });

  if (count > 0) await batch.commit();
}

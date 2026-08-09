import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

// ============================================================
// CORS
// Cette route est appelée depuis les URLs de preview Vercel
// (ex: agrimarche-ultra-v1-xxxxx.vercel.app), qui sont des origines
// différentes du domaine de production. Sans ces en-têtes, le
// navigateur bloque la requête au niveau du preflight (OPTIONS)
// avant même qu'elle n'atteigne ce handler.
// ============================================================
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Masque un token dans les logs (préfixe/suffixe seulement) pour éviter
// d'exposer des identifiants d'appareil complets en clair côté serveur.
function maskToken(t: string): string {
  if (!t) return "(vide)";
  if (t.length <= 16) return `${t.slice(0, 4)}…`;
  return `${t.slice(0, 8)}…${t.slice(-6)} (len=${t.length})`;
}

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
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400, headers: CORS_HEADERS });
    }

    const { tokens, title, body, deepLink, urgent, icon } = payload as {
      tokens?: string[];
      title?: string;
      body?: string;
      deepLink?: string;
      urgent?: boolean;
      icon?: string;
    };

    console.log(`[send-push] Requête reçue — ${tokens?.length ?? 0} token(s), titre="${title}", urgent=${!!urgent}`);

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.warn("[send-push] Aucun token fourni — abandon.");
      return NextResponse.json({ error: "Aucun token FCM fourni" }, { status: 400, headers: CORS_HEADERS });
    }
    if (tokens.length > 500) {
      console.warn(`[send-push] ${tokens.length} tokens fournis > 500 — abandon.`);
      return NextResponse.json({ error: "Maximum 500 tokens par requête (limite FCM multicast)" }, { status: 400, headers: CORS_HEADERS });
    }
    if (!title || !body) {
      console.warn("[send-push] Titre ou message manquant — abandon.");
      return NextResponse.json({ error: "Titre et message requis" }, { status: 400, headers: CORS_HEADERS });
    }

    // ── Filtrage des tokens mal formés AVANT l'envoi ────────
    // ⚠️ sendEachForMulticast rejette parfois TOUT le batch (erreur 400 globale,
    // sans response.responses[]) dès qu'un seul token est malformé — le
    // nettoyage post-envoi plus bas ne suffit pas à s'en protéger, il faut
    // filtrer en amont. Un vrai token FCM contient toujours ':' et fait
    // largement plus de 100 caractères ; un token APNs brut résiduel est un
    // hex de 64 caractères sans ':'.
    const isLikelyValidFcmToken = (t: string) =>
      typeof t === "string" && t.includes(":") && t.length > 100;

    const malformedTokens = tokens.filter((t) => !isLikelyValidFcmToken(t));
    const validTokens = tokens.filter(isLikelyValidFcmToken);

    console.log(
      `[send-push] Filtrage — ${validTokens.length} valide(s), ${malformedTokens.length} mal formé(s)` +
      (malformedTokens.length > 0 ? `: ${malformedTokens.map(maskToken).join(", ")}` : "")
    );

    if (malformedTokens.length > 0) {
      console.warn(`[send-push] ${malformedTokens.length} token(s) mal formé(s) écarté(s) avant l'envoi, suppression Firestore en cours…`);
      await cleanupInvalidTokens(adminDb, malformedTokens).catch((err) =>
        console.warn("[send-push] Erreur nettoyage tokens mal formés:", err)
      );
      console.log(`[send-push] Nettoyage tokens mal formés terminé.`);
    }

    if (validTokens.length === 0) {
      console.warn("[send-push] Aucun token valide après filtrage — abandon.");
      return NextResponse.json(
        { error: "Aucun token FCM valide après filtrage", malformedTokensRemoved: malformedTokens.length },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Construction du message multicast ──────────────────
    const message = {
      tokens: validTokens,
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
    console.log(`[send-push] Envoi vers ${validTokens.length} token(s) via sendEachForMulticast…`);
    const response = await messaging.sendEachForMulticast(message);
    console.log(`[send-push] Résultat FCM — success=${response.successCount}, failure=${response.failureCount}`);

    // ── Nettoyage des tokens invalides / désinstallés ────────
    const invalidTokens: string[] = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code;
        console.warn(`[send-push] Échec token ${maskToken(validTokens[idx])} — ${code}: ${res.error?.message}`);
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(validTokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      console.warn(`[send-push] ${invalidTokens.length} token(s) invalide(s)/désinstallé(s) détecté(s) post-envoi, suppression Firestore en cours…`);
      await cleanupInvalidTokens(adminDb, invalidTokens).catch((err) =>
        console.warn("[send-push] Erreur nettoyage tokens FCM:", err)
      );
      console.log(`[send-push] Nettoyage tokens invalides terminé.`);
    }

    console.log(
      `[send-push] Terminé — successCount=${response.successCount}, failureCount=${response.failureCount}, ` +
      `malformedTokensRemoved=${malformedTokens.length}, invalidTokensRemoved=${invalidTokens.length}`
    );

    return NextResponse.json(
      {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokensRemoved: invalidTokens.length,
        malformedTokensRemoved: malformedTokens.length,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("[send-push] Erreur non gérée:", error?.message ?? error, error?.cause ?? "");
    return NextResponse.json(
      { error: error?.message ?? "Erreur serveur lors de l'envoi push" },
      { status: 500, headers: CORS_HEADERS }
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
      console.log(`[send-push] Suppression token Firestore: ${maskToken(docSnap.id)} (${docSnap.ref.path})`);
      batch.delete(docSnap.ref);
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`[send-push] ${count} document(s) token supprimé(s) de Firestore.`);
  } else {
    console.log("[send-push] Aucun document token correspondant trouvé à supprimer.");
  }
}

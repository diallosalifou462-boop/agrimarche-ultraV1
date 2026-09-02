// src/lib/pushDebugLog.ts
//
// Journal de diagnostic des envois push, écrit dans Firestore
// (collection `push_debug_logs`) plutôt que dans un fichier disque :
// sur Vercel (serverless), il n'y a pas de système de fichiers
// persistant entre deux invocations — un `fs.writeFile` disparaîtrait
// à la requête suivante. Firestore, lui, persiste et reste consultable
// depuis la console Firebase (ou exportable en Excel via ton outillage
// xlsx existant).
//
// Chaque appel écrit UN document contenant :
//   - le résumé (succès/échec par plateforme : ios / android / web)
//   - le détail par token (masqué), avec le code d'erreur FCM/APNs exact
//     (ex: "messaging/mismatched-credential",
//     "messaging/third-party-auth-error",
//     "messaging/invalid-apns-credentials" → ce sont les 3 codes qui
//     indiquent typiquement un problème de clé APNs mal configurée
//     dans Firebase Console, la cause la plus fréquente d'un push qui
//     marche sur Android mais jamais sur iPhone).

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type PushPlatform = 'ios' | 'android' | 'web' | 'unknown';

export interface PushLogEntry {
  token: string; // token brut en entrée, masqué automatiquement avant écriture
  platform: PushPlatform;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  messageId?: string;
}

// Masque un token dans les logs (préfixe/suffixe seulement).
export function maskToken(t: string): string {
  if (!t) return '(vide)';
  if (t.length <= 16) return `${t.slice(0, 4)}…`;
  return `${t.slice(0, 8)}…${t.slice(-6)} (len=${t.length})`;
}

export async function logPushAttempt(
  adminDb: Firestore,
  params: {
    source: 'send-push' | 'notifications-send';
    userId?: string | null;
    title: string;
    body: string;
    entries: PushLogEntry[];
  }
): Promise<void> {
  const { source, userId, title, body, entries } = params;

  const byPlatform: Record<string, { success: number; failure: number }> = {};
  entries.forEach((e) => {
    const p = e.platform || 'unknown';
    byPlatform[p] = byPlatform[p] || { success: 0, failure: 0 };
    if (e.success) byPlatform[p].success++;
    else byPlatform[p].failure++;
  });

  // ⚠️ Repère spécifique iOS : ce sont les codes qui pointent quasi
  // toujours vers une clé APNs manquante/mal configurée dans Firebase
  // Console (Cloud Messaging > Apple), et non un bug côté app.
  const APNS_CONFIG_ERROR_CODES = new Set([
    'messaging/mismatched-credential',
    'messaging/third-party-auth-error',
    'messaging/invalid-apns-credentials',
  ]);
  const likelyApnsConfigIssue = entries.some(
    (e) => e.platform === 'ios' && !e.success && e.errorCode && APNS_CONFIG_ERROR_CODES.has(e.errorCode)
  );

  try {
    // ⚠️ FIX : Firestore rejette toute valeur `undefined` dans un document
    // (erreur "Cannot use 'undefined' as a Firestore value"). Pour un token
    // réussi, errorCode/errorMessage/messageId sont undefined — ce qui
    // faisait planter CETTE écriture de log (heureusement rattrapée par le
    // catch plus bas, donc l'envoi push lui-même n'était jamais impacté,
    // mais aucun log n'était sauvegardé dès qu'un seul token réussissait).
    // On nettoie chaque entrée en ne gardant que les clés définies.
    const cleanEntries = entries.map((e) => {
      const clean: Record<string, unknown> = {
        token: maskToken(e.token),
        platform: e.platform,
        success: e.success,
      };
      if (e.errorCode !== undefined) clean.errorCode = e.errorCode;
      if (e.errorMessage !== undefined) clean.errorMessage = e.errorMessage;
      if (e.messageId !== undefined) clean.messageId = e.messageId;
      return clean;
    });

    await adminDb.collection('push_debug_logs').add({
      source,
      userId: userId ?? null,
      title,
      body,
      createdAt: FieldValue.serverTimestamp(),
      totalTokens: entries.length,
      successCount: entries.filter((e) => e.success).length,
      failureCount: entries.filter((e) => !e.success).length,
      byPlatform,
      likelyApnsConfigIssue, // true → va vérifier la clé APNs dans Firebase Console
      entries: cleanEntries,
    });
  } catch (err) {
    // Un souci de logging ne doit jamais faire échouer l'envoi push lui-même.
    console.warn('[pushDebugLog] Échec écriture du log de diagnostic:', err);
  }
}

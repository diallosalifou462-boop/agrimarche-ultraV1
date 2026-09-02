'use client';

// src/lib/notifications/notifyUser.ts
//
// Point d'entrée UNIQUE pour notifier un ou plusieurs utilisateurs suite
// à un événement (nouvelle commande, produit publié, livraison...).
//
// ⚠️ IMPORTANT : ces fonctions passent TOUJOURS par une route API
// (Admin SDK côté serveur), jamais par un addDoc() Firestore direct
// depuis le client. Raison : la règle Firestore sur `notifications` est
// `allow create: if isAdmin();` — un vendeur qui vient de publier un
// produit, ou un acheteur qui vient de commander, n'est PAS admin, donc
// un addDoc() direct pour notifier quelqu'un d'autre serait rejeté par
// les règles (et c'est voulu : sans ça, n'importe quel utilisateur
// pourrait écrire une fausse notification dans la boîte de n'importe
// qui). La route API utilise Firebase Admin, qui contourne les règles
// de sécurité côté serveur — c'est le seul endroit légitime pour ça.

import { apiUrl } from '@/lib/api-config';

// ============================================================
// MOTEUR D'ENVOI ROBUSTE — retry + backoff exponentiel
// Même logique que `sendPushBatched` dans admin/page.tsx (diffusion à
// tous les tokens), qui elle survit déjà aux pannes réseau ponctuelles.
// notifyUser()/notifyAllUsers() faisaient un unique fetch : la moindre
// erreur réseau ou 5xx transitoire (cold start Vercel, timeout Firestore
// côté route...) faisait échouer silencieusement la notification, sans
// aucune seconde chance — contrairement à la diffusion admin.
// ============================================================
export async function fetchWithRetry(
  url: string,
  body: unknown,
  { maxRetries = 2, baseDelayMs = 600 }: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<{ ok: boolean; status?: number }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true, status: res.status };
      // Erreur serveur/réseau transitoire : on retente. Une erreur 4xx
      // (ex: userId/title manquant) ne se corrigera pas en réessayant,
      // mais on ne peut pas la distinguer sans lire le corps — le coût
      // d'un retry inutile est négligeable comparé à une notif perdue.
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      return { ok: false, status: res.status };
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  return { ok: false };
}

export type NotificationType = string;

export interface NotifyUserInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Route interne vers laquelle naviguer au clic, ex: "/orders/123" */
  link?: string;
  icon?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  urgent?: boolean;
  /** Canaux à envoyer en plus de l'in-app (toujours créé). Défaut: push seul. */
  channels?: ('push' | 'email' | 'sms')[];
}

/** Notifie UN utilisateur précis (ex: le vendeur d'une nouvelle commande). */
export async function notifyUser({
  userId,
  type,
  title,
  body,
  link,
  icon = '🔔',
  priority = 'medium',
  urgent = false,
  channels = ['push'],
}: NotifyUserInput): Promise<void> {
  try {
    const result = await fetchWithRetry(apiUrl('/api/notifications/send'), {
      userId, title, body, link, channels, priority, urgent, type, icon,
    });
    if (!result.ok) {
      console.warn('[notifyUser] Échec envoi après retries (statut', result.status, ')');
    }
  } catch (err) {
    // Best-effort : une notification ratée (même après retries) ne doit
    // jamais faire échouer l'action principale de l'utilisateur
    // (commande, publication...).
    console.warn('[notifyUser] Erreur réseau après retries:', err);
  }
}

export interface NotifyAllUsersInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  icon?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  urgent?: boolean;
  /** Ne pas notifier cet utilisateur (typiquement : celui qui vient de publier) */
  excludeUserId?: string;
}

/** Notifie TOUS les utilisateurs de la plateforme (ex: nouveau produit publié). */
export async function notifyAllUsers({
  type,
  title,
  body,
  link,
  icon = '🌾',
  priority = 'medium',
  urgent = false,
  excludeUserId,
}: NotifyAllUsersInput): Promise<void> {
  try {
    const result = await fetchWithRetry(apiUrl('/api/broadcast'), {
      title, body, link, type, icon, priority, urgent, excludeUserId,
    });
    if (!result.ok) {
      console.warn('[notifyAllUsers] Échec envoi après retries (statut', result.status, ')');
    }
  } catch (err) {
    console.warn('[notifyAllUsers] Erreur réseau après retries:', err);
  }
}

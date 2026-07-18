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
    const res = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, body, link, channels, priority, urgent, type, icon }),
    });
    if (!res.ok) {
      console.warn('[notifyUser] Échec envoi (statut', res.status, ')');
    }
  } catch (err) {
    // Best-effort : une notification ratée ne doit jamais faire échouer
    // l'action principale de l'utilisateur (commande, publication...).
    console.warn('[notifyUser] Erreur réseau:', err);
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
    const res = await fetch('/api/notifications/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, link, type, icon, priority, urgent, excludeUserId }),
    });
    if (!res.ok) {
      console.warn('[notifyAllUsers] Échec envoi (statut', res.status, ')');
    }
  } catch (err) {
    console.warn('[notifyAllUsers] Erreur réseau:', err);
  }
}

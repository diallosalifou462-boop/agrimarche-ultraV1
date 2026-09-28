// src/app/api/admin/delete-user/route.ts — suppression COMPLÈTE d'un compte
//
// Pourquoi : la page admin supprimait seulement le document Firestore
// users/{uid}. Le compte Firebase Auth restait, ainsi que d'éventuels
// comptes « téléphone seul » orphelins du même numéro et phoneIndex/{numéro}.
// Résultat : à la réinscription « Ce numéro est déjà associé à un compte »,
// et à la connexion « Ce compte n'a pas encore de mot de passe défini ».
//
// Cette route (Admin SDK, réservée aux admins) supprime :
//   1. le compte Auth + le profil Firestore (avec sous-collections) du uid ;
//   2. les autres comptes Auth du MÊME numéro qui sont des fantômes
//      (aucun profil Firestore, aucune commande/produit) ou des doublons vides ;
//   3. phoneIndex/{numéro} s'il désigne un compte supprimé ou inexistant.
// Un autre compte du même numéro qui contient des données n'est JAMAIS touché.
//
// Body : { uid?: string, phone?: string } — au moins l'un des deux.
//   - uid seul/avec phone : suppression d'un utilisateur de la liste admin ;
//   - phone seul : nettoyage d'un numéro bloqué (fantômes uniquement).

import { NextRequest, NextResponse } from 'next/server';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  getAdminApp,
  toE164Senegal,
  syntheticEmailCandidates,
  isEmptyDuplicate,
} from '@/lib/server/phoneAccounts';
import { isAdminEmail } from '@/lib/adminConfig';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** Retrouve le numéro d'un compte : champ phone du profil, Auth, ou email synthétique. */
function phoneFrom(profile: any, user: UserRecord | null): string | null {
  const fromProfile = profile?.phone ? toE164Senegal(String(profile.phone)) : null;
  if (fromProfile) return fromProfile;
  if (user?.phoneNumber) return toE164Senegal(user.phoneNumber);
  const local = user?.email?.split('@')[0];
  return local && /^\d{9,12}$/.test(local) ? toE164Senegal(local) : null;
}

export async function POST(req: NextRequest) {
  try {
    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    // ── 1. Seul un admin peut appeler cette route ─────────────────────
    const header = req.headers.get('authorization');
    const idToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) return json({ error: 'Non autorisé' }, 401);
    const caller = await auth.verifyIdToken(idToken).catch(() => null);
    if (!caller) return json({ error: 'Session expirée, reconnectez-vous.' }, 401);
    const callerSnap = await db.collection('users').doc(caller.uid).get();
    const callerIsAdmin = callerSnap.data()?.role === 'admin' || isAdminEmail(caller.email);
    if (!callerIsAdmin) return json({ error: 'Action réservée aux administrateurs.' }, 403);

    // ── 2. Cible ───────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const uid: string | null = typeof body?.uid === 'string' && body.uid ? body.uid : null;
    let e164: string | null = typeof body?.phone === 'string' ? toE164Senegal(body.phone) : null;
    if (!uid && !e164) return json({ error: 'Utilisateur ou numéro manquant.' }, 400);
    if (uid && uid === caller.uid) return json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, 400);

    const deleted: string[] = [];
    const kept: string[] = [];

    const deleteAccount = async (targetUid: string) => {
      await db.recursiveDelete(db.collection('users').doc(targetUid)).catch(() => {});
      await auth.deleteUser(targetUid).catch((e: any) => {
        if (e?.code !== 'auth/user-not-found') throw e;
      });
      deleted.push(targetUid);
    };

    if (uid) {
      const [profileSnap, user] = await Promise.all([
        db.collection('users').doc(uid).get(),
        auth.getUser(uid).catch(() => null),
      ]);
      if (profileSnap.data()?.role === 'admin') {
        return json({ error: 'Impossible de supprimer un compte administrateur.' }, 400);
      }
      e164 = e164 ?? phoneFrom(profileSnap.data(), user);
      await deleteAccount(uid);
    }

    // ── 3. Autres comptes Auth du même numéro : fantômes uniquement ────
    if (e164) {
      const phoneUser = await auth.getUserByPhoneNumber(e164).catch(() => null);
      const { users: emailUsers } = await auth.getUsers(
        syntheticEmailCandidates(e164).map((email) => ({ email })),
      );
      const candidates = new Map<string, UserRecord>();
      for (const u of [phoneUser, ...emailUsers]) if (u && !deleted.includes(u.uid)) candidates.set(u.uid, u);

      for (const u of candidates.values()) {
        // Un compte qui porte un AUTRE numéro n'appartient pas à ce numéro.
        if (u.phoneNumber && u.phoneNumber !== e164) { kept.push(u.uid); continue; }
        const profile = await db.collection('users').doc(u.uid).get();
        if (profile.data()?.role === 'admin') { kept.push(u.uid); continue; }
        const [asBuyer, asSeller, products] = await Promise.all([
          db.collection('orders').where('userId', '==', u.uid).limit(1).get(),
          db.collection('orders').where('sellerId', '==', u.uid).limit(1).get(),
          db.collection('products').where('sellerId', '==', u.uid).limit(1).get(),
        ]);
        const hasData = !asBuyer.empty || !asSeller.empty || !products.empty;
        const ghost = !profile.exists && !hasData;
        if (ghost || (await isEmptyDuplicate(u))) await deleteAccount(u.uid);
        else kept.push(u.uid);
      }

      // ── 4. phoneIndex : libère le numéro s'il pointe vers un compte disparu
      const indexRef = db.collection('phoneIndex').doc(e164);
      const indexed = (await indexRef.get()).data()?.accountId as string | undefined;
      if (indexed) {
        const stillExists = !deleted.includes(indexed) && (await auth.getUser(indexed).then(() => true).catch(() => false));
        if (!stillExists) await indexRef.delete();
      }
    }

    console.log(`[admin/delete-user] par ${caller.uid} — numéro ${e164 ?? '?'} — supprimés: ${deleted.join(', ') || 'aucun'} — conservés: ${kept.join(', ') || 'aucun'}`);
    return json({ ok: true, phone: e164, deleted: deleted.length, kept: kept.length });
  } catch (e: any) {
    console.error('[admin/delete-user] Erreur:', e);
    return json({ error: 'La suppression a échoué. Réessayez.' }, 500);
  }
}

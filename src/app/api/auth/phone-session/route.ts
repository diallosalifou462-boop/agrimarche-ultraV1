// Après un code SMS Orange (Firebase Phone Auth), ramène l'utilisateur sur
// SON compte.
//
// Problème corrigé : si le vrai compte (email) n'avait pas le numéro attaché,
// Firebase créait à la validation du code un DEUXIÈME compte « téléphone
// seul », vide. L'utilisateur s'y retrouvait connecté (sans commandes, sans
// rôle), et au mot de passe oublié le nouveau mot de passe était posé sur ce
// compte vide.
//
// Ici : on vérifie le jeton du compte téléphone (preuve que le code SMS est
// bon), on supprime le doublon s'il est vide, on attache le numéro au vrai
// compte et on renvoie un jeton de connexion pour ce vrai compte.

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { DuplicateAccountWithDataError, getAdminApp, resolveVerifiedPhoneAccount, toE164Senegal } from '@/lib/server/phoneAccounts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (typeof idToken !== 'string' || !idToken) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400, headers: CORS_HEADERS });
    }
    const auth = getAuth(getAdminApp());
    const decoded = await auth.verifyIdToken(idToken).catch(() => null);
    const phoneE164 = decoded?.phone_number ? toE164Senegal(decoded.phone_number) : null;
    // ⚠️ FIX (26/09) : le jeton doit provenir d'une connexion PAR SMS
    // (sign_in_provider 'phone'). Sinon, un compte email/mot de passe portant
    // un phone_number (attaché par ailleurs) servirait de « preuve » de
    // possession du numéro sans code SMS.
    if (!decoded || !phoneE164 || decoded.firebase?.sign_in_provider !== 'phone') {
      return NextResponse.json({ error: 'Vérification du numéro invalide' }, { status: 401, headers: CORS_HEADERS });
    }
    // Le jeton doit venir d'une vérification SMS récente (moins de 10 min).
    const authTimeMs = (decoded.auth_time ?? 0) * 1000;
    if (Date.now() - authTimeMs > 10 * 60 * 1000) {
      return NextResponse.json({ error: 'Vérification expirée, renvoyez le code' }, { status: 401, headers: CORS_HEADERS });
    }

    const uid = await resolveVerifiedPhoneAccount(phoneE164);
    if (!uid) {
      return NextResponse.json({ error: "Aucun compte n'est associé à ce numéro." }, { status: 404, headers: CORS_HEADERS });
    }
    const customToken = await auth.createCustomToken(uid);
    return NextResponse.json({ ok: true, uid, customToken, merged: uid !== decoded.uid }, { headers: CORS_HEADERS });
  } catch (error: any) {
    if (error instanceof DuplicateAccountWithDataError) {
      return NextResponse.json(
        { error: 'Deux comptes utilisent ce numéro. Contactez le support pour les réunir.' },
        { status: 409, headers: CORS_HEADERS }
      );
    }
    console.error('[auth/phone-session] Erreur:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500, headers: CORS_HEADERS });
  }
}

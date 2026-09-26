// Vérifie si un numéro a déjà un compte (inscription, mot de passe oublié)
// et donne l'email de connexion du compte (connexion).
//
// ⚠️ Avant, seul getUserByPhoneNumber() était utilisé : les comptes créés
// avec un email seul (sans numéro attaché) étaient considérés comme
// INEXISTANTS → réinscription possible avec le même numéro, et « aucun
// compte » au mot de passe oublié. La recherche couvre maintenant toutes
// les formes de compte (voir lib/server/phoneAccounts.ts).

import { NextRequest, NextResponse } from 'next/server';
import { findAccountsForPhone, toE164Senegal } from '@/lib/server/phoneAccounts';

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
    const { phone, purpose } = await req.json();
    const phoneE164 = toE164Senegal(String(phone || ''));
    if (!phoneE164) {
      return NextResponse.json({ error: 'Numéro invalide' }, { status: 400, headers: CORS_HEADERS });
    }
    if (purpose !== 'register' && purpose !== 'reset' && purpose !== 'login') {
      return NextResponse.json({ error: "Paramètre 'purpose' invalide" }, { status: 400, headers: CORS_HEADERS });
    }

    const { main, hasPassword } = await findAccountsForPhone(phoneE164);
    const accountExists = !!main;

    // ⚠️ FIX (26/09) : un compte SANS mot de passe (orphelin « téléphone
    // seul », inscription Orange interrompue) renvoyait 409 « déjà inscrit »
    // — impasse : impossible de se connecter (aucun mot de passe) ni de se
    // réinscrire. On le traite comme un numéro libre : l'inscription
    // (vérification SMS puis resolveVerifiedPhoneAccount) récupère ce compte.
    // 409 seulement si un mot de passe existe vraiment.
    if (purpose === 'register' && accountExists && hasPassword) {
      return NextResponse.json(
        { error: 'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».' },
        { status: 409, headers: CORS_HEADERS }
      );
    }
    if ((purpose === 'reset' || purpose === 'login') && !accountExists) {
      return NextResponse.json(
        { error: "Aucun compte n'est associé à ce numéro." },
        { status: 404, headers: CORS_HEADERS }
      );
    }
    if (purpose === 'login') {
      // L'email synthétique réel du compte (le format a varié dans le temps).
      // hasPassword=false : compte « téléphone seul » (orphelin, voir
      // phoneAccounts.ts) — la connexion échouera TOUJOURS quel que soit le
      // mot de passe tapé, ce n'est pas au client de le deviner via le code
      // d'erreur Firebase (auth/invalid-credential couvre les deux cas).
      return NextResponse.json({ ok: true, email: main?.email ?? null, hasPassword }, { headers: CORS_HEADERS });
    }
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[auth/check-phone] Erreur:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500, headers: CORS_HEADERS });
  }
}

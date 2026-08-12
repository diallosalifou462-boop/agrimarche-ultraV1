import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson && serviceAccountJson.trim() !== '') {
    const serviceAccount = JSON.parse(serviceAccountJson);
    return initializeApp({ credential: cert(serviceAccount) });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin n'est pas configuré.");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function toE164Senegal(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('221')) digits = '+' + digits;
    else if (digits.length === 9) digits = '+221' + digits;
    else digits = '+' + digits;
  }
  return /^\+221\d{9}$/.test(digits) ? digits : null;
}

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const { phone, code, registration } = await req.json();
    const phoneE164 = toE164Senegal(String(phone || ''));
    const submittedCode = String(code || '').trim();

    if (!phoneE164 || !/^\d{6}$/.test(submittedCode)) {
      return NextResponse.json(
        { error: 'Requête invalide' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const docRef = db.collection('otp_codes').doc(phoneE164);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Aucun code n'a été envoyé à ce numéro, ou il a expiré." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const data = snap.data()!;

    if (Date.now() > data.expiresAt) {
      await docRef.delete();
      return NextResponse.json(
        { error: 'Code expiré. Demandez-en un nouveau.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
      await docRef.delete();
      return NextResponse.json(
        { error: 'Trop de tentatives incorrectes. Demandez un nouveau code.' },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    if (data.code !== submittedCode) {
      await docRef.update({ attempts: (data.attempts ?? 0) + 1 });
      return NextResponse.json(
        { error: 'Code incorrect.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Code correct : on consomme le document (usage unique)
    await docRef.delete();

    // ⚠️ FIX : tout se fait maintenant côté serveur avec l'Admin SDK
    // (mot de passe + profil Firestore), au lieu de laisser le client
    // faire linkWithCredential() + setDoc() après signInWithCustomToken().
    // Raison : un compte connecté via jeton personnalisé (customToken) a
    // un sign_in_provider "custom", différent du sign_in_provider "phone"
    // utilisé par le flow Orange (Firebase Phone Auth natif). Si les
    // règles de sécurité Firestore vérifient ce provider pour autoriser
    // l'écriture dans users/{uid}, l'écriture échouait silencieusement
    // pour les comptes Free/Yas et Expresso : le compte Firebase Auth
    // était bien créé, mais sans son document Firestore ("pas de page").
    // L'Admin SDK contourne entièrement les règles de sécurité, donc ce
    // problème ne peut plus se poser, quelles que soient les règles.
    const adminAuth = getAuth(app);
    let uid: string | null = null;
    let userExisted = false;
    try {
      const existingUser = await adminAuth.getUserByPhoneNumber(phoneE164);
      uid = existingUser.uid;
      userExisted = true;
    } catch {
      userExisted = false;
    }

    // ⚠️ GARDE-FOU : `registration` présent = flow d'inscription, absent =
    // flow "mot de passe oublié". On ne se contente plus de brancher sur
    // ces deux cas, on les VALIDE d'abord (filet de sécurité serveur, même
    // si /api/otp/send a normalement déjà bloqué ces cas en amont avec
    // `purpose`) :
    //   - inscription sur un numéro déjà connu → refusé (pas de double
    //     compte, pas d'écrasement silencieux du compte existant) ;
    //   - réinitialisation sur un numéro inconnu → refusé (on ne crée plus
    //     de compte "fantôme" vide juste parce que quelqu'un a reçu et
    //     saisi un code SMS pour un numéro jamais inscrit).
    if (registration && userExisted) {
      return NextResponse.json(
        { error: 'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».' },
        { status: 409, headers: CORS_HEADERS }
      );
    }
    if (!registration && !userExisted) {
      return NextResponse.json(
        { error: "Aucun compte n'est associé à ce numéro." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (registration && !userExisted) {
      const newUser = await adminAuth.createUser({ phoneNumber: phoneE164 });
      uid = newUser.uid;
    }

    // Filet de sécurité : après les gardes ci-dessus, `uid` est toujours
    // assigné (compte existant retrouvé, ou nouveau compte créé pour une
    // inscription). Ce cas ne devrait jamais se produire, mais on évite
    // ainsi tout crash silencieux si la logique évolue plus tard.
    if (!uid) {
      return NextResponse.json(
        { error: 'Erreur serveur' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Si des données d'inscription sont fournies (premier passage), on
    // finalise le compte : mot de passe + nom + document de profil.
    if (registration && !userExisted) {
      const { password, name, region, departement, commune, quartier } = registration;
      const syntheticEmail = `${phoneE164.replace(/\D/g, '')}@agrimarche.sn`;

      // ⚠️ FIX : on attache désormais l'email/mot de passe comme second
      // provider sur le compte Firebase Auth lui-même (pas seulement dans
      // Firestore), pour que ce compte ait exactement la même structure
      // que ceux créés via le flow Orange (Firebase Phone Auth natif +
      // EmailAuthProvider lié côté client dans AuthContext.signUp()).
      // Sans ça, la console Firebase n'affichait qu'un seul provider
      // ("phone") pour les comptes Free/Yas et Expresso, contre deux
      // ("phone" + "password") pour les comptes Orange.
      await adminAuth.updateUser(uid, {
        email: syntheticEmail,
        emailVerified: true,
        password: String(password || ''),
        displayName: String(name || ''),
      });

      const userProfile = {
        uid,
        email: syntheticEmail,
        displayName: String(name || ''),
        phone: phoneE164,
        phoneVerified: true,
        role: 'client',
        region: String(region || ''),
        departement: String(departement || ''),
        commune: String(commune || ''),
        quartier: String(quartier || ''),
        createdAt: new Date().toISOString(),
      };

      await db.collection('users').doc(uid).set(userProfile, { merge: true });
    }

    const customToken = await adminAuth.createCustomToken(uid);

    return NextResponse.json(
      { success: true, customToken, uid },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('[otp/verify] Erreur:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// src/app/api/diag/otp-log/route.ts
//
// Reçoit les logs de diagnostic OTP envoyés par le CLIENT
// (src/lib/otpDiagnostics.ts) et les écrit dans Firestore via le Admin
// SDK — donc SANS dépendre d'une règle firestore.rules ouverte au
// client. Même logique que /api/otp/send : le Admin SDK contourne
// toujours les règles de sécurité, on n'a rien à toucher côté rules.
//
// Compromis assumé : si le réseau est TOTALEMENT coupé entre le
// téléphone et ce domaine, cet appel échoue lui aussi comme celui vers
// /api/otp/send — dans ce cas précis, aucun log ne peut être écrit nulle
// part (il n'y a littéralement aucune requête qui part), mais ce n'est
// pas grave : l'utilisateur voit déjà le message d'erreur réseau
// affiché à l'écran, on n'a pas besoin d'un log pour savoir que "rien ne
// part du tout". Ce qui nous intéresse — et que cet endpoint capture
// très bien — c'est TOUT le reste : erreurs API, timeouts partiels,
// succès/échecs Infobip, incohérences client/serveur, etc.

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

// Liste blanche stricte des champs acceptés — on ne laisse jamais le
// client écrire un document Firestore à forme libre, même via une route
// serveur (protège contre un payload abusif/gonflé).
const ALLOWED_FIELDS = [
  'flow', 'step', 'phoneMasked', 'carrier', 'platform',
  'httpStatus', 'errorMessage', 'durationMs', 'userAgent',
] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body?.flow !== 'string' || typeof body?.step !== 'string') {
      return NextResponse.json(
        { error: 'flow et step sont requis' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const clean: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (body[key] !== undefined && body[key] !== null) {
        // Tronque toute chaîne trop longue (ex: message d'erreur verbeux)
        clean[key] = typeof body[key] === 'string' ? body[key].slice(0, 500) : body[key];
      }
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    await db.collection('otp_debug_logs').add({
      ...clean,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error: any) {
    // Un souci de logging ne doit jamais remonter comme une vraie erreur
    // au flow d'inscription/connexion qui l'a déclenché.
    console.warn('[diag/otp-log] Échec écriture log (ignoré côté client):', error?.message || error);
    return NextResponse.json({ success: false }, { status: 200, headers: CORS_HEADERS });
  }
}

/**
 * app/api/ai/redeem/route.ts — Activation d'un code d'accès IA (SÉCURISÉ)
 *
 * Avant : la page /main/unlock-ia vérifiait le code, le marquait utilisé et accordait l'accès
 * DEPUIS LE NAVIGATEUR. Selon les règles Firestore, un utilisateur pouvait donc s'accorder
 * l'accès lui-même ou réutiliser un code. Ici, tout se fait côté serveur, dans UNE transaction :
 * code existant, non utilisé, non expiré → marqué utilisé + accès accordé, de façon atomique.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { getAdminApp, CORS_HEADERS } from '@/lib/server/adminApp';

const TOKEN_LIMIT = 500_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const idToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!idToken) return json({ valid: false, reason: 'auth_required' }, 401);
  let app;
  try { app = getAdminApp(); } catch { return json({ valid: false, reason: 'server' }, 500); }
  const decoded = await getAuth(app).verifyIdToken(idToken).catch(() => null);
  if (!decoded) return json({ valid: false, reason: 'auth_required' }, 401);

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) return json({ valid: false, reason: 'not_found' }, 400);

  const db = getFirestore(app);
  const codeRef = db.collection('accessCodes').doc(code);
  const userRef = db.collection('users').doc(decoded.uid);
  try {
    const result = await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(codeRef);
      if (!snap.exists) return { valid: false, reason: 'not_found' };
      const data = snap.data()!;
      if (data.used) return { valid: false, reason: 'already_used' };
      if (data.expiresAt && data.expiresAt.toDate() < new Date()) return { valid: false, reason: 'expired' };
      const days = Number(data.days) || 30;
      const expiry = new Date(Date.now() + days * 86_400_000);
      tx.update(codeRef, { used: true, usedBy: decoded.uid, usedAt: Timestamp.now() });
      tx.set(userRef, { hasAIAccess: true, aiExpiryDate: Timestamp.fromDate(expiry), aiUnlockedAt: Timestamp.now(),
                        aiTokensUsed: 0, aiTokensLimit: TOKEN_LIMIT, aiAlertSent: false, aiLastUsageAt: null }, { merge: true });
      return { valid: true, days, expiresAt: expiry.toISOString() };
    });
    return json(result, result.valid ? 200 : 400);
  } catch (e) {
    console.error('[ai/redeem]', e);
    return json({ valid: false, reason: 'error' }, 500);
  }
}

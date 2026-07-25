import { NextRequest, NextResponse } from 'next/server';
import { addSubscription } from '@/lib/subscriptions-store';

// ⚠️ Cette route n'est actuellement appelée par aucun code client (le
// composant qui l'utilisait, AutoNotifications.tsx, n'est jamais monté).
// Elle repose de plus sur un store en mémoire (lib/subscriptions-store.ts)
// qui ne persiste PAS entre deux invocations de fonction serverless sur
// Vercel — chaque cold start repart d'un tableau vide. Si ce flux Web Push
// (distinct du système FCM utilisé partout ailleurs dans l'app) est
// réactivé un jour, ce store doit d'abord être remplacé par Firestore.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const { endpoint, keys, userId } = await request.json();
    addSubscription({ endpoint, keys, userId, createdAt: new Date() });
    console.log('✅ Abonnement enregistré');
    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Erreur subscription:', error);
    return NextResponse.json({ error: 'Erreur' }, { status: 500, headers: CORS_HEADERS });
  }
}

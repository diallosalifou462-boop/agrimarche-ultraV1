import { NextRequest, NextResponse } from 'next/server';
import { addSubscription } from '@/lib/subscriptions-store';

export async function POST(request: NextRequest) {
  try {
    const { endpoint, keys, userId } = await request.json();
    addSubscription({ endpoint, keys, userId, createdAt: new Date() });
    console.log('✅ Abonnement enregistré');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur subscription:', error);
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}

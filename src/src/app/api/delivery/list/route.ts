// /app/api/delivery/list/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'delivery'));
    const snapshot = await getDocs(q);

    const deliveryPersons = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ success: true, deliveryPersons });
  } catch (error) {
    console.error('Erreur:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
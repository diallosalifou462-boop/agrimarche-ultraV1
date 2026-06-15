// /app/api/orders/assign-delivery/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const { orderId, deliveryId, deliveryName, deliveryPhone } = await request.json();
    
    if (!orderId || !deliveryId) {
      return NextResponse.json({ success: false, error: 'orderId et deliveryId requis' }, { status: 400 });
    }
    
    // Récupérer la commande
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    
    if (!orderSnap.exists()) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 });
    }
    
    // Mettre à jour la commande avec le livreur assigné
    await updateDoc(orderRef, {
      deliveryId: deliveryId,
      deliveryName: deliveryName || '',
      deliveryPhone: deliveryPhone || '',
      assignedAt: new Date().toISOString(),
      status: 'expediee', // Garde le statut expédiée
      updatedAt: new Date().toISOString(),
    });
    
    // 🔔 Optionnel: Envoyer une notification au livreur
    // await fetch('/api/notifications/send', { ... });
    
    return NextResponse.json({ success: true, message: 'Livreur assigné avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
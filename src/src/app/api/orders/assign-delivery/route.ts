// /app/api/orders/assign-delivery/route.ts
//
// ⚠️ FIX cohérence inter-pages (voir audit livreur) :
// 1) Cette route écrivait deliveryId/deliveryName/deliveryPhone — un
//    schéma que ni app/delivery/dashboard (where('delivererId','==',uid))
//    ni seller/orders ni admin/page.tsx ne lisent. Les commandes assignées
//    via cette route étaient invisibles côté livreur. On aligne sur le
//    schéma canonique delivererId/delivererName/delivererPhone, le même
//    que admin/page.tsx::assignDelivery et admin/assign-delivery/page.tsx.
// 2) Cette route utilisait le SDK client Firebase (`db` /
//    lib/firebase/firebase) dans une route API — sans session
//    utilisateur, `request.auth` est toujours null côté règles Firestore,
//    donc l'update échouait systématiquement en permission-denied (voir
//    lib/firebase/orders.rules.snippet : update réservé au vendeur/admin).
//    On bascule sur le SDK Admin (même pattern que
//    api/orders/notify-seller, api/notifications/send, api/broadcast),
//    qui n'est pas soumis aux règles.
// 3) MISE À JOUR : cette route ne touchait pas au statut, sur le modèle
//    (à l'époque) de admin/assign-delivery/page.tsx. Or cette page vient
//    d'être corrigée : ne pas faire avancer `status` vers 'en_livraison'
//    rend la commande invisible dans les deux onglets du dashboard livreur
//    (ni "Disponibles" — delivererId déjà posé —, ni "En cours" — status
//    resté sur sa valeur d'origine). Cette route suit désormais le même
//    correctif, pour rester cohérente si elle est un jour rebranchée.

// ⚠️ Comme /api/orders/notify-seller, cette route n'est actuellement
// appelée par AUCUN code client du projet (vérifié : aucune référence à
// "api/orders/assign-delivery" en dehors de ce fichier). L'assignation
// réelle d'un livreur passe aujourd'hui par admin/assign-delivery/page.tsx
// et admin/page.tsx::assignDelivery, en écriture directe côté client.
// Corrigée par cohérence / au cas où elle serait rebranchée plus tard —
// mais ne pas supposer qu'elle tourne en prod tant qu'aucun appel fetch()
// ne pointe dessus.

import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

export async function POST(request: Request) {
  try {
    const { orderId, delivererId, delivererName, delivererPhone } = await request.json();

    if (!orderId || !delivererId) {
      return NextResponse.json({ success: false, error: 'orderId et delivererId requis' }, { status: 400 });
    }

    const db = getFirestore(getAdminApp());
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 });
    }

    const payload = {
      delivererId,
      delivererName: delivererName || '',
      delivererPhone: delivererPhone || '',
      delivererAssignedAt: FieldValue.serverTimestamp(),
      status: 'en_livraison' as const,
      statusLabel: 'En livraison',
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Synchroniser seller_orders (lu par account-page.tsx pour l'historique
    // client), comme le fait déjà admin/page.tsx::assignDelivery — sinon
    // la copie miroir reste sans livreur assigné indéfiniment.
    const batch = db.batch();
    batch.set(orderRef, payload, { merge: true });
    const sellerOrderRef = db.collection('seller_orders').doc(orderId);
    const sellerOrderSnap = await sellerOrderRef.get();
    if (sellerOrderSnap.exists) {
      batch.set(sellerOrderRef, payload, { merge: true });
    }
    await batch.commit();

    return NextResponse.json({ success: true, message: 'Livreur assigné avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

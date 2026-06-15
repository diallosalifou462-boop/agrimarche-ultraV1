"use strict";
// /app/api/orders/assign-delivery/route.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const firebase_1 = require("@/lib/firebase/firebase");
const firestore_1 = require("firebase/firestore");
async function POST(request) {
    try {
        const { orderId, deliveryId, deliveryName, deliveryPhone } = await request.json();
        if (!orderId || !deliveryId) {
            return server_1.NextResponse.json({ success: false, error: 'orderId et deliveryId requis' }, { status: 400 });
        }
        // Récupérer la commande
        const orderRef = (0, firestore_1.doc)(firebase_1.db, 'orders', orderId);
        const orderSnap = await (0, firestore_1.getDoc)(orderRef);
        if (!orderSnap.exists()) {
            return server_1.NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 });
        }
        // Mettre à jour la commande avec le livreur assigné
        await (0, firestore_1.updateDoc)(orderRef, {
            deliveryId: deliveryId,
            deliveryName: deliveryName || '',
            deliveryPhone: deliveryPhone || '',
            assignedAt: new Date().toISOString(),
            status: 'expediee', // Garde le statut expédiée
            updatedAt: new Date().toISOString(),
        });
        // 🔔 Optionnel: Envoyer une notification au livreur
        // await fetch('/api/notifications/send', { ... });
        return server_1.NextResponse.json({ success: true, message: 'Livreur assigné avec succès' });
    }
    catch (error) {
        console.error('Erreur:', error);
        return server_1.NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}

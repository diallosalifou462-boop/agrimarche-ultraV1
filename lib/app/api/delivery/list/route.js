"use strict";
// /app/api/delivery/list/route.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const firebase_1 = require("@/lib/firebase/firebase");
const firestore_1 = require("firebase/firestore");
async function GET() {
    try {
        // Récupérer tous les utilisateurs avec role = "delivery"
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'users'), (0, firestore_1.where)('role', '==', 'delivery'));
        const snapshot = await (0, firestore_1.getDocs)(q);
        const deliveryPersons = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        return server_1.NextResponse.json({ success: true, deliveryPersons });
    }
    catch (error) {
        console.error('Erreur:', error);
        return server_1.NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}

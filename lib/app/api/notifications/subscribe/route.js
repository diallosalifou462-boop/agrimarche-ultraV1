"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptions = void 0;
exports.POST = POST;
// app/api/notify/subscribe/route.ts
const server_1 = require("next/server");
// Pour l'instant, on stocke en mémoire (plus tard on mettra une vraie base de données)
let subscriptions = [];
exports.subscriptions = subscriptions;
async function POST(request) {
    try {
        const { endpoint, keys, userId } = await request.json();
        // Éviter les doublons
        const existingIndex = subscriptions.findIndex(s => s.endpoint === endpoint);
        if (existingIndex !== -1) {
            subscriptions[existingIndex] = { endpoint, keys, userId, createdAt: new Date() };
        }
        else {
            subscriptions.push({ endpoint, keys, userId, createdAt: new Date() });
        }
        console.log(`✅ Nouvel abonnement : ${subscriptions.length} total`);
        return server_1.NextResponse.json({ success: true });
    }
    catch (error) {
        console.error('Erreur subscription:', error);
        return server_1.NextResponse.json({ error: 'Erreur' }, { status: 500 });
    }
}

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentcorpGateway = exports.ACTIONS = void 0;
exports.computeDisplayPrice = computeDisplayPrice;
exports.verifySignature = verifySignature;
exports.handle = handle;
// ============================================================
//   agentcorpGateway.ts — Passerelle d'actions AgentCorp → SunuMenef
//   (à copier dans functions/src/ puis exporter depuis index.ts)
//
//   Adapté au VRAI code de SunuMenef (lu le 14/10/2026) :
//   • produits : collection `products` ; masqué = status 'inactive'
//     (filtre de app/main/products/page.tsx) ; prix affiché = basePrice + 5 %
//     (src/lib/pricing.ts::computeDisplayPrice), basePrice rangé dans
//     products/{id}/productPricing/base — jamais dans le document public.
//   • commandes : `orders` + copie miroir `seller_orders` (même logique que
//     admin/page.tsx::updateOrderStatus), journal `order_status_log`.
//     Statuts : en_attente → en_preparation → en_livraison → livre | annule.
//     'livre' reste réservé au code de livraison (deliveryCode.ts) : INTERDIT ici.
//   • notifications : tokens FCM dans users/{uid}/tokens/{token} ; historique
//     in-app dans la collection racine `notifications` (schéma de writeNotification).
//   • promotions/bannières : collection `ads` (même calcul que l'onglet Promotions).
//
//   Effets automatiques à connaître (déjà dans index.ts, rien à ajouter) :
//   baisse de prix → notifyPriceDrop ; stock → notifyLowStock ;
//   statut de commande → notifyOrderStatusStep / notifyOrderCancelled.
//
//   Sécurité :
//   • signature HMAC-SHA256 + horodatage < 5 min ;
//   • le RISQUE est défini ICI (AgentCorp ne peut pas le changer) ;
//   • write / sensitive exigent meta.approved_by === 'propriétaire' ;
//   • forbidden n'est jamais exécutée ;
//   • aucune suppression définitive : produits → status 'inactive' + deletedAt,
//     avis → copie dans `agentcorp_trash` puis retrait (restaurable) ;
//   • chaque action journalisée dans `agentcorp_actions` (avant / après).
// ============================================================
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const crypto = __importStar(require("crypto"));
const whatsappSupport_1 = require("./whatsappSupport");
if (admin.apps.length === 0)
    admin.initializeApp();
const SECRET_NAME = 'AGENTCORP_GATEWAY_SECRET';
const ADMIN_MARGIN_RATE = 0.05; // DOIT rester identique à src/lib/pricing.ts
const AGENT_STATUSES = ['en_preparation', 'en_livraison'];
const MAX_NOTIFY_USERS = 5000;
const STATUS_LABELS = {
    en_attente: 'en attente de confirmation', en_preparation: 'en préparation', en_livraison: 'en cours de livraison',
    livre: 'livrée', annule: 'annulée',
};
const fdb = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
class InputError extends Error {
}
function str(v, name, max = 500) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s)
        throw new InputError(`Paramètre « ${name} » manquant`);
    if (s.length > max)
        throw new InputError(`Paramètre « ${name} » trop long`);
    return s;
}
function num(v, name, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max)
        throw new InputError(`Paramètre « ${name} » invalide`);
    return n;
}
function computeDisplayPrice(basePrice) {
    return Math.round((Number(basePrice) || 0) * (1 + ADMIN_MARGIN_RATE));
}
function pick(o, keys) {
    return Object.fromEntries(keys.map((k) => { var _a; return [k, (_a = o === null || o === void 0 ? void 0 : o[k]) !== null && _a !== void 0 ? _a : null]; }));
}
async function getDocOrFail(collection, id, label) {
    const ref = fdb().collection(collection).doc(str(id, `${label}_id`, 200));
    const snap = await ref.get();
    if (!snap.exists)
        throw new InputError(`${label} introuvable`);
    return { ref, snap, data: snap.data() };
}
function productSummary(id, p) {
    var _a, _b, _c, _d;
    return { id, name: p.name, category: p.category, region: p.region, price: p.price, stock: p.stock,
        availability: (_a = p.availability) !== null && _a !== void 0 ? _a : 'disponible', status: (_b = p.status) !== null && _b !== void 0 ? _b : 'active',
        sellerName: (_d = (_c = p.sellerName) !== null && _c !== void 0 ? _c : p.farmer) !== null && _d !== void 0 ? _d : null, deleted: Boolean(p.deletedAt) };
}
function orderSummary(id, o) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    return { id, orderNumber: o.orderNumber, status: o.status, total: (_b = (_a = o.total) !== null && _a !== void 0 ? _a : o.amount) !== null && _b !== void 0 ? _b : null,
        sellerName: (_c = o.sellerName) !== null && _c !== void 0 ? _c : null, userName: (_d = o.userName) !== null && _d !== void 0 ? _d : null, source: (_e = o.source) !== null && _e !== void 0 ? _e : 'app',
        delivererName: (_f = o.delivererName) !== null && _f !== void 0 ? _f : null, items: ((_g = o.items) !== null && _g !== void 0 ? _g : []).map((i) => `${i.quantity} × ${i.productName}`),
        createdAt: (_m = (_l = (_k = (_j = (_h = o.createdAt) === null || _h === void 0 ? void 0 : _h.toDate) === null || _j === void 0 ? void 0 : _j.call(_h)) === null || _k === void 0 ? void 0 : _k.toISOString) === null || _l === void 0 ? void 0 : _l.call(_k)) !== null && _m !== void 0 ? _m : null };
}
// Commande : même double écriture que admin/page.tsx (orders + seller_orders) + journal.
async function writeOrder(orderId, payload, fromStatus, ctx, action) {
    var _a;
    const sellerRef = fdb().collection('seller_orders').doc(orderId);
    const sellerSnap = await sellerRef.get();
    const batch = fdb().batch();
    batch.set(fdb().collection('orders').doc(orderId), payload, { merge: true });
    if (sellerSnap.exists)
        batch.set(sellerRef, payload, { merge: true });
    batch.set(fdb().collection('order_status_log').doc(), {
        orderId, uid: `agentcorp:${ctx.agentId}`, action, fromStatus, toStatus: (_a = payload.status) !== null && _a !== void 0 ? _a : fromStatus,
        seller_orders_synced: sellerSnap.exists, createdAt: now(),
    });
    await batch.commit();
}
// Notifications : même schéma que index.ts::writeNotification et les tokens de useFCMToken.ts.
async function notifyUsers(userIds, n) {
    var _a, _b;
    const ids = [...new Set(userIds)].filter(Boolean).slice(0, MAX_NOTIFY_USERS);
    const tokens = [];
    for (const id of ids) {
        const snap = await fdb().collection('users').doc(id).collection('tokens').get();
        snap.docs.forEach((d) => { var _a; return tokens.push(((_a = d.data()) === null || _a === void 0 ? void 0 : _a.token) || d.id); });
    }
    let pushed = 0;
    for (let i = 0; i < tokens.length; i += 500) {
        const r = await admin.messaging().sendEachForMulticast({
            tokens: tokens.slice(i, i + 500), notification: { title: n.title, body: n.body },
            data: { type: (_a = n.type) !== null && _a !== void 0 ? _a : 'info', link: (_b = n.link) !== null && _b !== void 0 ? _b : '/' },
        });
        pushed += r.successCount;
    }
    for (let i = 0; i < ids.length; i += 400) {
        const batch = fdb().batch();
        ids.slice(i, i + 400).forEach((userId) => {
            var _a, _b, _c;
            return batch.set(fdb().collection('notifications').doc(), {
                userId, title: n.title, body: n.body, type: (_a = n.type) !== null && _a !== void 0 ? _a : 'info', icon: '🔔', link: (_b = n.link) !== null && _b !== void 0 ? _b : '/',
                deepLink: (_c = n.link) !== null && _c !== void 0 ? _c : '/', priority: 'medium', urgent: false, data: {}, read: false, createdAt: now(),
            });
        });
        await batch.commit();
    }
    return { recipients: ids.length, devices: tokens.length, pushed };
}
// ------------------------------------------------------------------
//   CATALOGUE — ajoute ici chaque nouvelle fonctionnalité de SunuMenef.
// ------------------------------------------------------------------
exports.ACTIONS = {
    // ---------- Lecture (automatique) ----------
    list_products: {
        risk: 'read', description: 'Lister les produits (filtres : query sur le nom, category, status active|inactive).',
        params: { query: 'texte', category: 'texte', status: 'active|inactive' },
        run: async (p) => {
            var _a;
            let q = fdb().collection('products');
            if (p.category)
                q = q.where('category', '==', String(p.category));
            const snap = await q.limit(300).get();
            const term = String((_a = p.query) !== null && _a !== void 0 ? _a : '').toLowerCase();
            return { items: snap.docs.map((d) => productSummary(d.id, d.data()))
                    .filter((x) => { var _a; return (!term || String((_a = x.name) !== null && _a !== void 0 ? _a : '').toLowerCase().includes(term)) && (!p.status || x.status === p.status); })
                    .slice(0, 50) };
        },
    },
    get_product: {
        risk: 'read', description: "Détail d'un produit, y compris le prix demandé par le vendeur (basePrice).",
        params: { product_id: 'id' },
        run: async (p) => {
            var _a, _b;
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            const pricing = await ref.collection('productPricing').doc('base').get();
            return Object.assign(Object.assign({}, productSummary(ref.id, data)), { description: (_a = data.description) !== null && _a !== void 0 ? _a : '', harvestDate: (_b = data.harvestDate) !== null && _b !== void 0 ? _b : '', basePrice: pricing.exists ? pricing.data().basePrice : null });
        },
    },
    list_orders: {
        risk: 'read', description: 'Lister les commandes récentes (filtres : status, source « whatsapp »).',
        params: { status: 'en_attente|en_preparation|en_livraison|livre|annule', source: 'whatsapp', limit: 'nombre ≤ 100' },
        run: async (p) => {
            let q = fdb().collection('orders');
            if (p.status)
                q = q.where('status', '==', String(p.status));
            if (p.source)
                q = q.where('source', '==', String(p.source));
            const snap = await q.orderBy('createdAt', 'desc').limit(Math.min(Number(p.limit) || 30, 100)).get();
            return { items: snap.docs.map((d) => orderSummary(d.id, d.data())) };
        },
    },
    get_order: {
        risk: 'read', description: "Détail d'une commande (par order_id ou order_number).",
        params: { order_id: 'id', order_number: 'texte' },
        run: async (p) => {
            var _a, _b, _c;
            if (p.order_id) {
                const { ref, data } = await getDocOrFail('orders', p.order_id, 'commande');
                return Object.assign(Object.assign({}, orderSummary(ref.id, data)), { paymentStatus: (_a = data.paymentStatus) !== null && _a !== void 0 ? _a : null, tracking: (_c = (_b = data.tracking) === null || _b === void 0 ? void 0 : _b.phase) !== null && _c !== void 0 ? _c : null });
            }
            const snap = await fdb().collection('orders').where('orderNumber', '==', str(p.order_number, 'order_number', 50)).limit(1).get();
            if (snap.empty)
                throw new InputError('Commande introuvable');
            return orderSummary(snap.docs[0].id, snap.docs[0].data());
        },
    },
    sales_summary: {
        risk: 'read', description: "Résumé des ventes sur N jours (commandes, livrées, chiffre d'affaires, commissions).",
        params: { days: 'nombre (défaut 7)' },
        run: async (p) => {
            const days = Math.min(Math.max(Number(p.days) || 7, 1), 365);
            const since = admin.firestore.Timestamp.fromMillis(Date.now() - days * 86400000);
            const snap = await fdb().collection('orders').where('createdAt', '>=', since).get();
            const out = { days, orders: 0, delivered: 0, cancelled: 0, revenue_fcfa: 0, commission_fcfa: 0, whatsapp_orders: 0 };
            snap.docs.forEach((d) => {
                var _a, _b, _c;
                const o = d.data();
                out.orders++;
                if (o.source === 'whatsapp')
                    out.whatsapp_orders++;
                if (o.status === 'annule')
                    out.cancelled++;
                if (o.status === 'livre') {
                    out.delivered++;
                    out.revenue_fcfa += Number((_b = (_a = o.total) !== null && _a !== void 0 ? _a : o.amount) !== null && _b !== void 0 ? _b : 0);
                    out.commission_fcfa += Number((_c = o.commission) !== null && _c !== void 0 ? _c : 0);
                }
            });
            return out;
        },
    },
    list_users: {
        risk: 'read', description: 'Compter / lister des utilisateurs par rôle (buyer, seller, delivery) et région. Sans téléphone ni e-mail.',
        params: { role: 'buyer|seller|delivery', region: 'texte' },
        run: async (p) => {
            let q = fdb().collection('users');
            if (p.role)
                q = q.where('role', '==', String(p.role));
            if (p.region)
                q = q.where('region', '==', String(p.region));
            const snap = await q.limit(MAX_NOTIFY_USERS).get();
            return { count: snap.size, sample: snap.docs.slice(0, 20).map((d) => {
                    var _a, _b, _c;
                    return ({ id: d.id, name: (_b = (_a = d.data().name) !== null && _a !== void 0 ? _a : d.data().displayName) !== null && _b !== void 0 ? _b : '',
                        role: d.data().role, region: (_c = d.data().region) !== null && _c !== void 0 ? _c : null });
                }) };
        },
    },
    list_reviews: {
        risk: 'read', description: "Lister les avis (filtre product_id).", params: { product_id: 'id' },
        run: async (p) => {
            let q = fdb().collection('reviews');
            if (p.product_id)
                q = q.where('productId', '==', String(p.product_id));
            const snap = await q.limit(50).get();
            return { items: snap.docs.map((d) => (Object.assign({ id: d.id }, pick(d.data(), ['productId', 'rating', 'comment', 'userName'])))) };
        },
    },
    list_ads: {
        risk: 'read', description: 'Lister les promotions et bannières (collection ads).', params: { active: 'true|false' },
        run: async (p) => {
            let q = fdb().collection('ads');
            if (p.active !== undefined)
                q = q.where('active', '==', String(p.active) === 'true');
            const snap = await q.limit(50).get();
            return { items: snap.docs.map((d) => (Object.assign({ id: d.id }, pick(d.data(), ['type', 'title', 'badge', 'discountPercent', 'active', 'placement'])))) };
        },
    },
    // ---------- Modification réversible (approbation du propriétaire) ----------
    update_product: {
        risk: 'write', description: 'Modifier un produit : name, category, region, description, availability (disponible|sur_commande|a_venir), harvestDate.',
        params: { product_id: 'id', name: 'texte', category: 'texte', region: 'texte', description: 'texte', availability: 'texte', harvestDate: 'texte' },
        run: async (p) => {
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            const allowed = ['name', 'category', 'region', 'description', 'availability', 'harvestDate'];
            const patch = {};
            for (const k of allowed)
                if (p[k] !== undefined)
                    patch[k] = str(p[k], k, k === 'description' ? 3000 : 200);
            if (patch.availability && !['disponible', 'sur_commande', 'a_venir'].includes(String(patch.availability)))
                throw new InputError('availability invalide');
            if (!Object.keys(patch).length)
                throw new InputError('Aucun champ à modifier');
            await ref.update(patch);
            return { product_id: ref.id, before: pick(data, Object.keys(patch)), after: patch };
        },
    },
    set_base_price: {
        risk: 'write', description: 'Changer le prix demandé par le vendeur (FCFA). Le prix affiché = base + 5 %. Une baisse déclenche notifyPriceDrop.',
        params: { product_id: 'id', base_price: 'nombre FCFA' },
        run: async (p) => {
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            const base = Math.round(num(p.base_price, 'base_price', 1, 50000000));
            const price = computeDisplayPrice(base);
            await ref.update({ price });
            await ref.collection('productPricing').doc('base').set({ basePrice: base, updatedAt: now() }, { merge: true });
            return { product_id: ref.id, before: { price: data.price }, after: { basePrice: base, price } };
        },
    },
    update_stock: {
        risk: 'write', description: 'Changer le stock d\'un produit (déclenche notifyLowStock si nécessaire).',
        params: { product_id: 'id', stock: 'nombre' },
        run: async (p) => {
            var _a;
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            const stock = Math.round(num(p.stock, 'stock', 0, 10000000));
            await ref.update({ stock });
            return { product_id: ref.id, before: { stock: (_a = data.stock) !== null && _a !== void 0 ? _a : null }, after: { stock } };
        },
    },
    hide_product: {
        risk: 'write', description: 'Masquer un produit du catalogue (status inactive, restaurable).', params: { product_id: 'id' },
        run: async (p) => {
            var _a;
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            await ref.update({ status: 'inactive', updatedAt: now() });
            return { product_id: ref.id, before: { status: (_a = data.status) !== null && _a !== void 0 ? _a : 'active' }, after: { status: 'inactive' } };
        },
    },
    restore_product: {
        risk: 'write', description: 'Remettre en vente un produit masqué ou supprimé.', params: { product_id: 'id' },
        run: async (p) => {
            var _a;
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            await ref.update({ status: 'active', deletedAt: null, deletedBy: null, updatedAt: now() });
            return { product_id: ref.id, before: { status: (_a = data.status) !== null && _a !== void 0 ? _a : 'active' }, after: { status: 'active' } };
        },
    },
    update_order_status: {
        risk: 'write', description: 'Faire avancer une commande : en_preparation ou en_livraison (la livraison finale passe par le code client).',
        params: { order_id: 'id', status: 'en_preparation|en_livraison' },
        run: async (p, ctx) => {
            const { ref, data } = await getDocOrFail('orders', p.order_id, 'commande');
            const status = String(p.status);
            if (!AGENT_STATUSES.includes(status))
                throw new InputError('Statut non autorisé pour un agent');
            if (['livre', 'annule'].includes(data.status))
                throw new InputError(`Commande déjà ${data.status}`);
            const payload = { status, updatedAt: admin.firestore.Timestamp.now() };
            if (status === 'en_preparation')
                payload.enPreparationAt = admin.firestore.Timestamp.now();
            await writeOrder(ref.id, payload, data.status, ctx, 'agent_status');
            return { order_id: ref.id, before: { status: data.status }, after: { status } };
        },
    },
    assign_deliverer: {
        risk: 'write', description: 'Attribuer un livreur (rôle delivery) à une commande et le prévenir.',
        params: { order_id: 'id', deliverer_id: 'id utilisateur' },
        run: async (p, ctx) => {
            var _a, _b, _c, _d, _e;
            const { ref, data } = await getDocOrFail('orders', p.order_id, 'commande');
            const { data: d } = await getDocOrFail('users', p.deliverer_id, 'livreur');
            if (d.role !== 'delivery')
                throw new InputError("Cet utilisateur n'est pas livreur");
            if (['livre', 'annule'].includes(data.status))
                throw new InputError(`Commande déjà ${data.status}`);
            const payload = { delivererId: String(p.deliverer_id), delivererName: (_b = (_a = d.name) !== null && _a !== void 0 ? _a : d.displayName) !== null && _b !== void 0 ? _b : '', delivererPhone: (_c = d.phone) !== null && _c !== void 0 ? _c : '',
                delivererAssignedAt: admin.firestore.Timestamp.now(), status: 'en_preparation',
                updatedAt: admin.firestore.Timestamp.now(), 'tracking.phase': 'assigned' };
            await writeOrder(ref.id, payload, data.status, ctx, 'agent_assign_deliverer');
            await notifyUsers([String(p.deliverer_id)], { title: '📦 Nouvelle livraison assignée', type: 'delivery',
                body: `Commande #${(_d = data.orderNumber) !== null && _d !== void 0 ? _d : ref.id} à récupérer chez ${(_e = data.sellerName) !== null && _e !== void 0 ? _e : 'le vendeur'}.`, link: '/delivery/dashboard' });
            return { order_id: ref.id, before: pick(data, ['delivererId', 'status']), after: { delivererId: p.deliverer_id, status: 'en_preparation' } };
        },
    },
    create_promotion: {
        risk: 'write', description: 'Publier une promotion sur un produit (collection ads), prix remisé calculé sur le prix actuel.',
        params: { product_id: 'id', discount_percent: 'nombre 1-90', badge: 'texte', placement: 'banner|…', active: 'true|false' },
        run: async (p) => {
            var _a, _b, _c, _d;
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            const pct = Math.round(num(p.discount_percent, 'discount_percent', 1, 90));
            const originalPrice = Number(data.price) || 0;
            const discountedPrice = Math.round(originalPrice * (1 - pct / 100));
            const ad = await fdb().collection('ads').add({
                type: 'promotion', productId: ref.id, title: data.name, subtitle: `${(_a = data.category) !== null && _a !== void 0 ? _a : ''} · ${(_b = data.region) !== null && _b !== void 0 ? _b : ''}`,
                badge: typeof p.badge === 'string' && p.badge.trim() ? p.badge.trim().slice(0, 30) : '🔥 PROMO',
                imageUrl: Array.isArray(data.images) ? (_c = data.images[0]) !== null && _c !== void 0 ? _c : '' : '', linkUrl: '/main/products',
                placement: typeof p.placement === 'string' ? p.placement : 'banner', active: String((_d = p.active) !== null && _d !== void 0 ? _d : 'true') === 'true',
                priority: 0, discountPercent: pct, originalPrice, discountedPrice, savings: originalPrice - discountedPrice,
                createdBy: 'agentcorp', createdAt: now(), updatedAt: now(),
            });
            return { ad_id: ad.id, product_id: ref.id, discountPercent: pct, originalPrice, discountedPrice };
        },
    },
    set_ad_active: {
        risk: 'write', description: 'Activer ou désactiver une promotion / bannière.', params: { ad_id: 'id', active: 'true|false' },
        run: async (p) => {
            const { ref, data } = await getDocOrFail('ads', p.ad_id, 'annonce');
            const active = String(p.active) === 'true';
            await ref.update({ active, updatedAt: now() });
            return { ad_id: ref.id, before: { active: data.active }, after: { active } };
        },
    },
    restore_review: {
        risk: 'write', description: "Restaurer un avis retiré (depuis la corbeille).", params: { review_id: 'id' },
        run: async (p) => {
            const { ref, data } = await getDocOrFail('agentcorp_trash', `review_${str(p.review_id, 'review_id', 200)}`, 'avis en corbeille');
            await fdb().collection('reviews').doc(String(p.review_id)).set(data.data);
            await ref.delete();
            return { review_id: p.review_id, restored: true };
        },
    },
    // ---------- Sensible (approbation + avertissement) ----------
    delete_product: {
        risk: 'sensitive', description: 'Supprimer un produit (suppression DOUCE : retiré du catalogue, restaurable avec restore_product).',
        params: { product_id: 'id' },
        run: async (p, ctx) => {
            var _a;
            const { ref, data } = await getDocOrFail('products', p.product_id, 'produit');
            await ref.update({ status: 'inactive', deletedAt: now(), deletedBy: `agentcorp:${ctx.agentId}` });
            return { product_id: ref.id, name: data.name, before: { status: (_a = data.status) !== null && _a !== void 0 ? _a : 'active' }, after: { status: 'inactive', deleted: true } };
        },
    },
    cancel_order: {
        risk: 'sensitive', description: 'Annuler une commande non livrée (déclenche notifyOrderCancelled). Ne rembourse rien.',
        params: { order_id: 'id', reason: 'texte' },
        run: async (p, ctx) => {
            const { ref, data } = await getDocOrFail('orders', p.order_id, 'commande');
            if (['livre', 'annule'].includes(data.status))
                throw new InputError(`Commande déjà ${data.status}`);
            const payload = { status: 'annule', cancelledBy: 'admin', cancelledVia: 'agentcorp', cancelReason: str(p.reason, 'reason', 300),
                cancelledAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() };
            await writeOrder(ref.id, payload, data.status, ctx, 'agent_cancel');
            return { order_id: ref.id, before: { status: data.status }, after: { status: 'annule' },
                warning: data.paymentStatus === 'paid' ? 'Commande déjà payée : remboursement à traiter MANUELLEMENT par le propriétaire.' : null };
        },
    },
    remove_review: {
        risk: 'sensitive', description: 'Retirer un avis (copié dans la corbeille, restaurable avec restore_review).', params: { review_id: 'id' },
        run: async (p, ctx) => {
            const { ref, data } = await getDocOrFail('reviews', p.review_id, 'avis');
            await fdb().collection('agentcorp_trash').doc(`review_${ref.id}`).set({ kind: 'review', data, removedAt: now(), removedBy: `agentcorp:${ctx.agentId}` });
            await ref.delete();
            return { review_id: ref.id, archived: true };
        },
    },
    send_notification: {
        risk: 'sensitive', description: 'Notification push + in-app à : user_ids (liste) OU un rôle (buyer|seller|delivery|all) et/ou une région.',
        params: { title: 'texte ≤ 65', body: 'texte ≤ 240', user_ids: 'liste d\'ids', role: 'buyer|seller|delivery|all', region: 'texte', link: 'chemin ex. /main/products' },
        run: async (p) => {
            var _a, _b;
            const title = str(p.title, 'title', 65), body = str(p.body, 'body', 240);
            const link = typeof p.link === 'string' && p.link.startsWith('/') ? p.link : '/';
            let ids = Array.isArray(p.user_ids) ? p.user_ids.map(String) : [];
            if (!ids.length) {
                if (!p.role && !p.region)
                    throw new InputError('Cible manquante : user_ids, role ou region');
                let q = fdb().collection('users');
                if (p.role && p.role !== 'all')
                    q = q.where('role', '==', String(p.role));
                if (p.region)
                    q = q.where('region', '==', String(p.region));
                ids = (await q.limit(MAX_NOTIFY_USERS).get()).docs.map((d) => d.id);
            }
            const res = await notifyUsers(ids, { title, body, link, type: 'broadcast' });
            await fdb().collection('broadcasts').add({ title, body, deepLink: link, targetRole: (_a = p.role) !== null && _a !== void 0 ? _a : 'liste', targetRegion: (_b = p.region) !== null && _b !== void 0 ? _b : 'all',
                sentBy: 'agentcorp', sentAt: admin.firestore.Timestamp.now(), recipientCount: res.recipients, inAppCount: res.recipients,
                pushCount: res.pushed, channels: { push: true, inApp: true, email: false, sms: false } });
            return res;
        },
    },
    // ---------- Support client WhatsApp (utilisées par l'agent support, données réduites) ----------
    support_find_orders: {
        risk: 'read', description: 'Support : les 5 dernières commandes passées avec CE numéro (vérifié par Meta), sans données de tiers.',
        params: { phone: '221XXXXXXXXX' },
        run: async (p) => {
            const phone = (0, whatsappSupport_1.normalizePhone)(p.phone);
            if (!phone)
                throw new InputError('Numéro invalide');
            const tail = phone.slice(-9);
            // Les numéros sont rangés sous plusieurs formats (userPhone, buyerPhone…) : on compare les 9 derniers chiffres.
            const snap = await fdb().collection('orders').orderBy('createdAt', 'desc').limit(500).get();
            const items = snap.docs.filter((d) => {
                const o = d.data();
                return [o.userPhone, o.buyerPhone, o.buyerPhoneNormalized, o.customerPhone, o.phone]
                    .some((v) => v && String(v).replace(/\D/g, '').slice(-9) === tail);
            }).slice(0, 5).map((d) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                const o = d.data();
                return { orderNumber: o.orderNumber, status: o.status, statusLabel: (_a = STATUS_LABELS[o.status]) !== null && _a !== void 0 ? _a : o.status,
                    total: (_c = (_b = o.total) !== null && _b !== void 0 ? _b : o.amount) !== null && _c !== void 0 ? _c : null, items: ((_d = o.items) !== null && _d !== void 0 ? _d : []).map((i) => `${i.quantity} × ${i.productName}`),
                    delivererName: (_e = o.delivererName) !== null && _e !== void 0 ? _e : null, createdAt: (_k = (_j = (_h = (_g = (_f = o.createdAt) === null || _f === void 0 ? void 0 : _f.toDate) === null || _g === void 0 ? void 0 : _g.call(_f)) === null || _h === void 0 ? void 0 : _h.toISOString) === null || _j === void 0 ? void 0 : _j.call(_h)) !== null && _k !== void 0 ? _k : null };
            });
            return { items, scanned: snap.size };
        },
    },
    support_search_products: {
        risk: 'read', description: 'Support : produits PUBLICS en vente (nom, prix affiché, région, disponibilité). Jamais basePrice.',
        params: { query: 'mots-clés' },
        run: async (p) => {
            var _a;
            const words = String((_a = p.query) !== null && _a !== void 0 ? _a : '').toLowerCase().split(/\s+/).filter((w) => w.length >= 3).slice(0, 5);
            const snap = await fdb().collection('products').limit(300).get();
            const items = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())))
                .filter((x) => {
                var _a;
                return ((_a = x.status) !== null && _a !== void 0 ? _a : 'active') === 'active' && !x.deletedAt
                    && (!words.length || words.some((w) => { var _a; return String((_a = x.name) !== null && _a !== void 0 ? _a : '').toLowerCase().includes(w); }));
            })
                .slice(0, 8)
                .map((x) => {
                var _a, _b, _c, _d;
                return ({ name: x.name, price: x.price, unit: (_a = x.unit) !== null && _a !== void 0 ? _a : null, region: (_b = x.region) !== null && _b !== void 0 ? _b : null,
                    availability: (_c = x.availability) !== null && _c !== void 0 ? _c : 'disponible', inStock: Number((_d = x.stock) !== null && _d !== void 0 ? _d : 0) > 0 });
            });
            return { items };
        },
    },
    support_get_media: {
        risk: 'read', description: "Support : récupérer un vocal / une photo envoyé par un client (pour que le propriétaire l'écoute).",
        params: { path: 'whatsapp_media/…' },
        run: async (p) => {
            var _a;
            const path = str(p.path, 'path', 300);
            if (!/^whatsapp_media\/[0-9]{8,15}\/[A-Za-z0-9._-]+$/.test(path))
                throw new InputError('Chemin de média invalide');
            const file = admin.storage().bucket().file(path);
            const [meta] = await file.getMetadata();
            if (Number(meta.size) > 16 * 1024 * 1024)
                throw new InputError('Média trop volumineux');
            const [buf] = await file.download();
            return { mime: (_a = meta.contentType) !== null && _a !== void 0 ? _a : 'application/octet-stream', size: buf.length, data_b64: buf.toString('base64') };
        },
    },
    support_send_whatsapp: {
        risk: 'write', description: "Envoyer un message WhatsApp à un client qui a écrit il y a moins de 24 h (règle de Meta).",
        params: { phone: '221XXXXXXXXX', text: 'texte ≤ 4000' },
        run: async (p, ctx) => {
            const phone = (0, whatsappSupport_1.normalizePhone)(p.phone);
            if (!phone)
                throw new InputError('Numéro invalide');
            const text = str(p.text, 'text', 4000);
            if (!(await (0, whatsappSupport_1.withinCustomerWindow)(phone))) {
                throw new InputError("Fenêtre de 24 h fermée : le client doit d'abord écrire (sinon un modèle approuvé par Meta est requis)");
            }
            const r = await (0, whatsappSupport_1.sendWhatsAppText)(phone, text);
            await fdb().collection('support_conversations').doc(phone).collection('messages').add({
                direction: 'out', author: ctx.approvedBy === 'propriétaire' ? 'owner' : 'agent', text, wamid: r.wamid, at: now()
            });
            return { sent: true, wamid: r.wamid };
        },
    },
    // ---------- Interdit aux agents (visible pour que Saliou puisse l'expliquer) ----------
    set_order_delivered: { risk: 'forbidden', description: 'Passer une commande à « livrée » : uniquement via le code de livraison du client.', params: {}, run: async () => { throw new Error('Interdit'); } },
    refund_or_payment: { risk: 'forbidden', description: 'Rembourser, encaisser ou modifier un paiement.', params: {}, run: async () => { throw new Error('Interdit'); } },
    delete_user: { risk: 'forbidden', description: 'Supprimer un compte utilisateur.', params: {}, run: async () => { throw new Error('Interdit'); } },
    change_user_role: { risk: 'forbidden', description: "Changer le rôle d'un utilisateur (admin, vendeur…).", params: {}, run: async () => { throw new Error('Interdit'); } },
    manage_loans: { risk: 'forbidden', description: 'Créer ou modifier un prêt.', params: {}, run: async () => { throw new Error('Interdit'); } },
};
function verifySignature(raw, ts, sig, secret) {
    if (!secret || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300)
        return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
    const a = Buffer.from(expected), b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function handle(method, path, raw, headers, secret) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!verifySignature(method === 'POST' ? raw : '{}', headers['x-agentcorp-timestamp'], headers['x-agentcorp-signature'], secret)) {
        return { status: 401, body: { error: 'Signature invalide' } };
    }
    if (method === 'GET' && path.endsWith('/catalog')) {
        return { status: 200, body: { actions: Object.entries(exports.ACTIONS).map(([name, a]) => ({ name, risk: a.risk, description: a.description, params: a.params })) } };
    }
    if (method !== 'POST' || !path.endsWith('/execute'))
        return { status: 404, body: { error: 'Route inconnue' } };
    let req;
    try {
        req = JSON.parse(raw || '{}');
    }
    catch (_l) {
        return { status: 400, body: { error: 'JSON invalide' } };
    }
    const def = exports.ACTIONS[req.action];
    if (!def)
        return { status: 400, body: { error: 'Action inconnue' } };
    if (def.risk === 'forbidden')
        return { status: 403, body: { error: 'Action interdite aux agents' } };
    const meta = (_a = req.meta) !== null && _a !== void 0 ? _a : {};
    if (def.risk !== 'read' && meta.approved_by !== 'propriétaire')
        return { status: 403, body: { error: 'Approbation du propriétaire requise' } };
    const ctx = { agentId: String((_b = meta.agent_id) !== null && _b !== void 0 ? _b : ''), agentName: String((_c = meta.agent_name) !== null && _c !== void 0 ? _c : ''),
        missionId: (_d = meta.mission_id) !== null && _d !== void 0 ? _d : null, approvedBy: String((_e = meta.approved_by) !== null && _e !== void 0 ? _e : '') };
    const log = fdb().collection('agentcorp_actions').doc();
    try {
        const result = await def.run((_f = req.params) !== null && _f !== void 0 ? _f : {}, ctx);
        if (def.risk !== 'read')
            await log.set(Object.assign(Object.assign({ action: req.action, risk: def.risk, params: (_g = req.params) !== null && _g !== void 0 ? _g : {} }, ctx), { ok: true, result, at: now() }));
        return { status: 200, body: result };
    }
    catch (e) {
        await log.set(Object.assign(Object.assign({ action: req.action, risk: def.risk, params: (_h = req.params) !== null && _h !== void 0 ? _h : {} }, ctx), { ok: false, error: String((_j = e === null || e === void 0 ? void 0 : e.message) !== null && _j !== void 0 ? _j : e), at: now() }));
        return { status: e instanceof InputError ? 400 : 500, body: { error: String((_k = e === null || e === void 0 ? void 0 : e.message) !== null && _k !== void 0 ? _k : e) } };
    }
}
exports.agentcorpGateway = (0, https_1.onRequest)({ region: 'us-central1', secrets: [SECRET_NAME, 'WHATSAPP_ACCESS_TOKEN'], cors: false, timeoutSeconds: 120 }, async (req, res) => {
    var _a;
    const raw = req.method === 'POST' ? (req.rawBody ? req.rawBody.toString('utf8') : '') : '{}';
    const out = await handle(req.method, req.path, raw, {
        'x-agentcorp-timestamp': req.get('x-agentcorp-timestamp'), 'x-agentcorp-signature': req.get('x-agentcorp-signature'),
    }, (_a = process.env[SECRET_NAME]) !== null && _a !== void 0 ? _a : '');
    res.status(out.status).json(out.body);
});

"use strict";
// app/sitemap.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = sitemap;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("@/lib/firebase/firebase");
async function sitemap() {
    const baseUrl = 'https://agrimarche.sn';
    // Récupérer tous les produits
    const productsSnapshot = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, 'products'));
    const products = productsSnapshot.docs.map((doc) => {
        var _a;
        return ({
            url: `${baseUrl}/main/products/${doc.id}`,
            lastModified: ((_a = doc.data().updatedAt) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        });
    });
    // Pages statiques
    const staticPages = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/main/products`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/main/account`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/cart`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
    ];
    return [...staticPages, ...products];
}

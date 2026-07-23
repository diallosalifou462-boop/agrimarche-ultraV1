/**
 * Tests d'integration pour submitReview, executes contre l'emulateur
 * Firestore. Voir orderStatusTransitions.test.ts pour les prerequis.
 */

import * as admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'agrimarche-test';

import functionsTest from 'firebase-functions-test';
const testEnv = functionsTest({ projectId: process.env.GCLOUD_PROJECT });

import { submitReview } from '../reviewSubmission';

const db = admin.firestore();
const wrapped = testEnv.wrap(submitReview);

const BUYER_UID = 'buyer-1';
const OTHER_UID = 'not-the-buyer';

async function seedOrder(orderId: string, data: Record<string, any>) {
  await db.collection('orders').doc(orderId).set(data);
  await db.collection('reviews').doc(`${orderId}_${BUYER_UID}`).delete().catch(() => {});
}

afterAll(async () => {
  testEnv.cleanup();
});

describe('submitReview', () => {
  test('cree un avis pour une commande livree', async () => {
    const orderId = 'review-happy';
    await seedOrder(orderId, {
      userId: BUYER_UID, status: 'livre', sellerId: 'seller-1', sellerName: 'Ferme Test',
      items: [{ productName: 'Tomates' }],
    });

    const res: any = await wrapped(
      { data: { orderId, rating: 5, comment: 'Tres bon produit' }, auth: { uid: BUYER_UID, token: {} } } as any,
    );

    expect(res.success).toBe(true);
    expect(res.alreadyReviewed).toBe(false);

    const review = await db.collection('reviews').doc(`${orderId}_${BUYER_UID}`).get();
    expect(review.exists).toBe(true);
    expect(review.data()?.sellerId).toBe('seller-1'); // repris de la commande, pas du client
    expect(review.data()?.productNames).toEqual(['Tomates']);
  });

  test('refuse si la commande n\'est pas livree', async () => {
    // Regression test direct pour le bug remonte : une commande encore
    // en_livraison (jamais passee a livre a cause de l'ancien bug de
    // batch) ne doit plus faire echouer silencieusement -- elle doit
    // etre refusee avec une raison claire.
    const orderId = 'review-not-delivered';
    await seedOrder(orderId, { userId: BUYER_UID, status: 'en_livraison', sellerId: 'seller-1' });

    await expect(
      wrapped({ data: { orderId, rating: 4 }, auth: { uid: BUYER_UID, token: {} } } as any),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('est idempotent : un deuxieme envoi ne cree pas de doublon', async () => {
    const orderId = 'review-idempotent';
    await seedOrder(orderId, { userId: BUYER_UID, status: 'livre', sellerId: 'seller-1' });

    await wrapped({ data: { orderId, rating: 3 }, auth: { uid: BUYER_UID, token: {} } } as any);
    const res: any = await wrapped(
      { data: { orderId, rating: 3 }, auth: { uid: BUYER_UID, token: {} } } as any,
    );

    expect(res.alreadyReviewed).toBe(true);

    const snap = await db.collection('reviews').where('orderId', '==', orderId).get();
    expect(snap.size).toBe(1); // pas de doublon meme apres 2 appels
  });

  test("refuse si l'appelant n'est pas l'acheteur de la commande", async () => {
    const orderId = 'review-not-owner';
    await seedOrder(orderId, { userId: BUYER_UID, status: 'livre', sellerId: 'seller-1' });

    await expect(
      wrapped({ data: { orderId, rating: 5 }, auth: { uid: OTHER_UID, token: {} } } as any),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('refuse une note hors de 1-5', async () => {
    const orderId = 'review-bad-rating';
    await seedOrder(orderId, { userId: BUYER_UID, status: 'livre' });

    await expect(
      wrapped({ data: { orderId, rating: 7 }, auth: { uid: BUYER_UID, token: {} } } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('refuse un commentaire renseigne mais trop court', async () => {
    const orderId = 'review-short-comment';
    await seedOrder(orderId, { userId: BUYER_UID, status: 'livre' });

    await expect(
      wrapped({ data: { orderId, rating: 5, comment: 'ok' }, auth: { uid: BUYER_UID, token: {} } } as any),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('accepte un commentaire vide (optionnel)', async () => {
    const orderId = 'review-empty-comment';
    await seedOrder(orderId, { userId: BUYER_UID, status: 'livre' });

    const res: any = await wrapped(
      { data: { orderId, rating: 5, comment: '' }, auth: { uid: BUYER_UID, token: {} } } as any,
    );
    expect(res.success).toBe(true);
  });
});

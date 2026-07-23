/**
 * Tests d'integration pour updateOrderStatus, executes contre
 * l'emulateur Firestore (pas de mock : on veut verifier le
 * comportement REEL d'une transaction Firestore, notamment
 * l'idempotence et le rejet des transitions invalides).
 *
 * Prerequis :
 *   firebase emulators:start --only firestore,auth
 * ou directement :
 *   npm run test:emulator
 *
 * Ces tests ne s'executent PAS contre la prod ni contre un projet
 * Firebase reel -- FIRESTORE_EMULATOR_HOST redirige l'Admin SDK vers
 * l'emulateur local.
 */

import * as admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'agrimarche-test';

import functionsTest from 'firebase-functions-test';
const testEnv = functionsTest({ projectId: process.env.GCLOUD_PROJECT });

// L'import doit venir APRES la config de l'emulateur, sinon
// admin.initializeApp() dans orderStatusTransitions.ts pointerait vers
// un vrai projet.
import { updateOrderStatus } from '../orderStatusTransitions';

const db = admin.firestore();
const wrapped = testEnv.wrap(updateOrderStatus);

const BUYER_UID = 'buyer-1';
const OTHER_UID = 'not-the-buyer';

async function resetOrder(orderId: string, data: Record<string, any>) {
  await db.collection('orders').doc(orderId).set(data);
  await db.collection('seller_orders').doc(orderId).delete().catch(() => {});
}

afterAll(async () => {
  testEnv.cleanup();
});

describe('updateOrderStatus', () => {
  test('confirme la livraison quand la commande est en_livraison', async () => {
    const orderId = 'order-confirm-happy';
    await resetOrder(orderId, { userId: BUYER_UID, status: 'en_livraison' });

    const res: any = await wrapped(
      { data: { orderId, action: 'confirm_delivery' }, auth: { uid: BUYER_UID } } as any,
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe('livre');
    expect(res.alreadyApplied).toBe(false);

    const after = await db.collection('orders').doc(orderId).get();
    expect(after.data()?.status).toBe('livre');
  });

  test('propage la transition vers seller_orders si le doc existe', async () => {
    const orderId = 'order-confirm-sync';
    await db.collection('orders').doc(orderId).set({ userId: BUYER_UID, status: 'en_livraison' });
    await db.collection('seller_orders').doc(orderId).set({ userId: BUYER_UID, status: 'en_livraison' });

    await wrapped({ data: { orderId, action: 'confirm_delivery' }, auth: { uid: BUYER_UID } } as any);

    const sellerOrder = await db.collection('seller_orders').doc(orderId).get();
    expect(sellerOrder.data()?.status).toBe('livre');
  });

  test('est idempotent : un second appel ne re-ecrit pas et renvoie alreadyApplied=true', async () => {
    const orderId = 'order-confirm-idempotent';
    await resetOrder(orderId, { userId: BUYER_UID, status: 'livre' });

    const res: any = await wrapped(
      { data: { orderId, action: 'confirm_delivery' }, auth: { uid: BUYER_UID } } as any,
    );

    expect(res.alreadyApplied).toBe(true);
    expect(res.status).toBe('livre');
  });

  test('refuse la confirmation si le statut ne le permet pas (ex: en_attente)', async () => {
    const orderId = 'order-confirm-invalid-status';
    await resetOrder(orderId, { userId: BUYER_UID, status: 'en_attente' });

    await expect(
      wrapped({ data: { orderId, action: 'confirm_delivery' }, auth: { uid: BUYER_UID } } as any),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test("refuse si l'appelant n'est pas le proprietaire de la commande", async () => {
    const orderId = 'order-confirm-not-owner';
    await resetOrder(orderId, { userId: BUYER_UID, status: 'en_livraison' });

    await expect(
      wrapped({ data: { orderId, action: 'confirm_delivery' }, auth: { uid: OTHER_UID } } as any),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('refuse sans authentification', async () => {
    await expect(
      wrapped({ data: { orderId: 'whatever', action: 'confirm_delivery' }, auth: undefined } as any),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  test('annule une commande en_attente', async () => {
    const orderId = 'order-cancel-happy';
    await resetOrder(orderId, { userId: BUYER_UID, status: 'en_attente' });

    const res: any = await wrapped({ data: { orderId, action: 'cancel' }, auth: { uid: BUYER_UID } } as any);

    expect(res.status).toBe('annule');
    const after = await db.collection('orders').doc(orderId).get();
    expect(after.data()?.cancelledBy).toBe('client');
  });

  test('refuse l\'annulation si la commande est deja en_preparation', async () => {
    // Regression test direct pour le bug corrige dans main/account/page.tsx :
    // le client ne doit plus pouvoir annuler une fois la preparation commencee.
    const orderId = 'order-cancel-too-late';
    await resetOrder(orderId, { userId: BUYER_UID, status: 'en_preparation' });

    await expect(
      wrapped({ data: { orderId, action: 'cancel' }, auth: { uid: BUYER_UID } } as any),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('renvoie not-found pour une commande inexistante', async () => {
    await expect(
      wrapped({ data: { orderId: 'does-not-exist', action: 'cancel' }, auth: { uid: BUYER_UID } } as any),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

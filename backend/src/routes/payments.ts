// backend/src/routes/payments.ts
// Paiement mobile — Wave Sénégal + Orange Money (via PayTech)
import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import crypto from 'crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getApp } from 'firebase-admin/app';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const db = () => getFirestore();

// Rate limiter strict pour les paiements
const paymentLimiter = rateLimit({ windowMs: 60_000, max: 5 });

const PAYTECH_API_KEY    = process.env.PAYTECH_API_KEY    || '';
const PAYTECH_API_SECRET = process.env.PAYTECH_API_SECRET || '';
const PAYTECH_BASE_URL   = 'https://paytech.sn/api/payment/request-payment';
const APP_URL            = process.env.FRONTEND_URL || 'http://localhost:3000';

function validationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(422).json({ errors: errors.array() }); return true; }
  return false;
}

// Signature HMAC-SHA256 pour PayTech
function paytechSignature(params: Record<string, string>): string {
  const str = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHmac('sha256', PAYTECH_API_SECRET).update(str).digest('hex');
}

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
router.post(
  '/initiate',
  authMiddleware,
  paymentLimiter,
  [
    body('orderId').isString().trim(),
    body('method').isIn(['wave_sn', 'orange_money_sn']),
  ],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;

    try {
      const { orderId, method } = req.body;

      const orderDoc = await db().collection('orders').doc(orderId).get();
      if (!orderDoc.exists) return res.status(404).json({ error: 'Commande introuvable' });

      const order = orderDoc.data()!;
      if (order.userId !== req.user!.uid) {
        return res.status(403).json({ error: 'Accès interdit' });
      }
      if (order.paymentStatus === 'paid') {
        return res.status(400).json({ error: 'Commande déjà payée' });
      }

      const itemName = `Commande Agrimarche #${orderId.slice(-6).toUpperCase()}`;
      const amount   = Math.round(order.total);
      const currency = 'XOF';

      const params: Record<string, string> = {
        item_name:      itemName,
        item_price:     String(amount),
        currency,
        ref_command:    orderId,
        command_name:   itemName,
        env:            process.env.NODE_ENV === 'production' ? 'prod' : 'test',
        ipn_url:        `${APP_URL}/api/payments/webhook`,
        success_url:    `${APP_URL}/checkout/success?order=${orderId}`,
        cancel_url:     `${APP_URL}/checkout/cancel?order=${orderId}`,
        payment_method: method,
        custom_field:   JSON.stringify({ userId: req.user!.uid, orderId }),
      };

      if (!PAYTECH_API_KEY || !PAYTECH_API_SECRET) {
        console.warn('[PAYMENTS] Clés PayTech non configurées — mode simulation');
        return res.json({
          paymentUrl: `${APP_URL}/checkout/simulate?order=${orderId}&method=${method}`,
          simulated: true,
        });
      }

      const signature = paytechSignature(params);

      const paytechRes = await fetch(PAYTECH_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API_KEY':       PAYTECH_API_KEY,
          'API_SECRET':    PAYTECH_API_SECRET,
          'X-Signature':   signature,
        },
        body: JSON.stringify(params),
      });

      const paytechData = await paytechRes.json() as any;

      if (!paytechRes.ok || paytechData.success !== 1) {
        console.error('[PAYMENTS] Erreur PayTech:', paytechData);
        return res.status(502).json({ error: 'Erreur initialisation paiement' });
      }

      await db().collection('orders').doc(orderId).update({
        paymentToken:  paytechData.token,
        paymentMethod: method,
        paymentStatus: 'pending',
        updatedAt:     FieldValue.serverTimestamp(),
      });

      res.json({ paymentUrl: paytechData.redirect_url, token: paytechData.token });
    } catch (err: any) {
      console.error('[POST /payments/initiate]', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: 'Body JSON invalide' });
    }

    const { ref_command: orderId, type_event: eventType, token } = body;

    const receivedSig = req.headers['x-paytech-signature'] as string | undefined;
    if (PAYTECH_API_SECRET && receivedSig) {
      const expectedSig = paytechSignature({ token, ref_command: orderId });
      const receivedBuf = Buffer.from(receivedSig,  'hex');
      const expectedBuf = Buffer.from(expectedSig, 'hex');
      if (
        receivedBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(receivedBuf, expectedBuf)
      ) {
        console.error('[WEBHOOK] Signature invalide');
        return res.status(400).json({ error: 'Signature invalide' });
      }
    }

    if (!orderId) return res.status(400).json({ error: 'ref_command manquant' });

    const orderRef = db().collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'Commande introuvable' });

    if (eventType === 'sale_complete') {
      await orderRef.update({
        paymentStatus: 'paid',
        status:        'confirmed',
        paidAt:        FieldValue.serverTimestamp(),
        updatedAt:     FieldValue.serverTimestamp(),
      });

      const order = orderDoc.data()!;
      await db()
        .collection('notifications')
        .doc(order.sellerId)
        .collection('items')
        .add({
          userId:    order.sellerId,
          type:      'order',
          title:     '💰 Nouveau paiement reçu',
          body:      `Commande #${orderId.slice(-6).toUpperCase()} payée — ${order.total.toLocaleString()} FCFA`,
          read:      false,
          orderId,
          createdAt: FieldValue.serverTimestamp(),
        });

    } else if (eventType === 'sale_canceled') {
      await orderRef.update({
        paymentStatus: 'failed',
        updatedAt:     FieldValue.serverTimestamp(),
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[POST /payments/webhook]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/payments/status/:orderId ───────────────────────────────────────
router.get(
  '/status/:orderId',
  authMiddleware,
  [param('orderId').isString().trim()],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;
    try {
      const orderId = String(req.params.orderId);

      const doc = await db()
        .collection('orders')
        .doc(orderId)
        .get();
      if (!doc.exists) return res.status(404).json({ error: 'Commande introuvable' });
      const data = doc.data()!;
      if (data.userId !== req.user!.uid && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Accès interdit' });
      }
      res.json({
        orderId: orderId,
        paymentStatus: data.paymentStatus,
        paymentMethod: data.paymentMethod,
        total:         data.total,
        paidAt:        data.paidAt,
      });
    } catch {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

export default router;
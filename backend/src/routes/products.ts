
// backend/src/routes/products.ts
import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const db = () => getFirestore();

// Rate limiter pour les mutations
const writeLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function validationErrors(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return true;
  }
  return false;
}

// â”€â”€â”€ GET /api/products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/',
  [
    query('category').optional().isString().trim().escape(),
    query('search').optional().isString().trim().escape(),
    query('minPrice').optional().isFloat({ min: 0 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
    query('isOrganic').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('cursor').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;

    try {
      const pageSize = Math.min(Number(req.query.limit) || 20, 50);
      let q: FirebaseFirestore.Query = db()
        .collection('products')
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(pageSize);

      if (req.query.category) q = q.where('categoryId', '==', req.query.category);
      if (req.query.isOrganic === 'true') q = q.where('isOrganic', '==', true);
      if (req.query.minPrice) q = q.where('price', '>=', Number(req.query.minPrice));
      if (req.query.maxPrice) q = q.where('price', '<=', Number(req.query.maxPrice));

      if (req.query.cursor) {
        const cursorDoc = await db().collection('products').doc(req.query.cursor as string).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc);
      }

      const snap = await q.get();
      const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null;

      res.json({ products, nextCursor });
    } catch (err: any) {
      console.error('[GET /products]', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// â”€â”€â”€ GET /api/products/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/:id',
  [param('id').isString().trim()],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;
    try {
      const productId = String(req.params.id);

      const doc = await db()
        .collection('products')
        .doc(productId)
        .get();
      if (!doc.exists) return res.status(404).json({ error: 'Produit introuvable' });
      res.json({ id: doc.id, ...doc.data() });
    } catch {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// â”€â”€â”€ POST /api/products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post(
  '/',
  authMiddleware,
  writeLimiter,
  [
    body('name').isString().trim().isLength({ min: 2, max: 100 }),
    body('description').isString().trim().isLength({ min: 10, max: 2000 }),
    body('price').isFloat({ min: 0 }),
    body('stock').isInt({ min: 0 }),
    body('unit').isString().trim().isIn(['kg', 'g', 'litre', 'ml', 'piÃ¨ce', 'sac', 'botte', 'carton']),
    body('categoryId').isString().trim(),
    body('category').isString().trim(),
    body('images').isArray({ min: 1, max: 5 }),
    body('images.*').isURL(),
    body('isOrganic').optional().isBoolean(),
    body('location').isString().trim(),
    body('tags').optional().isArray({ max: 10 }),
  ],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;

    if (req.user?.role !== 'seller' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'RÃ©servÃ© aux vendeurs' });
    }

    try {
      const now = FieldValue.serverTimestamp();
      const data = {
        name: req.body.name,
        description: req.body.description,
        price: Number(req.body.price),
        originalPrice: req.body.originalPrice ? Number(req.body.originalPrice) : null,
        stock: Number(req.body.stock),
        unit: req.body.unit,
        categoryId: req.body.categoryId,
        category: req.body.category,
        images: req.body.images,
        isOrganic: req.body.isOrganic ?? false,
        location: req.body.location,
        tags: req.body.tags ?? [],
        sellerId: req.user!.uid,
        sellerName: req.body.sellerName ?? '',
        sellerRating: 0,
        rating: 0,
        reviewCount: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db().collection('products').add(data);
      res.status(201).json({ id: docRef.id, ...data });
    } catch (err: any) {
      console.error('[POST /products]', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// â”€â”€â”€ PATCH /api/products/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch(
  '/:id',
  authMiddleware,
  writeLimiter,
  [
    param('id').isString().trim(),
    body('price').optional().isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
    body('status').optional().isIn(['active', 'inactive', 'out_of_stock']),
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('description').optional().isString().trim().isLength({ max: 2000 }),
    body('images').optional().isArray({ min: 1, max: 5 }),
    body('images.*').optional().isURL(),
  ],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;
    try {
      const productId = String(req.params.id);

      const docRef = db()
        .collection('products')
        .doc(productId);
      const doc = await docRef.get();

      if (!doc.exists) return res.status(404).json({ error: 'Produit introuvable' });

      const data = doc.data()!;
      if (data.sellerId !== req.user?.uid && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'AccÃ¨s interdit' });
      }

      const allowed = ['name', 'description', 'price', 'originalPrice', 'stock', 'unit',
        'categoryId', 'category', 'images', 'isOrganic', 'location', 'tags', 'status'];
      const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }

      await docRef.update(updates);
      res.json({ id: req.params.id, ...updates });
    } catch {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// â”€â”€â”€ DELETE /api/products/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete(
  '/:id',
  authMiddleware,
  [param('id').isString().trim()],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;
    try {
      const productId = String(req.params.id);

      const docRef = db()
        .collection('products')
        .doc(productId);
      const doc = await docRef.get();

      if (!doc.exists) return res.status(404).json({ error: 'Produit introuvable' });

      const data = doc.data()!;
      if (data.sellerId !== req.user?.uid && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'AccÃ¨s interdit' });
      }

      await docRef.update({
        status: 'inactive',
        deletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// â”€â”€â”€ GET /api/products/seller/:sellerId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/seller/:sellerId',
  [param('sellerId').isString().trim()],
  async (req: Request, res: Response) => {
    if (validationErrors(req, res)) return;
    try {
      const snap = await db()
        .collection('products')
        .where('sellerId', '==', req.params.sellerId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ products });
    } catch {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

export default router;




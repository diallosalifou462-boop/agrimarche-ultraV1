// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import productRoutes from './routes/products';
import paymentRoutes from './routes/payments';

config();

const app  = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── SÉCURITÉ ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));

// Rate limiting global
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes.' },
}));

// ─── PARSING ──────────────────────────────────────────────────────────────────
// IMPORTANT : le webhook PayTech doit recevoir le raw body (Buffer) pour que
// la signature HMAC soit vérifiable. On l'applique AVANT express.json().
// Le handler dans payments.ts se charge de parser manuellement le Buffer.
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));

// Toutes les autres routes reçoivent du JSON parsé
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/products', productRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Route non trouvée' }));

// Error handler global
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  const status  = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => console.log(`🚀 Agrimarche backend démarré sur le port ${PORT}`));

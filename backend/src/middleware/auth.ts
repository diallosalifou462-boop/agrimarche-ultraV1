import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Request, Response, NextFunction } from 'express';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
// Extension du type Request pour inclure user
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; role?: string };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, role: decoded.role as string };
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

export const auth = getAuth();
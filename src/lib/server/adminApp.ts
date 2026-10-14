// src/lib/server/adminApp.ts — Firebase Admin partagé par les routes API (même logique que
// app/api/notifications/send/route.ts::getAdminApp, factorisée pour les nouvelles routes).
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

export function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json || json.trim() === '') throw new Error('Firebase Admin non configuré');
  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(json);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON invalide');
  }
  if (!serviceAccount.project_id) throw new Error('project_id manquant');
  return initializeApp({ credential: cert(serviceAccount) });
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

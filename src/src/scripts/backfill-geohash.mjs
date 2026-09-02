/**
 * Script de migration ONE-SHOT : ajoute le champ `geohash` à tous les
 * documents `users` et `products` existants qui ont déjà `lat`/`lng` mais
 * pas encore `geohash` (créés avant ce déploiement).
 *
 * À exécuter UNE FOIS après avoir déployé le code qui écrit `geohash` sur
 * les nouveaux documents (sinon on ne fait que rattraper un manque qui va
 * réapparaître). Nécessite les credentials admin du projet Firebase — pas
 * exécutable depuis cet environnement (je n'ai pas accès à votre projet
 * Firebase), à lancer toi-même :
 *
 *   npm install firebase-admin geofire-common
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/backfill-geohash.mjs
 *
 * (service-account.json : clé de compte de service, téléchargeable depuis
 * Firebase Console → Paramètres du projet → Comptes de service.)
 */

import admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function backfillCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  let updated = 0, skipped = 0, batch = db.batch(), pending = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') { skipped++; continue; }
    if (typeof data.geohash === 'string' && data.geohash.length > 0) { skipped++; continue; }

    const geohash = geohashForLocation([data.lat, data.lng]);
    batch.update(doc.ref, { geohash });
    updated++;
    pending++;

    // Firestore limite un batch à 500 écritures.
    if (pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();

  console.log(`[${collectionName}] geohash ajouté : ${updated} document(s), ${skipped} déjà à jour / ignoré(s).`);
}

async function main() {
  await backfillCollection('users');
  await backfillCollection('products');
  console.log('Backfill terminé.');
}

main().catch((err) => {
  console.error('Backfill échoué :', err);
  process.exit(1);
});

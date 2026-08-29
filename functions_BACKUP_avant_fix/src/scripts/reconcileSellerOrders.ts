/**
 * reconcileSellerOrders.ts
 * ============================================================
 * SCRIPT DE RATTRAPAGE -- A EXECUTER UNE FOIS, MANUELLEMENT
 * ============================================================
 *
 * Pourquoi ce script existe :
 * Avant le fix (writeBatch orders+seller_orders bloque par les regles
 * de securite sur seller_orders), un nombre inconnu de commandes ont pu
 * rester avec un `status` desynchronise entre `orders` et
 * `seller_orders` -- typiquement `orders.status == 'livre'` alors que
 * `seller_orders.status` est reste a `en_livraison` (le batch entier
 * echouait, mais le client voyait parfois quand meme un succes partiel
 * selon l'ordre d'evaluation, ou l'utilisateur a retente jusqu'a ce que
 * seller_orders soit cree APRES coup sans jamais recevoir la mise a
 * jour de statut).
 *
 * Consequence concrete pour ces commandes : le vendeur voit encore la
 * commande comme "en livraison" dans son dashboard alors que le client
 * l'a deja confirmee recue -- et si un client tente de laisser un avis
 * dessus, `submitReview` la refusera desormais correctement avec
 * failed-precondition en lisant `orders.status` (qui LUI est a jour) --
 * mais le dashboard vendeur reste faux tant que ce script n'a pas
 * tourne.
 *
 * Ce que fait le script :
 *   1. Parcourt toutes les commandes `orders` avec status in
 *      ['livre', 'annule'] (etats terminaux -- les seuls pour lesquels
 *      une desynchronisation est definitive, pas juste "pas encore
 *      arrivee").
 *   2. Pour chacune, si seller_orders/{orderId} existe avec un status
 *      different, on le met a jour pour matcher `orders` (source de
 *      verite).
 *   3. Log un rapport (nombre de commandes scannees, corrigees, deja OK)
 *      -- ne modifie RIEN sans --apply (dry-run par defaut, par securite).
 *
 * Usage :
 *   npx ts-node src/scripts/reconcileSellerOrders.ts            # dry-run, affiche ce qui serait corrige
 *   npx ts-node src/scripts/reconcileSellerOrders.ts --apply     # applique reellement les corrections
 *
 * Necessite les credentials Admin (GOOGLE_APPLICATION_CREDENTIALS
 * pointant vers une clé de service, ou execution depuis Cloud Shell/CI
 * avec les droits appropries). NE PAS executer contre l'emulateur --
 * ce script est fait pour la vraie base de donnees de rattrapage.
 */

import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  console.log(`\n=== Reconciliation orders -> seller_orders ${DRY_RUN ? '(DRY-RUN — aucune ecriture)' : '(APPLICATION REELLE)'} ===\n`);

  const snapshot = await db
    .collection('orders')
    .where('status', 'in', ['livre', 'annule'])
    .get();

  console.log(`Commandes terminales trouvees : ${snapshot.size}`);

  let alreadyOk = 0;
  let noSellerOrderDoc = 0;
  let toFix = 0;
  let fixed = 0;
  const problems: string[] = [];

  for (const orderDoc of snapshot.docs) {
    const order = orderDoc.data();
    const sellerOrderRef = db.collection('seller_orders').doc(orderDoc.id);
    const sellerOrderSnap = await sellerOrderRef.get();

    if (!sellerOrderSnap.exists) {
      noSellerOrderDoc++;
      continue; // Pas de doc seller_orders pour cette commande -- rien a synchroniser
    }

    const sellerOrder = sellerOrderSnap.data();
    if (sellerOrder?.status === order.status) {
      alreadyOk++;
      continue;
    }

    toFix++;
    const line = `  [${orderDoc.id}] orders.status="${order.status}" != seller_orders.status="${sellerOrder?.status}"`;
    problems.push(line);
    console.log(line);

    if (!DRY_RUN) {
      await sellerOrderRef.set(
        {
          status: order.status,
          statusLabel: order.statusLabel ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Tracabilite : on sait que cette valeur vient d'un rattrapage,
          // pas d'une action utilisateur normale.
          reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
          reconciledFrom: 'reconcileSellerOrders-script',
        },
        { merge: true },
      );
      fixed++;
    }
  }

  console.log(`\n=== Rapport ===`);
  console.log(`Deja synchronisees      : ${alreadyOk}`);
  console.log(`Sans doc seller_orders  : ${noSellerOrderDoc} (normal si pas de vendeur associe au moment de la commande)`);
  console.log(`Desynchronisees trouvees: ${toFix}`);
  console.log(`Corrigees               : ${DRY_RUN ? '0 (dry-run)' : fixed}`);
  if (DRY_RUN && toFix > 0) {
    console.log(`\nRelance avec --apply pour corriger ces ${toFix} commande(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Erreur script de reconciliation:', e);
    process.exit(1);
  });

// ============================================================
//   index.ts — VERSION MINIMALE, SÛRE POUR PROD
//
//   Contient uniquement ce qui était déjà en prod + le fix
//   claimOrder (lecture avant écriture dans la transaction).
//
//   ⚠️ Le gros fichier "fusion notifications" (email queue, FCM,
//   digest hebdo, suivi GPS par phases, etc.) est volontairement
//   laissé de côté ici. Il n'a jamais été testé en émulateur et
//   ajoutait ~1300 lignes / 12 fonctions supplémentaires chargées
//   au déploiement — c'est très probablement ce qui causait le
//   timeout "Cannot determine backend specification" au déploiement
//   de claimOrder.
//
//   Objectif : que la page livreur (claimOrder / confirmDeliveryWithCode)
//   fonctionne à nouveau, sans rien casser d'autre. Le système de
//   notifications fusionné pourra être réintroduit plus tard,
//   testé en émulateur AVANT d'être redéployé (voir fichier
//   d'origine, conservé à part, pour ce travail).
// ============================================================
import * as admin from 'firebase-admin';

admin.initializeApp();
// Filet de sécurité : les payloads envoyés à Firestore dans ce fichier sont
// construits avec des `...(cond ? {...} : {})` pour éviter les valeurs
// `undefined` (rejetées par défaut par le SDK Admin), mais un seul oubli
// dans une future modification ferait planter silencieusement un trigger
// entier. Ce réglage rend ces valeurs simplement ignorées plutôt que fatales.
admin.firestore().settings({ ignoreUndefinedProperties: true });

// ============================================================
//   COMMANDES & AVIS — Cloud Functions callable (Admin SDK)
// ============================================================
// updateOrderStatus : confirmation de réception / annulation par le
// client. submitReview : création d'un avis lié à une commande. Les
// deux valident ownership + transition côté serveur en transaction —
// voir orderStatusTransitions.ts / reviewSubmission.ts pour le détail.
export { updateOrderStatus } from './orderStatusTransitions';
export { submitReview } from './reviewSubmission';

// ⚠️ Le code appartient au client, jamais au livreur (règle fondamentale
// du parcours de livraison) : claimOrder génère le code côté serveur et
// le range hors de portée du livreur ; confirmDeliveryWithCode est la
// SEULE porte par laquelle une commande peut désormais passer à 'livre'
// depuis le tableau de bord livreur. getDeliveryCode est la seule façon
// de lire le code, réservée au propriétaire de la commande. findGuestOrders
// / claimGuestOrderSession / startGuestCheckoutSession portent l'accès
// sans compte, sans SMS, sans mot de passe — voir deliveryCode.ts.
export {
  claimOrder,
  confirmDeliveryWithCode,
  getDeliveryCode,
  findGuestOrders,
  claimGuestOrderSession,
  startGuestCheckoutSession,
} from './deliveryCode';

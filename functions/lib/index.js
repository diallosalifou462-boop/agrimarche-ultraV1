"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGuestCheckoutSession = exports.claimGuestOrderSession = exports.findGuestOrders = exports.getDeliveryCode = exports.confirmDeliveryWithCode = exports.claimOrder = exports.submitReview = exports.updateOrderStatus = void 0;
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
const admin = __importStar(require("firebase-admin"));
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
var orderStatusTransitions_1 = require("./orderStatusTransitions");
Object.defineProperty(exports, "updateOrderStatus", { enumerable: true, get: function () { return orderStatusTransitions_1.updateOrderStatus; } });
var reviewSubmission_1 = require("./reviewSubmission");
Object.defineProperty(exports, "submitReview", { enumerable: true, get: function () { return reviewSubmission_1.submitReview; } });
// ⚠️ Le code appartient au client, jamais au livreur (règle fondamentale
// du parcours de livraison) : claimOrder génère le code côté serveur et
// le range hors de portée du livreur ; confirmDeliveryWithCode est la
// SEULE porte par laquelle une commande peut désormais passer à 'livre'
// depuis le tableau de bord livreur. getDeliveryCode est la seule façon
// de lire le code, réservée au propriétaire de la commande. findGuestOrders
// / claimGuestOrderSession / startGuestCheckoutSession portent l'accès
// sans compte, sans SMS, sans mot de passe — voir deliveryCode.ts.
var deliveryCode_1 = require("./deliveryCode");
Object.defineProperty(exports, "claimOrder", { enumerable: true, get: function () { return deliveryCode_1.claimOrder; } });
Object.defineProperty(exports, "confirmDeliveryWithCode", { enumerable: true, get: function () { return deliveryCode_1.confirmDeliveryWithCode; } });
Object.defineProperty(exports, "getDeliveryCode", { enumerable: true, get: function () { return deliveryCode_1.getDeliveryCode; } });
Object.defineProperty(exports, "findGuestOrders", { enumerable: true, get: function () { return deliveryCode_1.findGuestOrders; } });
Object.defineProperty(exports, "claimGuestOrderSession", { enumerable: true, get: function () { return deliveryCode_1.claimGuestOrderSession; } });
Object.defineProperty(exports, "startGuestCheckoutSession", { enumerable: true, get: function () { return deliveryCode_1.startGuestCheckoutSession; } });

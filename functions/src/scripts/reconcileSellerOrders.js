"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var admin = require("firebase-admin");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
var db = admin.firestore();
var DRY_RUN = !process.argv.includes('--apply');
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var snapshot, alreadyOk, noSellerOrderDoc, toFix, fixed, problems, _i, _a, orderDoc, order, sellerOrderRef, sellerOrderSnap, sellerOrder, line;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log("\n=== Reconciliation orders -> seller_orders ".concat(DRY_RUN ? '(DRY-RUN — aucune ecriture)' : '(APPLICATION REELLE)', " ===\n"));
                    return [4 /*yield*/, db
                            .collection('orders')
                            .where('status', 'in', ['livre', 'annule'])
                            .get()];
                case 1:
                    snapshot = _c.sent();
                    console.log("Commandes terminales trouvees : ".concat(snapshot.size));
                    alreadyOk = 0;
                    noSellerOrderDoc = 0;
                    toFix = 0;
                    fixed = 0;
                    problems = [];
                    _i = 0, _a = snapshot.docs;
                    _c.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    orderDoc = _a[_i];
                    order = orderDoc.data();
                    sellerOrderRef = db.collection('seller_orders').doc(orderDoc.id);
                    return [4 /*yield*/, sellerOrderRef.get()];
                case 3:
                    sellerOrderSnap = _c.sent();
                    if (!sellerOrderSnap.exists) {
                        noSellerOrderDoc++;
                        return [3 /*break*/, 5]; // Pas de doc seller_orders pour cette commande -- rien a synchroniser
                    }
                    sellerOrder = sellerOrderSnap.data();
                    if ((sellerOrder === null || sellerOrder === void 0 ? void 0 : sellerOrder.status) === order.status) {
                        alreadyOk++;
                        return [3 /*break*/, 5];
                    }
                    toFix++;
                    line = "  [".concat(orderDoc.id, "] orders.status=\"").concat(order.status, "\" != seller_orders.status=\"").concat(sellerOrder === null || sellerOrder === void 0 ? void 0 : sellerOrder.status, "\"");
                    problems.push(line);
                    console.log(line);
                    if (!!DRY_RUN) return [3 /*break*/, 5];
                    return [4 /*yield*/, sellerOrderRef.set({
                            status: order.status,
                            statusLabel: (_b = order.statusLabel) !== null && _b !== void 0 ? _b : null,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            // Tracabilite : on sait que cette valeur vient d'un rattrapage,
                            // pas d'une action utilisateur normale.
                            reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
                            reconciledFrom: 'reconcileSellerOrders-script',
                        }, { merge: true })];
                case 4:
                    _c.sent();
                    fixed++;
                    _c.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6:
                    console.log("\n=== Rapport ===");
                    console.log("Deja synchronisees      : ".concat(alreadyOk));
                    console.log("Sans doc seller_orders  : ".concat(noSellerOrderDoc, " (normal si pas de vendeur associe au moment de la commande)"));
                    console.log("Desynchronisees trouvees: ".concat(toFix));
                    console.log("Corrigees               : ".concat(DRY_RUN ? '0 (dry-run)' : fixed));
                    if (DRY_RUN && toFix > 0) {
                        console.log("\nRelance avec --apply pour corriger ces ".concat(toFix, " commande(s)."));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .then(function () { return process.exit(0); })
    .catch(function (e) {
    console.error('Erreur script de reconciliation:', e);
    process.exit(1);
});

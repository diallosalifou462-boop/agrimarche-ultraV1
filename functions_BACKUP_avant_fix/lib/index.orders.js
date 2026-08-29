"use strict";
// À fusionner dans ton functions/src/index.ts existant (celui qui exporte
// déjà requestWhatsAppOtp / verifyWhatsAppOtp) :
//
//   export { updateOrderStatus } from './orderStatusTransitions';
//
// Ne PAS créer un second fichier index — Firebase ne déploie que ce qui
// est exporté depuis le point d'entrée déclaré dans functions/package.json
// ("main": "lib/index.js" ou équivalent).
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatus = void 0;
var orderStatusTransitions_1 = require("./orderStatusTransitions");
Object.defineProperty(exports, "updateOrderStatus", { enumerable: true, get: function () { return orderStatusTransitions_1.updateOrderStatus; } });

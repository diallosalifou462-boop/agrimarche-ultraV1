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
exports.processEmailQueue = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
admin.initializeApp();
exports.processEmailQueue = functions.firestore.onDocumentCreated({
    document: 'email_queue/{docId}',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 60,
    region: 'us-central1'
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
    try {
        console.log(`📧 Envoi réel à: ${data.to}`);
        const { error } = await resend.emails.send({
            from: 'AgriMarché <onboarding@resend.dev>',
            to: data.to,
            subject: data.subject,
            html: `<div><h2>🌿 AgriMarché</h2><p>${data.body}</p></div>`,
        });
        if (error)
            throw new Error(error.message);
        await snapshot.ref.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Email envoyé à ${data.to}`);
    }
    catch (error) {
        console.error(`❌ Erreur: ${error.message}`);
        await snapshot.ref.update({
            status: 'failed',
            error: error.message
        });
    }
});

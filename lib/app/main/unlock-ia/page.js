"use strict";
'use client';
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = UnlockIAPage;
const react_1 = require("react");
const link_1 = __importDefault(require("next/link"));
const AuthContext_1 = require("@/contexts/AuthContext");
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("@/lib/firebase/firebase");
// ─────────────────────────────────────────────────────────────────────────────
// LIEN WAVE — paiement 690 FCFA
// ─────────────────────────────────────────────────────────────────────────────
const WAVE_PAYMENT_URL = 'https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/';
// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION DU CODE DANS FIRESTORE
// Collection "accessCodes" — chaque document a pour ID le code en majuscules.
// Structure attendue :
//   { days: number, used: boolean, expiresAt?: Timestamp, usedBy?: string, usedAt?: Timestamp }
//
// Vous créez ces documents manuellement (ou via un script admin) après réception
// du paiement Wave, puis vous envoyez le code à l'acheteur par SMS / WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────
async function verifyCodeFirestore(code) {
    var _a;
    if (!firebase_1.db)
        return { valid: false, days: 0, reason: 'db_unavailable' };
    try {
        const { doc: fsDoc, getDoc: fsGetDoc } = await Promise.resolve().then(() => __importStar(require('firebase/firestore')));
        const snap = await fsGetDoc(fsDoc(firebase_1.db, 'accessCodes', code));
        if (!snap.exists())
            return { valid: false, days: 0, reason: 'not_found' };
        const data = snap.data();
        if (data.used)
            return { valid: false, days: 0, reason: 'already_used' };
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
            return { valid: false, days: 0, reason: 'expired' };
        }
        return { valid: true, days: (_a = data.days) !== null && _a !== void 0 ? _a : 30 };
    }
    catch (e) {
        console.error('verifyCodeFirestore:', e);
        return { valid: false, days: 0, reason: 'error' };
    }
}
async function markCodeUsed(code, userId) {
    if (!firebase_1.db)
        return;
    try {
        const { doc: fsDoc, updateDoc, Timestamp: TS } = await Promise.resolve().then(() => __importStar(require('firebase/firestore')));
        await updateDoc(fsDoc(firebase_1.db, 'accessCodes', code), {
            used: true,
            usedBy: userId,
            usedAt: TS.now(),
        });
    }
    catch (e) {
        console.error('markCodeUsed:', e);
    }
}
async function grantAIAccess(userId, days) {
    if (!firebase_1.db)
        return;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, 'users', userId), {
        hasAIAccess: true,
        aiExpiryDate: firestore_1.Timestamp.fromDate(expiry),
        aiUnlockedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
    // Backup localStorage
    localStorage.setItem('ai_user_id', userId);
    localStorage.setItem('ai_code_expiry', expiry.getTime().toString());
}
const ERROR_MESSAGES = {
    not_found: 'Code introuvable. Vérifiez le code reçu ou contactez-nous.',
    already_used: 'Ce code a déjà été utilisé. Contactez-nous si c\'est une erreur.',
    expired: 'Ce code a expiré. Contactez-nous pour en obtenir un nouveau.',
    db_unavailable: 'Service temporairement indisponible. Réessayez dans un instant.',
    error: 'Erreur de vérification. Vérifiez votre connexion et réessayez.',
};
// ─────────────────────────────────────────────────────────────────────────────
function UnlockIAPage() {
    const { user, loading: authLoading } = (0, AuthContext_1.useAuth)();
    const [step, setStep] = (0, react_1.useState)('pay');
    const [code, setCode] = (0, react_1.useState)('');
    const [error, setError] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [countdown, setCountdown] = (0, react_1.useState)(0);
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [expiryDays, setExpiryDays] = (0, react_1.useState)(30);
    const intervalRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => { setMounted(true); }, []);
    // Redirige si déjà accès actif
    (0, react_1.useEffect)(() => {
        if (!mounted || authLoading || !(user === null || user === void 0 ? void 0 : user.uid) || !firebase_1.db)
            return;
        (async () => {
            var _a, _b;
            try {
                const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'users', user.uid));
                const data = snap.data();
                if ((data === null || data === void 0 ? void 0 : data.hasAIAccess) && (data === null || data === void 0 ? void 0 : data.aiExpiryDate)) {
                    const expiry = ((_b = (_a = data.aiExpiryDate).toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(data.aiExpiryDate);
                    if (expiry > new Date())
                        setStep('success');
                }
            }
            catch ( /* ignore */_c) { /* ignore */ }
        })();
    }, [mounted, authLoading, user]);
    const startCountdown = (seconds) => {
        setCountdown(seconds);
        intervalRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };
    (0, react_1.useEffect)(() => () => { if (intervalRef.current)
        clearInterval(intervalRef.current); }, []);
    const handlePayClick = () => {
        setStep('code');
        startCountdown(5);
    };
    const handleVerify = async () => {
        var _a;
        const trimmed = code.trim().toUpperCase();
        if (!trimmed) {
            setError('Veuillez entrer votre code de confirmation.');
            return;
        }
        if (!(user === null || user === void 0 ? void 0 : user.uid)) {
            setError('Vous devez être connecté pour activer l\'accès.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const { valid, days, reason } = await verifyCodeFirestore(trimmed);
            if (valid) {
                await grantAIAccess(user.uid, days);
                await markCodeUsed(trimmed, user.uid);
                setExpiryDays(days);
                setStep('success');
                return;
            }
            setError((_a = ERROR_MESSAGES[reason !== null && reason !== void 0 ? reason : 'error']) !== null && _a !== void 0 ? _a : ERROR_MESSAGES.error);
        }
        catch (e) {
            console.error('handleVerify:', e);
            setError('Erreur inattendue. Réessayez dans un instant.');
        }
        finally {
            setLoading(false);
        }
    };
    // ── LOADING ──────────────────────────────────────────────────────────────
    if (!mounted || authLoading) {
        return (<div style={{
                minHeight: '100vh', background: '#060e09',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
        <Spinner />
      </div>);
    }
    // ── NOT LOGGED IN ─────────────────────────────────────────────────────────
    if (!user) {
        return (<div style={{
                minHeight: '100vh', background: '#060e09',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 20,
                fontFamily: 'system-ui, sans-serif',
            }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <p style={{ color: '#e8f5e9', fontSize: 18, fontWeight: 700 }}>Connexion requise</p>
        <p style={{ color: '#6b8a71', fontSize: 14, maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
          Connectez-vous pour débloquer l'accès IA Premium.
        </p>
        <link_1.default href="/auth/login" style={ctaStyle('#00ff87', '#00c96b', '#060e09')}>
          Se connecter
        </link_1.default>
      </div>);
    }
    // ── MAIN ──────────────────────────────────────────────────────────────────
    return (<div style={{
            minHeight: '100vh',
            background: 'radial-gradient(ellipse at 30% 20%, #0a1f0e 0%, #060e09 60%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            padding: '24px 16px',
        }}>
      {/* Ambient glow */}
      <div style={{
            position: 'fixed', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 60% 80%, rgba(139,92,246,0.06) 0%, transparent 60%)',
        }}/>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440 }}>
        {/* ── CARD ── */}
        <div style={{
            background: '#0d1a10',
            border: '1px solid #1a2e1e',
            borderRadius: 24, overflow: 'hidden',
            boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,255,135,0.04)',
        }}>
          {/* Gradient bar */}
          <div style={{
            height: 3,
            background: step === 'success'
                ? 'linear-gradient(90deg, #00ff87, #00c96b)'
                : 'linear-gradient(90deg, #8b5cf6, #6d28d9, #00ff87)',
        }}/>

          <div style={{ padding: '36px 32px 40px' }}>

            {/* ══════════════════════════════════════════════
            ÉTAPE 1 — PAIEMENT WAVE
        ══════════════════════════════════════════════ */}
            {step === 'pay' && (<>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                  <div style={{
                width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
                background: 'linear-gradient(135deg, #8b5cf6, #00ff87)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, boxShadow: '0 8px 32px rgba(139,92,246,0.3)',
            }}>🤖</div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e8f5e9', letterSpacing: '-0.5px', marginBottom: 8 }}>
                    IA Premium
                  </h1>
                  <p style={{ fontSize: 14, color: '#6b8a71', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                  </p>
                </div>

                {/* Prix */}
                <div style={{
                background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.12)',
                borderRadius: 16, padding: '20px 24px', textAlign: 'center', marginBottom: 28,
            }}>
                  <div style={{ fontSize: 13, color: '#6b8a71', marginBottom: 6 }}>Accès 30 jours</div>
                  <div style={{ fontSize: 42, fontWeight: 900, color: '#00ff87', letterSpacing: '-2px', lineHeight: 1 }}>
                    690
                    <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0, marginLeft: 6 }}>FCFA</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#4a6b50', marginTop: 8 }}>Paiement sécurisé via Wave</div>
                </div>

                {/* Features */}
                <div style={{ marginBottom: 28 }}>
                  {[
                ['🌤️', 'Météo temps réel par région'],
                ['💰', 'Simulation financement & crédit'],
                ['🛒', 'Prix live depuis le catalogue'],
                ['🌱', 'Conseils agronomiques IA'],
                ['📈', 'Prévisions de marché'],
                ['🎙️', 'Reconnaissance vocale'],
            ].map(([icon, label]) => (<div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 0', borderBottom: '1px solid rgba(26,46,30,0.6)',
                }}>
                      <span style={{ fontSize: 16 }}>{icon}</span>
                      <span style={{ fontSize: 13.5, color: '#b2cfb8' }}>{label}</span>
                      <span style={{ marginLeft: 'auto', color: '#00ff87', fontSize: 13 }}>✓</span>
                    </div>))}
                </div>

                {/* CTA Wave */}
                <a href={WAVE_PAYMENT_URL} target="_blank" rel="noopener noreferrer" onClick={handlePayClick} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                width: '100%', padding: '16px 0',
                background: 'linear-gradient(135deg, #1e90e6, #0070cc)',
                color: '#fff', fontWeight: 700, fontSize: 15.5,
                borderRadius: 14, textDecoration: 'none',
                boxShadow: '0 8px 28px rgba(30,144,230,0.35)',
                transition: 'all 0.2s', letterSpacing: '0.2px',
            }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(30,144,230,0.45)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(30,144,230,0.35)'; }}>
                  <WaveLogo />
                  Payer 690 FCFA avec Wave
                </a>

                {/* Instruction */}
                <div style={{
                marginTop: 20, padding: '14px 16px',
                background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.1)',
                borderRadius: 12,
            }}>
                  <p style={{ fontSize: 12.5, color: '#6b8a71', lineHeight: 1.7, margin: 0 }}>
                    <strong style={{ color: '#b2cfb8' }}>Comment ça marche :</strong><br />
                    1. Cliquez sur "Payer avec Wave" ci-dessus<br />
                    2. Effectuez le paiement de 690 FCFA<br />
                    3. Nous vous envoyons un code d'activation<br />
                    4. Revenez ici et entrez ce code pour débloquer l'IA
                  </p>
                </div>

                <link_1.default href="/main" style={{
                display: 'block', textAlign: 'center',
                marginTop: 20, fontSize: 13, color: '#4a6b50', textDecoration: 'none',
            }}>
                  ← Retour à l'accueil
                </link_1.default>
              </>)}

            {/* ══════════════════════════════════════════════
            ÉTAPE 2 — SAISIE DU CODE
        ══════════════════════════════════════════════ */}
            {step === 'code' && (<>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                background: 'linear-gradient(135deg, #1e90e6, #0070cc)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                boxShadow: '0 8px 24px rgba(30,144,230,0.3)',
            }}>📩</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e8f5e9', marginBottom: 8 }}>
                    Entrez votre code
                  </h2>
                  <p style={{ fontSize: 14, color: '#6b8a71', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                    Entrez le code d'activation que vous avez reçu après votre paiement Wave.
                  </p>
                </div>

                {/* Info box */}
                <div style={{
                background: 'rgba(30,144,230,0.06)', border: '1px solid rgba(30,144,230,0.15)',
                borderRadius: 12, padding: '14px 16px', marginBottom: 24,
                display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
                  <p style={{ fontSize: 12.5, color: '#7ab8e8', lineHeight: 1.6, margin: 0 }}>
                    Après votre paiement Wave, nous vous envoyons un code d'activation par SMS ou WhatsApp. Format : <strong style={{ color: '#a8d4f0' }}>AGRI-XXXXXXXX</strong>
                  </p>
                </div>

                {/* Input */}
                <div style={{ marginBottom: error ? 0 : 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6b8a71', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                    CODE D'ACTIVATION
                  </label>
                  <input type="text" value={code} onChange={e => { setCode(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && !loading && countdown === 0 && handleVerify()} placeholder="Ex : AGRI-A1B2C3D4" style={{
                width: '100%', height: 50,
                background: '#0a1610', border: `1px solid ${error ? '#ef4444' : '#1a2e1e'}`,
                borderRadius: 12, padding: '0 16px',
                color: '#e8f5e9', fontSize: 15, outline: 'none',
                letterSpacing: '1px', fontFamily: 'monospace',
                transition: 'border-color 0.2s', boxSizing: 'border-box',
            }} onFocus={e => { if (!error)
            e.target.style.borderColor = 'rgba(0,255,135,0.4)'; }} onBlur={e => { if (!error)
            e.target.style.borderColor = '#1a2e1e'; }} autoFocus autoCapitalize="characters"/>
                </div>

                {error && (<div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 10, padding: '10px 14px', margin: '10px 0 16px',
                }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                    <span style={{ fontSize: 13, color: '#f87171', lineHeight: 1.5 }}>{error}</span>
                  </div>)}

                <button onClick={handleVerify} disabled={loading || countdown > 0 || !code.trim()} style={{
                width: '100%', height: 50, borderRadius: 12, border: 'none',
                background: loading || countdown > 0 || !code.trim()
                    ? '#1a2e1e'
                    : 'linear-gradient(135deg, #00ff87, #00c96b)',
                color: loading || countdown > 0 || !code.trim() ? '#6b8a71' : '#060e09',
                fontWeight: 700, fontSize: 15,
                cursor: loading || countdown > 0 || !code.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading || countdown > 0 || !code.trim() ? 'none' : '0 4px 20px rgba(0,255,135,0.3)',
                marginBottom: 14,
            }}>
                  {loading ? '⏳ Vérification…' : countdown > 0 ? `Patienter ${countdown}s…` : '✓ Activer l\'accès IA'}
                </button>

                {/* Besoin d'aide */}
                <div style={{
                background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)',
                borderRadius: 10, padding: '12px 14px', marginBottom: 16,
                fontSize: 12.5, color: '#9b84e8', lineHeight: 1.6, textAlign: 'center',
            }}>
                  Vous n'avez pas reçu votre code ?<br />
                  <strong style={{ color: '#b8a4f0' }}>Contactez-nous sur WhatsApp</strong> en indiquant votre numéro Wave.
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => { setStep('pay'); setCode(''); setError(''); }} style={{
                background: 'none', border: 'none', color: '#6b8a71',
                fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
            }}>
                    ← Retour au paiement
                  </button>
                </div>
              </>)}

            {/* ══════════════════════════════════════════════
            ÉTAPE 3 — SUCCÈS
        ══════════════════════════════════════════════ */}
            {step === 'success' && (<div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
                background: 'linear-gradient(135deg, #00ff87, #00c96b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
                boxShadow: '0 0 0 16px rgba(0,255,135,0.08), 0 8px 32px rgba(0,255,135,0.35)',
                animation: 'successPop 0.5s cubic-bezier(.22,.68,0,1.2)',
            }}>✅</div>

                <h2 style={{ fontSize: 26, fontWeight: 800, color: '#00ff87', letterSpacing: '-0.5px', marginBottom: 10 }}>
                  Accès activé !
                </h2>
                <p style={{ fontSize: 14.5, color: '#b2cfb8', lineHeight: 1.7, marginBottom: 32 }}>
                  Bienvenue dans l'IA Premium AgriMarché.<br />
                  Votre accès est valide <strong style={{ color: '#e8f5e9' }}>{expiryDays} jours</strong>.
                </p>

                <div style={{
                background: 'rgba(0,255,135,0.05)', border: '1px solid rgba(0,255,135,0.15)',
                borderRadius: 14, padding: '16px 20px', marginBottom: 28, textAlign: 'left',
            }}>
                  {[
                'Assistant IA DeepSeek débloqué',
                'Météo temps réel par région',
                'Simulation financement',
                'Conseils agronomiques personnalisés',
            ].map(f => (<div key={f} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 0', borderBottom: '1px solid rgba(0,255,135,0.07)',
                    fontSize: 13.5, color: '#b2cfb8',
                }}>
                      <span style={{ color: '#00ff87', fontSize: 14 }}>✓</span>{f}
                    </div>))}
                </div>

                <link_1.default href="/main/ai-assistant" style={ctaStyle('#8b5cf6', '#6d28d9', '#fff')}>
                  🤖 Accéder à l'IA Premium
                </link_1.default>

                <link_1.default href="/main" style={{
                display: 'block', textAlign: 'center',
                marginTop: 16, fontSize: 13, color: '#4a6b50', textDecoration: 'none',
            }}>
                  Retour à l'accueil
                </link_1.default>
              </div>)}

          </div>
        </div>

        {/* Footer sécurité */}
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginTop: 20, color: '#2d4a32', fontSize: 12,
        }}>
          <span>🔒</span>
          <span>Paiement sécurisé · Données chiffrées · AgriMarché Sénégal</span>
        </div>
      </div>

      <style>{`
        @keyframes successPop { from{transform:scale(0.6);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes spin { to{transform:rotate(360deg)} }
        *{box-sizing:border-box}
      `}</style>
    </div>);
}
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
    return (<>
      <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: '3px solid #00ff87', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
        }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>);
}
function ctaStyle(c1, c2, textColor) {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        width: '100%', padding: '16px 0',
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        color: textColor, fontWeight: 700, fontSize: 15.5,
        borderRadius: 14, textDecoration: 'none',
        boxShadow: `0 8px 28px ${c1}55`,
    };
}
function WaveLogo() {
    return (<svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#fff"/>
      <path d="M8 16c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#1e90e6" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M10.5 18.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="#1e90e6" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="20" r="2" fill="#1e90e6"/>
    </svg>);
}

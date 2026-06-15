'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const WAVE_PAYMENT_URL = 'https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/';
const TOKEN_LIMIT = 500_000;

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function verifyCodeFirestore(
  code: string,
): Promise<{ valid: boolean; days: number; reason?: string }> {
  if (!db) return { valid: false, days: 0, reason: 'db_unavailable' };
  try {
    const { doc: fsDoc, getDoc: fsGetDoc } = await import('firebase/firestore');
    const snap = await fsGetDoc(fsDoc(db, 'accessCodes', code));
    if (!snap.exists()) return { valid: false, days: 0, reason: 'not_found' };
    const data = snap.data();
    if (data.used) return { valid: false, days: 0, reason: 'already_used' };
    if (data.expiresAt && data.expiresAt.toDate() < new Date())
      return { valid: false, days: 0, reason: 'expired' };
    return { valid: true, days: data.days ?? 30 };
  } catch (e) {
    console.error('verifyCodeFirestore:', e);
    return { valid: false, days: 0, reason: 'error' };
  }
}

async function markCodeUsed(code: string, userId: string) {
  if (!db) return;
  try {
    const { doc: fsDoc, updateDoc, Timestamp: TS } = await import('firebase/firestore');
    await updateDoc(fsDoc(db, 'accessCodes', code), {
      used: true,
      usedBy: userId,
      usedAt: TS.now(),
    });
  } catch (e) {
    console.error('markCodeUsed:', e);
  }
}

async function grantAIAccess(userId: string, days: number) {
  if (!db) return;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  await setDoc(
    doc(db, 'users', userId),
    {
      hasAIAccess: true,
      aiExpiryDate: Timestamp.fromDate(expiry),
      aiUnlockedAt: Timestamp.now(),
      aiTokensUsed: 0,
      aiTokensLimit: TOKEN_LIMIT,
      aiAlertSent: false,
      aiLastUsageAt: null,
    },
    { merge: true },
  );
  localStorage.setItem('ai_user_id', userId);
  localStorage.setItem('ai_code_expiry', expiry.getTime().toString());
  localStorage.setItem('ai_tokens_limit', TOKEN_LIMIT.toString());
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTES UI
// ─────────────────────────────────────────────────────────────────────────────
type Step = 'pay' | 'code' | 'success';

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Code introuvable. Vérifiez le code reçu ou contactez-nous.',
  already_used: "Ce code a déjà été utilisé. Contactez-nous si c'est une erreur.",
  expired: 'Ce code a expiré. Contactez-nous pour en obtenir un nouveau.',
  db_unavailable: 'Service temporairement indisponible. Réessayez dans un instant.',
  error: 'Erreur de vérification. Vérifiez votre connexion et réessayez.',
};

const FEATURES = [
  { icon: '🌤️', label: 'Météo temps réel par région' },
  { icon: '💰', label: 'Simulation financement & crédit' },
  { icon: '🛒', label: 'Prix live depuis le catalogue' },
  { icon: '🌱', label: 'Conseils agronomiques IA' },
  { icon: '📈', label: 'Prévisions de marché' },
  { icon: '🎙️', label: 'Reconnaissance vocale' },
  { icon: '📊', label: `${TOKEN_LIMIT.toLocaleString()} tokens inclus` },
];

const SUCCESS_FEATURES = [
  'Assistant IA DeepSeek débloqué',
  'Météo temps réel par région',
  'Simulation financement',
  'Conseils agronomiques personnalisés',
  `${TOKEN_LIMIT.toLocaleString()} tokens inclus (500k)`,
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function UnlockIAPage() {
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>('pay');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Vérifie si l'utilisateur a déjà un accès actif
  useEffect(() => {
    if (!mounted || authLoading || !user?.uid || !db) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data();
        if (data?.hasAIAccess && data?.aiExpiryDate) {
          const expiry = data.aiExpiryDate.toDate?.() || new Date(data.aiExpiryDate);
          if (expiry > new Date()) {
            setStep('success');
            setExpiryDays(
              Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            );
          }
        }
      } catch { /* ignore */ }
    })();
  }, [mounted, authLoading, user]);

  const startCountdown = (seconds: number) => {
    setCountdown(seconds);
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(
    () => () => { if (intervalRef.current) clearInterval(intervalRef.current); },
    [],
  );

  const handlePayClick = () => {
    setStep('code');
    startCountdown(5);
    window.open(WAVE_PAYMENT_URL, '_blank');
  };

  const handleVerify = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('Veuillez entrer votre code de confirmation.'); return; }
    if (!user?.uid) { setError("Vous devez être connecté pour activer l'accès."); return; }
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
      setError(ERROR_MESSAGES[reason ?? 'error'] ?? ERROR_MESSAGES.error);
    } catch (e) {
      console.error('handleVerify:', e);
      setError('Erreur inattendue. Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  };

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (!mounted || authLoading) {
    return (
      <div className="unlock-root">
        <Spinner />
        <style>{BASE_CSS}</style>
      </div>
    );
  }

  // ── NON CONNECTÉ ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="unlock-root">
        <div className="auth-gate">
          <span className="auth-gate__icon">🔐</span>
          <p className="auth-gate__title">Connexion requise</p>
          <p className="auth-gate__body">
            Connectez-vous pour débloquer l'accès IA Premium AgriMarché.
          </p>
          <Link href="/auth/login" className="cta cta--green">
            Se connecter
          </Link>
        </div>
        <style>{BASE_CSS}</style>
      </div>
    );
  }

  // ── MAIN ──────────────────────────────────────────────────────────────────
  return (
    <div className="unlock-root">
      {/* Ambient glow */}
      <div className="ambient-glow" />

      <div className="card-wrap">
        {/* Progress bar */}
        <div className={`progress-bar progress-bar--${step}`} />

        {/* Step indicators */}
        <div className="steps-nav">
          {(['pay', 'code', 'success'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`step-dot ${step === s ? 'step-dot--active' : ''} ${
                (step === 'code' && i === 0) || step === 'success' ? 'step-dot--done' : ''
              }`}
            >
              <span className="step-dot__num">{i + 1}</span>
            </div>
          ))}
          <div className="steps-nav__line" />
        </div>

        <div className="card-body">

          {/* ════════════════════════════════════════
              ÉTAPE 1 — PAIEMENT WAVE
          ════════════════════════════════════════ */}
          {step === 'pay' && (
            <>
              <div className="step-header">
                <div className="avatar avatar--gradient-purple">🤖</div>
                <h1 className="step-header__title">IA Premium</h1>
                <p className="step-header__sub">
                  Assistant IA AgriMarché propulsé par DeepSeek — conseils, météo,
                  financement, marché.
                </p>
              </div>

              {/* Prix */}
              <div className="price-box">
                <div className="price-box__label">Accès 30 jours</div>
                <div className="price-box__amount">
                  690 <span className="price-box__currency">FCFA</span>
                </div>
                <div className="price-box__sub">Paiement sécurisé via Wave</div>
              </div>

              {/* Features */}
              <ul className="feature-list">
                {FEATURES.map(({ icon, label }) => (
                  <li key={label} className="feature-list__item">
                    <span className="feature-list__icon">{icon}</span>
                    <span className="feature-list__label">{label}</span>
                    <span className="feature-list__check">✓</span>
                  </li>
                ))}
              </ul>

              <button className="btn-wave" onClick={handlePayClick}>
                <WaveLogo />
                Payer 690 FCFA avec Wave
              </button>

              <div className="info-box info-box--green">
                <strong className="info-box__heading">Comment ça marche :</strong>
                <ol className="info-box__steps">
                  <li>Cliquez sur "Payer avec Wave" ci-dessus</li>
                  <li>Effectuez le paiement de 690 FCFA</li>
                  <li>Nous vous envoyons un code d'activation</li>
                  <li>Revenez ici et entrez ce code pour débloquer l'IA</li>
                </ol>
              </div>

              <Link href="/main" className="back-link">← Retour à l'accueil</Link>
            </>
          )}

          {/* ════════════════════════════════════════
              ÉTAPE 2 — SAISIE DU CODE
          ════════════════════════════════════════ */}
          {step === 'code' && (
            <>
              <div className="step-header">
                <div className="avatar avatar--gradient-blue">📩</div>
                <h2 className="step-header__title">Entrez votre code</h2>
                <p className="step-header__sub">
                  Entrez le code d'activation reçu après votre paiement Wave.
                </p>
              </div>

              <div className="info-box info-box--blue">
                <span className="info-box__icon">💡</span>
                <p>
                  Nous vous envoyons votre code par SMS ou WhatsApp.{' '}
                  Format&nbsp;: <strong className="code-format">AGRI-XXXXXXXX</strong>
                </p>
              </div>

              <div className="field">
                <label className="field__label">CODE D'ACTIVATION</label>
                <input
                  className={`field__input ${error ? 'field__input--error' : ''}`}
                  type="text"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && !loading && countdown === 0 && handleVerify()}
                  placeholder="Ex : AGRI-A1B2C3D4"
                  autoFocus
                />
              </div>

              {error && (
                <div className="error-box">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                className={`btn-verify ${loading || countdown > 0 || !code.trim() ? 'btn-verify--disabled' : ''}`}
                onClick={handleVerify}
                disabled={loading || countdown > 0 || !code.trim()}
              >
                {loading
                  ? '⏳ Vérification…'
                  : countdown > 0
                  ? `Patienter ${countdown}s…`
                  : "✓ Activer l'accès IA"}
              </button>

              <div className="info-box info-box--purple" style={{ textAlign: 'center' }}>
                Vous n'avez pas reçu votre code ?<br />
                <strong style={{ color: '#b8a4f0' }}>Contactez-nous sur WhatsApp</strong> en
                indiquant votre numéro Wave.
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                <button
                  className="back-btn"
                  onClick={() => { setStep('pay'); setCode(''); setError(''); }}
                >
                  ← Retour au paiement
                </button>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════
              ÉTAPE 3 — SUCCÈS
          ════════════════════════════════════════ */}
          {step === 'success' && (
            <div className="success-wrap">
              <div className="success-icon">✅</div>
              <h2 className="success-title">Accès activé !</h2>
              <p className="success-sub">
                Bienvenue dans l'IA Premium AgriMarché.
                <br />
                Votre accès est valide{' '}
                <strong style={{ color: '#e8f5e9' }}>{expiryDays} jours</strong>.
              </p>

              <ul className="success-features">
                {SUCCESS_FEATURES.map(f => (
                  <li key={f} className="success-features__item">
                    <span className="success-features__check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/main/ai-assistant" className="cta cta--purple">
                🤖 Accéder à l'IA Premium
              </Link>

              <Link href="/main" className="back-link" style={{ marginTop: 14 }}>
                Retour à l'accueil
              </Link>
            </div>
          )}

        </div>{/* /card-body */}
      </div>{/* /card-wrap */}

      <footer className="unlock-footer">
        <span>🔒</span>
        <span>Paiement sécurisé · Données chiffrées · AgriMarché Sénégal</span>
      </footer>

      <style>{BASE_CSS}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="spinner" />;
}

function WaveLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#fff" />
      <path d="M8 16c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#1e90e6" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10.5 18.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="#1e90e6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="20" r="2" fill="#1e90e6" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── ROOT ─────────────────────────────────────────────────────────────── */
  .unlock-root {
    min-height: 100vh;
    background: radial-gradient(ellipse at 30% 20%, #0a1f0e 0%, #060e09 60%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    font-family: 'DM Sans', system-ui, sans-serif;
    position: relative;
    gap: 20px;
  }

  .ambient-glow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 70% 80%, rgba(139,92,246,.07) 0%, transparent 55%),
      radial-gradient(ellipse at 10% 10%, rgba(0,255,135,.04) 0%, transparent 50%);
  }

  /* ── CARD ─────────────────────────────────────────────────────────────── */
  .card-wrap {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 448px;
    background: #0d1a10;
    border: 1px solid #1a2e1e;
    border-radius: 24px;
    overflow: hidden;
    box-shadow:
      0 48px 96px rgba(0,0,0,.55),
      0 0 0 1px rgba(0,255,135,.04);
  }

  .card-body {
    padding: 32px 32px 40px;
  }

  /* ── PROGRESS BAR ─────────────────────────────────────────────────────── */
  .progress-bar {
    height: 3px;
    transition: background 0.4s;
  }
  .progress-bar--pay {
    background: linear-gradient(90deg, #8b5cf6 0%, #6d28d9 50%, #00ff87 100%);
    width: 33%;
  }
  .progress-bar--code {
    background: linear-gradient(90deg, #1e90e6, #00c8ff);
    width: 66%;
  }
  .progress-bar--success {
    background: linear-gradient(90deg, #00ff87, #00c96b);
    width: 100%;
  }

  /* ── STEP INDICATORS ──────────────────────────────────────────────────── */
  .steps-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 18px 32px 0;
    position: relative;
  }
  .steps-nav__line {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 160px;
    height: 1px;
    background: #1a2e1e;
    z-index: 0;
    margin-top: 9px;
  }
  .step-dot {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: 1.5px solid #1a2e1e;
    background: #0d1a10;
    display: flex; align-items: center; justify-content: center;
    z-index: 1;
    transition: all 0.3s;
    margin: 0 28px;
  }
  .step-dot--active {
    border-color: #00ff87;
    background: rgba(0,255,135,.1);
    box-shadow: 0 0 0 4px rgba(0,255,135,.1);
  }
  .step-dot--done {
    border-color: #00ff87;
    background: rgba(0,255,135,.15);
  }
  .step-dot__num {
    font-size: 11px;
    font-weight: 700;
    color: #4a6b50;
  }
  .step-dot--active .step-dot__num,
  .step-dot--done .step-dot__num {
    color: #00ff87;
  }

  /* ── STEP HEADER ──────────────────────────────────────────────────────── */
  .step-header {
    text-align: center;
    margin-bottom: 28px;
    margin-top: 8px;
  }
  .avatar {
    width: 72px; height: 72px;
    border-radius: 50%;
    margin: 0 auto 18px;
    display: flex; align-items: center; justify-content: center;
    font-size: 30px;
  }
  .avatar--gradient-purple {
    background: linear-gradient(135deg, #8b5cf6, #00ff87);
    box-shadow: 0 8px 32px rgba(139,92,246,.3);
  }
  .avatar--gradient-blue {
    background: linear-gradient(135deg, #1e90e6, #0070cc);
    box-shadow: 0 8px 24px rgba(30,144,230,.3);
  }
  .step-header__title {
    font-size: 26px;
    font-weight: 800;
    color: #e8f5e9;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
    line-height: 1.2;
  }
  .step-header__sub {
    font-size: 14px;
    color: #6b8a71;
    line-height: 1.65;
    max-width: 300px;
    margin: 0 auto;
  }

  /* ── PRICE BOX ────────────────────────────────────────────────────────── */
  .price-box {
    background: rgba(0,255,135,.04);
    border: 1px solid rgba(0,255,135,.12);
    border-radius: 16px;
    padding: 20px 24px;
    text-align: center;
    margin-bottom: 24px;
  }
  .price-box__label {
    font-size: 12px;
    color: #6b8a71;
    letter-spacing: .4px;
    margin-bottom: 6px;
  }
  .price-box__amount {
    font-size: 44px;
    font-weight: 900;
    color: #00ff87;
    letter-spacing: -2px;
    line-height: 1;
  }
  .price-box__currency {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0;
    margin-left: 6px;
  }
  .price-box__sub {
    font-size: 12px;
    color: #4a6b50;
    margin-top: 8px;
  }

  /* ── FEATURE LIST ─────────────────────────────────────────────────────── */
  .feature-list {
    list-style: none;
    margin-bottom: 24px;
  }
  .feature-list__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid rgba(26,46,30,.7);
  }
  .feature-list__item:last-child { border-bottom: none; }
  .feature-list__icon { font-size: 15px; flex-shrink: 0; }
  .feature-list__label { font-size: 13.5px; color: #b2cfb8; flex: 1; }
  .feature-list__check { color: #00ff87; font-size: 12px; margin-left: auto; }

  /* ── WAVE BUTTON ──────────────────────────────────────────────────────── */
  .btn-wave {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding: 16px 0;
    background: linear-gradient(135deg, #1e90e6, #0070cc);
    color: #fff;
    font-weight: 700;
    font-size: 15.5px;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(30,144,230,.35);
    transition: transform .18s, box-shadow .18s;
    font-family: inherit;
  }
  .btn-wave:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 40px rgba(30,144,230,.45);
  }
  .btn-wave:active { transform: translateY(0); }

  /* ── INFO BOX ─────────────────────────────────────────────────────────── */
  .info-box {
    border-radius: 12px;
    padding: 14px 16px;
    margin-top: 20px;
    font-size: 12.5px;
    line-height: 1.7;
  }
  .info-box--green {
    background: rgba(0,255,135,.04);
    border: 1px solid rgba(0,255,135,.1);
    color: #6b8a71;
  }
  .info-box--blue {
    background: rgba(30,144,230,.06);
    border: 1px solid rgba(30,144,230,.15);
    color: #7ab8e8;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 0;
    margin-bottom: 22px;
  }
  .info-box--purple {
    background: rgba(139,92,246,.05);
    border: 1px solid rgba(139,92,246,.12);
    color: #9b84e8;
    margin-top: 0;
  }
  .info-box__heading {
    display: block;
    color: #b2cfb8;
    margin-bottom: 4px;
  }
  .info-box__steps {
    padding-left: 16px;
  }
  .info-box__steps li { margin-top: 2px; }
  .info-box__icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
  .code-format {
    color: #a8d4f0;
    font-family: monospace;
    letter-spacing: .5px;
  }

  /* ── FIELD ────────────────────────────────────────────────────────────── */
  .field { margin-bottom: 14px; }
  .field__label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #6b8a71;
    letter-spacing: .6px;
    margin-bottom: 8px;
  }
  .field__input {
    display: block;
    width: 100%;
    height: 52px;
    background: #0a1610;
    border: 1.5px solid #1a2e1e;
    border-radius: 12px;
    padding: 0 16px;
    color: #e8f5e9;
    font-size: 15px;
    font-family: 'DM Mono', monospace;
    letter-spacing: 1.5px;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .field__input:focus {
    border-color: rgba(0,255,135,.45);
    box-shadow: 0 0 0 3px rgba(0,255,135,.07);
  }
  .field__input--error {
    border-color: rgba(239,68,68,.55) !important;
    box-shadow: 0 0 0 3px rgba(239,68,68,.07);
  }
  .field__input::placeholder { color: #2e4733; letter-spacing: 1px; }

  /* ── ERROR BOX ────────────────────────────────────────────────────────── */
  .error-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(239,68,68,.08);
    border: 1px solid rgba(239,68,68,.2);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 13px;
    color: #f87171;
    line-height: 1.5;
  }

  /* ── VERIFY BUTTON ────────────────────────────────────────────────────── */
  .btn-verify {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 52px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, #00ff87, #00c96b);
    color: #060e09;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 6px 24px rgba(0,255,135,.3);
    transition: transform .18s, box-shadow .18s;
    margin-bottom: 16px;
  }
  .btn-verify:hover:not(.btn-verify--disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 32px rgba(0,255,135,.4);
  }
  .btn-verify--disabled {
    background: #1a2e1e;
    color: #6b8a71;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* ── BACK CONTROLS ────────────────────────────────────────────────────── */
  .back-link {
    display: block;
    text-align: center;
    margin-top: 18px;
    font-size: 13px;
    color: #4a6b50;
    text-decoration: none;
    transition: color .2s;
  }
  .back-link:hover { color: #6b8a71; }

  .back-btn {
    background: none;
    border: none;
    color: #6b8a71;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color .2s;
  }
  .back-btn:hover { color: #b2cfb8; }

  /* ── SUCCESS ──────────────────────────────────────────────────────────── */
  .success-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    text-align: center;
  }
  .success-icon {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #00ff87, #00c96b);
    display: flex; align-items: center; justify-content: center;
    font-size: 34px;
    box-shadow:
      0 0 0 16px rgba(0,255,135,.07),
      0 10px 40px rgba(0,255,135,.35);
    animation: successPop .5s cubic-bezier(.22,.68,0,1.2) forwards;
    margin-bottom: 22px;
  }
  .success-title {
    font-size: 28px;
    font-weight: 800;
    color: #00ff87;
    letter-spacing: -0.5px;
    margin-bottom: 10px;
  }
  .success-sub {
    font-size: 14.5px;
    color: #b2cfb8;
    line-height: 1.75;
    margin-bottom: 28px;
  }
  .success-features {
    list-style: none;
    width: 100%;
    background: rgba(0,255,135,.04);
    border: 1px solid rgba(0,255,135,.13);
    border-radius: 14px;
    padding: 14px 18px;
    margin-bottom: 26px;
    text-align: left;
  }
  .success-features__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid rgba(0,255,135,.07);
    font-size: 13.5px;
    color: #b2cfb8;
  }
  .success-features__item:last-child { border-bottom: none; }
  .success-features__check { color: #00ff87; font-size: 13px; flex-shrink: 0; }

  /* ── CTAs ─────────────────────────────────────────────────────────────── */
  .cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 16px 0;
    border-radius: 14px;
    font-weight: 700;
    font-size: 15.5px;
    text-decoration: none;
    transition: transform .18s, box-shadow .18s;
  }
  .cta:hover { transform: translateY(-2px); }
  .cta--green {
    background: linear-gradient(135deg, #00ff87, #00c96b);
    color: #060e09;
    box-shadow: 0 8px 28px rgba(0,255,135,.3);
  }
  .cta--purple {
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    color: #fff;
    box-shadow: 0 8px 28px rgba(139,92,246,.35);
  }

  /* ── AUTH GATE ────────────────────────────────────────────────────────── */
  .auth-gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 340px;
    text-align: center;
  }
  .auth-gate__icon { font-size: 52px; }
  .auth-gate__title {
    font-size: 20px;
    font-weight: 800;
    color: #e8f5e9;
  }
  .auth-gate__body {
    font-size: 14px;
    color: #6b8a71;
    line-height: 1.65;
    max-width: 280px;
  }

  /* ── SPINNER ──────────────────────────────────────────────────────────── */
  .spinner {
    width: 44px; height: 44px;
    border-radius: 50%;
    border: 3px solid #00ff87;
    border-top-color: transparent;
    animation: spin .8s linear infinite;
  }

  /* ── FOOTER ───────────────────────────────────────────────────────────── */
  .unlock-footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #2d4a32;
  }

  /* ── ANIMATIONS ───────────────────────────────────────────────────────── */
  @keyframes successPop {
    from { transform: scale(.6); opacity: 0; }
    to   { transform: scale(1);  opacity: 1; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── RESPONSIVE ───────────────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .card-body { padding: 24px 20px 32px; }
    .step-header__title { font-size: 22px; }
    .price-box__amount { font-size: 38px; }
    .steps-nav { padding: 16px 20px 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .success-icon { animation: none; }
    .spinner { animation: none; border-color: #00ff87; }
    .btn-wave, .btn-verify, .cta { transition: none; }
  }
`;

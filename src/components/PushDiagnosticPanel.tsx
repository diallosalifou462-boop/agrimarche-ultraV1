'use client';

// ============================================================
//   PushDiagnosticPanel.tsx — Panneau « 🔔 Push » affiché à l'écran
//   pendant l'inscription. Dit en clair où le push bloque et quoi
//   corriger (voir lib/pushDiagnostics.ts pour la logique).
//   N'apparaît QUE si isPushDebugEnabled() est vrai.
// ============================================================

import { useEffect, useState, type CSSProperties } from 'react';
import {
  analyzePushDiag,
  clearPushDiag,
  isPushDebugEnabled,
  pushDiag,
  subscribePushDiag,
  type DiagStep,
  type ServerPushDiag,
} from '@/lib/pushDiagnostics';
import { PENDING_FCM_TOKEN_KEY } from '@/hooks/useFCMToken';

interface Props {
  serverDiag: ServerPushDiag | null;
  onRetryToken?: () => void;
}

const COLORS = { ok: '#16a34a', warn: '#d97706', error: '#dc2626', pending: '#2563eb', info: '#64748b' };
const ICONS = { ok: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' };

export default function PushDiagnosticPanel({ serverDiag, onRetryToken }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<DiagStep[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => setEnabled(isPushDebugEnabled()), []);
  useEffect(() => (enabled ? subscribePushDiag(setSteps) : undefined), [enabled]);

  // Web : NotificationProvider émet cet événement à chaque push reçu page ouverte.
  useEffect(() => {
    if (!enabled) return;
    const onPush = (e: Event) => {
      const p = (e as CustomEvent).detail;
      pushDiag('received', 'ok', 'Notification reçue par le navigateur', p?.notification?.body || p?.notification?.title);
    };
    window.addEventListener('agrimarche:push-received', onPush);
    return () => window.removeEventListener('agrimarche:push-received', onPush);
  }, [enabled]);

  // Confirme la RÉCEPTION réelle sur l'appareil (app au premier plan).
  // Sans ça, impossible de distinguer « FCM n'a rien envoyé » de
  // « envoyé mais pas affiché ».
  useEffect(() => {
    if (!enabled) return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let sub: any;
    (async () => {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        sub = await FirebaseMessaging.addListener('notificationReceived', (event) => {
          pushDiag('received', 'ok', 'Notification reçue par l’appareil', event.notification?.body || event.notification?.title);
        });
      } catch (err) {
        pushDiag('received', 'warn', 'Impossible d’écouter les notifications reçues', err);
      }
    })();
    return () => sub?.remove?.();
  }, [enabled]);

  if (!enabled) return null;

  const verdict = analyzePushDiag(steps, serverDiag);
  const color = COLORS[verdict.level];

  const report = [
    `VERDICT : ${verdict.title}`,
    verdict.explanation ? `Problème : ${verdict.explanation.problem}\nSolution : ${verdict.explanation.fix}` : '',
    serverDiag ? `Serveur : ${JSON.stringify(serverDiag)}` : 'Serveur : (pas encore appelé)',
    '',
    ...steps.map((s) => `+${(s.t / 1000).toFixed(1)}s ${ICONS[s.level]} ${s.label}${s.detail ? ` — ${s.detail}` : ''}`),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard parfois indisponible en WebView */
    }
  };

  const resetToken = async () => {
    try {
      window.localStorage.removeItem(PENDING_FCM_TOKEN_KEY);
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.()) {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        await FirebaseMessaging.deleteToken();
      }
      clearPushDiag();
      pushDiag('token', 'info', 'Ancien token supprimé, nouvelle demande…');
      onRetryToken?.();
    } catch (err) {
      pushDiag('token_error', 'error', 'Suppression du token impossible', err);
    }
  };

  const btn = (bg: string): CSSProperties => ({
    flex: 1, padding: '10px 4px', background: bg, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12,
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 80, right: 16, zIndex: 2147483647, background: color, color: '#fff',
          border: 'none', borderRadius: 20, padding: '8px 14px', fontSize: 13, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,.25)',
        }}
      >
        🔔 Push {verdict.level === 'ok' ? '✓' : verdict.level === 'error' ? '✗' : '…'}
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(15,23,42,.96)', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontSize: 13 }}>
      <div style={{ padding: 14, borderBottom: `4px solid ${color}` }}>
        <div style={{ fontWeight: 800, fontSize: 15, color }}>{verdict.title}</div>
        {verdict.explanation && (
          <>
            <p style={{ margin: '8px 0 4px' }}><b>Problème :</b> {verdict.explanation.problem}</p>
            <p style={{ margin: 0 }}><b>Solution :</b> {verdict.explanation.fix}</p>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontFamily: 'monospace', fontSize: 11 }}>
        {serverDiag && (
          <div style={{ marginBottom: 10, padding: 8, background: '#1e293b', borderRadius: 6 }}>
            Serveur → token reçu : {serverDiag.tokenReceived ? 'oui' : 'non'} · push tenté : {serverDiag.pushAttempted ? 'oui' : 'non'} ·
            FCM : {serverDiag.pushOk ? 'OK' : serverDiag.errorCode || '—'}
          </div>
        )}
        {steps.length === 0 ? '(aucune étape pour le moment)' : steps.map((s, i) => (
          <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #1e293b', wordBreak: 'break-all' }}>
            <span style={{ color: '#64748b' }}>+{(s.t / 1000).toFixed(1)}s</span> {ICONS[s.level]} {s.label}
            {s.detail && <div style={{ color: '#94a3b8', marginLeft: 16 }}>{s.detail}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 10, paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        <button onClick={copy} style={btn('#16a34a')}>{copied ? '✓ Copié' : 'Copier'}</button>
        <button onClick={resetToken} style={btn('#d97706')}>Effacer le token</button>
        <button onClick={() => setOpen(false)} style={btn('#475569')}>Fermer</button>
      </div>
    </div>
  );
}

'use client';

// ============================================================
//   AuthDiagPanel.tsx — Panneau « 🔐 AUTH » affiché à l'écran
//   pendant « Mot de passe oublié ». Trace chaque étape (envoi SMS,
//   validation du code, session Firebase, mise à jour du mot de passe)
//   avec l'heure, pour voir EXACTEMENT où ça casse sur iPhone/Android
//   sans console. Même principe que PushDiagnosticPanel.
//   🔍 TEMPORAIRE — à retirer une fois le problème réglé.
// ============================================================

import { useEffect, useState } from 'react';
import { trace } from '@/lib/firebase/firebase';

// ⚠️ Change ce numéro à chaque build : il s'affiche en haut du panneau et
// prouve que le téléphone fait bien tourner la dernière version du code.
export const AUTH_DIAG_BUILD = 'reset-v3 (23/09 20h)';

export type AuthDiagLevel = 'ok' | 'info' | 'warn' | 'error';
export interface AuthDiagLine { t: string; level: AuthDiagLevel; step: string; detail?: string }

const lines: AuthDiagLine[] = [];
const listeners = new Set<(l: AuthDiagLine[]) => void>();

function fmt(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Ajoute une ligne au panneau (et dans trace() pour la console). */
export function authDiag(level: AuthDiagLevel, step: string, detail?: unknown) {
  const d = new Date();
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  const line: AuthDiagLine = { t, level, step, detail: fmt(detail) || undefined };
  lines.push(line);
  if (lines.length > 150) lines.shift();
  try { trace('RESET', `${step}${line.detail ? ` ${line.detail}` : ''}`); } catch { /* trace indisponible */ }
  listeners.forEach((l) => l([...lines]));
}

/** Résumé lisible d'une erreur Firebase / JS. */
export function errInfo(err: any) {
  return { code: err?.code ?? null, message: err?.message ?? String(err) };
}

/** Résumé lisible de l'utilisateur Firebase courant. */
export function userInfo(u: any) {
  if (!u) return 'AUCUN utilisateur';
  return { uid: u.uid, phone: u.phoneNumber ?? null, email: u.email ?? null };
}

const COLORS: Record<AuthDiagLevel, string> = { ok: '#16a34a', info: '#64748b', warn: '#d97706', error: '#dc2626' };
const ICONS: Record<AuthDiagLevel, string> = { ok: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' };

export default function AuthDiagPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AuthDiagLine[]>([...lines]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  const errors = items.filter((i) => i.level === 'error').length;
  const text = [`BUILD ${AUTH_DIAG_BUILD}`, ...items.map((i) => `${i.t} ${ICONS[i.level]} ${i.step}${i.detail ? ` — ${i.detail}` : ''}`)].join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* WebView sans presse-papiers */ }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 99998,
          background: errors ? '#dc2626' : '#111', color: '#fff', border: 'none',
          borderRadius: 20, padding: '8px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', opacity: 0.9,
        }}
      >
        🔐 AUTH ({items.length}{errors ? ` · ${errors} ❌` : ''})
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.94)', color: '#fff', fontFamily: 'monospace', fontSize: 11, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, background: '#111', flexShrink: 0 }}>
        <div style={{ color: '#22c55e', fontWeight: 'bold', marginBottom: 8 }}>BUILD {AUTH_DIAG_BUILD}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copy} style={{ flex: 1, padding: '10px 0', background: '#22c55e', color: '#000', border: 'none', borderRadius: 6, fontWeight: 'bold' }}>
            {copied ? '✓ Copié' : `Copier (${items.length})`}
          </button>
          <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '10px 0', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold' }}>
            Fermer
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {items.length === 0 && <div style={{ color: '#94a3b8' }}>(aucune étape pour le moment)</div>}
        {items.map((i, k) => (
          <div key={k} style={{ marginBottom: 6, color: COLORS[i.level] === '#64748b' ? '#cbd5e1' : COLORS[i.level], wordBreak: 'break-all' }}>
            <span style={{ color: '#94a3b8' }}>{i.t}</span> {ICONS[i.level]} <b>{i.step}</b>
            {i.detail && <div style={{ color: '#e2e8f0', paddingLeft: 12 }}>{i.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

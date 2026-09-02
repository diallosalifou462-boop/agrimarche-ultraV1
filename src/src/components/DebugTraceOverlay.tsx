'use client';

import { useEffect, useState } from 'react';
import { traceBuffer, onTrace } from '@/lib/firebase/firebase';

// Overlay de debug in-app : affiche les logs [INIT t+Xms] directement à
// l'écran, avec un bouton "copier". Pensé pour tester sur un iPhone sans
// Mac à disposition (donc sans accès à Safari Web Inspector).
//
// ⚠️ v2 SIMPLIFIÉE : la v1 utilisait un geste "taper 5 fois" (sur le logo
// du splash ou une zone invisible en coin d'écran), qui s'est révélé peu
// fiable en usage réel (splash trop rapide, zone difficile à cibler avec
// opacity quasi nulle, pont via window.__debugTraceTap fragile). Remplacé
// par un simple bouton "DEBUG" toujours visible — un seul tap, zéro
// ambiguïté sur "est-ce que ça a bien enregistré le tap ou pas".
export default function DebugTraceOverlay() {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLines([...traceBuffer]);
    const unsub = onTrace((line) => {
      setLines((prev) => [...prev.slice(-199), line]);
    });
    return unsub;
  }, [visible]);

  const fullText = lines.join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API parfois indisponible en WebView natif — repli visuel
      setCopied(false);
    }
  };

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 99998,
          background: '#111',
          color: '#0f0',
          border: '1px solid #0f0',
          borderRadius: 20,
          padding: '8px 14px',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 'bold',
          opacity: 0.85,
        }}
      >
        DEBUG ({traceBuffer.length})
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.92)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', gap: 8, padding: 10, background: '#111', flexShrink: 0 }}>
        <button
          onClick={handleCopy}
          style={{ flex: 1, padding: '10px 0', background: '#22c55e', color: '#000', border: 'none', borderRadius: 6, fontWeight: 'bold' }}
        >
          {copied ? '✓ Copié' : `Copier (${lines.length} lignes)`}
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{ flex: 1, padding: '10px 0', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold' }}
        >
          Fermer
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {lines.length === 0 ? '(aucun log pour le moment...)' : fullText}
      </div>
    </div>
  );
}

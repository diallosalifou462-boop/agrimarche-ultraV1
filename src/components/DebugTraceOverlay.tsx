'use client';

import { useEffect, useState } from 'react';
import { traceBuffer, onTrace } from '@/lib/firebase/firebase';

// Overlay de debug in-app : affiche les logs [INIT t+Xms] directement à
// l'écran, avec un bouton "copier". Pensé pour tester sur un iPhone sans
// Mac à disposition (donc sans accès à Safari Web Inspector).
//
// Activation : taper 5 fois sur le logo du splash en moins de 3s.
// Se ferme avec le bouton "Fermer".
export default function DebugTraceOverlay() {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    if (tapCount === 0) return;
    const timer = setTimeout(() => setTapCount(0), 3000);
    if (tapCount >= 5) {
      setVisible(true);
      setTapCount(0);
    }
    return () => clearTimeout(timer);
  }, [tapCount]);

  useEffect(() => {
    // Expose un handler global pour que le logo du splash (ou n'importe
    // quel autre écran) puisse déclencher les taps sans prop-drilling.
    (window as any).__debugTraceTap = () => setTapCount((c) => c + 1);
    return () => {
      delete (window as any).__debugTraceTap;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLines([...traceBuffer]);
    const unsub = onTrace((line) => {
      setLines((prev) => [...prev.slice(-199), line]);
    });
    return unsub;
  }, [visible]);

  if (!visible) {
    // Zone de tap x5 toujours accessible (coin bas-droit, quasi invisible)
    // — utile une fois passé le splash, qui défile trop vite pour y taper.
    // Ce composant est bien 'use client', donc onClick y est valide
    // (contrairement à layout.tsx qui est un Server Component).
    return (
      <div
        onClick={() => setTapCount((c) => c + 1)}
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 44,
          height: 44,
          zIndex: 99998,
          opacity: 0.01,
        }}
      />
    );
  }

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

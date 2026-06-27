'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Pages qui fonctionnent offline — pas de blocage
const OFFLINE_OK_PAGES = ['/', '/main/products', '/cart'];

function isOfflineOk(pathname: string): boolean {
  return OFFLINE_OK_PAGES.some(p => pathname === p || pathname.startsWith(p + '/') === false && pathname === p);
}

export default function OfflineBanner() {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [show, setShow] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const offlineOk = isOfflineOk(pathname);

  useEffect(() => {
    const online = navigator.onLine;
    setIsOnline(online);
    if (!online) setShow(true);
  }, []);

  useEffect(() => {
    const goOffline = () => {
      setIsOnline(false);
      setReconnected(false);
      setShow(true);
    };
    const goOnline = () => {
      setIsOnline(true);
      setReconnected(true);
      setTimeout(() => {
        setShow(false);
        setReconnected(false);
      }, 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!show) return null;

  return (
    <>
      {/* ── Overlay bloquant uniquement sur les pages NON offline-ok ── */}
      {!isOnline && !offlineOk && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
          pointerEvents: 'all',
        }} />
      )}

      {/* ── Toast ── */}
      <div style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 40px)',
        maxWidth: 400,
        animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Reconnecté */}
        {isOnline && reconnected && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'linear-gradient(135deg,#064e3b,#065f46)',
            borderRadius: 18, padding: '14px 18px',
            boxShadow: '0 20px 60px rgba(6,78,59,0.45), 0 0 0 1px rgba(52,211,153,0.2)',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(52,211,153,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>✓</div>
            <div>
              <p style={{ margin: 0, color: '#6ee7b7', fontSize: 13, fontWeight: 700 }}>Connexion rétablie</p>
              <p style={{ margin: '2px 0 0', color: 'rgba(110,231,183,0.6)', fontSize: 11 }}>Tout est de nouveau disponible</p>
            </div>
          </div>
        )}

        {/* Hors ligne — page bloquée */}
        {!isOnline && !offlineOk && (
          <div style={{
            background: 'linear-gradient(135deg,#1c1917,#292524)',
            borderRadius: 20, padding: '18px 18px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Barre animée */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: 'linear-gradient(90deg,#f59e0b,#ef4444,#f59e0b)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14,
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>📡</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: '#fef3c7', fontSize: 14, fontWeight: 700 }}>
                  Pas de connexion internet
                </p>
                <p style={{ margin: '4px 0 0', color: 'rgba(254,243,199,0.5)', fontSize: 11.5, lineHeight: 1.5 }}>
                  Cette page nécessite internet.{'\n'}
                  Vérifiez votre réseau mobile ou Wi-Fi.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#f59e0b',
                      animation: `pulse 1.4s ease-in-out ${i*0.2}s infinite`,
                    }} />
                  ))}
                  <span style={{ color: 'rgba(254,243,199,0.35)', fontSize: 10 }}>En attente de reconnexion…</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hors ligne — page accessible offline */}
        {!isOnline && offlineOk && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'linear-gradient(135deg,#1e293b,#0f172a)',
            borderRadius: 16, padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(251,191,36,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, flexShrink: 0,
            }}>⚡</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: '#fde68a', fontSize: 12, fontWeight: 600 }}>
                Mode hors ligne
              </p>
              <p style={{ margin: '2px 0 0', color: 'rgba(253,230,138,0.5)', fontSize: 10.5 }}>
                Certaines données peuvent être limitées
              </p>
            </div>
            {/* Petit indicateur réseau */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
              {[6,10,14,18].map((h,i) => (
                <div key={i} style={{
                  width: 4, height: h,
                  borderRadius: 2,
                  background: i === 0 ? '#fbbf24' : 'rgba(251,191,36,0.2)',
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform:translateX(-50%) translateY(20px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position:-200% 0; }
        }
        @keyframes pulse {
          0%,100% { opacity:0.3; transform:scale(1); }
          50%      { opacity:1;   transform:scale(1.35); }
        }
      `}</style>
    </>
  );
}

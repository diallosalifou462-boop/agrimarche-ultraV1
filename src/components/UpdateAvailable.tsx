// src/components/UpdateAvailable.tsx
import React, { useEffect, useState } from 'react';

export const UpdateAvailable: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'UPDATE_AVAILABLE') {
        setVersion(event.data.version || '');
        setShowUpdate(true);
      }
    });
  }, []);

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }
      });
    }
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="update-banner">
      <span>🔄 Nouvelle version disponible {version}</span>
      <button onClick={handleUpdate}>Mettre à jour</button>
      <button onClick={() => setShowUpdate(false)}>✕</button>
      <style jsx>{`
        .update-banner {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: #2e7d32; color: white;
          padding: 12px 20px; border-radius: 50px;
          display: flex; align-items: center; gap: 12px;
          z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          animation: popUp 0.3s ease;
        }
        button {
          background: white; color: #2e7d32;
          border: none; padding: 6px 14px; border-radius: 20px;
          cursor: pointer; font-weight: 600; font-size: 13px;
        }
        button:last-child {
          background: none; color: rgba(255,255,255,0.8);
          padding: 6px; font-size: 16px;
        }
        @keyframes popUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

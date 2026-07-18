// src/components/NotificationPermission.tsx
import React, { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export const NotificationPermission: React.FC = () => {
  const { isSupported, isGranted, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (!isSupported || isGranted || dismissed) return null;

  return (
    <div className="notification-prompt">
      <div className="notification-content">
        <div>🔔</div>
        <div className="notification-text">
          <strong>Activer les notifications</strong>
          <p>Soyez alerté de vos commandes et des nouvelles offres</p>
        </div>
        <button onClick={requestPermission} className="allow-btn">Activer</button>
        <button onClick={() => setDismissed(true)} className="dismiss-btn">Plus tard</button>
      </div>
      <style jsx>{`
        .notification-prompt {
          background: #e8f5e9; border-left: 4px solid #2e7d32;
          padding: 16px; border-radius: 8px; margin: 16px;
        }
        .notification-content {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .notification-text { flex: 1; }
        .notification-text strong { color: #2e7d32; display: block; }
        .notification-text p { font-size: 13px; color: #555; margin: 4px 0 0; }
        .allow-btn {
          background: #2e7d32; color: white; border: none;
          padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: 600;
        }
        .dismiss-btn {
          background: none; border: none; color: #666;
          cursor: pointer; font-size: 14px;
        }
      `}</style>
    </div>
  );
};


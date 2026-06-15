'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';

export function NotificationBell() {
  const [showPanel, setShowPanel] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const requestPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setPermission(perm);
    }
  };

  if (permission === 'default') {
    return (
      <button
        onClick={requestPermission}
        className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition"
      >
        🔔 Activer
      </button>
    );
  }

  if (permission === 'denied') {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition"
      >
        <Bell size={18} className="text-gray-600" />
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 mt-2 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
              <h3 className="text-white font-semibold text-sm">Notifications</h3>
            </div>
            <div className="p-8 text-center text-gray-400">
              <Bell size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune notification</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
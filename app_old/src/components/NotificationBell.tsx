'use client';

// src/components/NotificationBell.tsx
//
// Le vrai centre de notifications de l'app. Remplace un ancien fichier
// mort du même nom qui affichait "Aucune notification" en dur et n'était
// jamais importé nulle part.
//
// Ce composant ne fait AUCUN appel Firestore lui-même : toute la
// donnée temps réel (liste, unreadCount, markAsRead, markAllAsRead)
// vient de useNotifications() (src/components/NotificationProvider.tsx),
// qui tourne déjà pour tout l'app via le RootLayout. Ce fichier est
// donc uniquement de l'affichage — il peut être posé dans n'importe
// quel header sans rien dupliquer.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  CheckCircle,
  Truck,
  MessageCircle,
  Star,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useNotifications } from '@/components/NotificationProvider';

const TYPE_STYLES: Record<
  string,
  { icon: React.ElementType; bg: string; fg: string }
> = {
  order:    { icon: CheckCircle,   bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  shipping: { icon: Truck,         bg: 'bg-blue-50',    fg: 'text-blue-600' },
  message:  { icon: MessageCircle, bg: 'bg-violet-50',  fg: 'text-violet-600' },
  review:   { icon: Star,          bg: 'bg-amber-50',   fg: 'text-amber-600' },
  alert:    { icon: AlertCircle,   bg: 'bg-red-50',     fg: 'text-red-600' },
  info:     { icon: Info,          bg: 'bg-gray-100',   fg: 'text-gray-500' },
};

function formatRelativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return "À l'instant";
  if (diff < 60) return `il y a ${diff} s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return date.toLocaleDateString('fr-SN', { day: 'numeric', month: 'short' });
}

export function NotificationBell({
  triggerClassName,
  badgeClassName,
}: {
  /** Classes CSS du bouton déclencheur, pour coller au design du header hôte */
  triggerClassName?: string;
  /** Classes CSS du badge de compteur, idem */
  badgeClassName?: string;
}) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fermer au clic extérieur (comportement attendu d'un panneau, pas géré par défaut)
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const handleNotificationClick = (notif: (typeof notifications)[number]) => {
    if (!notif.read) markAsRead(notif.id);
    setOpen(false);
    if (notif.link) router.push(notif.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName ?? 'relative p-2.5 rounded-xl bg-gray-50 hover:bg-emerald-50 transition'}
        aria-label="Notifications"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className={badgeClassName ?? 'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center'}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-80 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
          <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
            <h3 className="text-white font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-[11px] text-emerald-50/90 hover:text-white transition"
              >
                <CheckCheck size={13} />
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Bell size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucune notification pour le moment</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const style = TYPE_STYLES[notif.type] ?? TYPE_STYLES.info;
                const Icon = style.icon;
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 hover:bg-gray-50 transition ${
                      notif.read ? '' : 'bg-emerald-50/40'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${style.bg}`}>
                      <Icon size={16} className={style.fg} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm truncate ${notif.read ? 'text-gray-700 font-normal' : 'text-gray-900 font-semibold'}`}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{notif.body}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{formatRelativeTime(notif.createdAt)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

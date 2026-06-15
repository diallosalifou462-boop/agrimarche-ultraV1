'use client';

import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useFCMToken } from '@/hooks/useFCMToken';
import { useAuth } from '@/hooks/useAuth';
import { Bell, X, CheckCircle, Truck, MessageCircle, Star, AlertCircle } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'order' | 'shipping' | 'message' | 'review' | 'alert' | 'info';
  read: boolean;
  createdAt: Date;
  link?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  showNotification: (notif: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  requestPermission: () => Promise<void>;
  permission: NotificationPermission;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requestPermission: requestFCMToken, permission, onMessageReceived } = useFCMToken();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Écouter les notifications Firestore en temps réel
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as Notification[];
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [user]);

  // Écouter les messages en temps réel
  useEffect(() => {
    const unsubscribe = onMessageReceived((payload) => {
      const newNotification: Notification = {
        id: Date.now().toString(),
        title: payload.notification?.title || 'Notification',
        body: payload.notification?.body || '',
        type: payload.data?.type || 'info',
        read: false,
        createdAt: new Date(),
        link: payload.data?.link,
      };
      
      setNotifications(prev => [newNotification, ...prev]);
      
      if (Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'AgriMarché', {
          body: payload.notification?.body,
          icon: '/logo.png',
        });
      }
    });
    
    return unsubscribe;
  }, [onMessageReceived]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const showNotification = useCallback((notif: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    const newNotification: Notification = {
      ...notif,
      id: Date.now().toString(),
      read: false,
      createdAt: new Date(),
    };
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const requestPermission = useCallback(async () => {
    await requestFCMToken();
  }, [requestFCMToken]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'order': return <CheckCircle size={14} className="text-emerald-500" />;
      case 'shipping': return <Truck size={14} className="text-blue-500" />;
      case 'message': return <MessageCircle size={14} className="text-purple-500" />;
      case 'review': return <Star size={14} className="text-amber-500" />;
      case 'alert': return <AlertCircle size={14} className="text-red-500" />;
      default: return <Bell size={14} className="text-gray-500" />;
    }
  };

  const formatTime = (date: Date) => {
    const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return `il y a ${Math.floor(diff / 86400)} j`;
  };

  if (!isMounted) return <>{children}</>;

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      unreadCount, 
      markAsRead, 
      markAllAsRead, 
      showNotification,
      requestPermission,
      permission,
    }}>
      {/* Bouton flottant pour demander la permission */}
      {user && permission === 'default' && (
        <div className="fixed bottom-24 left-4 z-50">
          <button
            onClick={requestPermission}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-bounce"
          >
            <Bell size={16} />
            Activer les notifications
          </button>
        </div>
      )}

      {children}
    </NotificationContext.Provider>
  );
}
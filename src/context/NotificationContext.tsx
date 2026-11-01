import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppNotification } from '../types';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: AppNotification[];
  systemEmails: AppNotification[];
  unreadCount: number;
  isDrawerOpen: boolean;
  activeDrawerTab: 'notifications' | 'emails';
  openDrawer: (tab?: 'notifications' | 'emails') => void;
  closeDrawer: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [systemEmails, setSystemEmails] = useState<AppNotification[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'notifications' | 'emails'>('notifications');

  const refreshNotifications = async () => {
    // Notification endpoints require authentication (they can include OTP
    // codes in the simulated-email inbox, so they must never be reachable
    // by a guest - see server/routes/notifications.ts). There is no
    // legitimate guest notification state, so skip the request entirely
    // instead of firing it and getting a guaranteed 401 on every
    // registration/login screen and every 15s poll thereafter.
    if (!token) {
      setNotifications([]);
      setSystemEmails([]);
      return;
    }

    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

      // In-app notifications
      const notifRes = await fetch('/api/notifications', { headers });
      if (notifRes.ok) {
        const data = await notifRes.json();
        setNotifications(data);
      }

      // Simulated system emails
      const emailRes = await fetch('/api/notifications/emails', { headers });
      if (emailRes.ok) {
        const data = await emailRes.json();
        setSystemEmails(data);
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    refreshNotifications();
    // Only poll while actually logged in - no point running an interval
    // that would just 401 repeatedly for a guest.
    if (!token) return;
    const interval = setInterval(refreshNotifications, 15000); // 15s poll
    return () => clearInterval(interval);
  }, [token, user]);

  const markAsRead = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (e) {
      console.error('Failed to mark notification read:', e);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error('Failed to mark all read:', e);
    }
  };

  const openDrawer = (tab: 'notifications' | 'emails' = 'notifications') => {
    setActiveDrawerTab(tab);
    setIsDrawerOpen(true);
    refreshNotifications();
  };

  const closeDrawer = () => setIsDrawerOpen(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        systemEmails,
        unreadCount,
        isDrawerOpen,
        activeDrawerTab,
        openDrawer,
        closeDrawer,
        markAsRead,
        markAllAsRead,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

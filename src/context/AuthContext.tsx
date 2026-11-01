import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Worker } from '../types';

interface AuthContextType {
  user: User | null;
  workerProfile: Worker | null;
  token: string | null;
  isLoading: boolean;
  guestFavourites: string[];
  loginCustomer: (email: string, pass: string) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean; email?: string }>;
  registerCustomer: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginWorker: (identifier: string, pass: string) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean; email?: string }>;
  // loggedIn=true when the worker registered without an email (nothing to verify, session issued immediately)
  registerWorker: (data: any) => Promise<{ success: boolean; error?: string; loggedIn?: boolean }>;
  loginAdmin: (
    email: string,
    pass: string
  ) => Promise<{ success: boolean; error?: string; status?: number; network?: boolean }>;
  // "Continue with Google" (server-side flow, see src/api/googleAuth.ts). exchange: trades the one-time ticket for a
  // session, or reports that a sign-up form is needed. complete: creates the account after the person chose a role.
  exchangeGoogleTicket: (ticket: string) => Promise<{ success: boolean; signup?: boolean; email?: string; name?: string; error?: string; code?: string }>;
  completeGoogleSignup: (ticket: string, data: Record<string, unknown>) => Promise<{ success: boolean; error?: string; field?: string; code?: string }>;
  startGoogleLink: () => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  verifyEmailOtp: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  resendOtp: (email: string, purpose?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  toggleFavourite: (workerId: string) => Promise<boolean>;
  isFavourite: (workerId: string) => boolean;
  refreshUserData: () => Promise<void>;
  updateWorkerProfileState: (updated: Worker) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workerProfile, setWorkerProfile] = useState<Worker | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('now_token'));
  const [isLoading, setIsLoading] = useState(true);

  // Guest favourites in localStorage (Req 11)
  const [guestFavourites, setGuestFavourites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('now_guest_favs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveGuestFavs = (favs: string[]) => {
    setGuestFavourites(favs);
    localStorage.setItem('now_guest_favs', JSON.stringify(favs));
  };

  const refreshUserData = async () => {
    const savedToken = localStorage.getItem('now_token');
    if (!savedToken) {
      setUser(null);
      setWorkerProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setWorkerProfile(data.worker);
      } else {
        // Stale or invalidated session
        localStorage.removeItem('now_token');
        setToken(null);
        setUser(null);
        setWorkerProfile(null);
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUserData();
  }, []);

  const syncGuestFavourites = async (activeToken: string) => {
    if (guestFavourites.length === 0) return;
    try {
      const res = await fetch('/api/customer/favourites/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ guestFavourites }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.favourites) {
          setUser((prev) => (prev ? { ...prev, favourites: data.favourites } : null));
        }
        // Clear guest favourites once synced
        saveGuestFavs([]);
      }
    } catch (e) {
      console.error('Failed to sync guest favourites:', e);
    }
  };

  const setAuthSession = (newToken: string, newUser: User, newWorker: Worker | null = null) => {
    localStorage.setItem('now_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setWorkerProfile(newWorker);
    if (newUser.role === 'customer') {
      syncGuestFavourites(newToken);
    }
  };

  const loginCustomer = async (email: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Login failed',
          requiresVerification: Boolean(data.requiresVerification),
          email: data.email,
        };
      }
      setAuthSession(data.token, data.user, null);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  const registerCustomer = async (email: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Registration failed' };
      // SECURITY FIX: the backend no longer returns a token here - an
      // unverified account must not get an authenticated session just from
      // registering. The real session is only created by verifyEmailOtp()
      // below, after the OTP is actually confirmed. Closing the OTP screen
      // at this point leaves token/user untouched (still null), exactly as
      // if registration had never happened.
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  // `identifier` is a User ID, a phone number or (verified) email; the server decides which.
  const loginWorker = async (identifier: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/worker/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Login failed',
          requiresVerification: Boolean(data.requiresVerification),
          email: data.email,
        };
      }
      setAuthSession(data.token, data.user, data.worker);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  const registerWorker = async (formData: any) => {
    try {
      const res = await fetch('/api/auth/worker/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Registration failed' };
      // SECURITY FIX: same as registerCustomer - no session is established
      // here for workers WITH an email. See verifyEmailOtp() for where the
      // real token comes from. A worker who registered WITHOUT an email has
      // nothing to verify, so the server returns the session directly.
      if (data.token && data.user && data.requiresVerification === false) {
        setAuthSession(data.token, data.user, data.worker);
        return { success: true, loggedIn: true };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  const loginAdmin = async (email: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      // A proxy/gateway error page is not JSON: treat it as a server error, not a network error.
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) return { success: false, error: data.error || 'Admin login failed', status: res.status };
      setAuthSession(data.token, data.user, null);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred', network: true };
    }
  };

  // Google sign-in. Nothing here is trusted by the server: the ticket was issued by OUR server after it verified
  // Google's ID token (signature, issuer, audience, expiry, nonce, email_verified); the session token comes from the
  // server's response, and the role/e-mail are whatever the server returns.
  const exchangeGoogleTicket = async (ticket: string) => {
    try {
      const res = await fetch('/api/auth/google/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) return { success: false, error: data.error || 'Google sign-in failed', code: data.code };
      if (data.signup) return { success: true, signup: true, email: data.email, name: data.name };
      setAuthSession(data.token, data.user, data.worker ?? null);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  const completeGoogleSignup = async (ticket: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/auth/google/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ticket, guestFavourites }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) return { success: false, error: data.error || 'Registration failed', field: data.field, code: data.code };
      setAuthSession(data.token, data.user, data.worker ?? null);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  // Signed-in user links a Google account. The server prepares the flow (bound to this session), then we leave for Google.
  const startGoogleLink = async () => {
    try {
      const res = await fetch('/api/auth/google/link/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data.url) return { success: false, error: data.error || 'Could not start Google linking' };
      window.location.assign(data.url);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  // Deliberately does NOT touch auth state - the backend's generic
  // response here is intentional (same message whether or not the email
  // exists, to avoid account enumeration), and no session is created until
  // resetPassword() below actually succeeds.
  const forgotPassword = async (email: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Request failed' };
      return { success: true, message: data.message };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  // Does NOT log the user in - the backend only updates the password hash
  // and bumps tokenVersion (invalidating other existing sessions for this
  // account); it does not return a token. The user logs in normally
  // afterward with loginCustomer/loginWorker, same as any other login.
  const resetPassword = async (email: string, otp: string, newPassword: string) => {
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Password reset failed' };
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'OTP verification failed' };
      // SECURITY FIX: this is now the ONLY place the post-registration
      // session gets created - the backend only returns a token here,
      // after OTP success (see server/routes/auth.ts POST /verify-email).
      // Wrong OTP / expired OTP / closing the OTP screen before this point
      // all leave token/user as they were (null, for a fresh registration),
      // so none of those paths can result in an authenticated session.
      if (data.token && data.user) {
        setAuthSession(data.token, data.user, data.worker || null);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Network error occurred' };
    }
  };

  const resendOtp = async (email: string, purpose = 'verify_email') => {
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await res.json();
      return { success: res.ok, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = () => {
    localStorage.removeItem('now_token');
    setToken(null);
    setUser(null);
    setWorkerProfile(null);
  };

  const toggleFavourite = async (workerId: string): Promise<boolean> => {
    if (!user) {
      // Guest favourites
      let nextFavs: string[];
      let isFav = false;
      if (guestFavourites.includes(workerId)) {
        nextFavs = guestFavourites.filter((id) => id !== workerId);
        isFav = false;
      } else {
        nextFavs = [...guestFavourites, workerId];
        isFav = true;
      }
      saveGuestFavs(nextFavs);
      return isFav;
    }

    // Authenticated user
    try {
      const res = await fetch('/api/customer/favourites/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workerId }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => (prev ? { ...prev, favourites: data.favourites } : null));
        return data.isSaved;
      }
    } catch (e) {
      console.error('Failed to toggle favourite:', e);
    }
    return false;
  };

  const isFavourite = (workerId: string): boolean => {
    if (user) {
      return (user.favourites || []).includes(workerId);
    }
    return guestFavourites.includes(workerId);
  };

  const updateWorkerProfileState = (updated: Worker) => {
    setWorkerProfile(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workerProfile,
        token,
        isLoading,
        guestFavourites,
        loginCustomer,
        registerCustomer,
        loginWorker,
        registerWorker,
        loginAdmin,
        exchangeGoogleTicket,
        completeGoogleSignup,
        startGoogleLink,
        forgotPassword,
        resetPassword,
        verifyEmailOtp,
        resendOtp,
        logout,
        toggleFavourite,
        isFavourite,
        refreshUserData,
        updateWorkerProfileState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

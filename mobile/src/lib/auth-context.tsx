// Auth context + provider.
//
// Lifecycle:
//   - On boot: read token from storage. If present, set in API client and try
//     GET /api/auth/me. If 401, clear and route to sign-in.
//   - After successful sign-in/sign-up: persist token + expires_at, set in
//     API client, load /me.
//   - Sign-out: DELETE session server-side (best effort), clear storage,
//     clear API client token.
//   - "Guest mode": no token; backend defaults to user_id = 1 (Terry).
//     Lets the existing single-user use case keep working without sign-in.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  setAuthToken,
  signIn as apiSignIn,
  signUp as apiSignUp,
  signOut as apiSignOut,
  getCurrentUser,
  deleteAccount as apiDeleteAccount,
} from './api';
import type { User } from './types';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from './storage';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  const persistSession = useCallback(
    async (token: string, expiresAt: string) => {
      await storageSet(STORAGE_KEYS.AUTH_TOKEN, token);
      await storageSet(STORAGE_KEYS.AUTH_EXPIRES_AT, expiresAt);
      await storageRemove(STORAGE_KEYS.AUTH_GUEST_MODE);
      setAuthToken(token);
    },
    [],
  );

  const clearSession = useCallback(async () => {
    await storageRemove(STORAGE_KEYS.AUTH_TOKEN);
    await storageRemove(STORAGE_KEYS.AUTH_EXPIRES_AT);
    setAuthToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
      setStatus('signed-in');
    } catch {
      await clearSession();
      setStatus('signed-out');
    }
  }, [clearSession]);

  // Boot: load token from storage and verify
  useEffect(() => {
    (async () => {
      try {
        const guest = await storageGet(STORAGE_KEYS.AUTH_GUEST_MODE);
        if (guest === '1') {
          setStatus('guest');
          return;
        }
        const token = await storageGet(STORAGE_KEYS.AUTH_TOKEN);
        if (!token) {
          setStatus('signed-out');
          return;
        }
        setAuthToken(token);
        await refresh();
      } catch {
        setStatus('signed-out');
      }
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await apiSignIn({ email, password });
      await persistSession(session.token, session.expires_at);
      setUser(session.user);
      setStatus('signed-in');
    },
    [persistSession],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const session = await apiSignUp({
        email,
        password,
        display_name: displayName,
      });
      await persistSession(session.token, session.expires_at);
      setUser(session.user);
      setStatus('signed-in');
    },
    [persistSession],
  );

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } catch {
      // Best-effort — even if server is unreachable, clear local state.
    }
    await clearSession();
    setStatus('signed-out');
  }, [clearSession]);

  const continueAsGuest = useCallback(async () => {
    await storageSet(STORAGE_KEYS.AUTH_GUEST_MODE, '1');
    await clearSession();
    setStatus('guest');
  }, [clearSession]);

  const deleteAccount = useCallback(async () => {
    await apiDeleteAccount();
    await clearSession();
    setStatus('signed-out');
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signOut,
      continueAsGuest,
      deleteAccount,
      refresh,
    }),
    [status, user, signIn, signUp, signOut, continueAsGuest, deleteAccount, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be called within <AuthProvider>');
  return ctx;
}

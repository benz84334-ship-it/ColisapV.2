import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { WORKSPACE_ROLES } from '../utils/constants.js';
import { freshDatabase } from '../services/supabaseStorageService.js';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient.js';
import { useData } from './DataContext.jsx';

const AuthContext = createContext(null);

const FALLBACK_ADMIN = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'admin',
  password: 'Admin1245',
  fullName: 'Admin',
  role: 'Admin',
  status: 'Active',
  branch: 'Main Office',
  email: 'admin@admin.com',
  contactNumber: '',
};

const AUTH_SESSION_KEY = 'colisapAuthSession';

function publicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

export function AuthProvider({ children }) {
  const data = useData();
  const users = (data?.users || freshDatabase().users || []).filter(Boolean);
  const isAuthReady = !data?.isDatabaseLoading;
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    try {
      const savedSession = window.sessionStorage.getItem(AUTH_SESSION_KEY);
      if (savedSession && !currentUser) {
        const parsed = JSON.parse(savedSession);
        if (parsed && typeof parsed === 'object') {
          setCurrentUser(parsed);
        }
      }
    } catch (error) {
      console.error('Unable to restore auth session:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    const isFallbackAdmin = currentUser?.id === FALLBACK_ADMIN.id;
    if (currentUser && !isFallbackAdmin && !users.some((item) => item.id === currentUser.id && item.status === 'Active')) {
      setCurrentUser(null);
    }
  }, [currentUser, users]);

  const login = useCallback(
    async ({ username, password }) => {
      const loginValue = String(username).toLowerCase().trim();
      const passwordValue = String(password).trim();
      let user = users.find((item) =>
        [item.username, item.email].some((value) => String(value || '').toLowerCase().trim() === loginValue)
        && String(item.password || '').trim() === passwordValue
        && WORKSPACE_ROLES.includes(item.role)
        && item.status === 'Active',
      );

      if (!user && isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .or(`username.eq.${loginValue},email.eq.${loginValue}`)
          .limit(10);

        if (!error && Array.isArray(data)) {
          user = data.find((item) =>
            String(item.password || '').trim() === passwordValue
            && WORKSPACE_ROLES.includes(item.role)
            && item.status === 'Active',
          ) || null;
        }
      }

      if (!user) {
        const fallbackLogin = [FALLBACK_ADMIN.username, FALLBACK_ADMIN.email]
          .some((value) => String(value || '').toLowerCase().trim() === loginValue);
        if (fallbackLogin && passwordValue === FALLBACK_ADMIN.password) {
          user = FALLBACK_ADMIN;
        }
      }

      if (!user) {
        return { ok: false, message: 'Invalid username, password, or inactive account.' };
      }

      const lastLogin = new Date().toISOString();
      const nextUser = publicUser({ ...user, lastLogin });
      if (user?.id) {
        try {
          await data.updateUser(user.id, { lastLogin }, user.username || user.fullName || 'System');
        } catch (error) {
          console.error('Unable to persist last login:', error);
        }
      }
      setCurrentUser(nextUser);
      try {
        window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextUser));
      } catch (error) {
        console.error('Unable to persist auth session:', error);
      }
      return { ok: true };
    },
    [users],
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    try {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch (error) {
      console.error('Unable to clear auth session:', error);
    }
  }, []);

  const hasRole = useCallback(
    (roles = []) => {
      if (!roles.length) return true;
      return currentUser ? roles.includes(currentUser.role) : false;
    },
    [currentUser],
  );

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated: Boolean(currentUser),
      isAuthReady,
      login,
      logout,
      hasRole,
    }),
    [currentUser, hasRole, isAuthReady, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

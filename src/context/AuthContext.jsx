import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { STORAGE_KEYS, WORKSPACE_ROLES } from '../utils/constants.js';
import { useData } from './DataContext.jsx';

const AuthContext = createContext(null);

function storedSession() {
  const raw = localStorage.getItem(STORAGE_KEYS.session) || sessionStorage.getItem(STORAGE_KEYS.session);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

export function AuthProvider({ children }) {
  const { users, updateUser, deleteOtherUsers, addActivity } = useData();
  const [currentUser, setCurrentUser] = useState(() => {
    const session = storedSession();
    const user = users.find((item) => item.id === session?.userId && item.status === 'Active');
    return publicUser(user);
  });

  const login = useCallback(
    ({ username, password, remember }) => {
      const loginValue = String(username).toLowerCase().trim();
      const user = users.find(
        (item) =>
          [item.username, item.email].some((value) => String(value || '').toLowerCase() === loginValue) &&
          item.password === password &&
          WORKSPACE_ROLES.includes(item.role) &&
          item.status === 'Active',
      );

      if (!user) {
        return { ok: false, message: 'Invalid username, password, or inactive account.' };
      }

      const session = {
        userId: user.id,
        username: user.username,
        role: user.role,
        branch: user.branch,
        createdAt: new Date().toISOString(),
      };
      const storage = remember ? localStorage : sessionStorage;
      localStorage.removeItem(STORAGE_KEYS.session);
      sessionStorage.removeItem(STORAGE_KEYS.session);
      storage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
      updateUser(user.id, { lastLogin: new Date().toISOString() }, user.username);
      deleteOtherUsers(user);
      addActivity('Login', `${user.username} signed in.`, user.username);
      setCurrentUser(publicUser({ ...user, lastLogin: new Date().toISOString() }));
      return { ok: true };
    },
    [addActivity, deleteOtherUsers, updateUser, users],
  );

  const logout = useCallback(() => {
    if (currentUser) addActivity('Logout', `${currentUser.username} (${currentUser.role}, ${currentUser.branch || 'Unassigned'}) signed out.`, currentUser.username);
    localStorage.removeItem(STORAGE_KEYS.session);
    sessionStorage.removeItem(STORAGE_KEYS.session);
    setCurrentUser(null);
  }, [addActivity, currentUser]);

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
      login,
      logout,
      hasRole,
    }),
    [currentUser, hasRole, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

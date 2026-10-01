import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getMe,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  persistAuth,
  register as apiRegister,
  updateAccount as apiUpdateAccount,
} from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setIsLoading(false);
      return;
    }
    getMe()
      .then(({ user: data }) => {
        persistAuth(getToken(), data);
        setUser(data);
      })
      .catch(() => {
        persistAuth(null, null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const { user: data, token } = await apiLogin(credentials);
    persistAuth(token, data);
    setUser(data);
    return data;
  }, []);

  const register = useCallback(async (details) => {
    const { user: data, token } = await apiRegister(details);
    persistAuth(token, data);
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore - we clear local auth state regardless
    }
    persistAuth(null, null);
    setUser(null);
  }, []);

  const updateAccount = useCallback(async (payload) => {
    const { user: data } = await apiUpdateAccount(payload);
    persistAuth(getToken(), data);
    setUser(data);
    return data;
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: data } = await getMe();
    persistAuth(getToken(), data);
    setUser(data);
    return data;
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticated: Boolean(user), login, register, logout, updateAccount, refreshUser }),
    [user, isLoading, login, register, logout, updateAccount, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

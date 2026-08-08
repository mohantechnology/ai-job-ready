import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe, getToken, login as apiLogin, logout as apiLogout, register as apiRegister, setToken } from "../lib/api.js";

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
      .then(({ user: data }) => setUser(data))
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const { user: data, token } = await apiLogin(credentials);
    setToken(token);
    setUser(data);
    return data;
  }, []);

  const register = useCallback(async (details) => {
    const { user: data, token } = await apiRegister(details);
    setToken(token);
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore - we clear local auth state regardless
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticated: Boolean(user), login, register, logout }),
    [user, isLoading, login, register, logout]
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

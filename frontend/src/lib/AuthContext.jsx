import { createContext, useContext, useEffect, useState, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TOKEN_KEY = "filed_admin_token";

const AuthContext = createContext(null);

function setAuthHeader(token) {
  if (token) axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete axios.defaults.headers.common["Authorization"];
}

// Apply any persisted token immediately so the first admin request is authorized.
const persisted = localStorage.getItem(TOKEN_KEY);
if (persisted) setAuthHeader(persisted);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out
  const [token, setToken] = useState(persisted || null);

  useEffect(() => {
    if (!token) { setUser(null); return; }
    setAuthHeader(token);
    axios.get(`${API}/auth/me`)
      .then(({ data }) => setUser(data))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setAuthHeader(null); setToken(null); setUser(null); });
  }, [token]);

  const login = useCallback(async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setAuthHeader(data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthHeader(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthed: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

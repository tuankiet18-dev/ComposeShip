import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

type User = {
  id: string;
  email: string;
  fullName: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, inviteCode: string, acceptedPilotTerms: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const stored = localStorage.getItem("user");
      try {
        if (stored) setUser(JSON.parse(stored));
        const profile = await api.getProfile();
        const userData = {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
        };
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
      } catch {
        localStorage.removeItem("user");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    const userData = { id: response.id, email: response.email, fullName: response.fullName };
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const register = async (email: string, password: string, fullName: string, inviteCode: string, acceptedPilotTerms: boolean) => {
    await api.register(email, password, fullName, inviteCode, acceptedPilotTerms);
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from '@/components/ui/toast';

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  role: 'Admin' | 'DeputyAdmin' | 'Member';
  status: 'Pending' | 'Active' | 'Banned';
  created_at: string;
  muted_until?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  avatar?: string;
  verification_code: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/current-user');
      if (response.data.success) {
        setUser(response.data.data);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await axios.post('/api/login', { email, password });
      if (response.data.success) {
        await checkAuth();
        showToast({ title: response.data.message, type: "success" });
        return true;
      } else {
        showToast({ title: response.data.message, type: "error" });
        return false;
      }
    } catch (error) {
      showToast({ title: "登录失败", type: "error" });
      return false;
    }
  };

  const register = async (data: RegisterData): Promise<boolean> => {
    try {
      const response = await axios.post('/api/register', data);
      if (response.data.success) {
        showToast({ title: response.data.message, type: "success" });
        // 如果是第一个用户，会自动登录
        await checkAuth();
        return true;
      } else {
        showToast({ title: response.data.message, type: "error" });
        return false;
      }
    } catch (error) {
      showToast({ title: "注册失败", type: "error" });
      return false;
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/logout');
      setUser(null);
      showToast({ title: "已退出登录", type: "success" });
    } catch (error) {
      showToast({ title: "退出登录失败", type: "error" });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

interface User {
  id: string;
  email: string;
  username: string;
  user_type: 'creator' | 'viewer';
  points: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

interface RegisterData {
  email: string;
  username: string;
  password: string;
  user_type: 'creator' | 'viewer';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await api.get('/api/users/me');
        setUser(response.data);
      }
    } catch (error) {
      localStorage.removeItem('token');
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const formData = new FormData();
    formData.append('username', email); // API expects email in username field
    formData.append('password', password);

    const response = await api.post('/api/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    
    // Fetch user data
    const userResponse = await api.get('/api/users/me');
    setUser(userResponse.data);
  }

  async function register(data: RegisterData) {
    const response = await api.post('/api/auth/register', data);
    await login(data.email, data.password);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 
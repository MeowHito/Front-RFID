'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from './api';

interface User {
    _id?: string;
    uuid: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    phone?: string;
    avatarUrl?: string;
}

interface RegisterData {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
}

interface UpdateProfileData {
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    updateProfile: (data: UpdateProfileData) => Promise<void>;
    updateAvatar: (file: File) => Promise<void>;
    updatePassword: (oldPassword: string, newPassword: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check for stored token on mount
        const storedToken = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('auth_user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        }

        setIsLoading(false);
    }, []);

    const login = async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });
        const { access_token, user: userData } = response.data;

        // Store in localStorage
        localStorage.setItem('auth_token', access_token);
        localStorage.setItem('auth_user', JSON.stringify(userData));

        // Set axios default header
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

        setToken(access_token);
        setUser(userData);
    };

    const register = async (data: RegisterData) => {
        const response = await api.post('/auth/register', data);
        const { access_token, user: userData } = response.data;

        // Store in localStorage
        localStorage.setItem('auth_token', access_token);
        localStorage.setItem('auth_user', JSON.stringify(userData));

        // Set axios default header
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

        setToken(access_token);
        setUser(userData);
    };

    const updateProfile = async (data: UpdateProfileData) => {
        if (!user) throw new Error('Not authenticated');
        
        const response = await api.put(`/users/profile/${user.uuid}`, data);
        const updatedUser = { ...user, ...response.data };
        
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
    };

    const updateAvatar = async (file: File) => {
        if (!user) throw new Error('Not authenticated');
        
        const formData = new FormData();
        formData.append('avatar', file);
        
        const response = await api.post(`/users/avatar/${user.uuid}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        const updatedUser = { ...user, avatarUrl: response.data.avatarUrl };
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
    };

    const updatePassword = async (oldPassword: string, newPassword: string) => {
        if (!user) throw new Error('Not authenticated');
        
        await api.post('/users/update-password', {
            uuid: user.uuid,
            opw: oldPassword,
            npw: newPassword
        });
    };

    const logout = () => {
        // Clear localStorage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');

        // Remove axios header
        delete api.defaults.headers.common['Authorization'];

        setToken(null);
        setUser(null);
    };

    const value = {
        user,
        token,
        isLoading,
        isAuthenticated: !!token,
        isAdmin: user?.role === 'admin' || user?.role === 'organizer',
        login,
        register,
        updateProfile,
        updateAvatar,
        updatePassword,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

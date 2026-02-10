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
    avatarUrl?: string;
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
    refreshUser: () => Promise<void>;
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
        // Use local API proxy to avoid mixed content (HTTPS -> HTTP) issue
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
        }

        const { access_token, user: userData } = await response.json();

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

    const refreshUser = async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/users/profile/${user.uuid}`);
            if (res.ok) {
                const freshData = await res.json();
                const updatedUser = {
                    ...user,
                    firstName: freshData.firstName || user.firstName,
                    lastName: freshData.lastName || user.lastName,
                    username: freshData.username || user.username,
                    phone: freshData.phone || user.phone,
                    avatarUrl: freshData.avatarUrl || user.avatarUrl,
                    email: freshData.email || user.email,
                    role: freshData.role || user.role,
                };
                localStorage.setItem('auth_user', JSON.stringify(updatedUser));
                setUser(updatedUser);
            }
        } catch (err) {
            console.error('Failed to refresh user:', err);
        }
    };

    const updateProfile = async (data: UpdateProfileData) => {
        if (!user) throw new Error('Not authenticated');

        const res = await fetch(`/api/users/profile/${user.uuid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to update profile');
        }

        const responseData = await res.json();
        const updatedUser = { ...user, ...responseData };
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
    };

    const updateAvatar = async (file: File) => {
        if (!user) throw new Error('Not authenticated');

        const formData = new FormData();
        formData.append('avatar', file);

        const res = await fetch(`/api/users/avatar/${user.uuid}`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to upload avatar');
        }

        const responseData = await res.json();
        const updatedUser = { ...user, avatarUrl: responseData.avatarUrl };
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
    };

    const updatePassword = async (oldPassword: string, newPassword: string) => {
        if (!user) throw new Error('Not authenticated');

        await fetch('/api/users/update-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uuid: user.uuid,
                opw: oldPassword,
                npw: newPassword,
            }),
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
        refreshUser,
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

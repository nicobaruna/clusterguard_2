'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export type UserRole = 'WARGA' | 'PIC' | 'SUPER_ADMIN';

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  house_number?: string;
};

type AuthState = {
  session: SessionUser | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signUp: (input: {
    email: string;
    password: string;
    full_name: string;
    house_number?: string;
    role?: UserRole;
  }) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
};

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      isAuthenticated: false,
      signIn: async (email, password) => {
        if (isDemoMode) {
          const fallback = {
            id: 'demo-user',
            email,
            full_name: email.split('@')[0] || 'Warga',
            role: 'WARGA' as UserRole,
            house_number: 'Blok A-12',
          };

          set({ session: fallback, isAuthenticated: true });
          return { ok: true };
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
          return { ok: false, message: error?.message || 'Login failed' };
        }

        const nextSession = {
          id: data.user.id,
          email: data.user.email ?? email,
          full_name: data.user.user_metadata?.full_name ?? 'Pengguna',
          role: (data.user.user_metadata?.role ?? 'WARGA') as UserRole,
          house_number: data.user.user_metadata?.house_number,
        };

        set({ session: nextSession, isAuthenticated: true });
        return { ok: true };
      },
      signUp: async ({ email, password, full_name, house_number, role = 'WARGA' }) => {
        if (isDemoMode) {
          const fallback = {
            id: `demo-${Date.now()}`,
            email,
            full_name,
            role,
            house_number,
          };

          set({ session: fallback, isAuthenticated: true });
          return { ok: true };
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name,
              house_number,
              role,
            },
          },
        });

        if (error || !data.user) {
          return { ok: false, message: error?.message || 'Sign up failed' };
        }

        const nextSession = {
          id: data.user.id,
          email: data.user.email ?? email,
          full_name: full_name || 'Pengguna',
          role,
          house_number,
        };

        set({ session: nextSession, isAuthenticated: true });
        return { ok: true };
      },
      signOut: async () => {
        if (!isDemoMode) {
          await supabase.auth.signOut();
        }

        set({ session: null, isAuthenticated: false });
      },
    }),
    {
      name: 'cluster-guard-auth',
      partialize: (state) => ({
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

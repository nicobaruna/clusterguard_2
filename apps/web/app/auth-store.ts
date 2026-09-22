'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { isEmailLoginAllowed, loginMismatchMessage, type UserRole } from './auth-policy';

type SessionUser = { id: string; email: string; fullName: string; role: UserRole; phone?: string; houseNumber?: string };

type AuthState = {
  user: SessionUser | null;
  initialize: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<string | null>;
  signUp: (input: { phone: string; password: string; fullName: string; houseNumber: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      initialize: async () => {
        if (!supabase) {
          set({ user: null });
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          set({ user: null });
          return;
        }
        const { data: profile, error } = await supabase
          .from('users')
          .select('full_name, phone_number, house_number, role')
          .eq('id', data.session.user.id)
          .single();
        if (error || !profile) {
          await supabase.auth.signOut();
          set({ user: null });
          return;
        }
        set({
          user: {
            id: data.session.user.id,
            email: data.session.user.email ?? '',
            fullName: profile.full_name,
            role: profile.role as UserRole,
            phone: profile.phone_number ?? undefined,
            houseNumber: profile.house_number ?? undefined,
          },
        });
      },
      signIn: async (identifier, password) => {
        if (!supabase) return 'Konfigurasi Supabase belum tersedia.';
        const credentials = identifier.includes('@')
          ? { email: identifier, password }
          : { phone: identifier, password };
        const { data, error } = await supabase.auth.signInWithPassword(credentials);
        if (error || !data.user) return error?.message ?? 'Login gagal.';

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('full_name, phone_number, house_number, role')
          .eq('id', data.user.id)
          .single();
        if (profileError || !profile) {
          await supabase.auth.signOut();
          return 'Profil pengguna tidak ditemukan.';
        }

        const role = profile.role as UserRole;
        if (!isEmailLoginAllowed(identifier, role)) {
          await supabase.auth.signOut();
          return loginMismatchMessage(role);
        }

        set({
          user: {
            id: data.user.id,
            email: data.user.email ?? '',
            fullName: profile.full_name,
            role,
            phone: profile.phone_number ?? undefined,
            houseNumber: profile.house_number ?? undefined,
          },
        });
        return null;
      },
      signUp: async ({ phone, password, fullName, houseNumber }) => {
        if (!supabase) return 'Konfigurasi Supabase belum tersedia.';
        const { data, error } = await supabase.auth.signUp({
          phone,
          password,
          options: { data: { full_name: fullName, house_number: houseNumber } },
        });
        if (error || !data.user) return error?.message ?? 'Registrasi gagal.';
        return 'Registrasi berhasil. Periksa SMS konfirmasi jika diminta.';
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
        set({ user: null });
      },
    }),
    {
      name: 'clusterguard-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

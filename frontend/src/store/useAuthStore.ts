import { create } from "zustand";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

// Update these with your actual Supabase project values
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

interface AuthStore {
  supabase: SupabaseClient | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  init: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  supabase: null,
  user: null,
  loading: false,
  initialized: false,

  init: () => {
    if (get().initialized) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn("Supabase credentials not configured in .env");
      set({ initialized: true });
      return;
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    set({ supabase, initialized: true });
    // Check session on init
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) set({ user: data.session.user });
    });
    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null });
    });
  },

  signIn: async (email, password) => {
    const { supabase } = get();
    if (!supabase) throw new Error("Supabase not initialized");
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) throw error;
  },

  signUp: async (email, password) => {
    const { supabase } = get();
    if (!supabase) throw new Error("Supabase not initialized");
    set({ loading: true });
    const { error } = await supabase.auth.signUp({ email, password });
    set({ loading: false });
    if (error) throw error;
  },

  signOut: async () => {
    const { supabase } = get();
    await supabase?.auth.signOut();
    set({ user: null });
  },
}));

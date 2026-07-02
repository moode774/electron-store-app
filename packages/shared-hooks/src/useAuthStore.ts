import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { TABLES, USER_ROLES, type UserRole } from '@marketplace/shared-utils';
import type { User } from '@marketplace/shared-types';

// ---- State Interface ----------------------------------------
interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  initialize: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<{ error: string | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface SignUpParams {
  phone: string;
  fullName: string;
  role: UserRole;
}

// ---- Phone-as-identity helpers ------------------------------
// المستخدم يكتب رقم هاتفه فقط، ونحوّله داخلياً لحساب بريد/كلمة مرور
// لأن مزوّد البريد مُفعّل في Supabase (لا يحتاج SMS أو تكلفة)، وينتج جلسة JWT حقيقية
const phoneDigits = (phone: string): string => phone.replace(/\D/g, '');
const phoneToEmail = (phone: string): string => `u${phoneDigits(phone)}@levi-phone.app`;
const phoneToPassword = (phone: string): string => `Levi-${phoneDigits(phone)}-auth`;

// تسجيل دخول خام بالبريد/كلمة المرور المشتقّين من الهاتف (بدون set/refresh)
// يُستخدم لكسر التكرار المتبادل بين signInWithPhone و signUp
const rawPhoneSignIn = (phone: string) =>
  supabase.auth.signInWithPassword({ email: phoneToEmail(phone), password: phoneToPassword(phone) });

// ---- Store -------------------------------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,

  // Initialize: listen to session changes
  initialize: async (): Promise<void> => {
    // Get existing session
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      await get().refreshUser();
    }

    set({ isLoading: false });

    // Listen for changes
    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      set({ session: newSession });
      if (newSession) {
        await get().refreshUser();
      } else {
        set({ user: null, role: null, isAuthenticated: false });
      }
    });
  },

  // تسجيل دخول مستخدم موجود برقم هاتفه (يكمل المصادقة مباشرة بدون OTP)
  signInWithPhone: async (phone: string): Promise<{ error: string | null }> => {
    const { data, error } = await rawPhoneSignIn(phone);
    if (error) {
      // لا يوجد حساب بهذا الرقم → أنشئ حساب عميل تلقائياً (تسجيل بالهاتف)
      // التاجر/المندوب يُنشئان حسابهما عبر شاشة التسجيل باختيار الدور.
      return get().signUp({ phone, fullName: 'مستخدم', role: USER_ROLES.CUSTOMER });
    }
    if (!data.session) return { error: 'فشل تسجيل الدخول' };
    set({ session: data.session });
    await get().refreshUser();
    return { error: null };
  },

  // الإبقاء على verifyOtp للتوافق (غير مستخدم في تدفّق الهاتف الحالي)
  verifyOtp: async (phone: string, token: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'لم يتم إنشاء الجلسة' };
    set({ session: data.session });
    await get().refreshUser();
    return { error: null };
  },

  // Email + Password
  signInWithEmail: async (email: string, password: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'فشل تسجيل الدخول' };

    set({ session: data.session });
    await get().refreshUser();
    return { error: null };
  },

  // إنشاء حساب جديد بالهاتف + الاسم + الدور (يدخل مباشرة بعد الإنشاء)
  // يُنشأ سجل المستخدم في قاعدة البيانات تلقائياً عبر refreshUser من البيانات الوصفية
  signUp: async ({ phone, fullName, role }: SignUpParams): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password: phoneToPassword(phone),
      options: { data: { full_name: fullName, role, phone } },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already been registered')) {
        // الحساب موجود مسبقاً → سجّل الدخول مباشرة (بدون المرور عبر signInWithPhone لتفادي التكرار)
        const { data: d2, error: e2 } = await rawPhoneSignIn(phone);
        if (e2 || !d2.session) return { error: 'هذا الرقم مسجّل مسبقاً. تعذّر تسجيل الدخول، حاول مجدداً.' };
        set({ session: d2.session });
        await get().refreshUser();
        return { error: null };
      }
      return { error: error.message };
    }

    if (!data.session) {
      // GoTrue لم يُرجع الجلسة مباشرة، لكن الحساب مؤكّد عبر trigger → سجّل الدخول فوراً
      const { data: d3, error: e3 } = await rawPhoneSignIn(phone);
      if (e3 || !d3.session) return { error: 'تم إنشاء الحساب. سجّل الدخول الآن.' };
      set({ session: d3.session });
      await get().refreshUser();
      return { error: null };
    }

    set({ session: data.session });
    await get().refreshUser();
    return { error: null };
  },

  // Sign out
  signOut: async (): Promise<void> => {
    await supabase.auth.signOut();
    set({ session: null, user: null, role: null, isAuthenticated: false });
  },

  // Load user profile from DB
  refreshUser: async (): Promise<void> => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data, error } = await supabase
      .from(TABLES.USERS)
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !data) {
      // Create user record if first login
      const meta = authUser.user_metadata as { full_name?: string; role?: string; phone?: string };
      const { error: insertError } = await supabase.from(TABLES.USERS).insert({
        id: authUser.id,
        phone: meta.phone ?? authUser.phone ?? null,
        email: null,
        full_name: meta.full_name ?? 'مستخدم جديد',
        role: (meta.role as UserRole) ?? USER_ROLES.CUSTOMER,
      });
      if (insertError) {
        console.error('Failed to create user record:', insertError);
        set({ isAuthenticated: false, isLoading: false, session: null });
        return;
      }
      await get().refreshUser();
      return;
    }

    const dbUser = data as User;
    set({
      user: dbUser,
      role: dbUser.role,
      isAuthenticated: true,
    });
  },
}));

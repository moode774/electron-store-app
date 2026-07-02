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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password: phoneToPassword(phone),
    });
    if (error) {
      return { error: 'لا يوجد حساب بهذا الرقم، أو الرقم غير صحيح. الرجاء إنشاء حساب جديد.' };
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
        // الحساب موجود مسبقاً → سجّل الدخول مباشرة
        return get().signInWithPhone(phone);
      }
      return { error: error.message };
    }

    if (!data.session) {
      // GoTrue لم يُرجع الجلسة مباشرة، لكن الحساب مؤكّد عبر trigger → سجّل الدخول فوراً
      return get().signInWithPhone(phone);
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

    // 1) قراءة سجل المستخدم. عادةً يكون موجوداً لأن trigger `handle_new_user`
    //    ينشئه لحظة التسجيل. نعيد المحاولة قليلاً تحسّباً لتأخّر الـ trigger.
    const fetchRow = async () => supabase
      .from(TABLES.USERS)
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    let { data, error } = await fetchRow();
    if (!data && !error) {
      await new Promise((r) => setTimeout(r, 400));
      ({ data, error } = await fetchRow());
    }

    // 2) إن غاب السجل رغم ذلك، ننشئه بأنفسنا (سياسة users_insert_self تسمح
    //    بإدراج سجل يملك نفس auth.uid()). ثم نقرأه مجدداً.
    if (!data) {
      const meta = authUser.user_metadata as { full_name?: string; role?: string; phone?: string };
      const { error: insertError } = await supabase.from(TABLES.USERS).insert({
        id: authUser.id,
        phone: meta.phone ?? authUser.phone ?? null,
        email: null,
        full_name: meta.full_name ?? 'مستخدم جديد',
        role: (meta.role as UserRole) ?? USER_ROLES.CUSTOMER,
      });
      // نتجاهل تعارض المفتاح (23505) لأنه يعني أن السجل أُنشئ بالتوازي عبر الـ trigger
      if (insertError && (insertError as { code?: string }).code !== '23505') {
        console.error('Failed to create user record:', insertError);
        // لا نُتلف الجلسة الصالحة: نُبقيها ليتمكّن المستخدم من إعادة المحاولة
        set({ isLoading: false });
        return;
      }
      ({ data } = await fetchRow());
      if (!data) {
        set({ isLoading: false });
        return;
      }
    }

    const dbUser = data as User;
    set({
      user: dbUser,
      role: dbUser.role,
      isAuthenticated: true,
      isLoading: false,
    });
  },
}));

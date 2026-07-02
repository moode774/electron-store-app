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
  // يرسل رمز OTP عبر SMS لرقم موجود (تسجيل دخول)
  signInWithPhone: (phone: string) => Promise<{ error: string | null }>;
  // يرسل رمز OTP عبر SMS مع بيانات الحساب (إنشاء حساب جديد)
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  // يتحقق من رمز OTP ويُنشئ الجلسة
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  refreshUser: () => Promise<void>;
}

interface SignUpParams {
  phone: string;
  fullName: string;
  role: UserRole;
}

// ---- Phone normalization ------------------------------------
// يُطبّع الرقم إلى صيغة E.164 (مطلوبة لمزوّد SMS في Supabase Auth)
const normalizePhone = (phone: string): string => {
  const cleaned = phone.trim().replace(/\s/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  // إزالة صفر البداية المحلي ثم إضافة مفتاح الدولة الافتراضي
  return `+966${cleaned.replace(/^0+/, '')}`;
};

// ---- Store -------------------------------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,

  // Initialize: listen to session changes
  initialize: async (): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      set({ session });
      await get().refreshUser();
    }

    set({ isLoading: false });

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      set({ session: newSession });
      if (newSession) {
        await get().refreshUser();
      } else {
        set({ user: null, role: null, isAuthenticated: false });
      }
    });
  },

  // إرسال رمز التحقق (OTP) عبر SMS لتسجيل الدخول برقم موجود.
  // ملاحظة تشغيلية: يتطلب تفعيل مزوّد SMS (Twilio/Vonage…) في لوحة Supabase → Auth → Phone.
  signInWithPhone: async (phone: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizePhone(phone),
      options: { shouldCreateUser: false },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('signups not allowed') || msg.includes('not found') || msg.includes('user not')) {
        return { error: 'لا يوجد حساب بهذا الرقم. الرجاء إنشاء حساب جديد.' };
      }
      return { error: 'تعذّر إرسال رمز التحقق. تحقّق من الرقم وحاول مجدداً.' };
    }
    return { error: null };
  },

  // إنشاء حساب جديد: يرسل OTP مع بيانات الحساب (الاسم/الدور) التي تُخزَّن في user_metadata.
  // يُنشأ سجل المستخدم في جدول users عبر trigger handle_new_user بعد التحقق.
  signUp: async ({ phone, fullName, role }: SignUpParams): Promise<{ error: string | null }> => {
    // منع التصعيد: العميل لا يستطيع إنشاء حساب admin عبر التسجيل
    const safeRole: UserRole = role === USER_ROLES.ADMIN ? USER_ROLES.CUSTOMER : role;
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizePhone(phone),
      options: {
        shouldCreateUser: true,
        data: { full_name: fullName, role: safeRole },
      },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') || msg.includes('registered')) {
        // الحساب موجود مسبقاً → أرسل رمز دخول عادي
        return get().signInWithPhone(phone);
      }
      return { error: 'تعذّر إرسال رمز التحقق. تحقّق من الرقم وحاول مجدداً.' };
    }
    return { error: null };
  },

  // التحقق من رمز OTP الحقيقي وإنشاء الجلسة
  verifyOtp: async (phone: string, token: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizePhone(phone),
      token,
      type: 'sms',
    });
    if (error) return { error: 'الرمز غير صحيح أو انتهت صلاحيته' };
    if (!data.session) return { error: 'لم يتم إنشاء الجلسة' };
    set({ session: data.session });
    await get().refreshUser();
    return { error: null };
  },

  // Email + Password (للأدمن/الاستخدامات الداخلية)
  signInWithEmail: async (email: string, password: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'فشل تسجيل الدخول' };

    set({ session: data.session });
    await get().refreshUser();
    return { error: null };
  },

  // Sign out
  signOut: async (): Promise<void> => {
    await supabase.auth.signOut();
    set({ session: null, user: null, role: null, isAuthenticated: false });
  },

  // حذف الحساب نهائياً (مطلب إلزامي في متاجر التطبيقات).
  // يستدعي دالة آمنة تحذف سجلات المستخدم ثم حساب المصادقة، وتسجّل الخروج.
  deleteAccount: async (): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { error: 'تعذّر حذف الحساب. حاول لاحقاً أو تواصل مع الدعم.' };
    await get().signOut();
    return { error: null };
  },

  // Load user profile from DB
  refreshUser: async (): Promise<void> => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      set({ isAuthenticated: false });
      return;
    }

    const { data, error } = await supabase
      .from(TABLES.USERS)
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !data) {
      // احتياط: إن لم يُنشئ الـ trigger السجل بعد، أنشئه من البيانات الوصفية.
      // ملاحظة: حقل الدور محمي في قاعدة البيانات ولا يمكن تصعيده لاحقاً من العميل.
      const meta = authUser.user_metadata as { full_name?: string; role?: string; phone?: string };
      const requestedRole = (meta.role as UserRole) ?? USER_ROLES.CUSTOMER;
      const safeRole: UserRole = requestedRole === USER_ROLES.ADMIN ? USER_ROLES.CUSTOMER : requestedRole;
      const { error: insertError } = await supabase.from(TABLES.USERS).insert({
        id: authUser.id,
        phone: meta.phone ?? authUser.phone ?? null,
        email: authUser.email ?? null,
        full_name: meta.full_name ?? 'مستخدم جديد',
        role: safeRole,
      });
      if (insertError) {
        console.error('Failed to create user record:', insertError.message);
        set({ isAuthenticated: false, isLoading: false });
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

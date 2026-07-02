import { supabase } from './supabaseClient';
import { TABLES } from '@marketplace/shared-utils';

// ============================================================
// ADMIN API — يعمل فقط لحسابات الدور 'admin' (تفرضه RLS + الدوال الآمنة)
// ============================================================

export interface AdminStats {
  users: number;
  merchants: number;
  pending_merchants: number;
  delivery: number;
  orders: number;
  orders_today: number;
  revenue: number;
  open_refunds: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats');
  if (error) throw error;
  return data as AdminStats;
}

export interface AdminUser {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export async function adminListUsers(search?: string, limit = 50): Promise<AdminUser[]> {
  let q = supabase
    .from(TABLES.USERS)
    .select('id, full_name, phone, email, role, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (search && search.trim()) {
    const t = search.trim();
    q = q.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data as AdminUser[];
}

export async function adminSetUserActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user: userId, p_active: active });
  if (error) throw error;
}

export interface AdminMerchant {
  id: string;
  store_name: string;
  city: string | null;
  is_approved: boolean;
  rating: number;
  created_at: string;
}

export async function adminListMerchants(onlyPending = false, limit = 50): Promise<AdminMerchant[]> {
  let q = supabase
    .from(TABLES.MERCHANT_PROFILES)
    .select('id, store_name, city, is_approved, rating, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (onlyPending) q = q.eq('is_approved', false);
  const { data, error } = await q;
  if (error) throw error;
  return data as AdminMerchant[];
}

export async function adminSetMerchantApproval(merchantId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_merchant_approval', { p_merchant: merchantId, p_approved: approved });
  if (error) throw error;
}

export interface AdminOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number | null;
  created_at: string;
  merchant_profiles?: { store_name: string } | null;
}

export async function adminListOrders(status?: string, limit = 50): Promise<AdminOrder[]> {
  let q = supabase
    .from(TABLES.ORDERS)
    .select('id, order_number, status, total_amount, created_at, merchant_profiles(store_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as AdminOrder[];
}

export interface AdminRefund {
  id: string;
  order_id: string;
  reason: string;
  status: string;
  amount: number;
  created_at: string;
}

export async function adminListRefunds(limit = 50): Promise<AdminRefund[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, order_id, reason, status, amount, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as AdminRefund[];
}

export async function adminSetRefundStatus(refundId: string, status: 'approved' | 'rejected' | 'processed'): Promise<void> {
  const { error } = await supabase.from('refund_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', refundId);
  if (error) throw error;
}

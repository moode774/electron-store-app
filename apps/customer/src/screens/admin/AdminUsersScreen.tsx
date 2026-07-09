import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Platform
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminUsers, AdminUser,
  getAdminUserDetails, AdminUserDetails,
  adminBlockUser, adminUnblockUser, adminSetUserActive, adminUpdateUser,
} from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
};

const ROLE_FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'customer', label: 'عملاء' },
  { key: 'merchant', label: 'تجار' },
  { key: 'delivery', label: 'سائقون' },
  { key: 'admin', label: 'مدراء' },
];

const ROLE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  customer: { label: 'عميل', color: UI.info, bg: '#EFF6FF', icon: 'person' },
  merchant: { label: 'تاجر', color: UI.success, bg: '#ECFDF5', icon: 'storefront' },
  delivery: { label: 'سائق', color: '#8B5CF6', bg: '#F5F3FF', icon: 'bicycle' },
  admin: { label: 'مدير', color: UI.danger, bg: '#FEF2F2', icon: 'shield-checkmark' },
};

const BLOCK_DURATIONS = [
  { hours: 24, label: '24 ساعة' },
  { hours: 72, label: '3 أيام' },
  { hours: 168, label: 'أسبوع' },
  { hours: 720, label: 'شهر' },
];

// ترجمة أحداث سجل التحركات
const ACTIVITY_LABELS: Record<string, string> = {
  order_created: 'أنشأ طلباً',
  order_pending: 'طلب قيد الانتظار',
  order_preparing: 'طلب قيد التجهيز',
  order_ready: 'طلب جاهز',
  order_on_the_way: 'طلب في الطريق',
  order_delivered: 'تم تسليم طلبه',
  order_cancelled: 'أُلغي طلبه',
  review_created: 'كتب تقييماً',
  support_ticket_created: 'فتح تذكرة دعم',
  refund_requested: 'طلب استرجاعاً',
  complaint_created: 'قدّم شكوى',
  wallet_credit: 'إيداع في المحفظة',
  wallet_debit: 'خصم من المحفظة',
  blocked_permanent: '🚫 حُظر نهائياً',
  blocked_temporary: '⏳ حُظر مؤقتاً',
  unblocked: '✅ فُك حظره',
  deactivated: '⛔ عُطّل حسابه',
  activated: '✅ فُعّل حسابه',
};

type UserStatus = { label: string; color: string; bg: string };

const userStatus = (u: AdminUser): UserStatus => {
  if (u.is_blocked) return { label: 'محظور نهائياً', color: UI.danger, bg: '#FEF2F2' };
  if (u.blocked_until && new Date(u.blocked_until) > new Date())
    return { label: 'حظر مؤقت', color: UI.warning, bg: '#FFFBEB' };
  if (!u.is_active) return { label: 'معطّل', color: UI.textMuted, bg: '#F1F5F9' };
  return { label: 'نشط', color: UI.success, bg: '#ECFDF5' };
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAdminUsers(roleFilter || undefined);
      setUsers(data);
    } catch { Alert.alert('خطأ', 'فشل تحميل المستخدمين'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [roleFilter]);

  useEffect(() => { setLoading(true); load(); }, [roleFilter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const openDetails = async (u: AdminUser) => {
    setSelected(u);
    setDetails(null);
    setBlockReason('');
    setShowEdit(false);
    setEditName(u.full_name ?? '');
    setEditPhone(u.phone ?? '');
    setDetailsLoading(true);
    try {
      const d = await getAdminUserDetails(u.id);
      setDetails(d);
    } catch { Alert.alert('خطأ', 'فشل تحميل تفاصيل المستخدم'); }
    finally { setDetailsLoading(false); }
  };

  const closeModal = () => { setSelected(null); setDetails(null); };

  const refreshAfterAction = async () => {
    await load();
    if (selected) {
      try {
        const d = await getAdminUserDetails(selected.id);
        setDetails(d);
        const fresh = (await getAdminUsers(roleFilter || undefined)).find(x => x.id === selected.id);
        if (fresh) setSelected(fresh);
      } catch { /* ignore */ }
    }
  };

  const doAction = async (fn: () => Promise<void>, successMsg: string) => {
    setProcessing(true);
    try {
      await fn();
      await refreshAfterAction();
      Alert.alert('تم', successMsg);
    } catch { Alert.alert('خطأ', 'فشلت العملية'); }
    finally { setProcessing(false); }
  };

  const confirmAction = (title: string, message: string, action: () => void, destructive = false) => {
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: destructive ? 'destructive' : 'default', onPress: action },
    ]);
  };

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  );

  const renderUser = ({ item }: { item: AdminUser }) => {
    const meta = ROLE_META[item.role] ?? { label: item.role, color: UI.textMuted, bg: '#F1F5F9', icon: 'person' };
    const status = userStatus(item);
    const date = new Date(item.created_at).toLocaleDateString('ar-SA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return (
      <TouchableOpacity style={s.card} activeOpacity={0.7} onPress={() => openDetails(item)}>
        <View style={s.cardRow}>
          <View style={[s.avatar, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={22} color={meta.color} />
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName}>{item.full_name}</Text>
            <View style={s.userPhoneRow}>
              <Ionicons name="call-outline" size={12} color={UI.textMuted} />
              <Text style={s.userPhone}>{item.phone ?? 'غير متوفر'}</Text>
            </View>
            <Text style={s.userDate}>تاريخ الانضمام: {date}</Text>
          </View>
          <View style={s.badgeCol}>
            <View style={[s.roleBadge, { backgroundColor: meta.bg }]}>
              <Text style={[s.roleText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={[s.roleBadge, { backgroundColor: status.bg }]}>
              <Text style={[s.roleText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const counts = ROLE_FILTERS.map(f => ({
    key: f.key,
    count: f.key === '' ? users.length : users.filter(u => u.role === f.key).length,
  }));

  // ---------- تفاصيل المستخدم (المودال) ----------
  const renderDetailsModal = () => {
    if (!selected) return null;
    const status = userStatus(selected);
    const isAdminUser = selected.role === 'admin';
    const isBlocked = selected.is_blocked || (selected.blocked_until && new Date(selected.blocked_until) > new Date());
    const st = details?.stats;

    return (
      <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Header */}
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={closeModal} style={s.modalClose}>
                <Ionicons name="close" size={24} color={UI.text} />
              </TouchableOpacity>
              <View style={{ alignItems: 'flex-end', flex: 1 }}>
                <Text style={s.modalTitle}>{selected.full_name}</Text>
                <Text style={[s.modalStatus, { color: status.color }]}>{status.label}
                  {selected.blocked_until && new Date(selected.blocked_until) > new Date() ? ` حتى ${fmtDate(selected.blocked_until)}` : ''}
                </Text>
              </View>
            </View>

            {detailsLoading ? (
              <View style={{ padding: 40 }}><ActivityIndicator size="large" color={UI.primary} /></View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>

                {/* معلومات أساسية */}
                <Section title="المعلومات الأساسية" icon="information-circle-outline">
                  <InfoRow label="الهاتف" value={selected.phone ?? '—'} />
                  <InfoRow label="الدور" value={ROLE_META[selected.role]?.label ?? selected.role} />
                  <InfoRow label="البريد الداخلي" value={details?.auth?.email ?? '—'} />
                  <InfoRow label="آخر دخول" value={fmtDate(details?.auth?.last_sign_in_at)} />
                  <InfoRow label="تاريخ التسجيل" value={fmtDate(selected.created_at)} />
                  {selected.blocked_reason ? <InfoRow label="سبب الحظر" value={selected.blocked_reason} danger /> : null}
                </Section>

                {/* إحصائيات */}
                {st && (
                  <Section title="الإحصائيات" icon="stats-chart-outline">
                    <View style={s.statsGrid}>
                      <StatBox label="الطلبات" value={String(st.orders_count)} />
                      <StatBox label="إجمالي الإنفاق" value={`${Number(st.total_spent).toFixed(0)} ر.س`} />
                      <StatBox label="طلبات ملغاة" value={String(st.cancelled_orders)} />
                      <StatBox label="التقييمات" value={String(st.reviews_count)} />
                      <StatBox label="الشكاوى" value={String(st.complaints_count)} />
                      <StatBox label="الاسترجاعات" value={String(st.refunds_count)} />
                    </View>
                  </Section>
                )}

                {/* بروفايل حسب الدور */}
                {details?.profile && selected.role === 'merchant' && (
                  <Section title="بيانات المتجر" icon="storefront-outline">
                    <InfoRow label="المتجر" value={details.profile.store_name} />
                    <InfoRow label="المدينة" value={details.profile.city ?? '—'} />
                    <InfoRow label="معتمد" value={details.profile.is_approved ? 'نعم' : 'لا'} />
                    <InfoRow label="رصيد المحفظة" value={`${details.profile.wallet_balance ?? 0} ر.س`} />
                  </Section>
                )}
                {details?.profile && selected.role === 'delivery' && (
                  <Section title="بيانات المندوب" icon="bicycle-outline">
                    <InfoRow label="المركبة" value={details.profile.vehicle_type ?? '—'} />
                    <InfoRow label="اللوحة" value={details.profile.vehicle_plate ?? '—'} />
                    <InfoRow label="معتمد" value={details.profile.is_approved ? 'نعم' : 'لا'} />
                    <InfoRow label="متصل الآن" value={details.profile.is_online ? 'نعم' : 'لا'} />
                    <InfoRow label="التوصيلات" value={String(details.profile.total_deliveries ?? 0)} />
                    <InfoRow label="رصيد المحفظة" value={`${details.profile.wallet_balance ?? 0} ر.س`} />
                  </Section>
                )}
                {details?.profile && selected.role === 'customer' && (
                  <Section title="بيانات العميل" icon="person-outline">
                    <InfoRow label="نقاط الولاء" value={String(details.profile.loyalty_points ?? 0)} />
                    <InfoRow label="رصيد المحفظة" value={`${details.profile.wallet_balance ?? 0} ر.س`} />
                  </Section>
                )}

                {/* ======= أدوات السيطرة ======= */}
                {!isAdminUser && (
                  <Section title="أدوات التحكم" icon="shield-half-outline">

                    {/* تعديل البيانات */}
                    <TouchableOpacity style={s.editToggle} onPress={() => setShowEdit(!showEdit)}>
                      <Ionicons name={showEdit ? 'chevron-up' : 'create-outline'} size={18} color={UI.primary} />
                      <Text style={s.editToggleText}>تعديل البيانات</Text>
                    </TouchableOpacity>
                    {showEdit && (
                      <View style={s.editBox}>
                        <TextInput style={s.input} value={editName} onChangeText={setEditName} placeholder="الاسم الكامل" textAlign="right" />
                        <TextInput style={s.input} value={editPhone} onChangeText={setEditPhone} placeholder="رقم الهاتف" textAlign="right" keyboardType="phone-pad" />
                        <ActionBtn
                          label="حفظ التعديلات" color={UI.primary} disabled={processing}
                          onPress={() => doAction(
                            () => adminUpdateUser(selected.id, { full_name: editName.trim(), phone: editPhone.trim() || undefined }),
                            'تم تحديث البيانات'
                          )}
                        />
                      </View>
                    )}

                    {/* الحظر */}
                    {!isBlocked ? (
                      <>
                        <TextInput
                          style={s.input}
                          value={blockReason}
                          onChangeText={setBlockReason}
                          placeholder="سبب الحظر (اختياري)"
                          placeholderTextColor={UI.textMuted}
                          textAlign="right"
                        />
                        <Text style={s.subLabel}>حظر مؤقت:</Text>
                        <View style={s.durationRow}>
                          {BLOCK_DURATIONS.map(d => (
                            <TouchableOpacity
                              key={d.hours}
                              style={s.durationBtn}
                              disabled={processing}
                              onPress={() => confirmAction(
                                'حظر مؤقت',
                                `حظر "${selected.full_name}" لمدة ${d.label}؟`,
                                () => doAction(() => adminBlockUser(selected.id, d.hours, blockReason.trim() || undefined), `تم الحظر لمدة ${d.label}`),
                                true
                              )}
                            >
                              <Text style={s.durationText}>{d.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <ActionBtn
                          label="🚫 حظر نهائي" color={UI.danger} disabled={processing}
                          onPress={() => confirmAction(
                            'حظر نهائي',
                            `حظر "${selected.full_name}" نهائياً؟ لن يستطيع الدخول أبداً حتى فك الحظر.`,
                            () => doAction(() => adminBlockUser(selected.id, null, blockReason.trim() || undefined), 'تم الحظر النهائي'),
                            true
                          )}
                        />
                      </>
                    ) : (
                      <ActionBtn
                        label="✅ فك الحظر" color={UI.success} disabled={processing}
                        onPress={() => confirmAction(
                          'فك الحظر',
                          `فك الحظر عن "${selected.full_name}"؟`,
                          () => doAction(() => adminUnblockUser(selected.id), 'تم فك الحظر')
                        )}
                      />
                    )}

                    {/* تفعيل / تعطيل */}
                    <ActionBtn
                      label={selected.is_active ? '⛔ تعطيل الحساب' : '✅ تفعيل الحساب'}
                      color={selected.is_active ? UI.warning : UI.success}
                      disabled={processing}
                      onPress={() => confirmAction(
                        selected.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب',
                        `${selected.is_active ? 'تعطيل' : 'تفعيل'} حساب "${selected.full_name}"؟`,
                        () => doAction(() => adminSetUserActive(selected.id, !selected.is_active), 'تم بنجاح'),
                        selected.is_active
                      )}
                    />
                  </Section>
                )}

                {/* سجل التحركات */}
                <Section title="سجل التحركات" icon="footsteps-outline">
                  {details?.activity?.length ? details.activity.map((a: any, i: number) => (
                    <View key={i} style={s.activityRow}>
                      <Text style={s.activityTime}>{fmtDate(a.created_at)}</Text>
                      <Text style={s.activityAction}>
                        {ACTIVITY_LABELS[a.action] ?? a.action}
                        {a.details?.order_number ? ` (${a.details.order_number})` : ''}
                        {a.details?.total ? ` — ${a.details.total} ر.س` : ''}
                        {a.details?.amount ? ` — ${a.details.amount} ر.س` : ''}
                      </Text>
                    </View>
                  )) : <Text style={s.emptySmall}>لا توجد تحركات مسجلة بعد</Text>}
                </Section>

                {/* آخر الطلبات */}
                <Section title="آخر الطلبات" icon="receipt-outline">
                  {details?.recent_orders?.length ? details.recent_orders.map((o: any) => (
                    <View key={o.id} style={s.activityRow}>
                      <Text style={s.activityTime}>{o.status}</Text>
                      <Text style={s.activityAction}>{o.order_number} — {o.total_amount} ر.س</Text>
                    </View>
                  )) : <Text style={s.emptySmall}>لا توجد طلبات</Text>}
                </Section>

                {/* عمليات البحث والمشاهدات */}
                <Section title="نشاط التصفح" icon="eye-outline">
                  {details?.recent_searches?.length ? (
                    <>
                      <Text style={s.subLabel}>آخر عمليات البحث:</Text>
                      {details.recent_searches.map((q: any, i: number) => (
                        <Text key={i} style={s.browsing}>🔍 "{q.query}" ({q.results_count} نتيجة)</Text>
                      ))}
                    </>
                  ) : null}
                  {details?.recent_views?.length ? (
                    <>
                      <Text style={s.subLabel}>آخر المنتجات المشاهدة:</Text>
                      {details.recent_views.map((v: any, i: number) => (
                        <Text key={i} style={s.browsing}>👁 {v.product_name}</Text>
                      ))}
                    </>
                  ) : null}
                  {!details?.recent_searches?.length && !details?.recent_views?.length && (
                    <Text style={s.emptySmall}>لا يوجد نشاط تصفح</Text>
                  )}
                </Section>

                {/* المحفظة */}
                <Section title="حركات المحفظة" icon="wallet-outline">
                  {details?.wallet_transactions?.length ? details.wallet_transactions.map((w: any, i: number) => (
                    <View key={i} style={s.activityRow}>
                      <Text style={s.activityTime}>{fmtDate(w.created_at)}</Text>
                      <Text style={s.activityAction}>{w.type === 'credit' ? '⬆️ إيداع' : '⬇️ خصم'} {w.amount} ر.س (الرصيد: {w.balance_after})</Text>
                    </View>
                  )) : <Text style={s.emptySmall}>لا توجد حركات</Text>}
                </Section>

                {/* العناوين */}
                <Section title="العناوين" icon="location-outline">
                  {details?.addresses?.length ? details.addresses.map((a: any) => (
                    <Text key={a.id} style={s.browsing}>📍 {a.label ? `${a.label}: ` : ''}{a.full_address} — {a.city}</Text>
                  )) : <Text style={s.emptySmall}>لا توجد عناوين</Text>}
                </Section>

              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <Text style={s.headerCount}>{users.length} مستخدم</Text>
          <Text style={s.headerTitle}>المستخدمين</Text>
        </View>

        {/* Search Input */}
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={20} color={UI.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="البحث برقم الهاتف أو الاسم..."
            placeholderTextColor={UI.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </View>

      <View style={s.filterRowWrap}>
        <FlatList
          horizontal
          inverted
          data={ROLE_FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          keyExtractor={f => f.key}
          renderItem={({ item: f, index }) => {
            const count = counts[index].count;
            const isActive = roleFilter === f.key;
            return (
              <TouchableOpacity
                style={[s.filterBtn, isActive && s.filterBtnActive]}
                onPress={() => setRoleFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.filterText, isActive && s.filterTextActive]}>{f.label}</Text>
                {count > 0 && (
                  <View style={[s.filterCount, isActive && s.filterCountActive]}>
                    <Text style={[s.filterCountText, isActive && s.filterCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderUser}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
               <Ionicons name="people-outline" size={48} color={UI.border} />
               <Text style={s.emptyText}>لا يوجد مستخدمون حالياً</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderDetailsModal()}
    </View>
  );
}

// ---------- مكونات مساعدة ----------
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon as any} size={18} color={UI.primary} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={s.infoRow}>
      <Text style={[s.infoValue, danger && { color: UI.danger }]}>{value}</Text>
      <Text style={s.infoLabel}>{label}</Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ActionBtn({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.actionBtn, { backgroundColor: color }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={s.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: {
    backgroundColor: UI.card,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    borderBottomWidth: 1, borderColor: UI.border,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    zIndex: 10
  },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  headerCount: { fontSize: 13, color: UI.primary, fontWeight: '700', backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: UI.bg, marginHorizontal: 20, paddingHorizontal: 16, borderRadius: 16, height: 50, borderWidth: 1, borderColor: UI.border },
  searchInput: { flex: 1, fontSize: 15, color: UI.text, fontWeight: '600' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterRow: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  filterCount: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  filterCountActive: { backgroundColor: '#FFFFFF33' },
  filterCountText: { fontSize: 11, fontWeight: '800', color: UI.text },
  filterCountTextActive: { color: '#FFFFFF' },
  list: { padding: 20, paddingTop: 6, gap: 14, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: UI.textMuted, fontWeight: '600' },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 16, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  cardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1, alignItems: 'flex-end' },
  userName: { fontSize: 16, fontWeight: '800', color: UI.text, textAlign: 'right', marginBottom: 4 },
  userPhoneRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginBottom: 4 },
  userPhone: { fontSize: 13, color: UI.textMuted, fontWeight: '600', textAlign: 'right' },
  userDate: { fontSize: 11, color: '#94A3B8', textAlign: 'right', fontWeight: '500' },
  badgeCol: { gap: 6, alignItems: 'center' },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  roleText: { fontSize: 12, fontWeight: '800' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#0F172A88', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: UI.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', minHeight: '60%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: UI.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomWidth: 1, borderColor: UI.border, gap: 12 },
  modalClose: { width: 40, height: 40, borderRadius: 14, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: UI.text, textAlign: 'right' },
  modalStatus: { fontSize: 13, fontWeight: '700', marginTop: 2, textAlign: 'right' },

  section: { backgroundColor: UI.card, marginHorizontal: 16, marginTop: 14, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: UI.text },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#F8FAFC' },
  infoLabel: { fontSize: 13, color: UI.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 13, color: UI.text, fontWeight: '700', flex: 1 },
  statsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  statBox: { backgroundColor: UI.bg, borderRadius: 14, padding: 12, minWidth: '30%', flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: UI.primary },
  statLabel: { fontSize: 11, color: UI.textMuted, fontWeight: '600', marginTop: 2 },

  editToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 8 },
  editToggleText: { fontSize: 14, fontWeight: '700', color: UI.primary },
  editBox: { gap: 10, marginBottom: 10 },
  input: { backgroundColor: UI.bg, borderRadius: 14, borderWidth: 1, borderColor: UI.border, paddingHorizontal: 14, height: 46, fontSize: 14, color: UI.text, fontWeight: '600', marginBottom: 8 },
  subLabel: { fontSize: 13, fontWeight: '700', color: UI.textMuted, textAlign: 'right', marginBottom: 8 },
  durationRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  durationBtn: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  durationText: { fontSize: 13, fontWeight: '800', color: UI.warning },
  actionBtn: { borderRadius: 16, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  actionBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  activityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderColor: '#F8FAFC', gap: 8 },
  activityAction: { fontSize: 13, color: UI.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  activityTime: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  browsing: { fontSize: 13, color: UI.text, fontWeight: '600', textAlign: 'right', paddingVertical: 4 },
  emptySmall: { fontSize: 13, color: UI.textMuted, textAlign: 'center', paddingVertical: 8 },
});

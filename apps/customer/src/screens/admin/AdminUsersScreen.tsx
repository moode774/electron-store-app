import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, RefreshControl, TextInput, Platform, useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminUsers, AdminUser,
  getAdminUserDetails, AdminUserDetails,
  adminBlockUser, adminUnblockUser, adminSetUserActive, adminUpdateUser,
} from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { translate, useTranslation } from '../../i18n';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  danger: COLORS.error,
  warning: COLORS.warning,
  info: COLORS.info,
};

const ROLE_FILTERS = [
  { key: '', labelKey: 'adminUi.all' },
  { key: 'customer', labelKey: 'adminUi.usersCustomers' },
  { key: 'merchant', labelKey: 'adminUi.usersMerchants' },
  { key: 'delivery', labelKey: 'adminUi.usersCouriers' },
  { key: 'admin', labelKey: 'adminUi.usersAdmins' },
];

const ROLE_META: Record<string, { labelKey: string; color: string; bg: string; icon: string }> = {
  customer: { labelKey: 'adminUi.roleCustomer', color: UI.primary, bg: UI.primaryLight, icon: 'person' },
  merchant: { labelKey: 'adminUi.roleMerchant', color: UI.primary, bg: UI.primaryLight, icon: 'storefront' },
  delivery: { labelKey: 'adminUi.roleCourier', color: UI.primary, bg: UI.primaryLight, icon: 'bicycle' },
  admin: { labelKey: 'adminUi.roleAdmin', color: UI.primary, bg: UI.primaryLight, icon: 'shield-checkmark' },
};

const BLOCK_DURATIONS = [
  { hours: 24, labelKey: 'adminUi.block24Hours' },
  { hours: 72, labelKey: 'adminUi.block3Days' },
  { hours: 168, labelKey: 'adminUi.blockWeek' },
  { hours: 720, labelKey: 'adminUi.blockMonth' },
];

// Activity log labels.
const ACTIVITY_LABELS: Record<string, string> = {
  order_created: 'adminUi.activityOrderCreated',
  order_pending: 'adminUi.activityOrderPending',
  order_preparing: 'adminUi.activityOrderPreparing',
  order_ready: 'adminUi.activityOrderReady',
  order_on_the_way: 'adminUi.activityOrderOnWay',
  order_delivered: 'adminUi.activityOrderDelivered',
  order_cancelled: 'adminUi.activityOrderCancelled',
  review_created: 'adminUi.activityReviewCreated',
  support_ticket_created: 'adminUi.activitySupportCreated',
  refund_requested: 'adminUi.activityRefundRequested',
  complaint_created: 'adminUi.activityComplaintCreated',
  wallet_credit: 'adminUi.activityWalletCredit',
  wallet_debit: 'adminUi.activityWalletDebit',
  blocked_permanent: 'adminUi.activityBlockedPermanent',
  blocked_temporary: 'adminUi.activityBlockedTemporary',
  unblocked: 'adminUi.activityUnblocked',
  deactivated: 'adminUi.activityDeactivated',
  activated: 'adminUi.activityActivated',
};

type UserStatus = { labelKey: string; color: string; bg: string };

const userStatus = (u: AdminUser): UserStatus => {
  if (u.is_blocked) return { labelKey: 'adminUi.userBlockedPermanent', color: UI.danger, bg: '#FEF2F2' };
  if (u.blocked_until && new Date(u.blocked_until) > new Date())
    return { labelKey: 'adminUi.userBlockedTemporary', color: UI.warning, bg: '#FFFBEB' };
  if (!u.is_active) return { labelKey: 'adminUi.userInactive', color: UI.textMuted, bg: '#F1F5F9' };
  return { labelKey: 'adminUi.active', color: UI.success, bg: '#ECFDF5' };
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString(translate('adminUi.locale'), { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const desktop = width >= BREAKPOINTS.desktop;
  const pagePadding = desktop ? 24 : 16;
  const contentWidth = Math.min(Math.max(width - (desktop ? 122 : 0) - (pagePadding * 2), 280), 1280);
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
    } catch { Alert.alert(t('adminUi.error'), t('adminUi.usersLoadFailed')); }
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
    } catch { Alert.alert(t('adminUi.error'), t('adminUi.userDetailsLoadFailed')); }
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
      Alert.alert(t('adminUi.done'), successMsg);
    } catch { Alert.alert(t('adminUi.error'), t('adminUi.operationFailed')); }
    finally { setProcessing(false); }
  };

  const confirmAction = (title: string, message: string, action: () => void, destructive = false) => {
    Alert.alert(title, message, [
      { text: t('adminUi.cancel'), style: 'cancel' },
      { text: t('adminUi.confirm'), style: destructive ? 'destructive' : 'default', onPress: action },
    ]);
  };

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  );

  const renderUser = ({ item }: { item: AdminUser }) => {
    const meta = ROLE_META[item.role] ?? { labelKey: '', color: UI.textMuted, bg: '#F1F5F9', icon: 'person' };
    const status = userStatus(item);
    const date = new Date(item.created_at).toLocaleDateString(translate('adminUi.locale'), { day: '2-digit', month: '2-digit', year: 'numeric' });
    return (
      <TouchableOpacity style={[s.card, !desktop && { padding: 14, borderRadius: 16, shadowOpacity: 0, elevation: 0 }]} activeOpacity={0.7} onPress={() => openDetails(item)}>
        <View style={s.cardRow}>
          <View style={[s.avatar, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={22} color={meta.color} />
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName}>{item.full_name}</Text>
            <View style={s.userPhoneRow}>
              <Ionicons name="call-outline" size={12} color={UI.textMuted} />
              <Text style={s.userPhone}>{item.phone ?? t('adminUi.unavailable')}</Text>
            </View>
            <Text style={s.userDate}>{t('adminUi.joinDate')}: {date}</Text>
          </View>
          <View style={s.badgeCol}>
            <View style={[s.roleBadge, { backgroundColor: meta.bg }]}>
              <Text style={[s.roleText, { color: meta.color }]}>{meta.labelKey ? t(meta.labelKey) : item.role}</Text>
            </View>
            <View style={[s.roleBadge, { backgroundColor: status.bg }]}>
              <Text style={[s.roleText, { color: status.color }]}>{t(status.labelKey)}</Text>
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

  // ---------- User details modal ----------
  const renderDetailsModal = () => {
    if (!selected) return null;
    const status = userStatus(selected);
    const isAdminUser = selected.role === 'admin';
    const isBlocked = selected.is_blocked || (selected.blocked_until && new Date(selected.blocked_until) > new Date());
    const st = details?.stats;

    return (
      <Modal visible transparent animationType="slide" onRequestClose={closeModal}>
        <View style={[s.modalOverlay, !compact && s.modalOverlayDesktop]}>
          <View style={[s.modalSheet, !compact && s.modalSheetDesktop, { width: Math.min(Math.max(width - 24, 280), 820) }]}>
            {/* Header */}
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={closeModal} style={s.modalClose}>
                <Ionicons name="close" size={24} color={UI.text} />
              </TouchableOpacity>
              <View style={{ alignItems: 'flex-end', flex: 1 }}>
                <Text style={s.modalTitle}>{selected.full_name}</Text>
                <Text style={[s.modalStatus, { color: status.color }]}>{t(status.labelKey)}
                  {selected.blocked_until && new Date(selected.blocked_until) > new Date() ? ` ${t('adminUi.until')} ${fmtDate(selected.blocked_until)}` : ''}
                </Text>
              </View>
            </View>

            {detailsLoading ? (
              <View style={{ padding: 40 }}><ActivityIndicator size="large" color={UI.primary} /></View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>

                {/* Basic information */}
                <Section title={t('adminUi.basicInformation')} icon="information-circle-outline">
                  <InfoRow label={t('adminUi.phone')} value={selected.phone ?? '—'} />
                  <InfoRow label={t('adminUi.role')} value={ROLE_META[selected.role]?.labelKey ? t(ROLE_META[selected.role].labelKey) : selected.role} />
                  <InfoRow label={t('adminUi.internalEmail')} value={details?.auth?.email ?? '—'} />
                  <InfoRow label={t('adminUi.lastSignIn')} value={fmtDate(details?.auth?.last_sign_in_at)} />
                  <InfoRow label={t('adminUi.registrationDate')} value={fmtDate(selected.created_at)} />
                  {selected.blocked_reason ? <InfoRow label={t('adminUi.blockReason')} value={selected.blocked_reason} danger /> : null}
                </Section>

                {/* Statistics */}
                {st && (
                  <Section title={t('adminUi.statistics')} icon="stats-chart-outline">
                    <View style={s.statsGrid}>
                      <StatBox label={t('adminUi.orders')} value={String(st.orders_count)} />
                      <StatBox label={t('adminUi.totalSpent')} value={`${Number(st.total_spent).toFixed(0)} ${t('adminUi.yer')}`} />
                      <StatBox label={t('adminUi.cancelledOrders')} value={String(st.cancelled_orders)} />
                      <StatBox label={t('adminUi.reviews')} value={String(st.reviews_count)} />
                      <StatBox label={t('adminUi.complaints')} value={String(st.complaints_count)} />
                      <StatBox label={t('adminUi.refunds')} value={String(st.refunds_count)} />
                    </View>
                  </Section>
                )}

                {/* Role-specific profile */}
                {details?.profile && selected.role === 'merchant' && (
                  <Section title={t('adminUi.storeData')} icon="storefront-outline">
                    <InfoRow label={t('adminUi.store')} value={details.profile.store_name} />
                    <InfoRow label={t('adminUi.city')} value={details.profile.city ?? '—'} />
                    <InfoRow label={t('adminUi.approved')} value={details.profile.is_approved ? t('adminUi.yes') : t('adminUi.no')} />
                    <InfoRow label={t('adminUi.walletBalance')} value={`${details.profile.wallet_balance ?? 0} ${t('adminUi.yer')}`} />
                  </Section>
                )}
                {details?.profile && selected.role === 'delivery' && (
                  <Section title={t('adminUi.courierData')} icon="bicycle-outline">
                    <InfoRow label={t('adminUi.vehicle')} value={details.profile.vehicle_type ?? '—'} />
                    <InfoRow label={t('adminUi.plate')} value={details.profile.vehicle_plate ?? '—'} />
                    <InfoRow label={t('adminUi.approved')} value={details.profile.is_approved ? t('adminUi.yes') : t('adminUi.no')} />
                    <InfoRow label={t('adminUi.onlineNow')} value={details.profile.is_online ? t('adminUi.yes') : t('adminUi.no')} />
                    <InfoRow label={t('adminUi.deliveries')} value={String(details.profile.total_deliveries ?? 0)} />
                    <InfoRow label={t('adminUi.walletBalance')} value={`${details.profile.wallet_balance ?? 0} ${t('adminUi.yer')}`} />
                  </Section>
                )}
                {details?.profile && selected.role === 'customer' && (
                  <Section title={t('adminUi.customerData')} icon="person-outline">
                    <InfoRow label={t('adminUi.loyaltyPoints')} value={String(details.profile.loyalty_points ?? 0)} />
                    <InfoRow label={t('adminUi.walletBalance')} value={`${details.profile.wallet_balance ?? 0} ${t('adminUi.yer')}`} />
                  </Section>
                )}

                {/* ======= Admin controls ======= */}
                {!isAdminUser && (
                  <Section title={t('adminUi.controlTools')} icon="shield-half-outline">

                    {/* Edit data */}
                    <TouchableOpacity style={s.editToggle} onPress={() => setShowEdit(!showEdit)}>
                      <Ionicons name={showEdit ? 'chevron-up' : 'create-outline'} size={18} color={UI.primary} />
                      <Text style={s.editToggleText}>{t('adminUi.editData')}</Text>
                    </TouchableOpacity>
                    {showEdit && (
                      <View style={s.editBox}>
                        <TextInput style={s.input} value={editName} onChangeText={setEditName} placeholder={t('adminUi.fullName')} textAlign={translate('adminUi.locale') === 'ar-SA' ? 'right' : 'left'} />
                        <TextInput style={s.input} value={editPhone} onChangeText={setEditPhone} placeholder={t('adminUi.phoneNumber')} textAlign={translate('adminUi.locale') === 'ar-SA' ? 'right' : 'left'} keyboardType="phone-pad" />
                        <ActionBtn
                          label={t('adminUi.saveChanges')} color={UI.primary} disabled={processing}
                          onPress={() => doAction(
                            () => adminUpdateUser(selected.id, { full_name: editName.trim(), phone: editPhone.trim() || undefined }),
                            t('adminUi.dataUpdated')
                          )}
                        />
                      </View>
                    )}

                    {/* Blocking */}
                    {!isBlocked ? (
                      <>
                        <TextInput
                          style={s.input}
                          value={blockReason}
                          onChangeText={setBlockReason}
                          placeholder={t('adminUi.blockReasonOptional')}
                          placeholderTextColor={UI.textMuted}
                          textAlign={translate('adminUi.locale') === 'ar-SA' ? 'right' : 'left'}
                        />
                        <Text style={s.subLabel}>{t('adminUi.temporaryBlock')}:</Text>
                        <View style={s.durationRow}>
                          {BLOCK_DURATIONS.map(d => (
                            <TouchableOpacity
                              key={d.hours}
                              style={s.durationBtn}
                              disabled={processing}
                              onPress={() => confirmAction(
                                t('adminUi.temporaryBlock'),
                                `${t('adminUi.blockUserPrefix')} "${selected.full_name}" ${t('adminUi.forDuration')} ${t(d.labelKey)}?`,
                                () => doAction(() => adminBlockUser(selected.id, d.hours, blockReason.trim() || undefined), `${t('adminUi.blockedFor')} ${t(d.labelKey)}`),
                                true
                              )}
                            >
                              <Text style={s.durationText}>{d.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <ActionBtn
                          label={t('adminUi.blockPermanent')} color={UI.danger} disabled={processing}
                          onPress={() => confirmAction(
                            t('adminUi.blockPermanentTitle'),
                            `${t('adminUi.blockPermanentConfirmPrefix')} "${selected.full_name}"? ${t('adminUi.blockPermanentConfirmSuffix')}`,
                            () => doAction(() => adminBlockUser(selected.id, null, blockReason.trim() || undefined), t('adminUi.blockPermanentSuccess')),
                            true
                          )}
                        />
                      </>
                    ) : (
                      <ActionBtn
                        label={t('adminUi.unblock')} color={UI.success} disabled={processing}
                        onPress={() => confirmAction(
                          t('adminUi.unblockTitle'),
                          `${t('adminUi.unblockConfirm')} "${selected.full_name}"?`,
                          () => doAction(() => adminUnblockUser(selected.id), t('adminUi.unblockSuccess'))
                        )}
                      />
                    )}

                    {/* Activation */}
                    <ActionBtn
                      label={selected.is_active ? t('adminUi.deactivateAccount') : t('adminUi.activateAccount')}
                      color={selected.is_active ? UI.warning : UI.success}
                      disabled={processing}
                      onPress={() => confirmAction(
                        selected.is_active ? t('adminUi.deactivateAccountTitle') : t('adminUi.activateAccountTitle'),
                        `${selected.is_active ? t('adminUi.deactivate') : t('adminUi.activate')} ${t('adminUi.accountOf')} "${selected.full_name}"?`,
                        () => doAction(() => adminSetUserActive(selected.id, !selected.is_active), t('adminUi.operationSuccess')),
                        selected.is_active
                      )}
                    />
                  </Section>
                )}

                {/* Activity log */}
                <Section title={t('adminUi.activityLog')} icon="footsteps-outline">
                  {details?.activity?.length ? details.activity.map((a: any, i: number) => (
                    <View key={i} style={s.activityRow}>
                      <Text style={s.activityTime}>{fmtDate(a.created_at)}</Text>
                      <Text style={s.activityAction}>
                        {ACTIVITY_LABELS[a.action] ? t(ACTIVITY_LABELS[a.action]) : a.action}
                        {a.details?.order_number ? ` (${a.details.order_number})` : ''}
                        {a.details?.total ? ` — ${a.details.total} ${t('adminUi.yer')}` : ''}
                        {a.details?.amount ? ` — ${a.details.amount} ${t('adminUi.yer')}` : ''}
                      </Text>
                    </View>
                  )) : <Text style={s.emptySmall}>{t('adminUi.noActivity')}</Text>}
                </Section>

                {/* Latest orders */}
                <Section title={t('adminUi.latestOrders')} icon="receipt-outline">
                  {details?.recent_orders?.length ? details.recent_orders.map((o: any) => (
                    <View key={o.id} style={s.activityRow}>
                      <Text style={s.activityTime}>{o.status}</Text>
                      <Text style={s.activityAction}>{o.order_number} — {o.total_amount} {t('adminUi.yer')}</Text>
                    </View>
                  )) : <Text style={s.emptySmall}>{t('adminUi.noOrders')}</Text>}
                </Section>

                {/* Browsing activity */}
                <Section title={t('adminUi.browsingActivity')} icon="eye-outline">
                  {details?.recent_searches?.length ? (
                    <>
                      <Text style={s.subLabel}>{t('adminUi.recentSearches')}:</Text>
                      {details.recent_searches.map((q: any, i: number) => (
                        <Text key={i} style={s.browsing}>🔍 "{q.query}" ({q.results_count} {t('adminUi.results')})</Text>
                      ))}
                    </>
                  ) : null}
                  {details?.recent_views?.length ? (
                    <>
                      <Text style={s.subLabel}>{t('adminUi.recentViewedProducts')}:</Text>
                      {details.recent_views.map((v: any, i: number) => (
                        <Text key={i} style={s.browsing}>👁 {v.product_name}</Text>
                      ))}
                    </>
                  ) : null}
                  {!details?.recent_searches?.length && !details?.recent_views?.length && (
                    <Text style={s.emptySmall}>{t('adminUi.noBrowsingActivity')}</Text>
                  )}
                </Section>

                {/* Wallet */}
                <Section title={t('adminUi.walletTransactions')} icon="wallet-outline">
                  {details?.wallet_transactions?.length ? details.wallet_transactions.map((w: any, i: number) => (
                    <View key={i} style={s.activityRow}>
                      <Text style={s.activityTime}>{fmtDate(w.created_at)}</Text>
                      <Text style={s.activityAction}>{w.type === 'credit' ? t('adminUi.deposit') : t('adminUi.debit')} {w.amount} {t('adminUi.yer')} ({t('adminUi.balance')}: {w.balance_after})</Text>
                    </View>
                  )) : <Text style={s.emptySmall}>{t('adminUi.noTransactions')}</Text>}
                </Section>

                {/* Addresses */}
                <Section title={t('adminUi.addresses')} icon="location-outline">
                  {details?.addresses?.length ? details.addresses.map((a: any) => (
                    <Text key={a.id} style={s.browsing}>📍 {a.label ? `${a.label}: ` : ''}{a.full_address} — {a.city}</Text>
                  )) : <Text style={s.emptySmall}>{t('adminUi.noAddresses')}</Text>}
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
      <View style={[s.header, !desktop && { paddingTop: Platform.OS === 'web' ? 18 : 52, paddingBottom: 14 }]}>
        <View style={[s.headerContent, { width: contentWidth, paddingHorizontal: 0 }]}>
          <Text style={s.headerCount}>{users.length} {t('adminUi.usersCount')}</Text>
          <Text style={s.headerTitle}>{t('adminUi.users')}</Text>
        </View>

        {/* Search Input */}
        <View style={[s.searchBox, { width: contentWidth }]}>
          <Ionicons name="search-outline" size={20} color={UI.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder={t('adminUi.searchUsersPlaceholder')}
            placeholderTextColor={UI.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign={translate('adminUi.locale') === 'ar-SA' ? 'right' : 'left'}
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
                <Text style={[s.filterText, isActive && s.filterTextActive]}>{t(f.labelKey)}</Text>
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
          key={`users-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={i => i.id}
          renderItem={renderUser}
          contentContainerStyle={[s.list, { paddingHorizontal: 0, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
               <Ionicons name="people-outline" size={48} color={UI.border} />
               <Text style={s.emptyText}>{t('adminUi.noUsers')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderDetailsModal()}
    </View>
  );
}

// ---------- Helper components ----------
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
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 10, elevation: 1,
    zIndex: 10
  },
  headerContent: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, color: UI.text },
  headerCount: { fontSize: 13, color: UI.primary, fontFamily: FONTS.semiBold, backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' },
  searchBox: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: UI.card, paddingHorizontal: 16, borderRadius: 13, minHeight: 50, borderWidth: 1, borderColor: UI.border },
  searchInput: { flex: 1, fontSize: 16, color: UI.text, fontFamily: FONTS.medium },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 8 },
  filterRow: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  filterCount: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  filterCountActive: { backgroundColor: '#FFFFFF33' },
  filterCountText: { fontSize: 11, fontWeight: '800', color: UI.text },
  filterCountTextActive: { color: '#FFFFFF' },
  list: { alignSelf: 'center', paddingTop: 8, gap: 12, paddingBottom: 24 },
  columnRow: { gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: UI.textMuted, fontWeight: '600' },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: 20, padding: 16, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.02, shadowRadius: 12, elevation: 1, borderWidth: 1, borderColor: UI.border },
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
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  modalOverlayDesktop: { justifyContent: 'center', padding: 24 },
  modalSheet: { backgroundColor: UI.bg, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '92%', minHeight: '60%' },
  modalSheetDesktop: { borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: UI.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomWidth: 1, borderColor: UI.border, gap: 12 },
  modalClose: { width: 44, height: 44, borderRadius: 13, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
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

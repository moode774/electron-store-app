import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, Modal, Image, Linking,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import {
  getAdminDrivers,
  approveDriver,
  AdminDriver,
  getDeliveryOnboardingDocumentLinks,
} from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv } from '@marketplace/shared-i18n';

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
};

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'بانتظار الموافقة' },
  { key: 'approved', label: 'معتمد' },
] as const;

const VEHICLE_LABELS: Record<string, string> = {
  pickup: 'بيك أب',
  motorcycle: 'دراجة نارية',
  car: 'سيارة',
  bicycle: 'دراجة هوائية',
  truck: 'شاحنة',
};

function reviewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/complete core profile fields/i.test(message)) {
    return 'لا يمكن اعتماد المندوب قبل اكتمال الاسم ورقم الهوية ونوع المركبة واللوحة ومدينة العمل.';
  }
  if (/both stored delivery documents|external verification note/i.test(message)) {
    return 'يلزم وجود صورتي الهوية والرخصة معًا، أو ملاحظة تحقق خارجي واضحة لا تقل عن 20 حرفًا.';
  }
  if (/document is missing or not owned|invalid delivery document/i.test(message)) {
    return 'تعذر على الخادم التحقق من ملف الهوية أو الرخصة. أعد رفع المستندات أو وثّق تحققًا خارجيًا لا يقل عن 20 حرفًا.';
  }
  if (/application changed since review|revision/i.test(message)) {
    return 'عدّل المندوب بياناته أو مستنداته أثناء المراجعة. أُعيد تحميل الطلب؛ افتحه وراجع النسخة الجديدة قبل القرار.';
  }
  return message || 'لم تتغير حالة المندوب.';
}

export default function AdminDeliveryScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ visible: boolean; driver: AdminDriver | null; approve: boolean; reason: string }>({ visible: false, driver: null, approve: true, reason: '' });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [documentLinks, setDocumentLinks] = useState<Array<{ path: string; signedUrl: string }>>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const documentGeneration = useRef(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await getAdminDrivers(filter);
      setDrivers(data);
    } catch (e) {
      console.error('Failed to load delivery profiles:', e);
      setLoadError('تعذر تحميل بيانات المندوبين. تحقق من الاتصال ثم أعد المحاولة.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);
  useEffect(() => () => { documentGeneration.current += 1; }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = (driver: AdminDriver, approve: boolean) => {
    const generation = ++documentGeneration.current;
    setReviewModal({ visible: true, driver, approve, reason: '' });
    setDocumentLinks([]);
    setDocumentsError(null);
    setDocumentsLoading(false);
    const paths = [driver.national_id_image_path, driver.license_image_path]
      .filter((path): path is string => !!path);
    if (!paths.length) return;
    setDocumentsLoading(true);
    getDeliveryOnboardingDocumentLinks(paths)
      .then((links) => {
        if (generation === documentGeneration.current) setDocumentLinks(links);
      })
      .catch((error) => {
        if (generation === documentGeneration.current) {
          console.error('Failed to sign delivery onboarding documents:', error);
          setDocumentsError('تعذّر فتح أحد المستندات الخاصة؛ استخدم تحققًا خارجيًا موثقًا أو اطلب إعادة الرفع.');
        }
      })
      .finally(() => {
        if (generation === documentGeneration.current) setDocumentsLoading(false);
      });
  };

  const closeReview = () => {
    documentGeneration.current += 1;
    setReviewModal({ visible: false, driver: null, approve: true, reason: '' });
    setDocumentLinks([]);
    setDocumentsError(null);
    setDocumentsLoading(false);
  };

  const submitReview = async () => {
    const { driver, approve, reason } = reviewModal;
    if (!driver || processing) return;
    const cleanReason = reason.trim();
    const hasExternalVerification = cleanReason.length >= 20;
    const hasBothDocumentPaths = !!driver.national_id_image_path && !!driver.license_image_path;
    if (!approve && !cleanReason) {
      Alert.alert('سبب الرفض مطلوب', 'اكتب سبباً واضحاً ليتمكن المندوب من تصحيح طلبه.');
      return;
    }
    if (approve && !hasBothDocumentPaths && !hasExternalVerification) {
      Alert.alert('توثيق التحقق الخارجي مطلوب', 'لا تكتمل صورتا الهوية والرخصة؛ اكتب ملاحظة لا تقل عن 20 حرفًا توضّح كيف تحققت منهما خارج التطبيق.');
      return;
    }
    if (approve && (documentsLoading || documentsError) && !hasExternalVerification) {
      Alert.alert('المستندات لم تُراجع', 'انتظر تحميل المستندات أو أعد فتح الطلب قبل الاعتماد.');
      return;
    }
    setProcessing(driver.id);
    try {
      await approveDriver(driver.id, approve, driver.application_revision, cleanReason || undefined);
      setDrivers((current) => current.map((item) => item.id === driver.id ? { ...item, is_approved: approve } : item));
      closeReview();
      Alert.alert('تم حفظ المراجعة', approve ? 'تم اعتماد المندوب بعد مراجعة البيانات المعروضة.' : 'تم رفض الطلب وتسجيل السبب.');
    } catch (e) {
      console.error('Failed to review delivery application:', e);
      if (/application changed since review|revision/i.test(e instanceof Error ? e.message : String(e ?? ''))) {
        closeReview();
        await load();
      }
      Alert.alert('تعذر حفظ المراجعة', reviewErrorMessage(e));
    } finally {
      setProcessing(null);
    }
  };

  const filtered = drivers.filter(d => {
    const name = (d.users as any)?.full_name ?? '';
    const phone = (d.users as any)?.phone ?? '';
    return name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search);
  });

  const renderDriver = ({ item }: { item: AdminDriver }) => {
    const name = (item.users as any)?.full_name ?? 'غير متوفر';
    const phone = (item.users as any)?.phone ?? 'غير متوفر';
    const vehicle = VEHICLE_LABELS[item.vehicle_type ?? ''] ?? item.vehicle_type ?? 'غير محدد';
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.avatar}>
            <Ionicons name="bicycle" size={24} color={UI.primary} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.driverName}>{tv(name)}</Text>
            <View style={s.infoRow}>
              <Ionicons name="call-outline" size={12} color={UI.textMuted} />
              <Text style={s.phoneText}>{tv(phone)}</Text>
            </View>
            <View style={s.vehicleRow}>
              <Ionicons name="car-sport-outline" size={13} color={UI.textMuted} />
              <Text style={s.vehicleText}>{tv(vehicle)}</Text>
              {item.vehicle_plate && <Text style={s.plateText}>{tv(item.vehicle_plate)}</Text>}
            </View>
          </View>
          <View style={[s.statusBadge, { backgroundColor: item.is_approved ? '#ECFDF5' : '#FFFBEB' }]}>
            <Text style={[s.statusText, { color: item.is_approved ? UI.success : UI.warning }]}>
              {tv(item.is_approved ? t('معتمد') : t('انتظار'))}
            </Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{tv(item.total_deliveries)}</Text>
            <Text style={s.statLabel}>{t('عدد التوصيلات')}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: UI.success }]}>{tv(item.wallet_balance.toFixed(2))}</Text>
            <Text style={s.statLabel}>{t('الرصيد المتاح (ر.ي)')}</Text>
          </View>
        </View>

        {processing === item.id ? (
          <View style={s.actionsRow}><ActivityIndicator size="small" color={UI.primary} /></View>
        ) : !item.is_approved ? (
          <View style={s.actionsRow}>
            <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(item, true)} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={s.approveBtnText}>{t('موافقة')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.rejectBtn} onPress={() => handleApprove(item, false)} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={18} color={UI.danger} />
              <Text style={s.rejectBtnText}>{t('رفض')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.actionsRow}>
            <View style={s.approvedRow}>
              <Ionicons name="shield-checkmark" size={18} color={UI.success} />
              <Text style={s.approvedText}>{t('تمت الموافقة وهو نشط في المنصة')}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={[s.headerContent, { width: contentWidth }]}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{t('السائقين')}</Text>
          </View>
          <Text style={s.headerCount}>{t('{0} سائق', [tv(drivers.length)])}</Text>
        </View>

        <View style={[s.searchBox, { width: contentWidth }]}>
          <Ionicons name="search-outline" size={20} color={UI.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder={t('البحث بالاسم أو الهاتف...')}
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
          data={FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          keyExtractor={f => f.key}
          renderItem={({ item: f }) => {
            const isActive = filter === f.key;
            return (
              <TouchableOpacity
                style={[s.filterBtn, isActive && s.filterBtnActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.filterText, isActive && s.filterTextActive]}>{tv(f.label)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : loadError ? (
        <View style={s.center} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={48} color={UI.danger} />
          <Text style={s.errorText}>{tv(loadError)}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }} accessibilityRole="button"><Text style={s.retryText}>{t('إعادة المحاولة')}</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          key={`delivery-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={i => i.id}
          renderItem={renderDriver}
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
               <Ionicons name="bicycle-outline" size={48} color={UI.border} />
               <Text style={s.emptyText}>{t('لا يوجد سائقون لعرضهم')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={reviewModal.visible} transparent animationType="fade" onRequestClose={() => !processing && closeReview()} accessibilityViewIsModal>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { width: Math.min(Math.max(width - 24, 280), 460) }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{tv(reviewModal.approve ? t('مراجعة واعتماد المندوب') : t('رفض طلب اعتماد المندوب'))}</Text>
              <TouchableOpacity onPress={closeReview} disabled={!!processing} accessibilityRole="button" accessibilityLabel={t('إغلاق مراجعة المندوب')}><Ionicons name="close" size={22} color={UI.textMuted} /></TouchableOpacity>
            </View>
            {reviewModal.driver && (() => {
              const driver = reviewModal.driver as AdminDriver & Record<string, any>;
              return <View style={s.verificationBox}>
                <Text style={s.verificationTitle}>{tv((driver.users as any)?.full_name ?? t('مندوب غير معروف'))}</Text>
                <Text style={s.verificationRow}>{t('الهاتف: {0}', [(driver.users as any)?.phone ?? 'غير متوفر'])}</Text>
                <Text style={s.verificationRow}>{t('رقم الهوية: {0}', [driver.national_id || 'غير مرفق'])}</Text>
                <Text style={s.verificationRow}>{t('نوع المركبة: {0}', [VEHICLE_LABELS[driver.vehicle_type ?? ''] ?? driver.vehicle_type ?? 'غير محدد'])}</Text>
                <Text style={s.verificationRow}>{t('رقم اللوحة: {0}', [driver.vehicle_plate || 'غير مرفق'])}</Text>
                <Text style={s.verificationRow}>{t('مدينة العمل: {0}', [driver.work_city || 'غير محددة'])}</Text>
                <Text style={s.verificationRow}>{t('نسخة الطلب: {0}', [tv(driver.application_revision)])}</Text>
                {documentsLoading && <ActivityIndicator size="small" color={UI.primary} />}
                {!!documentsError && <Text style={s.documentsError}>{tv(documentsError)}</Text>}
                {documentLinks.length > 0 && (
                  <View style={s.documentsRow}>
                    {documentLinks.map((document) => (
                      <TouchableOpacity
                        key={document.path}
                        style={s.documentCard}
                        onPress={() => void Linking.openURL(document.signedUrl)}
                        accessibilityRole="link"
                      >
                        <Image source={{ uri: document.signedUrl }} style={s.documentImage} />
                        <Text style={s.documentLabel}>
                          {tv(document.path.includes('national-id-') ? t('صورة الهوية') : t('رخصة القيادة'))}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {(!driver.national_id_image_path || !driver.license_image_path) && (
                  <View style={s.evidenceWarning}><Ionicons name="warning-outline" size={17} color={UI.warning} /><Text style={s.evidenceWarningText}>{t('يلزم وجود صورتي الهوية والرخصة معًا. عند غياب أي منهما، وثّق طريقة التحقق الخارجي في ملاحظة لا تقل عن 20 حرفًا.')}</Text></View>
                )}
              </View>;
            })()}
            <TextInput
              style={s.reviewInput}
              value={reviewModal.reason}
              onChangeText={(reason) => setReviewModal((current) => ({ ...current, reason }))}
              placeholder={reviewModal.approve ? t('ملاحظة تحقق خارجي (20 حرفًا عند غياب أي مستند)...') : t('سبب الرفض (مطلوب)...')}
              placeholderTextColor={UI.textMuted}
              multiline
              textAlign="right"
              accessibilityLabel={t('ملاحظات مراجعة المندوب')}
            />
            {reviewModal.approve && <Text style={s.reviewHint}>{t('المستندان الكاملان يسمحان بالاعتماد دون ملاحظة؛ وإلا فالملاحظة الخارجية إلزامية ({0}/20).', [tv(reviewModal.reason.trim().length)])}</Text>}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={closeReview} disabled={!!processing}><Text style={s.modalCancelText}>{t('تراجع')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalConfirm, !reviewModal.approve && { backgroundColor: UI.danger }]} onPress={submitReview} disabled={!!processing}>
                {processing ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalConfirmText}>{tv(reviewModal.approve ? t('اعتماد بعد المراجعة') : t('تأكيد الرفض'))}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  headerContent: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, color: UI.text },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  headerCount: { fontSize: 13, color: UI.primary, fontFamily: FONTS.semiBold, backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, overflow: 'hidden' },
  searchBox: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: UI.bg, paddingHorizontal: 16, borderRadius: RADIUS.md, minHeight: 50, borderWidth: 1, borderColor: UI.border },
  searchInput: { flex: 1, fontSize: 15, color: UI.text, fontFamily: FONTS.medium },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterRow: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { alignSelf: 'center', paddingTop: 6, gap: 16, paddingBottom: 112 },
  columnRow: { gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: UI.textMuted, fontFamily: FONTS.medium },
  errorText: { color: UI.danger, fontFamily: FONTS.semiBold, textAlign: 'center', lineHeight: 22 },
  retryBtn: { backgroundColor: UI.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFF', fontFamily: FONTS.bold },
  card: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 18, gap: 14, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: UI.border },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, alignItems: 'flex-end' },
  driverName: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right', marginBottom: 6 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginBottom: 4 },
  phoneText: { fontSize: 13, color: UI.textMuted, marginTop: 2, textAlign: 'right', fontFamily: FONTS.medium },
  vehicleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  vehicleText: { fontSize: 13, color: UI.textMuted, fontFamily: FONTS.medium },
  plateText: { fontSize: 11, color: UI.text, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontFamily: FONTS.bold },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, fontFamily: FONTS.bold },
  statsRow: { flexDirection: 'row-reverse', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: UI.border },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontFamily: FONTS.bold, color: UI.text },
  statLabel: { fontSize: 12, color: UI.textMuted, marginTop: 4, fontFamily: FONTS.medium },
  statDivider: { width: 1, backgroundColor: UI.border, marginVertical: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center', justifyContent: 'center' },
  approveBtn: { flex: 1, minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: UI.success, borderRadius: RADIUS.md, paddingVertical: 10, shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  approveBtnText: { fontSize: 14, fontFamily: FONTS.semiBold, color: '#FFFFFF' },
  rejectBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#FEE2E2' },
  rejectBtnText: { fontSize: 14, fontFamily: FONTS.semiBold, color: UI.danger },
  approvedRow: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ECFDF5', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  approvedText: { fontSize: 14, fontFamily: FONTS.bold, color: UI.success },
  modalOverlay: { flex: 1, backgroundColor: '#0F172A80', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { maxWidth: 460, maxHeight: '90%', backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 22 },
  modalHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: UI.text, fontSize: 18, fontFamily: FONTS.bold, textAlign: 'right', flex: 1 },
  verificationBox: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: UI.border, borderRadius: 14, padding: 14, gap: 7 },
  verificationTitle: { color: UI.text, fontSize: 16, fontFamily: FONTS.bold, textAlign: 'right', marginBottom: 3 },
  verificationRow: { color: '#334155', fontSize: 13, fontFamily: FONTS.medium, textAlign: 'right' },
  evidenceWarning: { flexDirection: 'row-reverse', gap: 7, alignItems: 'flex-start', backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10, marginTop: 5 },
  evidenceWarningText: { flex: 1, color: '#92400E', fontSize: 12, lineHeight: 19, textAlign: 'right', fontFamily: FONTS.semiBold },
  documentsRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  documentCard: { flex: 1, borderWidth: 1, borderColor: UI.border, borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  documentImage: { width: '100%', height: 92, backgroundColor: '#E2E8F0' },
  documentLabel: { color: UI.primary, fontSize: 12, fontFamily: FONTS.bold, padding: 8, textAlign: 'center' },
  documentsError: { color: UI.danger, fontSize: 12, fontFamily: FONTS.semiBold, textAlign: 'right' },
  reviewInput: { minHeight: 100, borderWidth: 1, borderColor: UI.border, borderRadius: 14, backgroundColor: '#F8FAFC', color: UI.text, padding: 14, textAlignVertical: 'top', marginTop: 14 },
  reviewHint: { color: UI.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 13, alignItems: 'center' },
  modalCancelText: { color: UI.textMuted, fontFamily: FONTS.bold },
  modalConfirm: { flex: 2, backgroundColor: UI.success, borderRadius: 12, padding: 13, alignItems: 'center' },
  modalConfirmText: { color: '#FFF', fontFamily: FONTS.bold },
});

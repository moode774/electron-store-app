import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  createIdempotencyKey,
  getAdminLegacyFinancialReconciliationQueue,
  LegacyFinancialReconciliationCandidate,
  LegacyReconciliationStatsState,
  reconcileLegacyDeliveredOrder,
} from '@marketplace/shared-hooks';

const C = {
  primary: '#1E3A8A',
  primarySoft: '#EEF2FF',
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  danger: '#B91C1C',
  dangerSoft: '#FEF2F2',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  success: '#047857',
  successSoft: '#ECFDF5',
};

const CONFLICT_LABELS: Record<string, string> = {
  new_order_requires_incident_investigation: 'الطلب جديد ويحتاج تحقيق عطل، وليس تسوية تاريخية.',
  delivery_assignment_missing: 'تعيين المندوب أو حسابه غير مكتمل.',
  merchant_profile_missing: 'ملف التاجر المرتبط غير مكتمل.',
  customer_role_relationship_invalid: 'صاحب الطلب ليس مرتبطًا بدور عميل صحيح.',
  merchant_role_relationship_invalid: 'مالك ملف المتجر ليس مرتبطًا بدور تاجر صحيح.',
  delivery_role_relationship_invalid: 'مالك ملف المندوب ليس مرتبطًا بدور توصيل صحيح.',
  order_payment_already_refunded: 'حالة دفع الطلب مستردة؛ يمنع إنشاء تسوية جديدة.',
  completed_refund_or_reversal_exists: 'يوجد استرداد مكتمل أو قيد عكسي مالي؛ يمنع إنشاء تسوية جديدة.',
  settled_timestamp_without_settlement: 'يوجد وقت تسوية بلا سجل تسوية؛ يلزم فحص يدوي.',
  wallet_transactions_already_exist: 'توجد حركات محفظة سابقة مرتبطة بالطلب.',
  delivery_earning_already_exists: 'يوجد ربح توصيل سابق مرتبط بالطلب.',
  ledger_entries_already_exist: 'توجد قيود محاسبية سابقة مرتبطة بالطلب.',
  cod_collection_already_exists: 'يوجد تحصيل نقدي سابق مرتبط بالطلب.',
  order_financial_components_unbalanced: 'مكونات الطلب المالية غير متوازنة.',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار تأكيد الدفع',
  paid: 'مدفوع',
  refunded: 'مسترد',
};

type FormState = {
  deliveredAt: string;
  gross: string;
  merchant: string;
  delivery: string;
  commission: string;
  tax: string;
  statsState: LegacyReconciliationStatsState | '';
  acknowledgeCod: boolean;
  evidence: string;
  reason: string;
  confirmOrderNumber: string;
};

function amount(value: number) {
  return Number(value || 0).toFixed(2);
}

function initialForm(item: LegacyFinancialReconciliationCandidate): FormState {
  return {
    deliveredAt: item.stored_delivered_at ?? '',
    gross: amount(item.gross_amount),
    merchant: amount(item.merchant_proceeds),
    delivery: amount(item.delivery_earning),
    commission: amount(item.platform_commission),
    tax: amount(item.tax_amount),
    statsState: '',
    acknowledgeCod: false,
    evidence: '',
    reason: '',
    confirmOrderNumber: '',
  };
}

export default function AdminFinancialReconciliationScreen({ navigation }: any) {
  const [items, setItems] = useState<LegacyFinancialReconciliationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LegacyFinancialReconciliationCandidate | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeys = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setItems(await getAdminLegacyFinancialReconciliationQueue());
    } catch (error) {
      console.error('Failed to load legacy reconciliation queue:', error);
      setLoadError('تعذر تحميل طلبات المطابقة المالية. لم تُجرَ أي تغييرات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = (item: LegacyFinancialReconciliationCandidate) => {
    if (!item.is_reconcilable) return;
    if (!idempotencyKeys.current[item.order_id]) {
      idempotencyKeys.current[item.order_id] = createIdempotencyKey();
    }
    setSelected(item);
    setForm(initialForm(item));
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const submit = async () => {
    if (!selected || !form || submitting) return;
    if (form.confirmOrderNumber.trim() !== selected.order_number) {
      Alert.alert('رقم الطلب غير مطابق', 'اكتب رقم الطلب الظاهر كما هو لتأكيد أنك تراجع السجل الصحيح.');
      return;
    }
    const deliveredAt = new Date(form.deliveredAt);
    if (!form.deliveredAt.trim() || Number.isNaN(deliveredAt.getTime())) {
      Alert.alert('وقت التسليم مطلوب', 'أدخل وقتًا صحيحًا بصيغة ISO، مثال: 2026-07-10T14:30:00+03:00');
      return;
    }
    const values = [form.gross, form.merchant, form.delivery, form.commission, form.tax].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      Alert.alert('المبالغ غير صالحة', 'راجع جميع المبالغ ولا تترك أي مبلغ فارغًا أو سالبًا.');
      return;
    }
    const [gross, merchant, delivery, commission, tax] = values;
    if (Math.abs(gross - merchant - delivery - commission - tax) > 0.01) {
      Alert.alert('المبالغ غير متوازنة', 'يجب أن يساوي الإجمالي مستحق التاجر + التوصيل + العمولة + الضريبة.');
      return;
    }
    if (!form.statsState) {
      Alert.alert('قرار الإحصاءات مطلوب', 'حدد هل أضيف الطلب سابقًا إلى عدادات التاجر والمندوب أم لا.');
      return;
    }
    if (selected.cod_custody_requires_review && !form.acknowledgeCod) {
      Alert.alert('إقرار التحصيل النقدي مطلوب', 'أكد أن التحصيل سيبقى معلقًا حتى يرسل المندوب إثبات الحوالة وتراجعه الإدارة.');
      return;
    }
    if (form.evidence.trim().length < 5 || form.reason.trim().length < 20) {
      Alert.alert('الدليل والسبب مطلوبان', 'أدخل مرجع دليل واضح وسبب مراجعة لا يقل عن 20 حرفًا.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await reconcileLegacyDeliveredOrder({
        orderId: selected.order_id,
        confirmOrderNumber: form.confirmOrderNumber,
        confirmedDeliveredAt: deliveredAt.toISOString(),
        grossAmount: gross,
        merchantProceeds: merchant,
        deliveryEarning: delivery,
        platformCommission: commission,
        taxAmount: tax,
        statsState: form.statsState,
        acknowledgeCodCustody: form.acknowledgeCod,
        evidenceReference: form.evidence,
        reason: form.reason,
        idempotencyKey: idempotencyKeys.current[selected.order_id],
      });
      delete idempotencyKeys.current[selected.order_id];
      setSelected(null);
      setForm(null);
      await load();
      Alert.alert(
        'تمت المطابقة بأمان',
        result.cod_custody_requires_review
          ? 'تم إنشاء التسوية. التحصيل النقدي ما زال يحتاج إثبات حوالة من المندوب ومراجعة مستقلة من الإدارة.'
          : 'تم إنشاء التسوية والقيود والمحافظ مرة واحدة مع حفظ سجل التدقيق.',
      );
    } catch (error) {
      console.error('Legacy financial reconciliation failed:', error);
      Alert.alert(
        'لم تتم المطابقة',
        error instanceof Error ? error.message : 'رفضت قاعدة البيانات العملية ولم تغيّر الأرصدة.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: LegacyFinancialReconciliationCandidate }) => {
    const conflicts = item.conflict_reasons ?? [];
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.badge, item.is_reconcilable ? s.readyBadge : s.blockedBadge]}>
            <Text style={[s.badgeText, { color: item.is_reconcilable ? C.success : C.danger }]}>
              {item.is_reconcilable ? 'جاهز للمراجعة' : 'موقوف للفحص اليدوي'}
            </Text>
          </View>
          <View style={s.orderTitleWrap}>
            <Text style={s.orderNumber}>طلب {item.order_number}</Text>
            <Text style={s.meta}>{new Date(item.created_at).toLocaleString('ar-SA')}</Text>
          </View>
        </View>

        <View style={s.participants}>
          <Text style={s.participant}>التاجر: {item.merchant_name ?? 'غير معروف'}</Text>
          <Text style={s.participant}>المندوب: {item.delivery_name ?? 'غير معروف'}</Text>
          <Text style={s.participant}>الدفع: {PAYMENT_STATUS_LABELS[item.payment_status] ?? item.payment_status}</Text>
        </View>

        <View style={s.moneyGrid}>
          <Text style={s.money}>الإجمالي: {amount(item.gross_amount)} ر.ي</Text>
          <Text style={s.money}>التاجر: {amount(item.merchant_proceeds)} ر.ي</Text>
          <Text style={s.money}>التوصيل: {amount(item.delivery_earning)} ر.ي</Text>
          <Text style={s.money}>المنصة والضريبة: {amount(item.platform_amount)} ر.ي</Text>
        </View>

        {!item.stored_delivered_at && (
          <View style={s.warningBox}>
            <Ionicons name="time-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>وقت التسليم مفقود ويجب إدخاله من دليل موثوق.</Text>
          </View>
        )}
        {item.cod_custody_requires_review && (
          <View style={s.warningBox}>
            <Ionicons name="cash-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>طلب نقدي: التسوية لا تعني استلام الإدارة للنقد؛ إثبات الحوالة مسار منفصل.</Text>
          </View>
        )}
        {item.has_active_refund && (
          <View style={s.warningBox}>
            <Ionicons name="wallet-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>يوجد طلب استرداد مالي نشط. قد تكون التسوية الموثقة متطلبًا لمعالجته، ويجب مراجعته فور نجاح المطابقة.</Text>
          </View>
        )}
        {item.has_active_physical_return && (
          <View style={s.warningBox}>
            <Ionicons name="return-down-back-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>يوجد إرجاع فعلي نشط مرتبط بهذا الطلب؛ راجع عهدة البضاعة والفحص بعد إنشاء التسوية.</Text>
          </View>
        )}

        {conflicts.length > 0 && (
          <View style={s.conflictBox}>
            {conflicts.map((code) => (
              <Text key={code} style={s.conflictText}>• {CONFLICT_LABELS[code] ?? code}</Text>
            ))}
          </View>
        )}

        {item.is_reconcilable && (
          <TouchableOpacity style={s.reviewButton} onPress={() => open(item)} accessibilityRole="button">
            <Text style={s.reviewButtonText}>فتح المراجعة الموثقة</Text>
            <Ionicons name="shield-checkmark" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton} accessibilityRole="button">
          <Ionicons name="arrow-forward" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>مطابقة الطلبات المالية القديمة</Text>
          <Text style={s.subtitle}>لا تُنشأ أي تسوية بلا أرقام ودليل وقرار صريح عن العدادات.</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : loadError ? (
        <View style={s.center} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={48} color={C.danger} />
          <Text style={s.centerText}>{loadError}</Text>
          <TouchableOpacity style={s.retryButton} onPress={() => { setLoading(true); load(); }}>
            <Text style={s.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={(
            <View style={s.center}>
              <Ionicons name="checkmark-done-circle-outline" size={52} color={C.success} />
              <Text style={s.centerText}>لا توجد طلبات مسلّمة قديمة بلا تسوية.</Text>
            </View>
          )}
        />
      )}

      <Modal
        visible={!!selected && !!form}
        transparent
        animationType="fade"
        onRequestClose={() => !submitting && setSelected(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setSelected(null)} disabled={submitting} style={s.closeButton}>
                  <Ionicons name="close" size={22} color={C.muted} />
                </TouchableOpacity>
                <View style={s.modalTitleWrap}>
                  <Text style={s.modalTitle}>مطابقة {selected?.order_number}</Text>
                  <Text style={s.modalSubtitle}>راجع الدليل خارج التطبيق أولًا، ثم أكد البيانات هنا.</Text>
                </View>
              </View>

              <Field label="وقت التسليم المؤكد (ISO)" value={form?.deliveredAt ?? ''} onChangeText={(v) => update('deliveredAt', v)} placeholder="2026-07-10T14:30:00+03:00" />
              <View style={s.twoColumns}>
                <Field compact label="الإجمالي" value={form?.gross ?? ''} onChangeText={(v) => update('gross', v)} keyboardType="decimal-pad" />
                <Field compact label="مستحق التاجر" value={form?.merchant ?? ''} onChangeText={(v) => update('merchant', v)} keyboardType="decimal-pad" />
              </View>
              <View style={s.twoColumns}>
                <Field compact label="مستحق التوصيل" value={form?.delivery ?? ''} onChangeText={(v) => update('delivery', v)} keyboardType="decimal-pad" />
                <Field compact label="عمولة المنصة" value={form?.commission ?? ''} onChangeText={(v) => update('commission', v)} keyboardType="decimal-pad" />
              </View>
              <Field label="الضريبة" value={form?.tax ?? ''} onChangeText={(v) => update('tax', v)} keyboardType="decimal-pad" />

              <Text style={s.fieldLabel}>هل أضيفت إحصاءات الطلب سابقًا؟</Text>
              <View style={s.choiceRow}>
                <Choice selected={form?.statsState === 'already_counted'} label="نعم، محسوبة" onPress={() => update('statsState', 'already_counted')} />
                <Choice selected={form?.statsState === 'not_counted'} label="لا، غير محسوبة" onPress={() => update('statsState', 'not_counted')} />
              </View>

              {selected?.cod_custody_requires_review && (
                <TouchableOpacity
                  style={[s.ackBox, form?.acknowledgeCod && s.ackBoxSelected]}
                  onPress={() => update('acknowledgeCod', !form?.acknowledgeCod)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!form?.acknowledgeCod }}
                >
                  <Ionicons name={form?.acknowledgeCod ? 'checkbox' : 'square-outline'} size={22} color={C.primary} />
                  <Text style={s.ackText}>أقرّ أن النقد سيبقى معلقًا، ولن يُعد مستلمًا حتى يرفع المندوب إثبات الحوالة وتراجعه إدارة أخرى.</Text>
                </TouchableOpacity>
              )}

              <Field label="مرجع الدليل" value={form?.evidence ?? ''} onChangeText={(v) => update('evidence', v)} placeholder="رقم تذكرة، رابط ملف خاص، أو مرجع كشف موثوق" maxLength={1000} />
              <Field label="سبب المطابقة (20 حرفًا على الأقل)" value={form?.reason ?? ''} onChangeText={(v) => update('reason', v)} multiline maxLength={2000} />
              <Field label={`اكتب رقم الطلب للتأكيد: ${selected?.order_number ?? ''}`} value={form?.confirmOrderNumber ?? ''} onChangeText={(v) => update('confirmOrderNumber', v)} />

              <TouchableOpacity style={[s.submitButton, submitting && s.disabled]} onPress={submit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Text style={s.submitText}>تأكيد وإنشاء التسوية مرة واحدة</Text>
                    <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, compact, ...props }: React.ComponentProps<typeof TextInput> & { label: string; compact?: boolean }) {
  return (
    <View style={compact ? s.compactField : s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        style={[s.input, props.multiline && s.multiline]}
        placeholderTextColor="#94A3B8"
        textAlign="right"
      />
    </View>
  );
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.choice, selected && s.choiceSelected]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? C.primary : C.muted} />
      <Text style={[s.choiceText, selected && s.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingTop: Platform.OS === 'ios' ? 58 : 34, paddingBottom: 18, paddingHorizontal: 20, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  backButton: { padding: 6 },
  headerText: { flex: 1, alignItems: 'flex-end' },
  title: { color: C.text, fontSize: 21, fontWeight: '900', textAlign: 'right' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 4, textAlign: 'right' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  orderTitleWrap: { flex: 1, alignItems: 'flex-end' },
  orderNumber: { fontSize: 17, fontWeight: '900', color: C.text },
  meta: { color: C.muted, fontSize: 11, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  readyBadge: { backgroundColor: C.successSoft },
  blockedBadge: { backgroundColor: C.dangerSoft },
  badgeText: { fontSize: 11, fontWeight: '800' },
  participants: { alignItems: 'flex-end', gap: 4 },
  participant: { color: C.muted, fontSize: 13, textAlign: 'right' },
  moneyGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  money: { backgroundColor: '#F1F5F9', color: C.text, fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  warningBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, backgroundColor: C.warningSoft, borderRadius: 10, padding: 10 },
  warningText: { flex: 1, color: C.warning, fontSize: 12, lineHeight: 19, textAlign: 'right' },
  conflictBox: { backgroundColor: C.dangerSoft, borderRadius: 10, padding: 10, gap: 5 },
  conflictText: { color: C.danger, fontSize: 12, lineHeight: 19, textAlign: 'right' },
  reviewButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 11, paddingVertical: 12 },
  reviewButtonText: { color: '#FFFFFF', fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  centerText: { color: C.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: C.primarySoft, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: C.primary, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14, backgroundColor: 'rgba(15,23,42,0.62)' },
  modalCard: { width: '100%', maxWidth: 680, maxHeight: '92%', backgroundColor: C.card, borderRadius: 20, overflow: 'hidden' },
  modalContent: { padding: 18, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  closeButton: { padding: 5, backgroundColor: '#F1F5F9', borderRadius: 9 },
  modalTitleWrap: { flex: 1, alignItems: 'flex-end' },
  modalTitle: { color: C.text, fontSize: 20, fontWeight: '900', textAlign: 'right' },
  modalSubtitle: { color: C.muted, fontSize: 12, marginTop: 4, textAlign: 'right' },
  field: { gap: 6 },
  compactField: { flex: 1, gap: 6 },
  fieldLabel: { color: C.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, color: C.text, backgroundColor: '#FFFFFF' },
  multiline: { minHeight: 88, paddingTop: 11, textAlignVertical: 'top' },
  twoColumns: { flexDirection: 'row-reverse', gap: 10 },
  choiceRow: { flexDirection: 'row-reverse', gap: 10 },
  choice: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 11 },
  choiceSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
  choiceText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  choiceTextSelected: { color: C.primary },
  ackBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 9, borderWidth: 1, borderColor: C.border, borderRadius: 11, padding: 11 },
  ackBoxSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
  ackText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 19, textAlign: 'right' },
  submitButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, backgroundColor: C.primary, borderRadius: 11, marginTop: 4 },
  submitText: { color: '#FFFFFF', fontWeight: '900' },
  disabled: { opacity: 0.6 },
});

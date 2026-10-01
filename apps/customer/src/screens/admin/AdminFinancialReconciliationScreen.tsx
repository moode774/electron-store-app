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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  createIdempotencyKey,
  getAdminLegacyFinancialReconciliationQueue,
  LegacyFinancialReconciliationCandidate,
  LegacyReconciliationStatsState,
  reconcileLegacyDeliveredOrder,
} from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';

const C = {
  primary: COLORS.primary,
  primarySoft: COLORS.primarySoft,
  background: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  muted: COLORS.textMuted,
  border: COLORS.border,
  danger: COLORS.error,
  dangerSoft: COLORS.accentCoralSoft,
  warning: COLORS.warning,
  warningSoft: COLORS.secondarySoft,
  success: COLORS.success,
  successSoft: COLORS.accentMintSoft,
};

const CONFLICT_LABELS: Record<string, string> = {
  new_order_requires_incident_investigation: 'adminUi.reconConflictNewOrder',
  delivery_assignment_missing: 'adminUi.reconConflictDeliveryMissing',
  merchant_profile_missing: 'adminUi.reconConflictMerchantMissing',
  customer_role_relationship_invalid: 'adminUi.reconConflictCustomerRole',
  merchant_role_relationship_invalid: 'adminUi.reconConflictMerchantRole',
  delivery_role_relationship_invalid: 'adminUi.reconConflictDeliveryRole',
  order_payment_already_refunded: 'adminUi.reconConflictAlreadyRefunded',
  completed_refund_or_reversal_exists: 'adminUi.reconConflictRefundExists',
  settled_timestamp_without_settlement: 'adminUi.reconConflictTimestampWithoutSettlement',
  wallet_transactions_already_exist: 'adminUi.reconConflictWalletTransactions',
  delivery_earning_already_exists: 'adminUi.reconConflictDeliveryEarning',
  ledger_entries_already_exist: 'adminUi.reconConflictLedger',
  cod_collection_already_exists: 'adminUi.reconConflictCod',
  order_financial_components_unbalanced: 'adminUi.reconConflictUnbalanced',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'adminUi.reconPaymentPending',
  paid: 'adminUi.paymentPaid',
  refunded: 'adminUi.paymentRefunded',
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
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 20;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
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
      setLoadError(t('adminUi.reconLoadFailed'));
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
      Alert.alert(t('adminUi.reconOrderMismatch'), t('adminUi.reconOrderMismatchText'));
      return;
    }
    const deliveredAt = new Date(form.deliveredAt);
    if (!form.deliveredAt.trim() || Number.isNaN(deliveredAt.getTime())) {
      Alert.alert(t('adminUi.reconDeliveryTimeRequired'), t('adminUi.reconDeliveryTimeRequiredText'));
      return;
    }
    const values = [form.gross, form.merchant, form.delivery, form.commission, form.tax].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      Alert.alert(t('adminUi.reconInvalidAmounts'), t('adminUi.reconInvalidAmountsText'));
      return;
    }
    const [gross, merchant, delivery, commission, tax] = values;
    if (Math.abs(gross - merchant - delivery - commission - tax) > 0.01) {
      Alert.alert(t('adminUi.reconUnbalancedAmounts'), t('adminUi.reconUnbalancedAmountsText'));
      return;
    }
    if (!form.statsState) {
      Alert.alert(t('adminUi.reconStatsDecisionRequired'), t('adminUi.reconStatsDecisionText'));
      return;
    }
    if (selected.cod_custody_requires_review && !form.acknowledgeCod) {
      Alert.alert(t('adminUi.reconCodAckRequired'), t('adminUi.reconCodAckText'));
      return;
    }
    if (form.evidence.trim().length < 5 || form.reason.trim().length < 20) {
      Alert.alert(t('adminUi.reconEvidenceReasonRequired'), t('adminUi.reconEvidenceReasonText'));
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
        t('adminUi.reconSuccessTitle'),
        result.cod_custody_requires_review
          ? t('adminUi.reconSuccessCod')
          : t('adminUi.reconSuccessStandard'),
      );
    } catch (error) {
      console.error('Legacy financial reconciliation failed:', error);
      Alert.alert(
        t('adminUi.reconFailedTitle'),
        error instanceof Error ? error.message : t('adminUi.reconDatabaseRejected'),
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
              {item.is_reconcilable ? t('adminUi.reconReady') : t('adminUi.reconManualReview')}
            </Text>
          </View>
          <View style={s.orderTitleWrap}>
            <Text style={s.orderNumber}>{t('adminUi.order')} {item.order_number}</Text>
            <Text style={s.meta}>{new Date(item.created_at).toLocaleString('ar-SA')}</Text>
          </View>
        </View>

        <View style={s.participants}>
          <Text style={s.participant}>{t('adminUi.roleMerchant')}: {item.merchant_name ?? t('adminUi.unknown')}</Text>
          <Text style={s.participant}>{t('adminUi.courier')}: {item.delivery_name ?? t('adminUi.unknown')}</Text>
          <Text style={s.participant}>{t('adminUi.paymentStatus')}: {PAYMENT_STATUS_LABELS[item.payment_status] ? t(PAYMENT_STATUS_LABELS[item.payment_status]) : item.payment_status}</Text>
        </View>

        <View style={s.moneyGrid}>
          <Text style={s.money}>{t('adminUi.totalAmount')}: {amount(item.gross_amount)} {t('adminUi.yer')}</Text>
          <Text style={s.money}>{t('adminUi.roleMerchant')}: {amount(item.merchant_proceeds)} {t('adminUi.yer')}</Text>
          <Text style={s.money}>{t('adminUi.deliveryFee')}: {amount(item.delivery_earning)} {t('adminUi.yer')}</Text>
          <Text style={s.money}>{t('adminUi.reconPlatformTax')}: {amount(item.platform_amount)} {t('adminUi.yer')}</Text>
        </View>

        {!item.stored_delivered_at && (
          <View style={s.warningBox}>
            <Ionicons name="time-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>{t('adminUi.reconMissingDeliveryTime')}</Text>
          </View>
        )}
        {item.cod_custody_requires_review && (
          <View style={s.warningBox}>
            <Ionicons name="cash-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>{t('adminUi.reconCodWarning')}</Text>
          </View>
        )}
        {item.has_active_refund && (
          <View style={s.warningBox}>
            <Ionicons name="wallet-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>{t('adminUi.reconActiveRefundWarning')}</Text>
          </View>
        )}
        {item.has_active_physical_return && (
          <View style={s.warningBox}>
            <Ionicons name="return-down-back-outline" size={18} color={C.warning} />
            <Text style={s.warningText}>{t('adminUi.reconActiveReturnWarning')}</Text>
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
            <Text style={s.reviewButtonText}>{t('adminUi.reconOpenReview')}</Text>
            <Ionicons name="shield-checkmark" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingHorizontal: pagePadding + Math.max((width - contentWidth) / 2, 0) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton} accessibilityRole="button">
          <Ionicons name="arrow-forward" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>{t('adminUi.reconTitle')}</Text>
          <Text style={s.subtitle}>{t('adminUi.reconSubtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : loadError ? (
        <View style={s.center} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={48} color={C.danger} />
          <Text style={s.centerText}>{loadError}</Text>
          <TouchableOpacity style={s.retryButton} onPress={() => { setLoading(true); load(); }}>
            <Text style={s.retryText}>{t('adminUi.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          key={`reconciliation-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          renderItem={renderItem}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={(
            <View style={s.center}>
              <Ionicons name="checkmark-done-circle-outline" size={52} color={C.success} />
              <Text style={s.centerText}>{t('adminUi.reconEmpty')}</Text>
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
          <View style={[s.modalCard, { width: Math.min(Math.max(width - 24, 280), 680) }]}>
            <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setSelected(null)} disabled={submitting} style={s.closeButton}>
                  <Ionicons name="close" size={22} color={C.muted} />
                </TouchableOpacity>
                <View style={s.modalTitleWrap}>
                  <Text style={s.modalTitle}>{t('adminUi.reconModalTitle')} {selected?.order_number}</Text>
                  <Text style={s.modalSubtitle}>{t('adminUi.reconModalSubtitle')}</Text>
                </View>
              </View>

              <Field label={t('adminUi.reconConfirmedDeliveryTime')} value={form?.deliveredAt ?? ''} onChangeText={(v) => update('deliveredAt', v)} placeholder="2026-07-10T14:30:00+03:00" />
              <View style={[s.twoColumns, compact && s.stack]}>
                <Field compact label={t('adminUi.totalAmount')} value={form?.gross ?? ''} onChangeText={(v) => update('gross', v)} keyboardType="decimal-pad" />
                <Field compact label={t('adminUi.reconMerchantProceeds')} value={form?.merchant ?? ''} onChangeText={(v) => update('merchant', v)} keyboardType="decimal-pad" />
              </View>
              <View style={[s.twoColumns, compact && s.stack]}>
                <Field compact label={t('adminUi.reconDeliveryProceeds')} value={form?.delivery ?? ''} onChangeText={(v) => update('delivery', v)} keyboardType="decimal-pad" />
                <Field compact label={t('adminUi.reconPlatformCommission')} value={form?.commission ?? ''} onChangeText={(v) => update('commission', v)} keyboardType="decimal-pad" />
              </View>
              <Field label={t('adminUi.reconTax')} value={form?.tax ?? ''} onChangeText={(v) => update('tax', v)} keyboardType="decimal-pad" />

              <Text style={s.fieldLabel}>{t('adminUi.reconStatsQuestion')}</Text>
              <View style={[s.choiceRow, compact && s.stack]}>
                <Choice selected={form?.statsState === 'already_counted'} label={t('adminUi.reconStatsCounted')} onPress={() => update('statsState', 'already_counted')} />
                <Choice selected={form?.statsState === 'not_counted'} label={t('adminUi.reconStatsNotCounted')} onPress={() => update('statsState', 'not_counted')} />
              </View>

              {selected?.cod_custody_requires_review && (
                <TouchableOpacity
                  style={[s.ackBox, form?.acknowledgeCod && s.ackBoxSelected]}
                  onPress={() => update('acknowledgeCod', !form?.acknowledgeCod)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!form?.acknowledgeCod }}
                >
                  <Ionicons name={form?.acknowledgeCod ? 'checkbox' : 'square-outline'} size={22} color={C.primary} />
                  <Text style={s.ackText}>{t('adminUi.reconCodAcknowledgement')}</Text>
                </TouchableOpacity>
              )}

              <Field label={t('adminUi.reconEvidenceReference')} value={form?.evidence ?? ''} onChangeText={(v) => update('evidence', v)} placeholder={t('adminUi.reconEvidencePlaceholder')} maxLength={1000} />
              <Field label={t('adminUi.reconReasonLabel')} value={form?.reason ?? ''} onChangeText={(v) => update('reason', v)} multiline maxLength={2000} />
              <Field label={`${t('adminUi.reconConfirmOrderNumber')}: ${selected?.order_number ?? ''}`} value={form?.confirmOrderNumber ?? ''} onChangeText={(v) => update('confirmOrderNumber', v)} />

              <TouchableOpacity style={[s.submitButton, submitting && s.disabled]} onPress={submit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : (
                  <>
                    <Text style={s.submitText}>{t('adminUi.reconSubmit')}</Text>
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
  backButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted },
  headerText: { flex: 1, alignItems: 'flex-end' },
  title: { color: C.text, fontSize: 21, fontFamily: FONTS.bold, textAlign: 'right' },
  subtitle: { color: C.muted, fontSize: 12, fontFamily: FONTS.regular, marginTop: 4, textAlign: 'right' },
  list: { alignSelf: 'center', paddingTop: 12, paddingBottom: 96, gap: 12, flexGrow: 1 },
  columnRow: { gap: 12 },
  card: { flex: 1, minWidth: 0, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
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
  reviewButton: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: RADIUS.sm, paddingVertical: 10 },
  reviewButtonText: { color: '#FFFFFF', fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  centerText: { color: C.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: C.primarySoft, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 },
  retryText: { color: C.primary, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12, backgroundColor: COLORS.overlay },
  modalCard: { maxWidth: 680, maxHeight: '92%', backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
  modalContent: { padding: 18, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.sm },
  modalTitleWrap: { flex: 1, alignItems: 'flex-end' },
  modalTitle: { color: C.text, fontSize: 20, fontWeight: '900', textAlign: 'right' },
  modalSubtitle: { color: C.muted, fontSize: 12, marginTop: 4, textAlign: 'right' },
  field: { gap: 6 },
  compactField: { flex: 1, gap: 6 },
  fieldLabel: { color: C.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, color: C.text, backgroundColor: '#FFFFFF' },
  multiline: { minHeight: 88, paddingTop: 11, textAlignVertical: 'top' },
  twoColumns: { flexDirection: 'row-reverse', gap: 10 },
  stack: { flexDirection: 'column' },
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

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, Platform, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { useAuthStore, getDeliveryEarnings, getMyWithdrawalRequests, requestWithdrawal, DeliveryEarning, WithdrawalRequest, WithdrawalStatus } from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { useTranslation, translate } from '../../i18n';

const BLOCKING_WITHDRAWAL_STATUSES = new Set<WithdrawalStatus>([
  'pending',
  'approved',
  'processing',
]);

const WITHDRAWAL_STATUS_INFO: Record<WithdrawalStatus, { labelKey: string; color: string; backgroundColor: string }> = {
  pending: { labelKey: 'delivery.withdrawalPending', color: '#92400E', backgroundColor: '#FEF3C7' },
  approved: { labelKey: 'delivery.withdrawalApproved', color: COLORS.primary, backgroundColor: COLORS.primarySoft },
  processing: { labelKey: 'delivery.withdrawalProcessing', color: '#6D28D9', backgroundColor: '#EDE9FE' },
  paid: { labelKey: 'delivery.withdrawalPaid', color: '#047857', backgroundColor: '#D1FAE5' },
  rejected: { labelKey: 'delivery.withdrawalRejected', color: '#B91C1C', backgroundColor: '#FEE2E2' },
  failed: { labelKey: 'delivery.withdrawalFailed', color: '#B91C1C', backgroundColor: '#FEE2E2' },
};

function withdrawalErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/COD_FUNDS_NOT_YET_REMITTED/i.test(message)) {
    return translate('delivery.codFundsBlocked');
  }
  return message || translate('delivery.withdrawSendFailed');
}

export default function EarningsScreen() {
  const { t } = useTranslation();
  const layout = useResponsiveLayout(920);
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);
  const [history, setHistory] = useState<DeliveryEarning[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const withdrawLock = useRef(false);

  const loadEarnings = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try {
      const [result, requests] = await Promise.all([
        getDeliveryEarnings(user.id),
        getMyWithdrawalRequests(user.id),
      ]);
      setBalance(result.balance);
      setTotalDeliveries(result.totalDeliveries);
      setRecordedCount(result.recordedCount);
      setHistory(result.earnings);
      setWithdrawals(requests);
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : t('delivery.earningsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const blockingWithdrawal = withdrawals.find((request) => BLOCKING_WITHDRAWAL_STATUSES.has(request.status));
  const hasBlockingWithdrawal = Boolean(blockingWithdrawal);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadEarnings();
  }, [loadEarnings]));

  const handleWithdraw = async () => {
    if (withdrawLock.current || withdrawing) return;
    if (blockingWithdrawal) {
      Alert.alert(
        blockingWithdrawal.status === 'failed' ? t('delivery.requestNeedsReview') : t('delivery.requestProcessing'),
        blockingWithdrawal.status === 'failed'
          ? t('delivery.failedRequestText')
          : t('delivery.existingRequestText'),
      );
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { Alert.alert(t('auth.alert'), t('delivery.enterValidAmount')); return; }
    if (amount > balance) { Alert.alert(t('auth.alert'), t('delivery.amountAboveBalance')); return; }
    if (amount < 50) { Alert.alert(t('auth.alert'), `${t('delivery.minWithdrawal')} ${t('merchant.currencyYER')}`); return; }
    if (!user?.id) return;
    withdrawLock.current = true;
    setWithdrawing(true);
    try {
      await requestWithdrawal(amount, user.id);
      setShowWithdraw(false);
      setWithdrawAmount('');
      await loadEarnings();
      Alert.alert(t('delivery.requestCreated'), `${t('delivery.requestCreatedText')} ${amount} ${t('merchant.currencyYER')}`);
    } catch (error) {
      Alert.alert(t('delivery.requestWithdrawalFailed'), withdrawalErrorMessage(error));
    } finally {
      withdrawLock.current = false;
      setWithdrawing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <View><Text style={styles.headerTitle}>{t('delivery.earnings')}</Text><Text style={styles.headerSubtitle}>{t('delivery.earningsSubtitle')}</Text></View>
      </View>

      {/* Withdrawal Modal */}
      <Modal visible={showWithdraw} transparent animationType="fade" onRequestClose={() => !withdrawing && setShowWithdraw(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, layout.compact && styles.modalCardCompact]}>
            <Text style={styles.modalTitle}>{t('delivery.withdrawEarnings')}</Text>
            <Text style={styles.modalSub}>{t('delivery.currentBalance')}: <Text style={{ fontWeight: '800', color: COLORS.ink }}>{balance} ر.ي</Text></Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('delivery.amountToWithdraw')}
              placeholderTextColor="#9CA3AF"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              textAlign="right"
              editable={!withdrawing}
            />
            <TouchableOpacity
              style={[styles.modalBtn, (withdrawing || hasBlockingWithdrawal) && { opacity: 0.6 }]}
              onPress={handleWithdraw}
              disabled={withdrawing || hasBlockingWithdrawal}
              accessibilityState={{ disabled: withdrawing || hasBlockingWithdrawal }}
              activeOpacity={0.8}
            >
              {withdrawing
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.modalBtnText}>{t('delivery.sendWithdrawal')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancel, withdrawing && { opacity: 0.5 }]}
              onPress={() => { setShowWithdraw(false); setWithdrawAmount(''); }}
              disabled={withdrawing}
            >
              <Text style={styles.modalCancelText}>{t('delivery.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter }]}
        ListHeaderComponent={
          <>
            {loadError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity onPress={() => void loadEarnings()} accessibilityRole="button" accessibilityLabel={t('delivery.reloadEarnings')}>
                  <Text style={styles.retryText}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {/* Summary Card */}
            <View style={[styles.summaryCard, layout.compact && styles.summaryCardCompact]}>
              <Text style={styles.summaryLabel}>{t('delivery.currentBalanceLabel')}</Text>
              <Text style={styles.summaryValue}>{balance} ر.ي</Text>
              <View style={[styles.summaryRow, layout.compact && styles.summaryRowCompact]}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemValue}>{recordedCount}</Text>
                  <Text style={styles.summaryItemLabel}>{t('delivery.recordedDeliveries')}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemValue}>{totalDeliveries}</Text>
                  <Text style={styles.summaryItemLabel}>{t('delivery.totalDeliveries')}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.withdrawBtn, (balance < 50 || hasBlockingWithdrawal || withdrawing) && { opacity: 0.5 }]}
                onPress={() => setShowWithdraw(true)}
                activeOpacity={0.8}
                disabled={balance < 50 || hasBlockingWithdrawal || withdrawing}
                accessibilityRole="button"
                accessibilityLabel={t('delivery.withdrawEarnings')}
                accessibilityState={{ disabled: balance < 50 || hasBlockingWithdrawal || withdrawing }}
              >
                <Ionicons name="arrow-up-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.withdrawBtnText}>{t('delivery.withdrawEarnings')}</Text>
              </TouchableOpacity>
            </View>

            {withdrawals.length ? (
              <View style={styles.withdrawalSection}>
                <Text style={styles.sectionTitle}>{t('delivery.withdrawalRequests')}</Text>
                {withdrawals.slice(0, 5).map((request) => {
                  const statusInfo = WITHDRAWAL_STATUS_INFO[request.status];
                  return (
                    <View key={request.id} style={styles.withdrawalRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.withdrawalAmount}>{request.amount.toLocaleString()} ر.ي</Text>
                        <Text style={styles.withdrawalDate}>{new Date(request.created_at).toLocaleDateString('ar-EG-u-nu-latn')}</Text>
                      </View>
                      <Text
                        style={[
                          styles.withdrawalStatus,
                          { color: statusInfo.color, backgroundColor: statusInfo.backgroundColor },
                        ]}
                      >
                        {statusInfo.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>
              {t('delivery.deliveryHistory')}{recordedCount > history.length ? ` (${t('delivery.latest')} ${history.length} ${t('delivery.of')} ${recordedCount})` : ''}
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: COLORS.inkTertiary, fontSize: 13 }}>{t('delivery.noEarnings')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="checkmark-done" size={20} color="#059669" />
            </View>
            <View style={styles.info}>
              <Text style={styles.route}>{t('delivery.completedDelivery')}</Text>
              <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString('ar-EG-u-nu-latn')}</Text>
            </View>
            <Text style={styles.fee}>+{item.total_earning} ر.ي</Text>
          </View>
        )}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  header: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 16, width: '100%', maxWidth: 920, alignSelf: 'center' },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, color: COLORS.ink, textAlign: 'right' },
  headerSubtitle: { fontSize: 12, color: COLORS.inkSecondary, marginTop: 3, textAlign: 'right' },
  listContent: { padding: 20, gap: 12, paddingBottom: 100, width: '100%', maxWidth: 920, alignSelf: 'center' },
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  errorText: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  retryText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800' },
  withdrawalSection: { gap: 8, marginBottom: 6 },
  withdrawalRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.hairline },
  withdrawalAmount: { color: COLORS.ink, fontSize: 13.5, fontWeight: '800' },
  withdrawalDate: { color: COLORS.inkTertiary, fontSize: 10.5, marginTop: 3 },
  withdrawalStatus: { maxWidth: '52%', fontSize: 11, fontWeight: '700', textAlign: 'right', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  summaryCard: {
    backgroundColor: COLORS.primary, borderRadius: 24, padding: 26, alignItems: 'center', marginBottom: 10,
  },
  summaryCardCompact: { paddingHorizontal: 16 },
  summaryLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  summaryValue: { fontSize: 36, fontFamily: FONTS.bold, color: '#FFFFFF', marginTop: 7, marginBottom: 22, letterSpacing: -0.5 },
  summaryRow: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16, padding: 15, width: '100%', justifyContent: 'space-around',
  },
  summaryRowCompact: { paddingHorizontal: 8 },
  summaryItem: { alignItems: 'center' },
  summaryItemValue: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  summaryItemLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionTitle: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.ink, marginTop: 16, marginBottom: 4, textAlign: 'right' },
  card: {
    flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.hairline,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginHorizontal: 12 },
  route: { fontSize: 13.5, fontWeight: '700', color: COLORS.ink },
  meta: { fontSize: 11, color: COLORS.inkTertiary, marginTop: 3 },
  fee: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  withdrawBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16, minHeight: 48,
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: '100%', maxWidth: 390, borderWidth: 1, borderColor: COLORS.hairline },
  modalCardCompact: { padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, textAlign: 'right', marginBottom: 6 },
  modalSub: { fontSize: 13, color: COLORS.inkSecondary, textAlign: 'right', marginBottom: 20, fontWeight: '600' },
  modalInput: {
    backgroundColor: COLORS.canvas, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.ink,
    fontWeight: '700', marginBottom: 16,
  },
  modalBtn: { backgroundColor: COLORS.primary, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  modalBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalCancel: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { fontSize: 14, color: COLORS.inkTertiary, fontWeight: '700' },
});

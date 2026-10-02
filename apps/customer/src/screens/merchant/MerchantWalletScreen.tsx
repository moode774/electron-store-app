import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  Platform, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import {
  useAuthStore, getWalletTransactions, getMerchantWalletSummary,
  getMyWithdrawalRequests, requestWithdrawal, WalletTransaction, WithdrawalRequest, WithdrawalStatus,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { Banner, EmptyState, ScreenHeader, StatusPill, card, formatDate, formatMoney, ui, useIsDesktop } from './merchantUi';
import { useTranslation } from '../../i18n';

const BLOCKING_WITHDRAWAL_STATUSES = new Set<WithdrawalStatus>([
  'pending',
  'approved',
  'processing',
]);

const WITHDRAWAL_STATUS_INFO: Record<WithdrawalStatus, { labelKey: string; color: string; backgroundColor: string }> = {
  pending: { labelKey: 'merchant.withdrawalPending', color: '#92400E', backgroundColor: '#FEF3C7' },
  approved: { labelKey: 'merchant.withdrawalApprovedUnpaid', color: '#1D4ED8', backgroundColor: '#DBEAFE' },
  processing: { labelKey: 'merchant.withdrawalProcessing', color: '#6D28D9', backgroundColor: '#EDE9FE' },
  paid: { labelKey: 'merchant.withdrawalPaid', color: '#047857', backgroundColor: '#D1FAE5' },
  rejected: { labelKey: 'merchant.withdrawalRejected', color: '#B91C1C', backgroundColor: '#FEE2E2' },
  failed: { labelKey: 'merchant.withdrawalFailedStatus', color: '#B91C1C', backgroundColor: '#FEE2E2' },
};

export default function MerchantWalletScreen({ navigation }: any) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [codHeld, setCodHeld] = useState(0);
  const [withdrawable, setWithdrawable] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const withdrawLock = useRef(false);
  const isDesktop = useIsDesktop();

  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const [walletSummary, nextTransactions, requests] = await Promise.all([
        getMerchantWalletSummary(),
        getWalletTransactions(user.id),
        getMyWithdrawalRequests(user.id),
      ]);
      setBalance(walletSummary.balance);
      setCodHeld(walletSummary.codHeld);
      setWithdrawable(walletSummary.withdrawable);
      setTransactions(nextTransactions);
      setWithdrawals(requests);
    } catch (error: unknown) {
      setLoadError(error instanceof Error && error.message ? error.message : t('merchant.walletLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void loadData();
  }, [loadData]));

  const isIncome = (t: WalletTransaction) => t.type === 'credit';
  const blockingWithdrawal = withdrawals.find((request) => BLOCKING_WITHDRAWAL_STATUSES.has(request.status));
  const hasBlockingWithdrawal = Boolean(blockingWithdrawal);

  const openWithdraw = () => {
    if (blockingWithdrawal) {
      Alert.alert(
        blockingWithdrawal.status === 'failed' ? t('merchant.withdrawalNeedsReview') : t('merchant.withdrawalInProgress'),
        blockingWithdrawal.status === 'failed'
          ? t('merchant.failedWithdrawalReview')
          : t('merchant.existingWithdrawalWait'),
      );
      return;
    }
    setWithdrawAmount('');
    setWithdrawNotes('');
    setShowWithdrawModal(true);
  };

  const handleWithdraw = async () => {
    if (withdrawLock.current || submitting) return;
    if (blockingWithdrawal) {
      Alert.alert(
        blockingWithdrawal.status === 'failed' ? t('merchant.withdrawalNeedsReview') : t('merchant.withdrawalInProgress'),
        blockingWithdrawal.status === 'failed'
          ? t('merchant.failedWithdrawalReview')
          : t('merchant.existingWithdrawal'),
      );
      return;
    }
    const amount = parseFloat(withdrawAmount.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(t('auth.alert'), t('merchant.enterValidWithdrawal'));
      return;
    }
    if (amount > withdrawable) {
      Alert.alert(t('merchant.amountUnavailable'), codHeld > 0
        ? `${t('merchant.availableWithdrawalNow')} ${withdrawable.toLocaleString()} ${t('merchant.currencyYER')}. ${codHeld.toLocaleString()} ${t('merchant.currencyYER')} ${t('merchant.codHeldLong')}`
        : `${t('merchant.requestedExceedsAvailable')} (${withdrawable.toLocaleString()} ${t('merchant.currencyYER')})`);
      return;
    }
    if (amount < 50) {
      Alert.alert(t('auth.alert'), t('merchant.minimumWithdrawal'));
      return;
    }
    if (!user?.id) return;
    withdrawLock.current = true;
    setSubmitting(true);
    try {
      await requestWithdrawal(amount, user.id, withdrawNotes.trim() || undefined);
      setShowWithdrawModal(false);
      await loadData();
      Alert.alert(
        t('merchant.withdrawalSent'),
        `${t('merchant.withdrawalSubmittedPrefix')} ${amount.toLocaleString()} ${t('merchant.currencyYER')} ${t('merchant.withdrawalSubmittedSuffix')}`,
        [{ text: t('common.ok') }]
      );
    } catch (e: any) {
      const message = String(e?.message ?? '');
      Alert.alert(
        t('merchant.withdrawalFailed'),
        message.includes('COD_FUNDS_NOT_YET_REMITTED')
          ? t('merchant.codFundsLocked')
          : (message || t('merchant.withdrawalSendGenericFailed')),
      );
    } finally {
      withdrawLock.current = false;
      setSubmitting(false);
    }
  };

  const income = transactions.filter(isIncome).reduce((sum, t) => sum + Math.abs(t.amount ?? 0), 0);
  const outgoing = transactions.filter((t) => !isIncome(t)).reduce((sum, t) => sum + Math.abs(t.amount ?? 0), 0);
  const canWithdraw = withdrawable >= 50 && !hasBlockingWithdrawal && !submitting;
  const quickAmounts = [0.25, 0.5, 1].map((ratio) => ({
    label: ratio === 1 ? t('merchant.fullBalance') : `${ratio * 100}%`,
    value: Math.floor(withdrawable * ratio),
  })).filter((q) => q.value >= 50);

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader title={t('merchant.wallet')} subtitle={t('merchant.walletSubtitle')} onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[ui.content, isDesktop && ui.contentDesktop, styles.listGap]}
          ListHeaderComponent={
            <View style={styles.headerStack}>
              {loadError ? <Banner text={loadError} tone="error" actionLabel={t('common.retry')} onAction={() => void loadData()} /> : null}

              <View style={styles.balance}>
                <View style={styles.balanceTop}>
                  <View style={styles.balanceCopy}>
                    <Text style={styles.balanceLabel}>{t('merchant.availableToWithdraw')}</Text>
                    <Text style={styles.balanceValue}>{formatMoney(withdrawable)} <Text style={styles.balanceCurrency}>{t('merchant.currencyYER')}</Text></Text>
                  </View>
                  <View style={styles.balanceIcon}><Ionicons name="wallet" size={22} color={COLORS.primary} /></View>
                </View>
                <TouchableOpacity
                  style={[styles.withdraw, !canWithdraw && styles.withdrawDisabled]}
                  onPress={openWithdraw}
                  disabled={!canWithdraw}
                  accessibilityRole="button"
                  accessibilityLabel={t('merchant.withdraw')}
                  accessibilityState={{ disabled: !canWithdraw }}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.withdrawText}>{t('merchant.withdraw')}</Text>
                </TouchableOpacity>
                <Text style={styles.balanceNote}>
                  {hasBlockingWithdrawal ? t('merchant.existingWithdrawalShort') : codHeld > 0 ? `${formatMoney(codHeld)} ${t('merchant.currencyYER')} ${t('merchant.codHeldShortSuffix')}` : withdrawable < 50 ? t('merchant.minimumWithdrawal') : t('merchant.administrationTransferHint')}
                </Text>
              </View>

              <View style={styles.stats}>
                <View style={styles.stat}>
                  <View style={[styles.statIcon, { backgroundColor: '#DCFCE7' }]}><Ionicons name="arrow-down" size={16} color="#15803D" /></View>
                  <Text style={styles.statValue}>{formatMoney(income)}</Text>
                  <Text style={styles.statLabel}>{t('merchant.totalIncome')}</Text>
                </View>
                <View style={styles.stat}>
                  <View style={[styles.statIcon, { backgroundColor: '#FEE2E2' }]}><Ionicons name="arrow-up" size={16} color="#B91C1C" /></View>
                  <Text style={styles.statValue}>{formatMoney(outgoing)}</Text>
                  <Text style={styles.statLabel}>{t('merchant.totalOutgoing')}</Text>
                </View>
              </View>

              {withdrawals.length ? (
                <View style={ui.card}>
                  <Text style={[ui.cardTitle, styles.mb8]}>{t('merchant.withdrawalRequests')}</Text>
                  {withdrawals.slice(0, 5).map((request, index) => {
                    const statusInfo = WITHDRAWAL_STATUS_INFO[request.status];
                    return (
                      <View key={request.id} style={[styles.withdrawal, index < Math.min(withdrawals.length, 5) - 1 && styles.divider]}>
                        <View style={styles.flexEnd}>
                          <Text style={styles.withdrawalAmount}>{formatMoney(request.amount)} {t('merchant.currencyYER')}</Text>
                          <Text style={ui.muted}>{formatDate(request.created_at)}</Text>
                        </View>
                        <StatusPill label={t(statusInfo.labelKey)} color={statusInfo.color} background={statusInfo.backgroundColor} />
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[ui.sectionTitle, styles.txTitleRow]}>{t('merchant.transactions')}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('merchant.noTransactions')} text={t('merchant.noTransactionsText')} />}
          renderItem={({ item, index }) => {
            const credit = isIncome(item);
            return (
              <View style={[styles.tx, index === 0 && styles.txFirst, index === transactions.length - 1 && styles.txLast]}>
                <View style={[styles.txIcon, { backgroundColor: credit ? '#DCFCE7' : '#FEE2E2' }]}>
                  <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={16} color={credit ? '#15803D' : '#B91C1C'} />
                </View>
                <View style={styles.flexEnd}>
                  <Text style={styles.txName} numberOfLines={2}>{item.notes ?? item.source ?? item.type}</Text>
                  <Text style={ui.muted}>{formatDate(item.created_at, true)}</Text>
                </View>
                <Text style={[styles.txAmount, { color: credit ? '#15803D' : '#B91C1C' }]}>
                  {credit ? '+' : '-'}{formatMoney(Math.abs(item.amount ?? 0))}
                </Text>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowWithdrawModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, isDesktop && styles.overlayCentered]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => !submitting && setShowWithdrawModal(false)} accessibilityLabel={t('merchant.close')} />
          <ScrollView style={[styles.sheet, isDesktop && styles.sheetCentered]} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            {!isDesktop ? <View style={styles.handle} /> : null}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('merchant.withdraw')}</Text>
              <TouchableOpacity onPress={() => !submitting && setShowWithdrawModal(false)} disabled={submitting} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('merchant.close')}>
                <Ionicons name="close" size={22} color={COLORS.inkSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetBalance}>
              <View style={styles.flexEnd}><Text style={ui.text}>{t('merchant.availableToWithdraw')}</Text>{codHeld > 0 ? <Text style={styles.heldHint}>{t('merchant.codHeldPrefix')}: {formatMoney(codHeld)} {t('merchant.currencyYER')}</Text> : null}</View>
              <Text style={styles.sheetBalanceValue}>{formatMoney(withdrawable)} {t('merchant.currencyYER')}</Text>
            </View>

            <Text style={ui.label}>{t('merchant.amount')}</Text>
            <View style={styles.amountBox}>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={COLORS.inkTertiary}
                keyboardType="decimal-pad"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                editable={!submitting}
                accessibilityLabel={t('merchant.withdrawalAmountA11y')}
              />
              <Text style={styles.amountSuffix}>{t('merchant.currencyYER')}</Text>
            </View>
            {quickAmounts.length ? (
              <View style={styles.quick}>
                {quickAmounts.map((q) => (
                  <TouchableOpacity key={q.label} style={styles.quickChip} onPress={() => setWithdrawAmount(String(q.value))} accessibilityRole="button" accessibilityLabel={q.label}>
                    <Text style={styles.quickText}>{q.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={[ui.label, styles.mt12]}>{t('merchant.notesOptional')}</Text>
            <TextInput
              style={[ui.input, styles.notes]}
              placeholder={t('merchant.extraInstructions')}
              placeholderTextColor={COLORS.inkTertiary}
              value={withdrawNotes}
              onChangeText={setWithdrawNotes}
              multiline
              editable={!submitting}
              accessibilityLabel={t('merchant.withdrawalNotesA11y')}
            />

            <Banner text={t('merchant.withdrawalReviewBanner')} tone="info" />

            <TouchableOpacity
              style={[ui.primaryBtn, styles.mt12, (submitting || hasBlockingWithdrawal) && styles.busy]}
              onPress={handleWithdraw}
              disabled={submitting || hasBlockingWithdrawal}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.sendWithdrawal')}
              accessibilityState={{ disabled: submitting || hasBlockingWithdrawal }}
            >
              {submitting ? <ActivityIndicator color={COLORS.surface} size="small" /> : <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.surface} />}
              <Text style={ui.primaryBtnText}>{t('merchant.sendWithdrawal')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listGap: { gap: 0 },
  headerStack: { gap: 14, marginBottom: 8 },
  flexEnd: { flex: 1, alignItems: 'flex-end' },
  mb8: { marginBottom: 8 },
  mt12: { marginTop: 12 },
  busy: { opacity: 0.6 },
  divider: { borderBottomWidth: 1, borderBottomColor: COLORS.hairline },

  balance: { backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, padding: 18 },
  balanceTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  balanceCopy: { flex: 1, alignItems: 'flex-end' },
  balanceLabel: { fontSize: 12, fontFamily: FONTS.medium, color: '#CBD5E1' },
  balanceValue: { fontSize: 30, fontFamily: FONTS.bold, color: COLORS.surface, marginTop: 4 },
  balanceCurrency: { fontSize: 14, fontFamily: FONTS.medium, color: '#CBD5E1' },
  balanceIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  withdraw: {
    marginTop: 16, minHeight: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  withdrawDisabled: { opacity: 0.55 },
  withdrawText: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.primary },
  balanceNote: { fontSize: 11, fontFamily: FONTS.regular, color: '#CBD5E1', textAlign: 'center', marginTop: 10 },

  stats: { flexDirection: 'row-reverse', gap: 12 },
  stat: { ...card, flex: 1, padding: 14, alignItems: 'flex-end', gap: 4 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.ink },
  statLabel: { fontSize: 11, fontFamily: FONTS.regular, color: COLORS.inkSecondary },

  withdrawal: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10 },
  withdrawalAmount: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink },
  txTitleRow: { marginTop: 6 },

  tx: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.hairline, borderTopWidth: 0,
  },
  txFirst: { borderTopWidth: 1, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg },
  txLast: { borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg },
  txIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: 13, fontFamily: FONTS.semiBold, color: COLORS.ink, textAlign: 'right' },
  txAmount: { fontSize: 14, fontFamily: FONTS.bold },

  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  overlayCentered: { justifyContent: 'center', alignItems: 'center' },
  sheet: { maxHeight: '90%', backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetCentered: { width: 460, borderRadius: 24, flexGrow: 0 },
  sheetContent: { padding: 20, paddingBottom: 32 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.hairline, marginBottom: 14 },
  sheetHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.ink },
  sheetBalance: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md, padding: 14, marginBottom: 16,
  },
  heldHint: { marginTop: 3, fontSize: 10, fontFamily: FONTS.regular, color: COLORS.inkSecondary },
  sheetBalanceValue: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.primary },
  amountBox: {
    flexDirection: 'row-reverse', alignItems: 'center', minHeight: 58, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: COLORS.hairline, backgroundColor: COLORS.canvas, paddingHorizontal: 14,
  },
  amountInput: {
    flex: 1, width: 0, minWidth: 0, minHeight: 56, fontSize: 24, fontFamily: FONTS.bold, color: COLORS.ink,
    textAlign: 'right', outlineStyle: 'none' as any,
  },
  amountSuffix: { fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.inkSecondary },
  quick: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  quickChip: { paddingHorizontal: 14, minHeight: 34, borderRadius: RADIUS.full, backgroundColor: COLORS.primarySoft, justifyContent: 'center' },
  quickText: { fontSize: 12, fontFamily: FONTS.semiBold, color: COLORS.primary },
  notes: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12, marginBottom: 12 },
});

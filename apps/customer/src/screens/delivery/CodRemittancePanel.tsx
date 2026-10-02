import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DirectionalIcon } from '../../components/DirectionalIcon';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, useAuthStore } from '@marketplace/shared-hooks';
import { COLORS } from '@marketplace/shared-utils';

import { Alert } from '../../components/appAlert';
import { useTranslation, appLocale } from '../../i18n';
import {
  availableCodRemittanceAmount,
  CodCollection,
  CodCollectionStatus,
  CodRemittanceProofFile,
  CodSubmissionStatus,
  COD_REMITTANCE_PROOF_MAX_BYTES,
  createCodRemittanceIdempotencyKey,
  listMyCodCollections,
  submitCodRemittance,
  uploadCodRemittanceProof,
} from './codRemittanceData';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const COLLECTION_STATUS_INFO: Record<CodCollectionStatus, {
  labelKey: string;
  color: string;
  backgroundColor: string;
  icon: IconName;
}> = {
  collected: {
    labelKey: 'delivery.codNeedHandOver',
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    icon: 'cash-outline',
  },
  partially_remitted: {
    labelKey: 'delivery.codPartiallyHanded',
    color: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
    icon: 'time-outline',
  },
  remitted: {
    labelKey: 'delivery.codHandedOver',
    color: '#047857',
    backgroundColor: '#D1FAE5',
    icon: 'checkmark-circle-outline',
  },
  disputed: {
    labelKey: 'delivery.codReviewAdmin',
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    icon: 'warning-outline',
  },
};

const SUBMISSION_STATUS_INFO: Record<CodSubmissionStatus, {
  labelKey: string;
  color: string;
  backgroundColor: string;
}> = {
  pending: { labelKey: 'delivery.codPendingReview', color: '#92400E', backgroundColor: '#FEF3C7' },
  approved: { labelKey: 'delivery.codApproved', color: '#047857', backgroundColor: '#D1FAE5' },
  rejected: { labelKey: 'delivery.codRejected', color: '#B91C1C', backgroundColor: '#FEE2E2' },
  disputed: { labelKey: 'delivery.codDisputed', color: '#6D28D9', backgroundColor: '#EDE9FE' },
};

interface PendingAttempt {
  fingerprint: string;
  idempotencyKey: string;
  proofPath?: string;
}

function money(value: number): string {
  return value.toLocaleString(appLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG-u-nu-latn');
}

function localizedNumber(value: string): number {
  const eastern = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String(eastern.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/٬/g, '')
    .replace(/[٫،,]/g, '.')
    .replace(/\s+/g, '');
  return Number(normalized);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function proofFingerprint(
  collectionId: string,
  amount: number,
  reference: string,
  proof: CodRemittanceProofFile,
): string {
  return JSON.stringify([
    collectionId,
    amount.toFixed(2),
    reference.trim().toLowerCase(),
    proof.uri,
    proof.fileName ?? '',
    proof.mimeType ?? '',
    proof.fileSize ?? null,
  ]);
}

export default function CodRemittancePanel() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [collections, setCollections] = useState<CodCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<CodCollection | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [proof, setProof] = useState<CodRemittanceProofFile | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const attempts = useRef(new Map<string, PendingAttempt>());

  const loadCollections = useCallback(async (silent = false): Promise<CodCollection[] | null> => {
    if (!user?.id) {
      setCollections([]);
      setLoading(false);
      return [];
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const rows = await listMyCodCollections();
      setCollections(rows);
      return rows;
    } catch (error) {
      setLoadError(errorMessage(error, t('delivery.codLoadFailed')));
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void loadCollections();
  }, [loadCollections]));

  useEffect(() => {
    if (!user?.id) return undefined;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadCollections(true), 250);
    };
    const channel = supabase
      .channel(`delivery-cod-remittances-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'delivery_cod_collections',
      }, refreshSoon)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cod_remittance_submissions',
      }, refreshSoon)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadCollections, user?.id]);

  const openForm = useCallback((collection: CodCollection) => {
    const available = availableCodRemittanceAmount(collection);
    if (collection.status === 'disputed') {
      Alert.alert(t('delivery.codDisputeTitle'), collection.dispute_reason ?? t('delivery.codDisputeWait'));
      return;
    }
    if (available <= 0) {
      Alert.alert(
        collection.status === 'remitted' ? t('delivery.codCompleted') : t('delivery.codNoAvailable'),
        collection.status === 'remitted'
          ? t('delivery.codCompletedText')
          : t('delivery.codPendingText'),
      );
      return;
    }

    setSelectedCollection(collection);
    setAmountInput(String(available));
    setReferenceInput('');
    setProof(null);
    setFormError('');
  }, []);

  const closeForm = useCallback(() => {
    if (submitLock.current) return;
    setSelectedCollection(null);
    setAmountInput('');
    setReferenceInput('');
    setProof(null);
    setFormError('');
  }, []);

  const chooseProof = useCallback(async () => {
    if (submitting) return;
    setFormError('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error(t('delivery.photosPermission'));
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType?.toLowerCase();
      const sourceName = `${asset.fileName ?? ''} ${asset.uri}`.toLowerCase().split('?')[0];
      const supported = mimeType
        ? ['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)
        : /[.](jpe?g|png)$/.test(sourceName);
      if (!supported) throw new Error(t('delivery.unsupportedProof'));
      if (Number.isFinite(asset.fileSize) && (asset.fileSize as number) > COD_REMITTANCE_PROOF_MAX_BYTES) {
        throw new Error(t('delivery.proofTooLarge'));
      }

      setProof({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
    } catch (error) {
      setFormError(errorMessage(error, t('delivery.proofChooseFailed')));
    }
  }, [submitting]);

  const submitForm = useCallback(async () => {
    if (!selectedCollection || !user?.id || submitLock.current || submitting) return;

    const amount = Math.round(localizedNumber(amountInput) * 100) / 100;
    const reference = referenceInput.trim();
    const available = availableCodRemittanceAmount(selectedCollection);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t('delivery.codAmountInvalid'));
      return;
    }
    if (amount > available + 0.001) {
      setFormError(`${t('delivery.codMaxAvailable')} ${money(available)} ${t('merchant.currencyYER')}`);
      return;
    }
    if (!reference || reference.length > 200) {
      setFormError(t('delivery.codReferenceRequired'));
      return;
    }
    if (!proof) {
      setFormError(t('delivery.codProofRequired'));
      return;
    }

    const fingerprint = proofFingerprint(selectedCollection.id, amount, reference, proof);
    let attempt = attempts.current.get(selectedCollection.id);
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = {
        fingerprint,
        idempotencyKey: createCodRemittanceIdempotencyKey(),
      };
      attempts.current.set(selectedCollection.id, attempt);
    }

    submitLock.current = true;
    setSubmitting(true);
    setFormError('');
    let confirmed = false;

    try {
      if (!attempt.proofPath) {
        attempt.proofPath = await uploadCodRemittanceProof({
          userId: user.id,
          collectionId: selectedCollection.id,
          idempotencyKey: attempt.idempotencyKey,
          proof,
        });
      }

      await submitCodRemittance({
        collectionId: selectedCollection.id,
        amount,
        reference,
        proofPath: attempt.proofPath,
        idempotencyKey: attempt.idempotencyKey,
      });
      confirmed = true;
    } catch (error) {
      // A network response can be lost after the database commit. Re-read the
      // authoritative queue and match the deterministic proof path before
      // telling the courier that the operation failed.
      if (attempt.proofPath) {
        const latest = await loadCollections(true);
        confirmed = Boolean(latest?.some((collection) =>
          collection.id === selectedCollection.id
          && collection.submissions.some((submission) => submission.proof_path === attempt?.proofPath),
        ));
      }

      if (!confirmed) {
        setFormError(errorMessage(error, t('delivery.codSendFailed')));
        return;
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }

    if (!confirmed) return;
    attempts.current.delete(selectedCollection.id);
    await loadCollections(true);
    setSelectedCollection(null);
    setAmountInput('');
    setReferenceInput('');
    setProof(null);
    setFormError('');
    Alert.alert(t('delivery.codSent'), `${t('delivery.codSentText')} ${money(amount)} ${t('merchant.currencyYER')}`);
  }, [
    amountInput,
    loadCollections,
    proof,
    referenceInput,
    selectedCollection,
    submitting,
    user?.id,
  ]);

  const totalCollected = collections.reduce((sum, item) => sum + item.amount_collected, 0);
  const totalOutstanding = collections.reduce((sum, item) => sum + item.amount_outstanding, 0);
  const totalPending = collections.reduce((sum, item) => sum + item.amount_pending_review, 0);

  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <View style={styles.sectionIcon}>
            <Ionicons name="cash-outline" size={19} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{t('delivery.codCashCollections')}</Text>
            <Text style={styles.sectionSubtitle}>{t('delivery.codCashSubtitle')}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadCollections(true)}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel={t('delivery.codRefresh')}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="refresh" size={18} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('delivery.codLoading')}</Text>
        </View>
      ) : null}

      {loadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={19} color="#B91C1C" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => void loadCollections()} accessibilityRole="button">
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && collections.length === 0 && !loadError ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-done-circle-outline" size={28} color="#059669" />
          <Text style={styles.emptyTitle}>{t('delivery.codEmpty')}</Text>
          <Text style={styles.emptyText}>{t('delivery.codEmptyText')}</Text>
        </View>
      ) : null}

      {collections.length > 0 ? (
        <>
          <View style={styles.actionSummary}>
            <View style={styles.actionTop}><View style={styles.actionIcon}><Ionicons name="arrow-up-circle-outline" size={20} color={COLORS.primary} /></View><Text style={styles.actionEyebrow}>{t('delivery.codRequiredHandover')}</Text></View>
            <Text style={styles.actionAmount}>{money(Math.max(totalOutstanding - totalPending, 0))} <Text style={styles.actionCurrency}>{t('merchant.currencyYER')}</Text></Text>
            <Text style={styles.actionText}>{Math.max(totalOutstanding - totalPending, 0) > 0 ? t('delivery.codAfterHandover') : totalPending > 0 ? t('delivery.codSentWait') : t('delivery.codNothingDue')}</Text>
          </View>
          {totalPending > 0 ? <View style={styles.simpleStatus}><Ionicons name="time-outline" size={18} color={COLORS.primary} /><Text style={styles.simpleStatusText}>{money(totalPending)} {t('merchant.currencyYER')} {t('delivery.codAlreadySent')}</Text></View> : null}

          {collections.map((collection) => {
            const status = COLLECTION_STATUS_INFO[collection.status];
            const available = availableCodRemittanceAmount(collection);
            const canSubmit = available > 0
              && collection.status !== 'disputed'
              && collection.status !== 'remitted';
            const progress = collection.amount_collected > 0
              ? Math.min((collection.amount_remitted / collection.amount_collected) * 100, 100)
              : 100;

            return (
              <View key={collection.id} style={styles.collectionCard}>
                <View style={styles.collectionTopRow}>
                  <View style={[styles.collectionIcon, { backgroundColor: status.backgroundColor }]}>
                    <Ionicons name={status.icon} size={20} color={status.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNumber}>
                      {t('delivery.codOrder')} {collection.order_number ?? `#${collection.order_id.slice(-8)}`}
                    </Text>
                    <Text style={styles.collectionDate}>{t('delivery.codCollectedAt')} {dateLabel(collection.collected_at)}</Text>
                  </View>
                  <Text style={[styles.statusBadge, {
                    color: status.color,
                    backgroundColor: status.backgroundColor,
                  }]}>{t(status.labelKey)}</Text>
                </View>

                <View style={styles.amountLine}>
                  <Text style={styles.amountLabel}>{t('delivery.codHandedAdmin')}</Text>
                  <Text style={styles.amountValue}>
                    {money(collection.amount_remitted)} / {money(collection.amount_collected)} {t('merchant.currencyYER')}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>

                <View style={styles.collectionStats}>
                  <Text style={styles.collectionStat}>{t('delivery.codRemaining')}: {money(collection.amount_outstanding)} {t('merchant.currencyYER')}</Text>
                  {collection.amount_pending_review > 0 ? (
                    <Text style={[styles.collectionStat, { color: COLORS.primary }]}>
                      {t('delivery.codSentForReview')}: {money(collection.amount_pending_review)} {t('merchant.currencyYER')}
                    </Text>
                  ) : null}
                </View>

                {collection.dispute_reason ? (
                  <View style={styles.disputeBox}>
                    <Ionicons name="warning-outline" size={17} color="#B91C1C" />
                    <Text style={styles.disputeText}>{collection.dispute_reason}</Text>
                  </View>
                ) : null}

                {collection.submissions.slice(0, 3).map((submission) => {
                  const submissionStatus = SUBMISSION_STATUS_INFO[submission.status];
                  return (
                    <View key={submission.id} style={styles.submissionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.submissionAmount}>
                          {money(submission.amount)} {t('merchant.currencyYER')} · {submission.reference}
                        </Text>
                        <Text style={styles.submissionDate}>{dateLabel(submission.submitted_at)}</Text>
                        {submission.review_note ? (
                          <Text style={styles.reviewNote}>{submission.review_note}</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.submissionBadge, {
                        color: submissionStatus.color,
                        backgroundColor: submissionStatus.backgroundColor,
                      }]}>{t(submissionStatus.labelKey)}</Text>
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                  onPress={() => openForm(collection)}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit }}
                  accessibilityLabel={`${t('delivery.codSendOrderA11y')} ${collection.order_number ?? collection.order_id}`}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={collection.status === 'remitted' ? 'checkmark-circle' : 'cloud-upload-outline'}
                    size={18}
                    color={canSubmit ? '#FFFFFF' : '#6B7280'}
                  />
                  <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
                    {collection.status === 'remitted'
                      ? t('delivery.codDoneNothingDue')
                      : collection.status === 'disputed'
                        ? t('delivery.codBlockedDispute')
                        : available <= 0
                          ? t('delivery.codSentReview')
                          : `${t('delivery.codSendProof')} (${money(available)} ${t('merchant.currencyYER')} ${t('delivery.codAvailable')})`}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      ) : null}

      <Modal
        visible={Boolean(selectedCollection)}
        transparent
        animationType="fade"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{t('delivery.codProofTitle')}</Text>
                  <Text style={styles.modalSubtitle}>
                    {t('delivery.codOrder')} {selectedCollection?.order_number ?? selectedCollection?.order_id.slice(-8)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeForm}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('delivery.codCloseForm')}
                >
                  <Ionicons name="close" size={21} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.availableBox}>
                <Text style={styles.availableLabel}>{t('delivery.codRequiredHandover')}</Text>
                <Text style={styles.availableValue}>
                  {money(selectedCollection ? availableCodRemittanceAmount(selectedCollection) : 0)} {t('merchant.currencyYER')}
                </Text>
              </View>

              <Text style={styles.inputLabel}>{t('delivery.amount')}</Text>
              <TextInput
                style={styles.input}
                value={amountInput}
                onChangeText={setAmountInput}
                editable={!submitting}
                keyboardType="decimal-pad"
                textAlign="right"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.inputLabel}>{t('delivery.codReference')}</Text>
              <TextInput
                style={styles.input}
                value={referenceInput}
                onChangeText={setReferenceInput}
                editable={!submitting}
                maxLength={200}
                textAlign="right"
                autoCapitalize="characters"
                placeholder={t('delivery.codReferenceExample')}
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.inputLabel}>{t('delivery.codProof')}</Text>
              <TouchableOpacity
                style={styles.proofPicker}
                onPress={() => void chooseProof()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={t('delivery.codChooseProof')}
              >
                <View style={styles.proofIcon}>
                  <Ionicons name={proof ? 'document-attach' : 'image-outline'} size={22} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.proofTitle}>
                    {proof ? (proof.fileName ?? t('delivery.codProofSelected')) : t('delivery.codChooseJpegPng')}
                  </Text>
                  <Text style={styles.proofSubtitle}>
                    {proof?.fileSize
                      ? `${(proof.fileSize / 1024 / 1024).toFixed(2)} MB`
                      : t('delivery.codMax10mb')}
                  </Text>
                </View>
                <DirectionalIcon name="chevron-back" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {formError ? (
                <View style={styles.formErrorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                  <Text style={styles.formErrorText}>{formError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.confirmButton, submitting && { opacity: 0.65 }]}
                onPress={() => void submitForm()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Ionicons name="shield-checkmark-outline" size={19} color="#FFFFFF" />}
                <Text style={styles.confirmButtonText}>
                  {submitting ? t('delivery.codUploading') : t('delivery.codSentProof')}
                </Text>
              </TouchableOpacity>
              <Text style={styles.confirmHint}>
                {t('delivery.codAfterSendHint')}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, marginTop: 14, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  sectionTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  sectionSubtitle: { color: COLORS.inkSecondary, fontSize: 10.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  refreshButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  loadingBox: { minHeight: 72, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  loadingText: { color: COLORS.inkSecondary, fontSize: 12, fontWeight: '600' },
  errorBox: { borderRadius: 14, padding: 12, backgroundColor: '#FEF2F2', flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 11.5, fontWeight: '600', lineHeight: 18, textAlign: 'right' },
  retryText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' },
  emptyBox: { alignItems: 'center', borderRadius: 16, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  emptyTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '800', marginTop: 7 },
  emptyText: { color: COLORS.inkTertiary, fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },
  actionSummary: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, alignItems: 'flex-end', borderWidth: 1, borderColor: COLORS.hairline },
  actionTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  actionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionEyebrow: { color: COLORS.inkSecondary, fontSize: 11, fontWeight: '700' },
  actionAmount: { color: COLORS.ink, fontSize: 32, fontWeight: '900', marginTop: 10 },
  actionCurrency: { fontSize: 13, color: COLORS.inkSecondary },
  actionText: { color: COLORS.inkSecondary, fontSize: 11, lineHeight: 18, marginTop: 4, textAlign: 'right' },
  simpleStatus: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: COLORS.primarySoft, borderRadius: 14, padding: 12 },
  simpleStatusText: { flex: 1, color: COLORS.primary, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  summaryCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  summaryValue: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  summaryLabel: { color: COLORS.inkSecondary, fontSize: 9.5, fontWeight: '700', marginTop: 3 },
  summaryDivider: { width: 1, height: 30, backgroundColor: '#E5E7EB' },
  holdNotice: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 7, padding: 11, borderRadius: 12, backgroundColor: '#FFFBEB' },
  holdNoticeText: { flex: 1, color: '#92400E', fontSize: 10.5, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  collectionCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: COLORS.hairline, gap: 10, marginTop: 2 },
  collectionTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  collectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orderNumber: { color: COLORS.ink, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  collectionDate: { color: COLORS.inkTertiary, fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  statusBadge: { fontSize: 9.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', flexShrink: 1 },
  amountLine: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  amountLabel: { color: COLORS.inkSecondary, fontSize: 10.5, fontWeight: '700' },
  amountValue: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  progressTrack: { height: 5, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#059669' },
  collectionStats: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  collectionStat: { color: COLORS.inkSecondary, fontSize: 10.5, fontWeight: '700' },
  disputeBox: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 7, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2' },
  disputeText: { flex: 1, color: '#B91C1C', fontSize: 10.5, fontWeight: '600', lineHeight: 16, textAlign: 'right' },
  submissionRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F3F4F6', flexWrap: 'wrap' },
  submissionAmount: { color: '#374151', fontSize: 10.5, fontWeight: '800', textAlign: 'right' },
  submissionDate: { color: COLORS.inkTertiary, fontSize: 9.5, marginTop: 2, textAlign: 'right' },
  reviewNote: { color: COLORS.inkSecondary, fontSize: 9.5, lineHeight: 14, marginTop: 3, textAlign: 'right' },
  submissionBadge: { fontSize: 9, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  submitButton: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  submitButtonDisabled: { backgroundColor: '#E5E7EB' },
  submitButtonText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', textAlign: 'center' },
  submitButtonTextDisabled: { color: COLORS.inkSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.44)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 26, padding: 22, borderWidth: 1, borderColor: COLORS.hairline },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14 },
  modalTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900', textAlign: 'right' },
  modalSubtitle: { color: COLORS.inkSecondary, fontSize: 11.5, fontWeight: '600', marginTop: 3, textAlign: 'right' },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  availableBox: { borderRadius: 14, backgroundColor: '#ECFDF5', padding: 13, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  availableLabel: { color: '#047857', fontSize: 11.5, fontWeight: '700' },
  availableValue: { color: '#047857', fontSize: 16, fontWeight: '900' },
  inputLabel: { color: '#374151', fontSize: 11.5, fontWeight: '800', textAlign: 'right', marginBottom: 6 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: COLORS.canvas, color: COLORS.ink, fontSize: 14, fontWeight: '700', paddingHorizontal: 14, marginBottom: 13 },
  proofPicker: { minHeight: 66, borderRadius: 13, borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: COLORS.primarySoft, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 11, marginBottom: 13, minWidth: 0 },
  proofIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  proofTitle: { color: '#1F2937', fontSize: 11.5, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  proofSubtitle: { color: COLORS.inkSecondary, fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  formErrorBox: { borderRadius: 12, backgroundColor: '#FEF2F2', padding: 11, flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 7, marginBottom: 12 },
  formErrorText: { flex: 1, color: '#B91C1C', fontSize: 11, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  confirmButton: { minHeight: 50, borderRadius: 13, backgroundColor: '#111827', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  confirmHint: { color: COLORS.inkSecondary, fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 16, marginTop: 9 },
});

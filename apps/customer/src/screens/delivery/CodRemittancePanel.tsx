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
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, useAuthStore } from '@marketplace/shared-hooks';
import { COLORS } from '@marketplace/shared-utils';

import { Alert } from '../../components/appAlert';
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
  label: string;
  color: string;
  backgroundColor: string;
  icon: IconName;
}> = {
  collected: {
    label: 'بانتظار التسليم',
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    icon: 'cash-outline',
  },
  partially_remitted: {
    label: 'مُسلّم جزئيًا',
    color: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    icon: 'time-outline',
  },
  remitted: {
    label: 'مُسلّم بالكامل',
    color: '#047857',
    backgroundColor: '#D1FAE5',
    icon: 'checkmark-circle-outline',
  },
  disputed: {
    label: 'متنازع عليه',
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    icon: 'warning-outline',
  },
};

const SUBMISSION_STATUS_INFO: Record<CodSubmissionStatus, {
  label: string;
  color: string;
  backgroundColor: string;
}> = {
  pending: { label: 'قيد المراجعة', color: '#92400E', backgroundColor: '#FEF3C7' },
  approved: { label: 'معتمد', color: '#047857', backgroundColor: '#D1FAE5' },
  rejected: { label: 'مرفوض', color: '#B91C1C', backgroundColor: '#FEE2E2' },
  disputed: { label: 'قيد النزاع', color: '#6D28D9', backgroundColor: '#EDE9FE' },
};

interface PendingAttempt {
  fingerprint: string;
  idempotencyKey: string;
  proofPath?: string;
}

function money(value: number): string {
  return value.toLocaleString('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-SA');
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
      setLoadError(errorMessage(error, 'تعذّر تحميل سجل التحصيلات النقدية.'));
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
      Alert.alert('التحصيل قيد النزاع', collection.dispute_reason ?? 'انتظر مراجعة الإدارة قبل إرسال مبلغ جديد.');
      return;
    }
    if (available <= 0) {
      Alert.alert(
        collection.status === 'remitted' ? 'اكتمل التحصيل' : 'لا يوجد مبلغ متاح',
        collection.status === 'remitted'
          ? 'اعتمدت الإدارة كامل المبلغ المستلم من العميل.'
          : 'المتبقي موجود ضمن طلب تحويل قيد المراجعة.',
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
          throw new Error('اسمح بالوصول إلى الصور لاختيار إثبات الحوالة.');
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
      if (!supported) throw new Error('صيغة الإثبات غير مدعومة. اختر صورة JPEG أو PNG.');
      if (Number.isFinite(asset.fileSize) && (asset.fileSize as number) > COD_REMITTANCE_PROOF_MAX_BYTES) {
        throw new Error('حجم صورة الإثبات أكبر من 10 ميجابايت.');
      }

      setProof({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
    } catch (error) {
      setFormError(errorMessage(error, 'تعذّر اختيار صورة الإثبات.'));
    }
  }, [submitting]);

  const submitForm = useCallback(async () => {
    if (!selectedCollection || !user?.id || submitLock.current || submitting) return;

    const amount = Math.round(localizedNumber(amountInput) * 100) / 100;
    const reference = referenceInput.trim();
    const available = availableCodRemittanceAmount(selectedCollection);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('أدخل مبلغًا صحيحًا أكبر من صفر.');
      return;
    }
    if (amount > available + 0.001) {
      setFormError(`أقصى مبلغ متاح الآن هو ${money(available)} ر.ي بعد احتساب الطلبات قيد المراجعة.`);
      return;
    }
    if (!reference || reference.length > 200) {
      setFormError('أدخل رقم مرجع الحوالة أو الإيداع، بحد أقصى 200 حرف.');
      return;
    }
    if (!proof) {
      setFormError('اختر صورة إثبات الحوالة قبل الإرسال.');
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
        setFormError(errorMessage(error, 'تعذّر إرسال التحصيل. بقيت البيانات محفوظة ويمكنك إعادة المحاولة.'));
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
    Alert.alert(
      'تم إرسال التحصيل',
      `أُرسل مبلغ ${money(amount)} ر.ي مع الإثبات إلى الإدارة. سيبقى قيد المراجعة حتى يتم اعتماد الاستلام.`,
    );
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
            <Ionicons name="cash-outline" size={19} color="#B45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>تحصيلات الدفع عند الاستلام</Text>
            <Text style={styles.sectionSubtitle}>سلّم المبالغ للإدارة مع إثبات لكل حوالة</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadCollections(true)}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="تحديث التحصيلات النقدية"
        >
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="refresh" size={18} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>جاري تحميل التحصيلات…</Text>
        </View>
      ) : null}

      {loadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={19} color="#B91C1C" />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => void loadCollections()} accessibilityRole="button">
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && collections.length === 0 && !loadError ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-done-circle-outline" size={28} color="#059669" />
          <Text style={styles.emptyTitle}>لا توجد تحصيلات نقدية مسجلة</Text>
          <Text style={styles.emptyText}>ستظهر هنا الطلبات النقدية بعد تسليمها للعميل.</Text>
        </View>
      ) : null}

      {collections.length > 0 ? (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{money(totalCollected)}</Text>
              <Text style={styles.summaryLabel}>إجمالي مستلم</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, { color: '#B45309' }]}>{money(totalOutstanding)}</Text>
              <Text style={styles.summaryLabel}>غير معتمد</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={[styles.summaryValue, { color: '#1D4ED8' }]}>{money(totalPending)}</Text>
              <Text style={styles.summaryLabel}>قيد المراجعة</Text>
            </View>
          </View>

          <View style={styles.holdNotice}>
            <Ionicons name="information-circle-outline" size={18} color="#92400E" />
            <Text style={styles.holdNoticeText}>
              المبالغ غير المعتمدة لا تصبح متاحة للسحب حتى تؤكد الإدارة استلامها.
            </Text>
          </View>

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
                      الطلب {collection.order_number ?? `#${collection.order_id.slice(-8)}`}
                    </Text>
                    <Text style={styles.collectionDate}>استُلم في {dateLabel(collection.collected_at)}</Text>
                  </View>
                  <Text style={[styles.statusBadge, {
                    color: status.color,
                    backgroundColor: status.backgroundColor,
                  }]}>{status.label}</Text>
                </View>

                <View style={styles.amountLine}>
                  <Text style={styles.amountLabel}>المبلغ المعتمد</Text>
                  <Text style={styles.amountValue}>
                    {money(collection.amount_remitted)} / {money(collection.amount_collected)} ر.ي
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>

                <View style={styles.collectionStats}>
                  <Text style={styles.collectionStat}>المتبقي: {money(collection.amount_outstanding)} ر.ي</Text>
                  {collection.amount_pending_review > 0 ? (
                    <Text style={[styles.collectionStat, { color: '#1D4ED8' }]}>
                      تحت المراجعة: {money(collection.amount_pending_review)} ر.ي
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
                          {money(submission.amount)} ر.ي · {submission.reference}
                        </Text>
                        <Text style={styles.submissionDate}>{dateLabel(submission.submitted_at)}</Text>
                        {submission.review_note ? (
                          <Text style={styles.reviewNote}>{submission.review_note}</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.submissionBadge, {
                        color: submissionStatus.color,
                        backgroundColor: submissionStatus.backgroundColor,
                      }]}>{submissionStatus.label}</Text>
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                  onPress={() => openForm(collection)}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit }}
                  accessibilityLabel={`إرسال تحصيل الطلب ${collection.order_number ?? collection.order_id}`}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={collection.status === 'remitted' ? 'checkmark-circle' : 'cloud-upload-outline'}
                    size={18}
                    color={canSubmit ? '#FFFFFF' : '#6B7280'}
                  />
                  <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
                    {collection.status === 'remitted'
                      ? 'تم تسليم المبلغ كاملًا'
                      : collection.status === 'disputed'
                        ? 'موقوف حتى حل النزاع'
                        : available <= 0
                          ? 'المبلغ المتبقي قيد المراجعة'
                          : `إرسال تحصيل (${money(available)} ر.ي متاح)`}
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
                  <Text style={styles.modalTitle}>إرسال تحصيل نقدي</Text>
                  <Text style={styles.modalSubtitle}>
                    الطلب {selectedCollection?.order_number ?? selectedCollection?.order_id.slice(-8)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeForm}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="إغلاق نموذج التحصيل"
                >
                  <Ionicons name="close" size={21} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.availableBox}>
                <Text style={styles.availableLabel}>المتاح للإرسال الآن</Text>
                <Text style={styles.availableValue}>
                  {money(selectedCollection ? availableCodRemittanceAmount(selectedCollection) : 0)} ر.ي
                </Text>
              </View>

              <Text style={styles.inputLabel}>المبلغ</Text>
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

              <Text style={styles.inputLabel}>رقم مرجع الحوالة أو الإيداع</Text>
              <TextInput
                style={styles.input}
                value={referenceInput}
                onChangeText={setReferenceInput}
                editable={!submitting}
                maxLength={200}
                textAlign="right"
                autoCapitalize="characters"
                placeholder="مثال: BANK-458921"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.inputLabel}>إثبات الحوالة</Text>
              <TouchableOpacity
                style={styles.proofPicker}
                onPress={() => void chooseProof()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="اختيار صورة إثبات الحوالة"
              >
                <View style={styles.proofIcon}>
                  <Ionicons name={proof ? 'document-attach' : 'image-outline'} size={22} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.proofTitle}>
                    {proof ? (proof.fileName ?? 'تم اختيار صورة الإثبات') : 'اختر صورة JPEG أو PNG'}
                  </Text>
                  <Text style={styles.proofSubtitle}>
                    {proof?.fileSize
                      ? `${(proof.fileSize / 1024 / 1024).toFixed(2)} ميجابايت`
                      : 'الحد الأقصى 10 ميجابايت'}
                  </Text>
                </View>
                <Ionicons name="chevron-back" size={18} color="#9CA3AF" />
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
                  {submitting ? 'جاري رفع الإثبات والإرسال…' : 'إرسال للمراجعة'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.confirmHint}>
                لا يُعد المبلغ معتمدًا إلا بعد مراجعة الإدارة للإثبات وتأكيد الاستلام.
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: '#111827', fontSize: 15, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  sectionSubtitle: { color: '#6B7280', fontSize: 10.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  refreshButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  loadingBox: { minHeight: 72, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  loadingText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  errorBox: { borderRadius: 14, padding: 12, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 11.5, fontWeight: '600', lineHeight: 18, textAlign: 'right' },
  retryText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' },
  emptyBox: { alignItems: 'center', borderRadius: 16, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  emptyTitle: { color: '#111827', fontSize: 13, fontWeight: '800', marginTop: 7 },
  emptyText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  summaryCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  summaryValue: { color: '#111827', fontSize: 14, fontWeight: '900' },
  summaryLabel: { color: '#6B7280', fontSize: 9.5, fontWeight: '700', marginTop: 3 },
  summaryDivider: { width: 1, height: 30, backgroundColor: '#E5E7EB' },
  holdNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 11, borderRadius: 12, backgroundColor: '#FFFBEB' },
  holdNoticeText: { flex: 1, color: '#92400E', fontSize: 10.5, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  collectionCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#E5E7EB', gap: 10 },
  collectionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  collectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orderNumber: { color: '#111827', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  collectionDate: { color: '#9CA3AF', fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  statusBadge: { fontSize: 9.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', flexShrink: 1 },
  amountLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  amountLabel: { color: '#6B7280', fontSize: 10.5, fontWeight: '700' },
  amountValue: { color: '#111827', fontSize: 12, fontWeight: '900' },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#059669' },
  collectionStats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  collectionStat: { color: '#6B7280', fontSize: 10.5, fontWeight: '700' },
  disputeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: 10, backgroundColor: '#FEF2F2' },
  disputeText: { flex: 1, color: '#B91C1C', fontSize: 10.5, fontWeight: '600', lineHeight: 16, textAlign: 'right' },
  submissionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F3F4F6', flexWrap: 'wrap' },
  submissionAmount: { color: '#374151', fontSize: 10.5, fontWeight: '800', textAlign: 'right' },
  submissionDate: { color: '#9CA3AF', fontSize: 9.5, marginTop: 2, textAlign: 'right' },
  reviewNote: { color: '#6B7280', fontSize: 9.5, lineHeight: 14, marginTop: 3, textAlign: 'right' },
  submissionBadge: { fontSize: 9, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  submitButton: { minHeight: 44, borderRadius: 12, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  submitButtonDisabled: { backgroundColor: '#E5E7EB' },
  submitButtonText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', textAlign: 'center' },
  submitButtonTextDisabled: { color: '#6B7280' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.58)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  modalTitle: { color: '#111827', fontSize: 18, fontWeight: '900', textAlign: 'right' },
  modalSubtitle: { color: '#6B7280', fontSize: 11.5, fontWeight: '600', marginTop: 3, textAlign: 'right' },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  availableBox: { borderRadius: 14, backgroundColor: '#ECFDF5', padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  availableLabel: { color: '#047857', fontSize: 11.5, fontWeight: '700' },
  availableValue: { color: '#047857', fontSize: 16, fontWeight: '900' },
  inputLabel: { color: '#374151', fontSize: 11.5, fontWeight: '800', textAlign: 'right', marginBottom: 6 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', color: '#111827', fontSize: 14, fontWeight: '700', paddingHorizontal: 14, marginBottom: 13 },
  proofPicker: { minHeight: 66, borderRadius: 13, borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, marginBottom: 13, minWidth: 0 },
  proofIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  proofTitle: { color: '#1F2937', fontSize: 11.5, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  proofSubtitle: { color: '#6B7280', fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  formErrorBox: { borderRadius: 12, backgroundColor: '#FEF2F2', padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 12 },
  formErrorText: { flex: 1, color: '#B91C1C', fontSize: 11, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  confirmButton: { minHeight: 50, borderRadius: 13, backgroundColor: '#111827', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  confirmHint: { color: '#6B7280', fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 16, marginTop: 9 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, useAuthStore } from '@marketplace/shared-hooks';
import { COLORS } from '@marketplace/shared-utils';

import { Alert } from '../../components/appAlert';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import {
  completeDeliveryReturnStep,
  createDeliveryReturnIdempotencyKey,
  DeliveryReturnJob,
  DeliveryReturnProofPhoto,
  DeliveryReturnTargetStatus,
  getDeliveryReturnStatus,
  loadDeliveryReturnJobs,
  RETURN_PROOF_MAX_BYTES,
  uploadDeliveryReturnProof,
} from './deliveryReturnData';
import {
  hasFreshDeliveryLocation,
  hasValidDeliveryCoordinates,
} from './deliveryProofValidation';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

type JobFilter = 'active' | 'completed';

const REASON_LABELS: Record<DeliveryReturnJob['reason'], string> = {
  damaged: 'المنتج تالف',
  not_as_described: 'غير مطابق للوصف',
  wrong_item: 'منتج مختلف',
  changed_mind: 'تغيير الرأي',
  other: 'سبب آخر',
};

interface StepAttempt {
  fingerprint: string;
  idempotencyKey: string;
  proofPath?: string;
}

interface ProofLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function dateTime(value: string | null | undefined): string {
  if (!value) return 'غير محدد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير محدد';
  return date.toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

function locationLabel(job: DeliveryReturnJob, destination: 'customer' | 'merchant'): string {
  if (destination === 'customer') {
    if (!job.address) return t('عنوان العميل ({0})', [job.address_id.slice(-8)]);
    return [job.address.full_address, job.address.area, job.address.city].filter(Boolean).join('، ');
  }
  if (!job.merchant) return t('المتجر ({0})', [job.merchant_id.slice(-8)]);
  return [job.merchant.address, job.merchant.city].filter(Boolean).join('، ') || job.merchant.store_name;
}

function stepFingerprint(
  requestId: string,
  targetStatus: DeliveryReturnTargetStatus,
  photo: DeliveryReturnProofPhoto,
  location: ProofLocation,
): string {
  return JSON.stringify([
    requestId,
    targetStatus,
    photo.uri,
    photo.fileName ?? '',
    photo.mimeType ?? '',
    photo.fileSize ?? null,
    location.latitude.toFixed(6),
    location.longitude.toFixed(6),
  ]);
}

function hasReachedTarget(current: string | null, target: DeliveryReturnTargetStatus): boolean {
  if (!current) return false;
  if (target === 'picked_up') {
    return ['picked_up', 'received', 'inspected', 'completed'].includes(current);
  }
  return ['received', 'inspected', 'completed'].includes(current);
}

export default function DeliveryReturnsScreen({ navigation }: any) {
  const layout = useResponsiveLayout(1120);
  const user = useAuthStore((state) => state.user);
  const [jobs, setJobs] = useState<DeliveryReturnJob[]>([]);
  const [filter, setFilter] = useState<JobFilter>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedJob, setSelectedJob] = useState<DeliveryReturnJob | null>(null);
  const [targetStatus, setTargetStatus] = useState<DeliveryReturnTargetStatus | null>(null);
  const [proofPhoto, setProofPhoto] = useState<DeliveryReturnProofPhoto | null>(null);
  const [proofLocation, setProofLocation] = useState<ProofLocation | null>(null);
  const [proofError, setProofError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const locationLock = useRef(false);
  const attempts = useRef(new Map<string, StepAttempt>());

  const loadJobs = useCallback(async (silent = false): Promise<DeliveryReturnJob[] | null> => {
    if (!user?.id) {
      setJobs([]);
      setLoading(false);
      return [];
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const rows = await loadDeliveryReturnJobs();
      setJobs(rows);
      return rows;
    } catch (error) {
      setLoadError(errorMessage(error, 'تعذّر تحميل مهام الإرجاع المسندة إليك.'));
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void loadJobs();
  }, [loadJobs]));

  useEffect(() => {
    if (!user?.id) return undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadJobs(true), 250);
    };
    const channel = supabase
      .channel(`delivery-return-jobs-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'return_requests',
      }, refreshSoon)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'return_proofs',
      }, refreshSoon)
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadJobs, user?.id]);

  const visibleJobs = useMemo(() => jobs.filter((job) => (
    filter === 'completed' ? job.status === 'received' : job.status !== 'received'
  )), [filter, jobs]);
  const activeCount = jobs.filter((job) => job.status !== 'received').length;
  const completedCount = jobs.filter((job) => job.status === 'received').length;

  const refreshProofLocation = useCallback(async () => {
    if (locationLock.current) return;
    locationLock.current = true;
    setLocating(true);
    setProofError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('اسمح بالوصول إلى الموقع لتوثيق مكان تنفيذ خطوة الإرجاع.');
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setProofLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        timestamp: current.timestamp || Date.now(),
      });
    } catch (error) {
      setProofError(errorMessage(error, 'تعذّر تحديد موقعك الحالي.'));
    } finally {
      locationLock.current = false;
      setLocating(false);
    }
  }, []);

  const openStep = useCallback((job: DeliveryReturnJob) => {
    const nextTarget: DeliveryReturnTargetStatus | null = job.status === 'pickup_scheduled'
      ? 'picked_up'
      : job.status === 'picked_up'
        ? 'received'
        : null;
    if (!nextTarget) return;
    setSelectedJob(job);
    setTargetStatus(nextTarget);
    setProofPhoto(null);
    setProofLocation(null);
    setProofError('');
    void refreshProofLocation();
  }, [refreshProofLocation]);

  const closeStep = useCallback(() => {
    if (submitLock.current) return;
    setSelectedJob(null);
    setTargetStatus(null);
    setProofPhoto(null);
    setProofLocation(null);
    setProofError('');
  }, []);

  const captureProof = useCallback(async () => {
    if (capturing || submitting) return;
    setCapturing(true);
    setProofError('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('اسمح باستخدام الكاميرا لالتقاط إثبات الإرجاع.');
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.75,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType?.toLowerCase();
      const sourceName = `${asset.fileName ?? ''} ${asset.uri}`.toLowerCase().split('?')[0];
      const supported = mimeType
        ? ['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)
        : /[.](jpe?g|png)$/.test(sourceName);
      if (!supported) throw new Error('صيغة الصورة غير مدعومة. التقط صورة JPEG أو PNG.');
      if (Number.isFinite(asset.fileSize) && (asset.fileSize as number) > RETURN_PROOF_MAX_BYTES) {
        throw new Error('حجم صورة الإثبات أكبر من 10 ميجابايت.');
      }

      setProofPhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
      await refreshProofLocation();
    } catch (error) {
      setProofError(errorMessage(error, 'تعذّر التقاط صورة الإثبات.'));
    } finally {
      setCapturing(false);
    }
  }, [capturing, refreshProofLocation, submitting]);

  const submitStep = useCallback(async () => {
    if (!selectedJob || !targetStatus || !user?.id || submitLock.current || submitting) return;
    if (!proofPhoto) {
      setProofError('التقط صورة واضحة قبل تأكيد الخطوة.');
      return;
    }
    if (!proofLocation || !hasValidDeliveryCoordinates(
      proofLocation.latitude,
      proofLocation.longitude,
    )) {
      setProofError('حدّث موقعك الحالي قبل تأكيد الخطوة.');
      return;
    }
    if (!hasFreshDeliveryLocation(proofLocation.timestamp)) {
      setProofError('الموقع المسجل قديم. حدّث الموقع ثم أعد الإرسال.');
      return;
    }
    if (
      (selectedJob.status === 'pickup_scheduled' && targetStatus !== 'picked_up')
      || (selectedJob.status === 'picked_up' && targetStatus !== 'received')
    ) {
      setProofError('تغيّرت خطوة المهمة. أغلق النافذة وحدّث القائمة.');
      return;
    }

    const attemptKey = `${selectedJob.id}:${targetStatus}`;
    const fingerprint = stepFingerprint(selectedJob.id, targetStatus, proofPhoto, proofLocation);
    let attempt = attempts.current.get(attemptKey);
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = {
        fingerprint,
        idempotencyKey: createDeliveryReturnIdempotencyKey(),
      };
      attempts.current.set(attemptKey, attempt);
    }

    submitLock.current = true;
    setSubmitting(true);
    setProofError('');
    let confirmed = false;
    try {
      if (!attempt.proofPath) {
        attempt.proofPath = await uploadDeliveryReturnProof({
          userId: user.id,
          requestId: selectedJob.id,
          idempotencyKey: attempt.idempotencyKey,
          photo: proofPhoto,
        });
      }
      await completeDeliveryReturnStep({
        requestId: selectedJob.id,
        targetStatus,
        proofPath: attempt.proofPath,
        latitude: proofLocation.latitude,
        longitude: proofLocation.longitude,
        idempotencyKey: attempt.idempotencyKey,
      });
      confirmed = true;
    } catch (error) {
      // If the response was lost after commit, verify the authoritative return
      // state before asking the courier to repeat a physical custody event.
      const latestStatus = await getDeliveryReturnStatus(selectedJob.id);
      confirmed = hasReachedTarget(latestStatus, targetStatus);
      if (!confirmed) {
        setProofError(errorMessage(error, 'تعذّر تأكيد الخطوة. أعد المحاولة بنفس الإثبات.'));
        return;
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }

    if (!confirmed) return;
    attempts.current.delete(attemptKey);
    await loadJobs(true);
    const completedTarget = targetStatus;
    setSelectedJob(null);
    setTargetStatus(null);
    setProofPhoto(null);
    setProofLocation(null);
    setProofError('');
    Alert.alert(
      completedTarget === 'picked_up' ? 'تم استلام المرتجع' : 'تم تسليم المرتجع للتاجر',
      completedTarget === 'picked_up'
        ? 'سُجّل إثبات الاستلام وأصبحت المهمة الآن قيد النقل إلى التاجر.'
        : 'سُجّل إثبات التسليم، وينتظر المرتجع تأكيد الاستلام والفحص من التاجر.',
    );
  }, [
    loadJobs,
    proofLocation,
    proofPhoto,
    selectedJob,
    submitting,
    targetStatus,
    user?.id,
  ]);

  const openMap = useCallback(async (
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    fallbackAddress: string,
  ) => {
    const query = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude},${longitude}`
      : fallbackAddress;
    if (!query) {
      Alert.alert('العنوان غير مكتمل', 'لا توجد إحداثيات أو تفاصيل عنوان كافية لهذه الوجهة.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('تعذّر فتح الخريطة', 'انسخ العنوان الظاهر وحاول فتحه في تطبيق الخرائط.');
    }
  }, []);

  const renderJob = ({ item: job }: { item: DeliveryReturnJob }) => {
    const pickupPending = job.status === 'pickup_scheduled';
    const inTransit = job.status === 'picked_up';
    const received = job.status === 'received';
    const quantity = job.items.reduce((sum, item) => sum + item.approved_quantity, 0);
    const customerLocation = locationLabel(job, 'customer');
    const merchantLocation = locationLabel(job, 'merchant');

    return (
      <View style={styles.jobCard}>
        <View style={styles.jobHeader}>
          <View style={[styles.jobIcon, {
            backgroundColor: received ? '#D1FAE5' : inTransit ? '#DBEAFE' : '#FEF3C7',
          }]}>
            <Ionicons
              name={received ? 'checkmark-done' : inTransit ? 'bicycle-outline' : 'cube-outline'}
              size={22}
              color={received ? '#047857' : inTransit ? '#1D4ED8' : '#92400E'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNumber}>{t('طلب {0}', [tv(job.order_number)])}</Text>
            <Text style={styles.reason}>{t('{0} · {1} قطعة', [tv(REASON_LABELS[job.reason]), tv(quantity)])}</Text>
          </View>
          <Text style={[styles.jobStatus, {
            color: received ? '#047857' : inTransit ? '#1D4ED8' : '#92400E',
            backgroundColor: received ? '#D1FAE5' : inTransit ? '#DBEAFE' : '#FEF3C7',
          }]}>
            {tv(received ? t('وصل للتاجر') : inTransit ? t('قيد النقل') : t('بانتظار الاستلام'))}
          </Text>
        </View>

        <View style={styles.timeline}>
          <View style={styles.timelineStep}>
            <View style={[styles.timelineDot, (inTransit || received) && styles.timelineDotDone]}>
              {(inTransit || received) ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.timelineLabel, (inTransit || received) && styles.timelineLabelDone]}>{t('استلام العميل')}</Text>
          </View>
          <View style={[styles.timelineLine, (inTransit || received) && styles.timelineLineDone]} />
          <View style={styles.timelineStep}>
            <View style={[styles.timelineDot, inTransit && styles.timelineDotCurrent, received && styles.timelineDotDone]}>
              {received ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.timelineLabel, (inTransit || received) && styles.timelineLabelDone]}>{t('قيد النقل')}</Text>
          </View>
          <View style={[styles.timelineLine, received && styles.timelineLineDone]} />
          <View style={styles.timelineStep}>
            <View style={[styles.timelineDot, received && styles.timelineDotDone]}>
              {received ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.timelineLabel, received && styles.timelineLabelDone]}>{t('تسليم التاجر')}</Text>
          </View>
        </View>

        <View style={styles.scheduleBox}>
          <Ionicons name="calendar-outline" size={17} color="#6B7280" />
          <Text style={styles.scheduleText}>{t('الموعد: {0}', [dateTime(job.scheduled_at)])}</Text>
        </View>

        <View style={styles.destinationCard}>
          <View style={styles.destinationTitleRow}>
            <View style={[styles.destinationIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="person-outline" size={18} color="#92400E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.destinationTitle}>{t('الاستلام من العميل')}</Text>
              <Text style={styles.destinationAddress}>{tv(customerLocation)}</Text>
            </View>
            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => void openMap(
                job.address?.latitude,
                job.address?.longitude,
                customerLocation,
              )}
              accessibilityRole="button"
              accessibilityLabel={t('فتح عنوان العميل في الخريطة')}
            >
              <Ionicons name="navigate-outline" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.destinationCard}>
          <View style={styles.destinationTitleRow}>
            <View style={[styles.destinationIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="storefront-outline" size={18} color="#1D4ED8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.destinationTitle}>{tv(job.merchant?.store_name ?? t('التاجر'))}</Text>
              <Text style={styles.destinationAddress}>{tv(merchantLocation)}</Text>
              {job.merchant?.store_phone ? (
                <Text style={styles.destinationPhone}>{tv(job.merchant.store_phone)}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => void openMap(
                job.merchant?.latitude,
                job.merchant?.longitude,
                merchantLocation,
              )}
              accessibilityRole="button"
              accessibilityLabel={t('فتح عنوان التاجر في الخريطة')}
            >
              <Ionicons name="navigate-outline" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {pickupPending || inTransit ? (
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={() => openStep(job)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={pickupPending ? t('تأكيد استلام المرتجع من العميل') : t('تأكيد تسليم المرتجع للتاجر')}
          >
            <Ionicons name="camera-outline" size={19} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>
              {tv(pickupPending ? t('توثيق الاستلام من العميل') : t('توثيق التسليم للتاجر'))}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.completedBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#047857" />
            <Text style={styles.completedText}>{t('اكتملت عهدة المندوب وينتظر المرتجع فحص التاجر.')}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('العودة')}
        >
          <Ionicons name="arrow-forward" size={23} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('مهام الإرجاع')}</Text>
          <Text style={styles.headerSubtitle}>{t('مسار مستقل لاستلام المرتجعات وتسليمها للتاجر')}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadJobs(true)}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel={t('تحديث مهام الإرجاع')}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="refresh" size={19} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      <View style={[styles.filters, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'active' && styles.filterButtonActive]}
          onPress={() => setFilter('active')}
          accessibilityRole="button"
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>{t('الجارية ({0})', [tv(activeCount)])}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
          onPress={() => setFilter('completed')}
          accessibilityRole="button"
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>{t('المسلّمة ({0})', [tv(completedCount)])}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.centerText}>{t('جاري تحميل مهام الإرجاع…')}</Text>
        </View>
      ) : (
        <FlatList
          key={`delivery-returns-${layout.desktop ? 2 : 1}`}
          data={visibleJobs}
          keyExtractor={(item) => item.id}
          renderItem={renderJob}
          numColumns={layout.desktop ? 2 : 1}
          columnWrapperStyle={layout.desktop ? styles.jobColumns : undefined}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter }]}
          refreshControl={(
            <RefreshControl refreshing={refreshing} onRefresh={() => void loadJobs(true)} />
          )}
          ListHeaderComponent={loadError ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={19} color="#B91C1C" />
              <Text style={styles.errorText}>{tv(loadError)}</Text>
              <TouchableOpacity onPress={() => void loadJobs()} accessibilityRole="button">
                <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyCard}>
              <Ionicons
                name={filter === 'active' ? 'cube-outline' : 'checkmark-done-circle-outline'}
                size={34}
                color={filter === 'active' ? '#9CA3AF' : '#059669'}
              />
              <Text style={styles.emptyTitle}>
                {tv(filter === 'active' ? t('لا توجد مهام إرجاع جارية') : t('لا توجد مهام مسلّمة بعد'))}
              </Text>
              <Text style={styles.emptyText}>{t('تظهر المهمة بعد اعتمادها وإسنادها إليك من الإدارة.')}</Text>
            </View>
          )}
        />
      )}

      <Modal visible={Boolean(selectedJob && targetStatus)} transparent animationType="fade" onRequestClose={closeStep}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={[styles.modalScroll, { padding: layout.gutter }]}>
            <View style={[styles.modalCard, layout.compact && styles.modalCardCompact]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {tv(targetStatus === 'picked_up' ? t('إثبات استلام المرتجع') : t('إثبات تسليم المرتجع'))}
                  </Text>
                  <Text style={styles.modalSubtitle}>{t('طلب {0}', [tv(selectedJob?.order_number)])}</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeStep}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('إغلاق إثبات خطوة الإرجاع')}
                >
                  <Ionicons name="close" size={21} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.instructionBox}>
                <Ionicons name="information-circle-outline" size={19} color="#1D4ED8" />
                <Text style={styles.instructionText}>
                  {tv(targetStatus === 'picked_up'
                    ? t('التقط صورة واضحة للمرتجع عند استلامه من العميل. بعد التأكيد ستتحول المهمة تلقائيًا إلى «قيد النقل».')
                    : t('التقط صورة واضحة عند تسليم المرتجع للتاجر. يجب أن تكون في موقع المتجر وقت التأكيد.'))}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.captureBox, layout.compact && styles.captureBoxCompact]}
                onPress={() => void captureProof()}
                disabled={capturing || submitting}
                accessibilityRole="button"
                accessibilityLabel={t('التقاط صورة إثبات الإرجاع')}
              >
                {proofPhoto ? (
                  <Image source={{ uri: proofPhoto.uri }} style={styles.proofPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.capturePlaceholder}>
                    {capturing
                      ? <ActivityIndicator size="large" color={COLORS.primary} />
                      : <Ionicons name="camera-outline" size={38} color={COLORS.primary} />}
                    <Text style={styles.captureTitle}>{t('التقط صورة الإثبات')}</Text>
                    <Text style={styles.captureSubtitle}>{t('JPEG أو PNG · حتى 10 ميجابايت')}</Text>
                  </View>
                )}
                {proofPhoto ? (
                  <View style={styles.retakeBadge}>
                    <Ionicons name="camera-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.retakeText}>{t('إعادة الالتقاط')}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              <View style={styles.locationBox}>
                <View style={[styles.locationIcon, {
                  backgroundColor: proofLocation && hasFreshDeliveryLocation(proofLocation.timestamp)
                    ? '#D1FAE5'
                    : '#FEF3C7',
                }]}>
                  <Ionicons
                    name="location-outline"
                    size={19}
                    color={proofLocation && hasFreshDeliveryLocation(proofLocation.timestamp) ? '#047857' : '#92400E'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationTitle}>
                    {tv(proofLocation && hasFreshDeliveryLocation(proofLocation.timestamp)
                      ? t('الموقع الحالي موثّق')
                      : t('يلزم تحديث الموقع الحالي'))}
                  </Text>
                  <Text style={styles.locationSubtitle}>
                    {tv(proofLocation
                      ? `${proofLocation.latitude.toFixed(5)}, ${proofLocation.longitude.toFixed(5)}`
                      : t('لا توجد إحداثيات صالحة بعد'))}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.locationRefresh}
                  onPress={() => void refreshProofLocation()}
                  disabled={locating || submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('تحديث موقع إثبات الإرجاع')}
                >
                  {locating
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Ionicons name="refresh" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              </View>

              {proofError ? (
                <View style={styles.proofErrorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                  <Text style={styles.proofErrorText}>{tv(proofError)}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.confirmButton, submitting && { opacity: 0.65 }]}
                onPress={() => void submitStep()}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Ionicons name="shield-checkmark-outline" size={19} color="#FFFFFF" />}
                <Text style={styles.confirmButtonText}>
                  {tv(submitting
                    ? t('جاري حفظ الإثبات…')
                    : targetStatus === 'picked_up'
                      ? t('تأكيد الاستلام وبدء النقل')
                      : t('تأكيد التسليم للتاجر'))}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#111827', fontSize: 19, fontWeight: '900', textAlign: 'right' },
  headerSubtitle: { color: '#6B7280', fontSize: 10.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  refreshButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  filterButton: { flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { backgroundColor: '#111827' },
  filterText: { color: '#6B7280', fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { padding: 20, gap: 12, paddingBottom: 110, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  jobColumns: { gap: 14 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { color: '#6B7280', fontSize: 12.5, fontWeight: '600' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 12, marginBottom: 2 },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 11.5, fontWeight: '600', lineHeight: 18, textAlign: 'right' },
  retryText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' },
  emptyCard: { marginTop: 50, alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#374151', fontSize: 14, fontWeight: '800', marginTop: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  jobCard: { flex: 1, minWidth: 0, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#E5E7EB', gap: 11 },
  jobHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  jobIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  orderNumber: { color: '#111827', fontSize: 14, fontWeight: '900', textAlign: 'right' },
  reason: { color: '#6B7280', fontSize: 10.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  jobStatus: { fontSize: 9.5, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', flexShrink: 1 },
  timeline: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  timelineStep: { width: 66, alignItems: 'center' },
  timelineDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5E7EB', borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  timelineDotCurrent: { backgroundColor: '#DBEAFE', borderColor: '#2563EB' },
  timelineDotDone: { backgroundColor: '#059669', borderColor: '#059669' },
  timelineLabel: { color: '#9CA3AF', fontSize: 8.5, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  timelineLabelDone: { color: '#374151' },
  timelineLine: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginTop: 10, marginHorizontal: -14 },
  timelineLineDone: { backgroundColor: '#059669' },
  scheduleBox: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, backgroundColor: '#F9FAFB', padding: 10 },
  scheduleText: { flex: 1, color: '#4B5563', fontSize: 10.5, fontWeight: '700', textAlign: 'right' },
  destinationCard: { borderRadius: 13, borderWidth: 1, borderColor: '#E5E7EB', padding: 11 },
  destinationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  destinationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  destinationTitle: { color: '#1F2937', fontSize: 11.5, fontWeight: '800', textAlign: 'right' },
  destinationAddress: { color: '#6B7280', fontSize: 10, fontWeight: '600', lineHeight: 15, marginTop: 2, textAlign: 'right' },
  destinationPhone: { color: '#2563EB', fontSize: 9.5, fontWeight: '700', marginTop: 3, textAlign: 'right' },
  mapButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  primaryAction: { minHeight: 48, borderRadius: 13, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  completedBox: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, backgroundColor: '#ECFDF5', padding: 11 },
  completedText: { flex: 1, color: '#047857', fontSize: 10.5, fontWeight: '700', lineHeight: 16, textAlign: 'right' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 22, padding: 20, backgroundColor: '#FFFFFF' },
  modalCardCompact: { padding: 15, borderRadius: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13 },
  modalTitle: { color: '#111827', fontSize: 18, fontWeight: '900', textAlign: 'right' },
  modalSubtitle: { color: '#6B7280', fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  instructionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, backgroundColor: '#EFF6FF', padding: 11, marginBottom: 12 },
  instructionText: { flex: 1, color: '#1D4ED8', fontSize: 10.5, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  captureBox: { height: 210, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', marginBottom: 12 },
  captureBoxCompact: { height: 180 },
  capturePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { color: '#1F2937', fontSize: 13, fontWeight: '800', marginTop: 8 },
  captureSubtitle: { color: '#6B7280', fontSize: 10, fontWeight: '600', marginTop: 3 },
  proofPreview: { width: '100%', height: '100%' },
  retakeBadge: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.82)', paddingHorizontal: 9, paddingVertical: 6 },
  retakeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
  locationBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 13, borderWidth: 1, borderColor: '#E5E7EB', padding: 11, marginBottom: 12 },
  locationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  locationTitle: { color: '#1F2937', fontSize: 11.5, fontWeight: '800', textAlign: 'right' },
  locationSubtitle: { color: '#6B7280', fontSize: 9.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  locationRefresh: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  proofErrorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 12, backgroundColor: '#FEF2F2', padding: 11, marginBottom: 12 },
  proofErrorText: { flex: 1, color: '#B91C1C', fontSize: 10.5, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  confirmButton: { minHeight: 50, borderRadius: 13, backgroundColor: '#111827', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});

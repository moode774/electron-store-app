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
import { translate, useTranslation } from '../../i18n';

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

type JobFilter = 'active' | 'completed';

const REASON_LABELS: Record<DeliveryReturnJob['reason'], string> = {
  damaged: 'deliveryReturns.reasonDamaged',
  not_as_described: 'deliveryReturns.reasonNotAsDescribed',
  wrong_item: 'deliveryReturns.reasonWrongItem',
  changed_mind: 'deliveryReturns.reasonChangedMind',
  other: 'deliveryReturns.reasonOther',
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
  if (!value) return translate('deliveryReturns.unspecified');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate('deliveryReturns.unspecified');
  return date.toLocaleString(translate('adminUi.locale'), { dateStyle: 'medium', timeStyle: 'short' });
}

function locationLabel(job: DeliveryReturnJob, destination: 'customer' | 'merchant'): string {
  if (destination === 'customer') {
    if (!job.address) return `${translate('deliveryReturns.customerAddress')} (${job.address_id.slice(-8)})`;
    return [job.address.full_address, job.address.area, job.address.city].filter(Boolean).join(', ');
  }
  if (!job.merchant) return `${translate('deliveryReturns.store')} (${job.merchant_id.slice(-8)})`;
  return [job.merchant.address, job.merchant.city].filter(Boolean).join(', ') || job.merchant.store_name;
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

export default function DeliveryReturnsScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const isTabRoot = route?.name === 'DeliveryReturnsTab';
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
      setLoadError(errorMessage(error, t('deliveryReturns.loadFailed')));
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
        throw new Error(t('deliveryReturns.locationPermissionRequired'));
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
      setProofError(errorMessage(error, t('deliveryReturns.locationFailed')));
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
          throw new Error(t('deliveryReturns.cameraPermissionRequired'));
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
      if (!supported) throw new Error(t('deliveryReturns.unsupportedImage'));
      if (Number.isFinite(asset.fileSize) && (asset.fileSize as number) > RETURN_PROOF_MAX_BYTES) {
        throw new Error(t('deliveryReturns.imageTooLarge'));
      }

      setProofPhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
      await refreshProofLocation();
    } catch (error) {
      setProofError(errorMessage(error, t('deliveryReturns.captureFailed')));
    } finally {
      setCapturing(false);
    }
  }, [capturing, refreshProofLocation, submitting]);

  const submitStep = useCallback(async () => {
    if (!selectedJob || !targetStatus || !user?.id || submitLock.current || submitting) return;
    if (!proofPhoto) {
      setProofError(t('deliveryReturns.captureBeforeConfirm'));
      return;
    }
    if (!proofLocation || !hasValidDeliveryCoordinates(
      proofLocation.latitude,
      proofLocation.longitude,
    )) {
      setProofError(t('deliveryReturns.refreshLocationBeforeConfirm'));
      return;
    }
    if (!hasFreshDeliveryLocation(proofLocation.timestamp)) {
      setProofError(t('deliveryReturns.staleLocation'));
      return;
    }
    if (
      (selectedJob.status === 'pickup_scheduled' && targetStatus !== 'picked_up')
      || (selectedJob.status === 'picked_up' && targetStatus !== 'received')
    ) {
      setProofError(t('deliveryReturns.stepChanged'));
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
        setProofError(errorMessage(error, t('deliveryReturns.confirmFailed')));
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
      completedTarget === 'picked_up' ? t('deliveryReturns.pickupRecorded') : t('deliveryReturns.deliveryRecorded'),
      completedTarget === 'picked_up'
        ? t('deliveryReturns.pickupRecordedText')
        : t('deliveryReturns.deliveryRecordedText'),
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
      Alert.alert(t('deliveryReturns.incompleteAddress'), t('deliveryReturns.incompleteAddressText'));
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('deliveryReturns.mapOpenFailed'), t('deliveryReturns.mapOpenFailedText'));
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
            backgroundColor: received ? '#D1FAE5' : inTransit ? COLORS.primarySoft : '#FEF3C7',
          }]}>
            <Ionicons
              name={received ? 'checkmark-done' : inTransit ? 'bicycle-outline' : 'cube-outline'}
              size={22}
              color={received ? '#047857' : inTransit ? COLORS.primary : '#92400E'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNumber}>{t('adminUi.order')} {job.order_number}</Text>
            <Text style={styles.reason}>{t(REASON_LABELS[job.reason])} · {quantity} {t('deliveryReturns.items')}</Text>
          </View>
          <Text style={[styles.jobStatus, {
            color: received ? '#047857' : inTransit ? COLORS.primary : '#92400E',
            backgroundColor: received ? '#D1FAE5' : inTransit ? COLORS.primarySoft : '#FEF3C7',
          }]}>
            {received ? t('deliveryReturns.reachedMerchant') : inTransit ? t('deliveryReturns.inTransit') : t('deliveryReturns.awaitingPickup')}
          </Text>
        </View>

        <View style={styles.timeline}>
          <View style={styles.timelineStep}>
            <View style={[styles.timelineDot, (inTransit || received) && styles.timelineDotDone]}>
              {(inTransit || received) ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.timelineLabel, (inTransit || received) && styles.timelineLabelDone]}>{t('deliveryReturns.customerPickup')}</Text>
          </View>
          <View style={[styles.timelineLine, (inTransit || received) && styles.timelineLineDone]} />
          <View style={styles.timelineStep}>
            <View style={[styles.timelineDot, inTransit && styles.timelineDotCurrent, received && styles.timelineDotDone]}>
              {received ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.timelineLabel, (inTransit || received) && styles.timelineLabelDone]}>{t('deliveryReturns.inTransit')}</Text>
          </View>
          <View style={[styles.timelineLine, received && styles.timelineLineDone]} />
          <View style={styles.timelineStep}>
            <View style={[styles.timelineDot, received && styles.timelineDotDone]}>
              {received ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.timelineLabel, received && styles.timelineLabelDone]}>{t('deliveryReturns.merchantDelivery')}</Text>
          </View>
        </View>

        <View style={styles.scheduleBox}>
          <Ionicons name="calendar-outline" size={17} color="#6B7280" />
          <Text style={styles.scheduleText}>{t('deliveryReturns.appointment')}: {dateTime(job.scheduled_at)}</Text>
        </View>

        <View style={styles.destinationCard}>
          <View style={styles.destinationTitleRow}>
            <View style={[styles.destinationIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="person-outline" size={18} color="#92400E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.destinationTitle}>{t('deliveryReturns.pickupFromCustomer')}</Text>
              <Text style={styles.destinationAddress}>{customerLocation}</Text>
            </View>
            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => void openMap(
                job.address?.latitude,
                job.address?.longitude,
                customerLocation,
              )}
              accessibilityRole="button"
              accessibilityLabel={t('deliveryReturns.openCustomerMap')}
            >
              <Ionicons name="navigate-outline" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.destinationCard}>
          <View style={styles.destinationTitleRow}>
            <View style={[styles.destinationIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="storefront-outline" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.destinationTitle}>{job.merchant?.store_name ?? t('adminUi.roleMerchant')}</Text>
              <Text style={styles.destinationAddress}>{merchantLocation}</Text>
              {job.merchant?.store_phone ? (
                <Text style={styles.destinationPhone}>{job.merchant.store_phone}</Text>
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
              accessibilityLabel={t('deliveryReturns.openMerchantMap')}
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
            accessibilityLabel={pickupPending ? t('deliveryReturns.confirmCustomerPickup') : t('deliveryReturns.confirmMerchantDelivery')}
          >
            <Ionicons name="camera-outline" size={19} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>
              {pickupPending ? t('deliveryReturns.documentCustomerPickup') : t('deliveryReturns.documentMerchantDelivery')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.completedBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#047857" />
            <Text style={styles.completedText}>{t('deliveryReturns.custodyComplete')}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        {isTabRoot ? null : (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('adminUi.back')}
          >
            <Ionicons name="arrow-forward" size={23} color={COLORS.ink} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('deliveryReturns.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('deliveryReturns.subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadJobs(true)}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel={t('deliveryReturns.refreshA11y')}
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
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            {t('deliveryReturns.active')} ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
          onPress={() => setFilter('completed')}
          accessibilityRole="button"
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            {t('deliveryReturns.completed')} ({completedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.centerText}>{t('deliveryReturns.loading')}</Text>
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
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity onPress={() => void loadJobs()} accessibilityRole="button">
                <Text style={styles.retryText}>{t('adminUi.retry')}</Text>
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
                {filter === 'active' ? t('deliveryReturns.noActive') : t('deliveryReturns.noCompleted')}
              </Text>
              <Text style={styles.emptyText}>{t('deliveryReturns.emptyHint')}</Text>
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
                    {targetStatus === 'picked_up' ? t('deliveryReturns.pickupProofTitle') : t('deliveryReturns.deliveryProofTitle')}
                  </Text>
                  <Text style={styles.modalSubtitle}>{t('adminUi.order')} {selectedJob?.order_number}</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeStep}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('deliveryReturns.closeProofA11y')}
                >
                  <Ionicons name="close" size={21} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.instructionBox}>
                <Ionicons name="information-circle-outline" size={19} color={COLORS.primary} />
                <Text style={styles.instructionText}>
                  {targetStatus === 'picked_up'
                    ? t('deliveryReturns.pickupProofHint')
                    : t('deliveryReturns.deliveryProofHint')}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.captureBox, layout.compact && styles.captureBoxCompact]}
                onPress={() => void captureProof()}
                disabled={capturing || submitting}
                accessibilityRole="button"
                accessibilityLabel={t('deliveryReturns.captureProofA11y')}
              >
                {proofPhoto ? (
                  <Image source={{ uri: proofPhoto.uri }} style={styles.proofPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.capturePlaceholder}>
                    {capturing
                      ? <ActivityIndicator size="large" color={COLORS.primary} />
                      : <Ionicons name="camera-outline" size={38} color={COLORS.primary} />}
                    <Text style={styles.captureTitle}>{t('deliveryReturns.captureProof')}</Text>
                    <Text style={styles.captureSubtitle}>{t('deliveryReturns.imageRequirements')}</Text>
                  </View>
                )}
                {proofPhoto ? (
                  <View style={styles.retakeBadge}>
                    <Ionicons name="camera-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.retakeText}>{t('deliveryReturns.retake')}</Text>
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
                    {proofLocation && hasFreshDeliveryLocation(proofLocation.timestamp)
                      ? t('deliveryReturns.locationVerified')
                      : t('deliveryReturns.locationNeedsRefresh')}
                  </Text>
                  <Text style={styles.locationSubtitle}>
                    {proofLocation
                      ? `${proofLocation.latitude.toFixed(5)}, ${proofLocation.longitude.toFixed(5)}`
                      : t('deliveryReturns.noValidCoordinates')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.locationRefresh}
                  onPress={() => void refreshProofLocation()}
                  disabled={locating || submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('deliveryReturns.refreshProofLocationA11y')}
                >
                  {locating
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Ionicons name="refresh" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              </View>

              {proofError ? (
                <View style={styles.proofErrorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
                  <Text style={styles.proofErrorText}>{proofError}</Text>
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
                  {submitting
                    ? t('deliveryReturns.savingProof')
                    : targetStatus === 'picked_up'
                      ? t('deliveryReturns.confirmPickupStartTransit')
                      : t('deliveryReturns.confirmDeliveryToMerchant')}
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
  container: { flex: 1, backgroundColor: COLORS.canvas },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 38, paddingBottom: 16, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '900', textAlign: 'right' },
  headerSubtitle: { color: COLORS.inkSecondary, fontSize: 10.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 20, paddingBottom: 10, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  filterButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.hairline, alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { backgroundColor: COLORS.primary },
  filterText: { color: COLORS.inkSecondary, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { padding: 20, gap: 12, paddingBottom: 110, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  jobColumns: { gap: 14 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { color: COLORS.inkSecondary, fontSize: 12.5, fontWeight: '600' },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 12, marginBottom: 2 },
  errorText: { flex: 1, color: '#B91C1C', fontSize: 11.5, fontWeight: '600', lineHeight: 18, textAlign: 'right' },
  retryText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' },
  emptyCard: { marginTop: 50, alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#374151', fontSize: 14, fontWeight: '800', marginTop: 10 },
  emptyText: { color: COLORS.inkTertiary, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  jobCard: { flex: 1, minWidth: 0, backgroundColor: COLORS.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: COLORS.hairline, gap: 13, shadowColor: '#111827', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.025, shadowRadius: 14, elevation: 1 },
  jobHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  jobIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  orderNumber: { color: COLORS.ink, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  reason: { color: COLORS.inkSecondary, fontSize: 10.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  jobStatus: { fontSize: 9.5, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', flexShrink: 1 },
  timeline: { flexDirection: 'row-reverse', alignItems: 'flex-end', paddingHorizontal: 4, paddingVertical: 4 },
  timelineStep: { width: 66, alignItems: 'center' },
  timelineDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5E7EB', borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  timelineDotCurrent: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  timelineDotDone: { backgroundColor: '#059669', borderColor: '#059669' },
  timelineLabel: { color: COLORS.inkTertiary, fontSize: 8.5, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  timelineLabelDone: { color: '#374151' },
  timelineLine: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginTop: 10, marginHorizontal: -14 },
  timelineLineDone: { backgroundColor: '#059669' },
  scheduleBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, borderRadius: 11, backgroundColor: COLORS.canvas, padding: 10 },
  scheduleText: { flex: 1, color: COLORS.inkSecondary, fontSize: 10.5, fontWeight: '700', textAlign: 'right' },
  destinationCard: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.hairline, backgroundColor: COLORS.surface, padding: 12 },
  destinationTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  destinationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  destinationTitle: { color: '#1F2937', fontSize: 11.5, fontWeight: '800', textAlign: 'right' },
  destinationAddress: { color: COLORS.inkSecondary, fontSize: 10, fontWeight: '600', lineHeight: 15, marginTop: 2, textAlign: 'right' },
  destinationPhone: { color: COLORS.primary, fontSize: 9.5, fontWeight: '700', marginTop: 3, textAlign: 'right' },
  mapButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { minHeight: 52, borderRadius: 15, backgroundColor: COLORS.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  completedBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, borderRadius: 12, backgroundColor: '#ECFDF5', padding: 11 },
  completedText: { flex: 1, color: '#047857', fontSize: 10.5, fontWeight: '700', lineHeight: 16, textAlign: 'right' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 24, padding: 20, backgroundColor: COLORS.surface },
  modalCardCompact: { padding: 15, borderRadius: 18 },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 13 },
  modalTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900', textAlign: 'right' },
  modalSubtitle: { color: COLORS.inkSecondary, fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  instructionBox: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, borderRadius: 12, backgroundColor: COLORS.primarySoft, padding: 11, marginBottom: 12 },
  instructionText: { flex: 1, color: COLORS.primary, fontSize: 10.5, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  captureBox: { height: 210, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: COLORS.primarySoft, marginBottom: 12 },
  captureBoxCompact: { height: 180 },
  capturePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { color: '#1F2937', fontSize: 13, fontWeight: '800', marginTop: 8 },
  captureSubtitle: { color: COLORS.inkSecondary, fontSize: 10, fontWeight: '600', marginTop: 3 },
  proofPreview: { width: '100%', height: '100%' },
  retakeBadge: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.82)', paddingHorizontal: 9, paddingVertical: 6 },
  retakeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
  locationBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, borderRadius: 13, borderWidth: 1, borderColor: '#E5E7EB', padding: 11, marginBottom: 12 },
  locationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  locationTitle: { color: '#1F2937', fontSize: 11.5, fontWeight: '800', textAlign: 'right' },
  locationSubtitle: { color: COLORS.inkSecondary, fontSize: 9.5, fontWeight: '600', marginTop: 2, textAlign: 'right' },
  locationRefresh: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  proofErrorBox: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 7, borderRadius: 12, backgroundColor: '#FEF2F2', padding: 11, marginBottom: 12 },
  proofErrorText: { flex: 1, color: '#B91C1C', fontSize: 10.5, fontWeight: '600', lineHeight: 17, textAlign: 'right' },
  confirmButton: { minHeight: 50, borderRadius: 13, backgroundColor: COLORS.primary, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});

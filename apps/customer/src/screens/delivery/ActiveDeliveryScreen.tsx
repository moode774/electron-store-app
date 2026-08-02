import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { BREAKPOINTS, COLORS, ORDER_STATUS } from '@marketplace/shared-utils';
import {
  confirmOrderPickup,
  getDeliveryOrders,
  getOrderById,
  OrderDetail,
  supabase,
  updateOrderStatus,
  useAuthStore,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import {
  DeliveryCoordinates,
  getDeliveryRuntimeProfile,
  recordDeliveryLocation,
} from './deliveryData';
import {
  completeDeliveryWithProof,
  DeliveryProofPhoto,
  uploadDeliveryProofPhoto,
} from './deliveryProofData';
import {
  createDeliveryIdempotencyKey,
  getDeliveryProofValidationError,
  hasFreshDeliveryLocation,
} from './deliveryProofValidation';

const ACTIVE_DELIVERY_STATUSES = new Set(['assigned', ORDER_STATUS.PICKED_UP, ORDER_STATUS.ON_THE_WAY]);
const FALLBACK_REFRESH_MS = 20_000;

type PendingLocationSample = {
  orderId: string;
  sampleId: string;
  coordinates: DeliveryCoordinates;
};

const STEPS = [
  { key: 'heading_pickup', label: 'متجه للمتجر', action: 'وصلت إلى المتجر', statusOnEnter: null as string | null },
  { key: 'at_pickup', label: 'في المتجر', action: 'استلمت الطلب', statusOnEnter: null as string | null },
  { key: 'on_the_way', label: 'في الطريق للعميل', action: 'وصلت إلى العميل', statusOnEnter: ORDER_STATUS.PICKED_UP as string | null },
  { key: 'at_dropoff', label: 'عند العميل', action: 'إضافة إثبات التسليم', statusOnEnter: ORDER_STATUS.ON_THE_WAY as string | null },
];

const stepFromStatus = (status?: string): number => {
  switch (status) {
    case ORDER_STATUS.PICKED_UP: return 2;
    case ORDER_STATUS.ON_THE_WAY: return 3;
    default: return 0;
  }
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function ActiveDeliveryScreen({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isCompact = width < BREAKPOINTS.compact;
  const pageGutter = isDesktop ? 32 : width >= BREAKPOINTS.tablet ? 24 : isCompact ? 16 : 20;
  const paramOrderId: string | undefined = route?.params?.orderId;
  const user = useAuthStore((state) => state.user);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationStatus, setLocationStatus] = useState('جاري بدء مشاركة الموقع...');
  const [advancing, setAdvancing] = useState(false);
  const [proofVisible, setProofVisible] = useState(false);
  const [proofPhoto, setProofPhoto] = useState<DeliveryProofPhoto | null>(null);
  const [proofError, setProofError] = useState('');
  const [refreshingProofLocation, setRefreshingProofLocation] = useState(false);
  const [completingDelivery, setCompletingDelivery] = useState(false);
  const [uploadedProofPath, setUploadedProofPath] = useState<string | null>(null);
  const advanceLock = useRef(false);
  const [pickupCode, setPickupCode] = useState('');
  const completionLock = useRef(false);
  const proofIdempotencyKeyRef = useRef<string | null>(null);
  const proofLocationLock = useRef(false);
  const locationWriteLock = useRef(false);
  const pendingLocationSample = useRef<PendingLocationSample | null>(null);
  const latestLocationCoordinates = useRef<DeliveryCoordinates | null>(null);

  const loadOrder = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setLoadError('');

    try {
      let loaded: OrderDetail | null = null;
      if (paramOrderId) {
        loaded = await getOrderById(paramOrderId);
      } else if (user?.id) {
        const mine = await getDeliveryOrders(user.id);
        const active = mine.find((candidate) => ACTIVE_DELIVERY_STATUSES.has(candidate.status));
        if (active) loaded = await getOrderById(active.id);
      }

      setOrder(loaded);
      if (loaded) setStepIndex(stepFromStatus(loaded.status));
    } catch (error) {
      setLoadError(errorMessage(error, 'تعذّر تحميل التوصيلة. تحقق من الاتصال وحاول مجددًا.'));
    } finally {
      setLoading(false);
    }
  }, [paramOrderId, user?.id]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadOrder(true);

    const refreshTimer = setInterval(() => {
      if (active) void loadOrder();
    }, FALLBACK_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [loadOrder]));

  const orderId = order?.id ?? paramOrderId;

  useEffect(() => {
    if (!orderId) return undefined;

    const channel = supabase
      .channel(`active-delivery-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { void loadOrder(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadOrder, orderId]);

  const terminalOrder = order?.status === ORDER_STATUS.DELIVERED || order?.status === 'cancelled';

  useEffect(() => {
    let cancelled = false;
    let locationSubscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      if (!orderId || !user?.id || terminalOrder) return;
      if (Platform.OS === 'web') {
        setLocationStatus('مشاركة الموقع الحية متاحة من تطبيق الجوال.');
        return;
      }

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setLocationStatus('إذن الموقع مطلوب لمشاركة تقدم التوصيلة مع العميل.');
          return;
        }

        const runtimeProfile = await getDeliveryRuntimeProfile(user.id);
        if (!runtimeProfile) {
          setLocationStatus('تعذّر العثور على ملف المندوب لإرسال الموقع.');
          return;
        }

        if (pendingLocationSample.current?.orderId !== orderId) {
          pendingLocationSample.current = null;
        }
        latestLocationCoordinates.current = null;

        const flushLocation = async (): Promise<void> => {
          if (cancelled || locationWriteLock.current) return;
          let pending = pendingLocationSample.current;
          if (!pending) {
            const coordinates = latestLocationCoordinates.current;
            if (!coordinates) return;
            latestLocationCoordinates.current = null;
            pending = {
              orderId,
              sampleId: createDeliveryIdempotencyKey(),
              coordinates,
            };
            pendingLocationSample.current = pending;
          }

          locationWriteLock.current = true;
          let sent = false;
          try {
            await recordDeliveryLocation(
              runtimeProfile.id,
              pending.orderId,
              pending.sampleId,
              pending.coordinates,
            );
            sent = true;
            if (pendingLocationSample.current?.sampleId === pending.sampleId) {
              pendingLocationSample.current = null;
            }
          } catch (error) {
            if (!cancelled) {
              setLocationStatus(errorMessage(error, 'تعذّر إرسال آخر تحديث للموقع، وستتم إعادة نفس العينة بأمان.'));
            }
          } finally {
            locationWriteLock.current = false;
            if (sent && !cancelled && latestLocationCoordinates.current) {
              void flushLocation();
            }
          }
        };

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10_000,
            distanceInterval: 25,
          },
          (nextLocation) => {
            if (cancelled) return;
            setLocation(nextLocation);
            setLocationStatus('تمت مشاركة آخر تحديث للموقع.');
            latestLocationCoordinates.current = {
              latitude: nextLocation.coords.latitude,
              longitude: nextLocation.coords.longitude,
              speed: nextLocation.coords.speed,
            };
            void flushLocation();
          },
        );

        if (cancelled) subscription.remove();
        else locationSubscription = subscription;
      } catch (error) {
        if (!cancelled) setLocationStatus(errorMessage(error, 'تعذّر بدء مشاركة الموقع.'));
      }
    };

    void startTracking();
    return () => {
      cancelled = true;
      locationSubscription?.remove();
    };
  }, [orderId, terminalOrder, user?.id]);

  const currentStep = STEPS[stepIndex] ?? STEPS[0];
  const orderView = {
    store: order?.merchant_profiles?.store_name ?? 'المتجر',
    customer: order?.customer?.full_name ?? 'العميل',
    customerPhone: order?.customer?.phone ?? '',
    dropoff: order?.addresses?.full_address ?? 'عنوان العميل',
    codAmount: order?.total_amount ?? 0,
    // وجهات التوجيه في خرائط جوجل (نص العنوان — يعمل بدون إحداثيات)
    storeMapsQuery: [order?.merchant_profiles?.store_name, order?.merchant_profiles?.address, order?.merchant_profiles?.city]
      .filter(Boolean).join('، '),
    dropoffMapsQuery: [order?.addresses?.full_address, order?.addresses?.city].filter(Boolean).join('، '),
  };

  const openInMaps = (destination: string) => {
    if (!destination) return;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`);
  };
  const proofValidationMessage = getDeliveryProofValidationError({
    photoUri: proofPhoto?.uri,
    photoMimeType: proofPhoto?.mimeType,
    photoSize: proofPhoto?.fileSize,
    latitude: location?.coords.latitude,
    longitude: location?.coords.longitude,
    locationTimestamp: location?.timestamp,
  });
  const proofLocationFresh = hasFreshDeliveryLocation(location?.timestamp);

  const goHome = useCallback(() => {
    const currentNavigatorRoutes: string[] = navigation.getState?.()?.routeNames ?? [];
    if (currentNavigatorRoutes.includes('DeliveryHome')) {
      navigation.navigate('DeliveryHome');
      return;
    }
    navigation.getParent()?.navigate('DeliveryHome');
  }, [navigation]);

  useEffect(() => {
    setProofVisible(false);
    setProofPhoto(null);
    setProofError('');
    setUploadedProofPath(null);
    proofIdempotencyKeyRef.current = null;
  }, [orderId]);

  const refreshProofLocation = useCallback(async () => {
    if (proofLocationLock.current) return;
    proofLocationLock.current = true;
    setRefreshingProofLocation(true);
    setProofError('');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('اسمح بالوصول إلى الموقع لإرفاقه بإثبات التسليم.');
      }

      const nextLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(nextLocation);
      setLocationStatus('تم تحديث موقع إثبات التسليم.');
    } catch (error) {
      setProofError(errorMessage(error, 'تعذّر تحديد موقع إثبات التسليم. حاول مجددًا.'));
    } finally {
      proofLocationLock.current = false;
      setRefreshingProofLocation(false);
    }
  }, []);

  const openDeliveryProof = useCallback(() => {
    if (!proofIdempotencyKeyRef.current) {
      proofIdempotencyKeyRef.current = createDeliveryIdempotencyKey();
    }
    setProofError('');
    setProofVisible(true);

    if (!hasFreshDeliveryLocation(location?.timestamp)) {
      void refreshProofLocation();
    }
  }, [location?.timestamp, refreshProofLocation]);

  const captureProofPhoto = useCallback(async () => {
    if (uploadedProofPath || completingDelivery) return;
    setProofError('');

    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('اسمح باستخدام الكاميرا لالتقاط صورة إثبات التسليم.');
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setProofPhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      });
      setUploadedProofPath(null);
      proofIdempotencyKeyRef.current = createDeliveryIdempotencyKey();
    } catch (error) {
      setProofError(errorMessage(error, 'تعذّر فتح الكاميرا. حاول مجددًا.'));
    }
  }, [completingDelivery, uploadedProofPath]);

  const submitDeliveryProof = useCallback(async () => {
    if (!orderId || !order || !user?.id || completionLock.current || terminalOrder) return;

    const validationError = getDeliveryProofValidationError({
      photoUri: proofPhoto?.uri,
      photoMimeType: proofPhoto?.mimeType,
      photoSize: proofPhoto?.fileSize,
      latitude: location?.coords.latitude,
      longitude: location?.coords.longitude,
      locationTimestamp: location?.timestamp,
    });
    if (validationError) {
      setProofError(validationError);
      return;
    }

    const idempotencyKey = proofIdempotencyKeyRef.current ?? createDeliveryIdempotencyKey();
    proofIdempotencyKeyRef.current = idempotencyKey;
    completionLock.current = true;
    setCompletingDelivery(true);
    setProofError('');

    const confirmFromServer = async (): Promise<OrderDetail | null> => {
      try {
        const confirmed = await getOrderById(orderId);
        return confirmed?.status === ORDER_STATUS.DELIVERED ? confirmed : null;
      } catch {
        return null;
      }
    };

    const showConfirmedSuccess = (confirmed: OrderDetail) => {
      setOrder(confirmed);
      setProofVisible(false);
      setProofPhoto(null);
      setUploadedProofPath(null);
      proofIdempotencyKeyRef.current = null;
      Alert.alert('تم تأكيد التسليم', `تحقق الخادم من إثبات التوصيلة ${order.order_number} وسجّل اكتمالها.`, [
        { text: 'العودة للرئيسية', onPress: goHome },
      ]);
    };

    try {
      let photoPath = uploadedProofPath;
      if (!photoPath) {
        photoPath = await uploadDeliveryProofPhoto({
          userId: user.id,
          orderId,
          idempotencyKey,
          photo: proofPhoto as DeliveryProofPhoto,
        });
        setUploadedProofPath(photoPath);
      }

      await completeDeliveryWithProof({
        orderId,
        photoPath,
        latitude: location!.coords.latitude,
        longitude: location!.coords.longitude,
        idempotencyKey,
      });

      const confirmed = await confirmFromServer();
      if (!confirmed) {
        throw new Error('استلم الخادم الإثبات، لكن لم نتمكن من تأكيد حالة الطلب. أعد المحاولة بنفس الإثبات؛ لن يتكرر التسجيل.');
      }
      showConfirmedSuccess(confirmed);
    } catch (error) {
      const confirmed = await confirmFromServer();
      if (confirmed) {
        showConfirmedSuccess(confirmed);
      } else {
        const message = errorMessage(error, 'تعذّر إرسال إثبات التسليم. بقي الطلب قيد التوصيل ويمكنك إعادة المحاولة.');
        setProofError(message);
        Alert.alert('لم يُؤكد التسليم', message);
      }
    } finally {
      completionLock.current = false;
      setCompletingDelivery(false);
    }
  }, [
    goHome,
    location,
    order,
    orderId,
    proofPhoto,
    terminalOrder,
    uploadedProofPath,
    user?.id,
  ]);

  const advanceStep = useCallback(async () => {
    if (!orderId || !order || advanceLock.current || terminalOrder) return;

    if (stepIndex >= STEPS.length - 1) {
      openDeliveryProof();
      return;
    }

    // الانتقال إلى picked_up يتطلب كود الاستلام من التاجر
    const upcomingStatus = STEPS[stepIndex + 1]?.statusOnEnter;
    if (upcomingStatus === ORDER_STATUS.PICKED_UP && !pickupCode.trim()) {
      Alert.alert('كود الاستلام مطلوب', 'اطلب كود الاستلام (6 أرقام) من التاجر وأدخله لتأكيد استلام الطلب.');
      return;
    }

    advanceLock.current = true;
    setAdvancing(true);
    const previousStep = stepIndex;

    try {
      const nextStep = previousStep + 1;
      const nextStatus = STEPS[nextStep].statusOnEnter;
      if (nextStatus === ORDER_STATUS.PICKED_UP) {
        await confirmOrderPickup(orderId, pickupCode);
        setPickupCode('');
        setOrder((currentOrder) => currentOrder ? { ...currentOrder, status: nextStatus } : currentOrder);
      } else if (nextStatus) {
        await updateOrderStatus(orderId, nextStatus);
        setOrder((currentOrder) => currentOrder ? { ...currentOrder, status: nextStatus } : currentOrder);
      }
      setStepIndex(nextStep);
    } catch (error) {
      setStepIndex(previousStep);
      Alert.alert('تعذّر تحديث التوصيلة', errorMessage(error, 'تحقق من الاتصال وحاول مجددًا.'));
      await loadOrder();
    } finally {
      advanceLock.current = false;
      setAdvancing(false);
    }
  }, [loadOrder, openDeliveryProof, order, orderId, pickupCode, stepIndex, terminalOrder]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else goHome();
  }, [goHome, navigation]);

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color={COLORS.primary} accessibilityLabel="جاري تحميل التوصيلة" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <View style={[styles.header, { paddingHorizontal: pageGutter }]}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>توصيلة نشطة</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name={loadError ? 'cloud-offline-outline' : 'bicycle-outline'} size={48} color={loadError ? '#DC2626' : '#D1D5DB'} />
          <Text style={styles.emptyTitle}>{loadError ? 'تعذّر تحميل التوصيلة' : 'لا توجد توصيلة نشطة'}</Text>
          <Text style={[styles.emptySubtitle, loadError && { color: '#DC2626' }]}>
            {loadError || 'اقبل طلبًا من الرئيسية لبدء التوصيل.'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void loadOrder(true)}
            accessibilityRole="button"
            accessibilityLabel="إعادة تحميل التوصيلة"
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={[styles.header, { paddingHorizontal: pageGutter }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="العودة"
        >
          <Ionicons name="arrow-forward" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>توصيلة نشطة</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: pageGutter }, isDesktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder} accessibilityLiveRegion="polite">
            <Ionicons name="location" size={44} color={location ? '#059669' : '#9CA3AF'} />
            <Text style={[styles.mapText, { color: location ? '#059669' : '#6B7280' }]}>{locationStatus}</Text>
            {location && (
              <Text style={styles.locationTime}>
                آخر تحديث: {new Date(location.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.stepsCard}>
          {STEPS.map((step, index) => {
            const isDone = index < stepIndex;
            const isCurrent = index === stepIndex;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIndicator}>
                  <View style={[styles.stepCircle, isDone && styles.stepCircleDone, isCurrent && styles.stepCircleCurrent]}>
                    {isDone
                      ? <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      : <Text style={[styles.stepNum, isCurrent && { color: '#FFFFFF' }]}>{index + 1}</Text>}
                  </View>
                  {index < STEPS.length - 1 && <View style={[styles.stepLine, isDone && { backgroundColor: '#059669' }]} />}
                </View>
                <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent, isDone && { color: '#059669' }]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>تفاصيل الطلب {order.order_number}</Text>

          <View style={styles.detailRow}>
            <Ionicons name="storefront-outline" size={18} color={COLORS.primary} />
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>الاستلام من</Text>
              <Text style={styles.detailValue}>{orderView.store}</Text>
            </View>
            <TouchableOpacity
              style={styles.mapsBtn}
              activeOpacity={0.7}
              onPress={() => openInMaps(orderView.storeMapsQuery)}
              accessibilityRole="button"
              accessibilityLabel="التوجه إلى المتجر عبر الخرائط"
            >
              <Ionicons name="navigate" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={18} color="#059669" />
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>التسليم إلى</Text>
              <Text style={styles.detailValue}>{orderView.customer} — {orderView.dropoff}</Text>
            </View>
            <TouchableOpacity
              style={styles.mapsBtn}
              activeOpacity={0.7}
              onPress={() => openInMaps(orderView.dropoffMapsQuery)}
              accessibilityRole="button"
              accessibilityLabel="التوجه إلى العميل عبر الخرائط"
            >
              <Ionicons name="navigate" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callBtn, !orderView.customerPhone && styles.disabledAction]}
              activeOpacity={0.7}
              disabled={!orderView.customerPhone}
              onPress={() => { void Linking.openURL(`tel:${orderView.customerPhone}`); }}
              accessibilityRole="button"
              accessibilityLabel="الاتصال بالعميل"
              accessibilityState={{ disabled: !orderView.customerPhone }}
            >
              <Ionicons name="call" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {order.payment_method === 'cash' && (
            <View style={[styles.codBox, isCompact && styles.codBoxCompact]}>
              <Text style={styles.codLabel}>المبلغ المطلوب تحصيله نقدًا</Text>
              <Text style={styles.codValue}>{orderView.codAmount.toLocaleString()} ر.ي</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {!terminalOrder && (
        <View style={styles.bottomBar}>
          <View style={[styles.bottomBarInner, { paddingHorizontal: pageGutter }]}>
          {STEPS[stepIndex + 1]?.statusOnEnter === ORDER_STATUS.PICKED_UP && (
            <View style={styles.pickupCodeRow}>
              <TextInput
                style={styles.pickupCodeInput}
                placeholder="كود الاستلام من التاجر (6 أرقام)"
                placeholderTextColor="#9CA3AF"
                value={pickupCode}
                onChangeText={setPickupCode}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                accessibilityLabel="كود الاستلام من التاجر"
              />
            </View>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, advancing && styles.disabledAction]}
            onPress={() => void advanceStep()}
            activeOpacity={0.8}
            disabled={advancing}
            accessibilityRole="button"
            accessibilityLabel={currentStep.action}
            accessibilityState={{ disabled: advancing, busy: advancing }}
          >
            {advancing
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={styles.actionBtnText}>{currentStep.action}</Text>}
          </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal
        visible={proofVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !completingDelivery && setProofVisible(false)}
      >
        <View style={[styles.proofModalOverlay, isDesktop && styles.proofModalOverlayDesktop]}>
          <View style={[styles.proofModalSheet, isDesktop && styles.proofModalSheetDesktop]}>
            <View style={styles.proofModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.proofModalTitle}>إثبات تسليم الطلب</Text>
                <Text style={styles.proofModalSubtitle}>لن تتغير حالة الطلب قبل تحقق الخادم من الإثبات.</Text>
              </View>
              <TouchableOpacity
                style={styles.proofCloseBtn}
                onPress={() => setProofVisible(false)}
                disabled={completingDelivery}
                accessibilityRole="button"
                accessibilityLabel="إغلاق إثبات التسليم"
                accessibilityState={{ disabled: completingDelivery }}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.proofModalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.unavailableCodeCard} accessibilityState={{ disabled: true }}>
                <View style={styles.proofMethodIcon}>
                  <Ionicons name="keypad-outline" size={20} color="#6B7280" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.proofMethodTitleRow}>
                    <Text style={styles.proofMethodTitle}>كود تسليم قصير</Text>
                    <Text style={styles.unavailableBadge}>غير مفعّل</Text>
                  </View>
                  <Text style={styles.proofMethodDescription}>لا توجد آلية تحقق خادمية للكود حاليًا، لذلك لن نستخدم تحققًا محليًا غير موثوق.</Text>
                </View>
              </View>

              <View style={styles.activeProofCard}>
                <View style={styles.proofSectionHeader}>
                  <View style={[styles.proofMethodIcon, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="camera-outline" size={20} color="#047857" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proofSectionTitle}>صورة التسليم</Text>
                    <Text style={styles.proofSectionSubtitle}>التقط صورة واضحة عند موقع العميل.</Text>
                  </View>
                </View>

                {proofPhoto ? (
                  <Image source={{ uri: proofPhoto.uri }} style={styles.proofPhotoPreview as ImageStyle} resizeMode="cover" />
                ) : (
                  <View style={styles.proofPhotoPlaceholder}>
                    <Ionicons name="image-outline" size={32} color="#9CA3AF" />
                    <Text style={styles.proofPhotoPlaceholderText}>لم تُلتقط صورة بعد</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.secondaryProofBtn, (completingDelivery || Boolean(uploadedProofPath)) && styles.disabledAction]}
                  onPress={() => void captureProofPhoto()}
                  disabled={completingDelivery || Boolean(uploadedProofPath)}
                  accessibilityRole="button"
                  accessibilityLabel={proofPhoto ? 'إعادة التقاط صورة التسليم' : 'التقاط صورة التسليم'}
                  accessibilityState={{ disabled: completingDelivery || Boolean(uploadedProofPath) }}
                >
                  <Ionicons name="camera" size={18} color="#111827" />
                  <Text style={styles.secondaryProofBtnText}>
                    {uploadedProofPath ? 'تم رفع الصورة للمحاولة الحالية' : proofPhoto ? 'إعادة التقاط الصورة' : 'التقاط صورة'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.activeProofCard}>
                <View style={styles.proofSectionHeader}>
                  <View style={[styles.proofMethodIcon, { backgroundColor: proofLocationFresh ? '#DCFCE7' : '#FEF3C7' }]}>
                    <Ionicons name="location-outline" size={20} color={proofLocationFresh ? '#047857' : '#B45309'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proofSectionTitle}>موقع التسليم</Text>
                    <Text style={styles.proofSectionSubtitle}>
                      {proofLocationFresh ? 'الموقع حديث وجاهز للإرفاق.' : 'يلزم تحديث الموقع قبل الإرسال.'}
                    </Text>
                  </View>
                </View>

                {location && (
                  <Text style={styles.proofCoordinates}>
                    {location.coords.latitude.toFixed(5)}، {location.coords.longitude.toFixed(5)}
                  </Text>
                )}

                <TouchableOpacity
                  style={[styles.secondaryProofBtn, (refreshingProofLocation || completingDelivery) && styles.disabledAction]}
                  onPress={() => void refreshProofLocation()}
                  disabled={refreshingProofLocation || completingDelivery}
                  accessibilityRole="button"
                  accessibilityLabel="تحديث موقع إثبات التسليم"
                  accessibilityState={{ disabled: refreshingProofLocation || completingDelivery, busy: refreshingProofLocation }}
                >
                  {refreshingProofLocation
                    ? <ActivityIndicator size="small" color="#111827" />
                    : <Ionicons name="locate" size={18} color="#111827" />}
                  <Text style={styles.secondaryProofBtnText}>تحديث الموقع</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.proofNotice, proofError ? styles.proofErrorNotice : null]} accessibilityRole={proofError ? 'alert' : undefined}>
                <Ionicons
                  name={proofError ? 'alert-circle-outline' : 'shield-checkmark-outline'}
                  size={19}
                  color={proofError ? '#B91C1C' : '#1D4ED8'}
                />
                <Text style={[styles.proofNoticeText, proofError ? styles.proofErrorText : null]}>
                  {proofError || proofValidationMessage || 'الصورة والموقع جاهزان. سيؤكد الخادم التسليم والتسوية مرة واحدة فقط.'}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.confirmProofBtn, (Boolean(proofValidationMessage) || completingDelivery) && styles.disabledAction]}
                onPress={() => void submitDeliveryProof()}
                disabled={Boolean(proofValidationMessage) || completingDelivery}
                accessibilityRole="button"
                accessibilityLabel="إرسال إثبات التسليم وتأكيد الطلب"
                accessibilityState={{ disabled: Boolean(proofValidationMessage) || completingDelivery, busy: completingDelivery }}
              >
                {completingDelivery
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />}
                <Text style={styles.confirmProofBtnText}>
                  {completingDelivery ? 'جاري التحقق من الخادم...' : 'إرسال الإثبات وتأكيد التسليم'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelProofBtn}
                onPress={() => setProofVisible(false)}
                disabled={completingDelivery}
                accessibilityRole="button"
                accessibilityLabel="إلغاء وإبقاء الطلب قيد التوصيل"
                accessibilityState={{ disabled: completingDelivery }}
              >
                <Text style={styles.cancelProofBtnText}>إلغاء — إبقاء الطلب قيد التوصيل</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  containerDesktop: { backgroundColor: '#F3F6FA' },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16,
    width: '100%', maxWidth: 900, alignSelf: 'center',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 5, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EFF6FF' },
  retryText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  scrollContent: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: 900, alignSelf: 'center' },
  scrollContentDesktop: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingTop: 28, paddingHorizontal: 32 },
  mapContainer: { minHeight: 150, borderRadius: 16, overflow: 'hidden', marginBottom: 16, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#D1FAE5' },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 20 },
  mapText: { fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  locationTime: { fontSize: 11.5, color: '#6B7280', marginTop: 3 },
  stepsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: '#F3F4F6', marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepIndicator: { alignItems: 'center', marginLeft: 14 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepCircleDone: { backgroundColor: '#059669' },
  stepCircleCurrent: { backgroundColor: COLORS.primary },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#9CA3AF' },
  stepLine: { width: 2, height: 24, backgroundColor: '#E5E7EB', marginVertical: 2 },
  stepLabel: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', paddingTop: 3 },
  stepLabelCurrent: { color: COLORS.primary, fontWeight: '800' },
  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1.5, borderColor: '#F3F4F6' },
  detailsTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  detailInfo: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  detailValue: { fontSize: 13.5, color: '#111827', fontWeight: '600', marginTop: 2, lineHeight: 20 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  codBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginTop: 4,
  },
  codBoxCompact: { flexDirection: 'column', alignItems: 'flex-start', gap: 5 },
  codLabel: { fontSize: 12.5, fontWeight: '700', color: '#B45309' },
  codValue: { fontSize: 16, fontWeight: '800', color: '#B45309' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF',
    paddingTop: 20, paddingHorizontal: 0, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1.5, borderTopColor: '#F3F4F6',
  },
  bottomBarInner: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  actionBtn: { backgroundColor: COLORS.primary, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pickupCodeRow: { marginBottom: 10 },
  pickupCodeInput: { height: 48, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, backgroundColor: '#F9FAFB', fontSize: 16, fontWeight: '800', letterSpacing: 4, color: '#111827' },
  mapsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.info, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  disabledAction: { opacity: 0.55 },
  proofModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.55)' },
  proofModalOverlayDesktop: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  proofModalSheet: {
    maxHeight: '92%', backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, overflow: 'hidden',
  },
  proofModalSheetDesktop: { width: '100%', maxWidth: 720, borderRadius: 24 },
  proofModalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20,
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  proofModalTitle: { color: '#111827', fontSize: 19, fontWeight: '900', textAlign: 'right' },
  proofModalSubtitle: { color: '#6B7280', fontSize: 12.5, fontWeight: '600', lineHeight: 19, textAlign: 'right', marginTop: 4 },
  proofCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  proofModalContent: { padding: 20, gap: 14, paddingBottom: Platform.OS === 'ios' ? 38 : 24 },
  unavailableCodeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#F3F4F6',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', opacity: 0.85,
  },
  proofMethodIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  proofMethodTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  proofMethodTitle: { color: '#374151', fontSize: 14, fontWeight: '800', textAlign: 'right' },
  unavailableBadge: { color: '#6B7280', backgroundColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10.5, fontWeight: '800' },
  proofMethodDescription: { color: '#6B7280', fontSize: 11.5, fontWeight: '600', lineHeight: 18, textAlign: 'right', marginTop: 6 },
  activeProofCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
  proofSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  proofSectionTitle: { color: '#111827', fontSize: 14, fontWeight: '800', textAlign: 'right' },
  proofSectionSubtitle: { color: '#6B7280', fontSize: 11.5, fontWeight: '600', textAlign: 'right', marginTop: 3 },
  proofPhotoPreview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#F3F4F6' },
  proofPhotoPlaceholder: { height: 130, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB' },
  proofPhotoPlaceholderText: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  secondaryProofBtn: { minHeight: 44, borderRadius: 11, backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  secondaryProofBtnText: { color: '#111827', fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
  proofCoordinates: { color: '#047857', backgroundColor: '#ECFDF5', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  proofNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#BFDBFE' },
  proofErrorNotice: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  proofNoticeText: { flex: 1, color: '#1D4ED8', fontSize: 12, fontWeight: '700', lineHeight: 19, textAlign: 'right' },
  proofErrorText: { color: '#B91C1C' },
  confirmProofBtn: { minHeight: 52, borderRadius: 13, backgroundColor: '#047857', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  confirmProofBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  cancelProofBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  cancelProofBtnText: { color: '#6B7280', fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
});

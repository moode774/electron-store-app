import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, ORDER_STATUS } from '@marketplace/shared-utils';
import {
  useAuthStore,
  useCartStore,
  getOrders,
  getReorderItems,
  OrderSummary,
  supabase,
} from '@marketplace/shared-hooks';
import { Alert } from '../../../components/appAlert';

type FilterTab = 'all' | 'active' | 'delivering' | 'completed';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'الدفع عند الاستلام',
  cod: 'الدفع عند الاستلام',
  jawali: 'محفظة جوالي',
  kuraimi: 'الكريمي',
  card: 'بطاقة بنكية',
  wallet: 'المحفظة',
};

export default function OrdersListScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addToCart);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const loadOrders = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      setErrorMessage('');
      try {
        const data = await getOrders(user.id);
        setOrders(data);
      } catch (error: any) {
        setErrorMessage(error?.message ?? 'تعذّر تحميل طلباتك. تحقق من الاتصال وحاول مجدداً.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`customer-orders-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`,
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    const fallback = setInterval(() => {
      void loadOrders();
    }, 30000);

    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [loadOrders, user?.id]);

  const reorder = async (orderId: string, storeName: string) => {
    try {
      const items = await getReorderItems(orderId);
      if (items.length === 0) {
        Alert.alert('لا توجد عناصر متاحة', 'المنتجات السابقة غير متوفرة حالياً.');
        return;
      }
      items.forEach((it) =>
        addToCart({
          id: `${it.productId}-${it.variantId ?? 'default'}`,
          productId: it.productId,
          variantId: it.variantId,
          name: it.name,
          price: it.price,
          emoji: '🛍️',
          quantity: it.quantity,
          maxQuantity: it.maxQuantity,
          storeId: it.storeId,
          storeName,
        })
      );
      navigation.navigate('Cart' as any, { screen: 'CartMain' });
    } catch (error: any) {
      Alert.alert('تعذّرت إعادة الطلب', error?.message ?? 'تعذّر تحميل عناصر الطلب. حاول مرة أخرى.');
    }
  };

  // Filter orders based on active status tab
  const filteredOrders = orders.filter((order) => {
    const status = order.status;
    if (activeTab === 'all') return true;
    if (activeTab === 'active') {
      return [
        ORDER_STATUS.PENDING,
        ORDER_STATUS.CONFIRMED,
        ORDER_STATUS.PREPARING,
        ORDER_STATUS.READY,
      ].includes(status as any);
    }
    if (activeTab === 'delivering') {
      return [
        ORDER_STATUS.ASSIGNED,
        ORDER_STATUS.PICKED_UP,
        ORDER_STATUS.ON_THE_WAY,
      ].includes(status as any);
    }
    if (activeTab === 'completed') {
      return status === ORDER_STATUS.DELIVERED;
    }
    return true;
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-SA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadgeConfig = (status: string) => {
    switch (status) {
      case ORDER_STATUS.ON_THE_WAY:
      case ORDER_STATUS.PICKED_UP:
      case ORDER_STATUS.ASSIGNED:
        return {
          label: 'في الطريق',
          icon: 'car-outline',
          bgColor: '#F3E8FF',
          textColor: '#7E22CE',
          stepIndex: 3,
        };
      case ORDER_STATUS.PREPARING:
      case ORDER_STATUS.CONFIRMED:
      case ORDER_STATUS.PENDING:
      case ORDER_STATUS.READY:
        return {
          label: 'جاري التجهيز',
          icon: 'cube-outline',
          bgColor: '#EFF6FF',
          textColor: '#1D4ED8',
          stepIndex: 2,
        };
      case ORDER_STATUS.DELIVERED:
        return {
          label: 'تم التوصيل',
          icon: 'checkmark-circle-outline',
          bgColor: '#ECFDF5',
          textColor: '#047857',
          stepIndex: 4,
        };
      case ORDER_STATUS.CANCELLED:
      case ORDER_STATUS.FAILED_DELIVERY:
        return {
          label: 'ملغي',
          icon: 'close-circle-outline',
          bgColor: '#FEF2F2',
          textColor: '#DC2626',
          stepIndex: 0,
        };
      default:
        return {
          label: 'جاري المعالجة',
          icon: 'time-outline',
          bgColor: '#F1F5F9',
          textColor: '#475569',
          stepIndex: 1,
        };
    }
  };

  const renderOrderCard = ({ item }: { item: OrderSummary }) => {
    const statusConfig = getStatusBadgeConfig(item.status);
    const storeName = item.merchant_profiles?.store_name ?? 'المتجر';
    const dateFormatted = formatDate(item.created_at);
    const totalItems = item.order_items?.length || 1;
    const addressStr = item.addresses?.full_address || 'عنوان التوصيل غير متوفر';
    const paymentLabel = PAYMENT_LABELS[(item.payment_method ?? '').toLowerCase()] ?? 'طريقة الدفع غير محددة';

    // صور المنتجات الحقيقية فقط؛ ما لا صورة له يُعرض بأيقونة بديلة
    const thumbnails = (item.order_items ?? [])
      .slice(0, 3)
      .map((it) => ({ uri: it.products?.og_image_url ?? null }));

    return (
      <View style={styles.orderCard}>
        {/* Card Header Row: Order Number & Date vs Status Badge */}
        <View style={styles.cardHeaderRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.textColor} />
            <Text style={[styles.statusBadgeText, { color: statusConfig.textColor }]}>
              {statusConfig.label}
            </Text>
          </View>

          <View style={styles.headerRightCol}>
            <Text style={styles.orderNumberText}># طلب {item.order_number}</Text>
            <View style={styles.dateSubRow}>
              <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
              <Text style={styles.orderDateText}>{dateFormatted}</Text>
            </View>
          </View>
        </View>

        {/* Price & Payment Method Row */}
        <View style={styles.priceRow}>
          <View style={styles.paymentPill}>
            <Ionicons
              name={item.payment_method === 'cash' || item.payment_method === 'cod' ? 'cash-outline' : 'card-outline'}
              size={14}
              color="#172554"
            />
            <Text style={styles.paymentPillText}>{paymentLabel}</Text>
          </View>

          <View style={styles.priceCol}>
            <Text style={styles.priceAmountText}>
              {item.total_amount ? Number(item.total_amount).toLocaleString('ar-SA') : '0'} ر.ي
            </Text>
            <Text style={styles.itemCountText}>{totalItems} منتجات</Text>
          </View>
        </View>

        {/* Product Image Thumbnails Row */}
        {thumbnails.length > 0 && (
          <View style={styles.thumbnailsContainer}>
            {thumbnails.map((thumb, idx) => (
              <View key={idx} style={styles.thumbnailWrapper}>
                {thumb.uri ? (
                  <Image source={{ uri: thumb.uri }} style={styles.thumbnailImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumbnailImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name="cube-outline" size={18} color="#94A3B8" />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* 4-Step Stepper Timeline (Only for active / delivering orders) */}
        {item.status !== ORDER_STATUS.DELIVERED && item.status !== ORDER_STATUS.CANCELLED && (
          <View style={styles.stepperContainer}>
            {/* Step 1: Confirmed */}
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, styles.stepCircleDone]}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelDone]}>تم التأكيد</Text>
            </View>
            <View style={[styles.stepLine, statusConfig.stepIndex >= 2 && styles.stepLineDone]} />

            {/* Step 2: Preparing */}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  statusConfig.stepIndex >= 2 && styles.stepCircleDone,
                  statusConfig.stepIndex === 2 && styles.stepCircleActive,
                ]}
              >
                {statusConfig.stepIndex > 2 ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <View
                    style={[
                      styles.stepDotInner,
                      statusConfig.stepIndex === 2 && styles.stepDotActiveInner,
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  statusConfig.stepIndex >= 2 && styles.stepLabelDone,
                  statusConfig.stepIndex === 2 && styles.stepLabelActive,
                ]}
              >
                جاري التجهيز
              </Text>
            </View>
            <View style={[styles.stepLine, statusConfig.stepIndex >= 3 && styles.stepLineDone]} />

            {/* Step 3: On The Way */}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  statusConfig.stepIndex >= 3 && styles.stepCircleDone,
                  statusConfig.stepIndex === 3 && styles.stepCircleActive,
                ]}
              >
                {statusConfig.stepIndex > 3 ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <View
                    style={[
                      styles.stepDotInner,
                      statusConfig.stepIndex === 3 && styles.stepDotActiveInner,
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  statusConfig.stepIndex >= 3 && styles.stepLabelDone,
                  statusConfig.stepIndex === 3 && styles.stepLabelActive,
                ]}
              >
                في الطريق
              </Text>
            </View>
            <View style={[styles.stepLine, statusConfig.stepIndex >= 4 && styles.stepLineDone]} />

            {/* Step 4: Delivered */}
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, statusConfig.stepIndex >= 4 && styles.stepCircleDone]}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={[styles.stepLabel, statusConfig.stepIndex >= 4 && styles.stepLabelDone]}>
                تم التوصيل
              </Text>
            </View>
          </View>
        )}

        {/* Address & Expected Delivery Info Banner */}
        <View style={styles.infoBannerBox}>
          <View style={styles.infoBannerRow}>
            <Ionicons name="location-outline" size={15} color="#64748B" />
            <Text style={styles.infoBannerText} numberOfLines={1}>
              <Text style={styles.infoBannerLabel}>العنوان: </Text>
              {addressStr}
            </Text>
          </View>
          <View style={[styles.infoBannerRow, { marginTop: 4 }]}>
            <Ionicons name="time-outline" size={15} color="#172554" />
            <Text style={styles.infoBannerText}>
              <Text style={styles.infoBannerLabel}>
                {item.status === ORDER_STATUS.DELIVERED ? 'تم التوصيل في: ' : 'التوصيل المتوقع: '}
              </Text>
              {item.status === ORDER_STATUS.DELIVERED
                ? dateFormatted
                : `اليوم ${dateFormatted.split(' ')[0]} مايو • 4:00 م - 6:00 م`}
            </Text>
          </View>
        </View>

        {/* Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          {item.status === ORDER_STATUS.DELIVERED ? (
            <TouchableOpacity
              style={styles.reorderPrimaryBtn}
              onPress={() => reorder(item.id, storeName)}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={16} color="#172554" />
              <Text style={styles.reorderPrimaryBtnText}>إعادة الطلب</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.trackPrimaryBtn}
              onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={16} color="#FFFFFF" />
              <Text style={styles.trackPrimaryBtnText}>تتبع الطلب</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.detailsSecondaryBtn}
            onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
            activeOpacity={0.8}
          >
            <Text style={styles.detailsSecondaryBtnText}>عرض التفاصيل</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.supportPillBtn}
            onPress={() => Alert.alert('خدمة العملاء', 'نحن هنا لمساعدتك على مدار الساعة.')}
            activeOpacity={0.8}
          >
            <Ionicons name="headset-outline" size={16} color="#172554" />
            <Text style={styles.supportPillText}>الدعم</Text>
          </TouchableOpacity>

          <View style={styles.headerCenterCol}>
            <Text style={styles.headerTitle}>طلباتي</Text>
            <Text style={styles.headerSub}>تابع جميع طلباتك بسهولة</Text>
          </View>

          {navigation.canGoBack() ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-forward" size={20} color="#0F172A" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 42 }} />
          )}
        </View>

        {/* Filter Tabs Bar matching mockup */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'all' && styles.tabChipActive]}
              onPress={() => setActiveTab('all')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabChipText, activeTab === 'all' && styles.tabChipTextActive]}>
                الكل
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'active' && styles.tabChipActive]}
              onPress={() => setActiveTab('active')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabChipText, activeTab === 'active' && styles.tabChipTextActive]}>
                نشطة
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'delivering' && styles.tabChipActive]}
              onPress={() => setActiveTab('delivering')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabChipText,
                  activeTab === 'delivering' && styles.tabChipTextActive,
                ]}
              >
                قيد التوصيل
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'completed' && styles.tabChipActive]}
              onPress={() => setActiveTab('completed')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabChipText,
                  activeTab === 'completed' && styles.tabChipTextActive,
                ]}
              >
                مكتملة
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      {/* Main Orders List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#172554" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderCard}
          contentContainerStyle={styles.listContentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadOrders(true)}
              tintColor="#172554"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bag-handle-outline" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitleText}>
                {errorMessage || 'لا توجد طلبات في هذه القائمة'}
              </Text>
              <Text style={styles.emptySubText}>
                تصفح المنتجات في المتجر وأضف مشترياتك المفضلة للسلة!
              </Text>
              {errorMessage ? (
                <TouchableOpacity style={styles.retryBtn} onPress={() => loadOrders()}>
                  <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerCenterCol: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: '#0F172A',
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  supportPillBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  supportPillText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: '#172554',
  },
  tabsContainer: {
    marginTop: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
  },
  tabsScrollContent: {
    flexDirection: 'row-reverse',
    gap: 4,
    width: '100%',
  },
  tabChip: {
    flex: 1,
    minWidth: 70,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tabChipActive: {
    backgroundColor: '#172554', // Solid Royal Blue matching mockup
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  tabChipText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: '#64748B',
  },
  tabChipTextActive: {
    fontFamily: FONTS.bold,
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 14,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRightCol: {
    alignItems: 'flex-end',
  },
  orderNumberText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#0F172A',
  },
  dateSubRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  orderDateText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: '#94A3B8',
  },
  statusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  statusBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
  },
  priceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  priceAmountText: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: '#0F172A',
  },
  itemCountText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  paymentPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  paymentPillText: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: '#334155',
  },
  thumbnailsContainer: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 14,
  },
  thumbnailWrapper: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  stepperContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  stepCircleDone: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },
  stepCircleActive: {
    borderColor: '#172554',
    backgroundColor: '#F0F5FF',
  },
  stepDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
  },
  stepDotActiveInner: {
    backgroundColor: '#172554',
  },
  stepLabel: {
    fontFamily: FONTS.medium,
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 4,
  },
  stepLabelDone: {
    color: '#172554',
  },
  stepLabelActive: {
    fontFamily: FONTS.bold,
    color: '#172554',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    marginBottom: 14,
  },
  stepLineDone: {
    backgroundColor: '#172554',
  },
  infoBannerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoBannerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  infoBannerText: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: '#475569',
    flex: 1,
    textAlign: 'right',
  },
  infoBannerLabel: {
    fontFamily: FONTS.bold,
    color: '#172554',
  },
  actionButtonsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 14,
  },
  trackPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#172554', // Solid Royal Blue matching mockup
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  trackPrimaryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#FFFFFF',
  },
  reorderPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#172554',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reorderPrimaryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#172554',
  },
  detailsSecondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsSecondaryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: '#475569',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: '#0F172A',
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#172554',
  },
  retryBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
});

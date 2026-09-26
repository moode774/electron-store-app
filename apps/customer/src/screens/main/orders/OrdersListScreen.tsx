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
      case ORDER_STATUS.READY:
        return {
          label: 'جاري التجهيز',
          icon: 'cube-outline',
          bgColor: '#EFF6FF',
          textColor: '#1D4ED8',
          stepIndex: 2,
        };
      // الطلب المعلّق لم يؤكّده المتجر بعد — لا يجوز عرضه كأنه قيد التجهيز
      case ORDER_STATUS.PENDING:
        return {
          label: 'بانتظار تأكيد المتجر',
          icon: 'time-outline',
          bgColor: '#FEF3C7',
          textColor: '#B45309',
          stepIndex: 1,
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
    const paymentLabel = PAYMENT_LABELS[(item.payment_method ?? '').toLowerCase()] ?? 'طريقة الدفع غير محددة';
    const isDelivered = item.status === ORDER_STATUS.DELIVERED;

    const thumbnails = (item.order_items ?? [])
      .slice(0, 3)
      .map((it) => ({ uri: it.products?.og_image_url ?? null }));

    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
      >
        <View style={styles.topRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusConfig.textColor }]} />
            <Text style={[styles.statusBadgeText, { color: statusConfig.textColor }]}>
              {statusConfig.label}
            </Text>
          </View>

          <View style={styles.orderMeta}>
            <Text style={styles.orderNumberText}>طلب #{item.order_number}</Text>
            <Text style={styles.orderDateText}>{dateFormatted}</Text>
          </View>
        </View>

        <View style={styles.storeRow}>
          <View style={styles.storeAvatar}>
            <Ionicons name="storefront-outline" size={19} color="#172554" />
          </View>
          <View style={styles.storeCopy}>
            <Text style={styles.storeNameText} numberOfLines={1}>{storeName}</Text>
            <Text style={styles.storeCaptionText}>
              {totalItems} {totalItems === 1 ? 'منتج' : 'منتجات'} · {paymentLabel}
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color="#A7AFBC" />
        </View>

        {thumbnails.length > 0 && (
          <View style={styles.productStrip}>
            <View style={styles.thumbnailsContainer}>
              {thumbnails.map((thumb, idx) => (
                <View key={idx} style={styles.thumbnailWrapper}>
                  {thumb.uri ? (
                    <Image source={{ uri: thumb.uri }} style={styles.thumbnailImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.thumbnailFallback}>
                      <Ionicons name="cube-outline" size={18} color="#A3ACB9" />
                    </View>
                  )}
                </View>
              ))}
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.priceLabel}>الإجمالي</Text>
              <Text style={styles.priceAmountText}>
                {item.total_amount ? Number(item.total_amount).toLocaleString('ar-SA') : '0'} ر.ي
              </Text>
            </View>
          </View>
        )}

        {!isDelivered && item.status !== ORDER_STATUS.CANCELLED && (
          <View style={styles.progressArea}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>حالة الطلب</Text>
              <Text style={styles.progressHint}>{statusConfig.label}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width:
                      statusConfig.stepIndex >= 4
                        ? '100%'
                        : statusConfig.stepIndex === 3
                          ? '72%'
                          : statusConfig.stepIndex === 2
                            ? '46%'
                            : '20%',
                  },
                ]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>تم الطلب</Text>
              <Text style={styles.progressLabel}>التجهيز</Text>
              <Text style={styles.progressLabel}>التوصيل</Text>
            </View>
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.footerActionCopy}>
            <Text style={styles.footerActionTitle}>
              {isDelivered ? 'اطلب نفس المنتجات مجدداً' : 'عرض تفاصيل الطلب'}
            </Text>
            <Text style={styles.footerActionSub}>
              {isDelivered ? 'بنقرة واحدة' : 'التفاصيل والتتبع المباشر'}
            </Text>
          </View>

          {isDelivered ? (
            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                reorder(item.id, storeName);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={16} color="#172554" />
              <Text style={styles.secondaryActionBtnText}>إعادة الطلب</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.primaryActionBtn}>
              <Ionicons name="location-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>تتبع</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 48 : 22,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F7F8FB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9ECF2',
  },
  headerCenterCol: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 21,
    color: '#111827',
    letterSpacing: -0.25,
  },
  headerSub: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: '#8A92A1',
    marginTop: 3,
  },
  supportPillBtn: {
    height: 42,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#E9ECF2',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  supportPillText: { fontFamily: FONTS.bold, fontSize: 12, color: '#172554' },

  tabsContainer: {
    marginTop: 16,
    backgroundColor: '#F3F5F8',
    borderRadius: 15,
    padding: 4,
  },
  tabsScrollContent: { flexDirection: 'row-reverse', gap: 4, width: '100%' },
  tabChip: {
    flex: 1,
    minWidth: 72,
    height: 39,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  tabChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  tabChipText: { fontFamily: FONTS.medium, fontSize: 12.5, color: '#7B8494' },
  tabChipTextActive: { fontFamily: FONTS.bold, color: '#172554' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 12,
  },

  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9EDF3',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderMeta: { flex: 1, alignItems: 'flex-end' },
  orderNumberText: { fontFamily: FONTS.bold, fontSize: 15.5, color: '#151B2B' },
  orderDateText: {
    fontFamily: FONTS.regular,
    fontSize: 10.8,
    color: '#9AA2B1',
    marginTop: 4,
  },
  statusBadge: {
    minHeight: 29,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontFamily: FONTS.bold, fontSize: 11.2 },

  storeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginTop: 15,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F6',
  },
  storeAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F2F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeCopy: { flex: 1, alignItems: 'flex-end' },
  storeNameText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#1F2937',
    textAlign: 'right',
  },
  storeCaptionText: {
    fontFamily: FONTS.regular,
    fontSize: 10.8,
    color: '#8F98A7',
    marginTop: 3,
    textAlign: 'right',
  },

  productStrip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    backgroundColor: '#F8F9FC',
    borderRadius: 16,
    padding: 11,
  },
  thumbnailsContainer: { flexDirection: 'row-reverse', gap: 7, flex: 1 },
  thumbnailWrapper: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EBF0',
    overflow: 'hidden',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F3F7',
  },
  priceCol: { alignItems: 'flex-end', marginLeft: 10 },
  priceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: '#9AA2B1',
    marginBottom: 2,
  },
  priceAmountText: { fontFamily: FONTS.bold, fontSize: 17, color: '#172554' },

  progressArea: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F6',
  },
  progressHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTitle: { fontFamily: FONTS.bold, fontSize: 11.5, color: '#4B5563' },
  progressHint: { fontFamily: FONTS.medium, fontSize: 10.5, color: '#7B8494' },
  progressTrack: {
    height: 5,
    backgroundColor: '#E9EDF3',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 9,
  },
  progressFill: { height: '100%', backgroundColor: '#172554', borderRadius: 999 },
  progressLabels: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressLabel: { fontFamily: FONTS.regular, fontSize: 9.5, color: '#9AA2B1' },

  cardFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  footerActionCopy: { flex: 1, alignItems: 'flex-end' },
  footerActionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11.8,
    color: '#333B49',
    textAlign: 'right',
  },
  footerActionSub: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: '#9AA2B1',
    marginTop: 2,
    textAlign: 'right',
  },
  primaryActionBtn: {
    minWidth: 94,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#172554',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  primaryActionBtnText: { fontFamily: FONTS.bold, fontSize: 12.5, color: '#FFFFFF' },
  secondaryActionBtn: {
    minWidth: 116,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#F2F4FF',
    borderWidth: 1,
    borderColor: '#DFE4FF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  secondaryActionBtnText: { fontFamily: FONTS.bold, fontSize: 12, color: '#172554' },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 76,
    paddingHorizontal: 28,
  },
  emptyTitleText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#1F2937',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#7C8494',
    marginTop: 7,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: '#172554',
  },
  retryBtnText: { fontFamily: FONTS.bold, fontSize: 13, color: '#FFFFFF' },
});
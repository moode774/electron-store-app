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
    const firstImage = item.order_items?.[0]?.products?.og_image_url ?? null;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
      >
        <View style={styles.orderThumb}>
          {firstImage ? (
            <Image source={{ uri: firstImage }} style={styles.orderThumbImage} resizeMode="cover" />
          ) : (
            <View style={styles.orderThumbFallback}>
              <Ionicons name="bag-handle-outline" size={22} color="#667085" />
            </View>
          )}
          {totalItems > 1 && (
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountBadgeText}>+{totalItems - 1}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.titleRow}>
            <Text style={styles.storeNameText} numberOfLines={1}>{storeName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
              <View style={[styles.statusDot, { backgroundColor: statusConfig.textColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusConfig.textColor }]} numberOfLines={1}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>#{item.order_number}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{dateFormatted}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{totalItems} {totalItems === 1 ? 'منتج' : 'منتجات'}</Text>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.priceWrap}>
              <Text style={styles.priceAmountText}>
                {item.total_amount ? Number(item.total_amount).toLocaleString('ar-SA') : '0'}
              </Text>
              <Text style={styles.currencyText}>ر.ي</Text>
            </View>

            <View style={styles.detailsLink}>
              <Text style={styles.detailsLinkText}>عرض الطلب</Text>
              <View style={styles.arrowCircle}>
                <Ionicons name="chevron-back" size={13} color="#172554" />
              </View>
            </View>
          </View>
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
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 48 : 22,
    paddingHorizontal: 18,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F3',
  },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F7F8FA',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenterCol: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 21, color: '#101828', letterSpacing: -0.3 },
  headerSub: { fontFamily: FONTS.regular, fontSize: 11.5, color: '#98A2B3', marginTop: 2 },
  supportPillBtn: {
    height: 40, flexDirection: 'row-reverse', alignItems: 'center', gap: 5,
    backgroundColor: '#F7F8FA', borderRadius: 20, paddingHorizontal: 12,
  },
  supportPillText: { fontFamily: FONTS.bold, fontSize: 11.5, color: '#172554' },

  tabsContainer: { marginTop: 15, backgroundColor: '#F2F4F7', borderRadius: 13, padding: 3 },
  tabsScrollContent: { flexDirection: 'row-reverse', gap: 3, width: '100%' },
  tabChip: {
    flex: 1, minWidth: 72, height: 37, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  tabChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 5, elevation: 2,
  },
  tabChipText: { fontFamily: FONTS.medium, fontSize: 12, color: '#667085' },
  tabChipTextActive: { fontFamily: FONTS.bold, color: '#172554' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContentContainer: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 120, gap: 10 },

  orderCard: {
    height: 118,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 11,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#EAECF0',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.035,
    shadowRadius: 12,
    elevation: 1,
  },
  orderThumb: {
    width: 86, height: 94, borderRadius: 16, backgroundColor: '#F2F4F7',
    overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center',
  },
  orderThumbImage: { width: '100%', height: '100%' },
  orderThumbFallback: {
    width: '100%', height: '100%', backgroundColor: '#F2F4F7',
    alignItems: 'center', justifyContent: 'center',
  },
  itemCountBadge: {
    position: 'absolute', left: 6, bottom: 6, minWidth: 25, height: 23,
    paddingHorizontal: 6, borderRadius: 8, backgroundColor: 'rgba(17,24,39,0.82)',
    alignItems: 'center', justifyContent: 'center',
  },
  itemCountBadgeText: { fontFamily: FONTS.bold, fontSize: 9.5, color: '#FFFFFF' },

  cardContent: { flex: 1, alignSelf: 'stretch', paddingVertical: 2, justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  storeNameText: {
    flex: 1, fontFamily: FONTS.bold, fontSize: 14.5, color: '#101828',
    textAlign: 'right', letterSpacing: -0.15,
  },
  statusBadge: {
    maxWidth: 126, minHeight: 25, flexDirection: 'row-reverse', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 5,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusBadgeText: { fontFamily: FONTS.bold, fontSize: 9.5 },

  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 3 },
  metaText: { fontFamily: FONTS.regular, fontSize: 10, color: '#98A2B3' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#D0D5DD' },

  bottomRow: {
    flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F2F4F7',
  },
  priceWrap: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 4 },
  priceAmountText: { fontFamily: FONTS.bold, fontSize: 17, color: '#172554', letterSpacing: -0.2 },
  currencyText: { fontFamily: FONTS.bold, fontSize: 10.5, color: '#667085' },
  detailsLink: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  detailsLinkText: { fontFamily: FONTS.bold, fontSize: 10.5, color: '#475467' },
  arrowCircle: {
    width: 27, height: 27, borderRadius: 14, backgroundColor: '#F1F3FA',
    alignItems: 'center', justifyContent: 'center',
  },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 76, paddingHorizontal: 28 },
  emptyTitleText: { fontFamily: FONTS.bold, fontSize: 16, color: '#1F2937', marginTop: 16, textAlign: 'center' },
  emptySubText: {
    fontFamily: FONTS.regular, fontSize: 12, color: '#7C8494', marginTop: 7,
    textAlign: 'center', lineHeight: 19,
  },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 13, backgroundColor: '#172554' },
  retryBtnText: { fontFamily: FONTS.bold, fontSize: 13, color: '#FFFFFF' },
});
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getMerchantOrders,
  getMerchantProfile,
  OrderSummary,
  supabase,
} from '@marketplace/shared-hooks';

type MerchantProfile = NonNullable<Awaited<ReturnType<typeof getMerchantProfile>>>;
type LoadMode = 'initial' | 'refresh' | 'silent';
const FALLBACK_REFRESH_MS = 20_000;

export function useMerchantOrderFeed(userId: string | undefined, channelKey: string) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const merchantIdRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (mode: LoadMode = 'refresh'): Promise<string | null> => {
    const requestId = ++requestRef.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    if (!userId) {
      if (activeRef.current) {
        setOrders([]);
        setMerchantProfile(null);
        setError('تعذر تحديد حساب التاجر.');
        setLoading(false);
        setRefreshing(false);
      }
      return null;
    }

    try {
      let merchantId = merchantIdRef.current;
      if (!merchantId) {
        const profile = await getMerchantProfile(userId);
        if (!profile) throw new Error('MERCHANT_PROFILE_NOT_FOUND');
        merchantId = profile.id;
        merchantIdRef.current = profile.id;
        if (activeRef.current && requestId === requestRef.current) setMerchantProfile(profile);
      }

      const nextOrders = await getMerchantOrders(merchantId);
      if (activeRef.current && requestId === requestRef.current) {
        setOrders(nextOrders);
        setError(null);
      }
      return merchantId;
    } catch (loadError) {
      if (activeRef.current && requestId === requestRef.current) {
        const message = loadError instanceof Error ? loadError.message : '';
        setError(message === 'MERCHANT_PROFILE_NOT_FOUND'
          ? 'لم يتم العثور على ملف المتجر المرتبط بهذا الحساب.'
          : 'تعذر تحميل الطلبات. تحقق من الاتصال ثم أعد المحاولة.');
      }
      return null;
    } finally {
      if (activeRef.current && requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    activeRef.current = true;
    merchantIdRef.current = null;
    setRealtimeError(null);
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const startRealtime = (merchantId: string | null) => {
      if (!activeRef.current || !merchantId || channel) return;

      const nextChannel = supabase
        .channel(`merchant-orders-${channelKey}-${merchantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` },
          () => { void load('silent'); },
        );
      channel = nextChannel;
      nextChannel.subscribe((status) => {
        if (!activeRef.current) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeError(null);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeError('تعذر الاتصال بالتحديث اللحظي؛ يتم تحديث الطلبات دوريًا كل 20 ثانية.');
          if (channel === nextChannel) {
            channel = null;
            void supabase.removeChannel(nextChannel);
          }
        }
      });
    };

    void load('initial').then(startRealtime);

    const refreshTimer = setInterval(() => {
      if (!activeRef.current) return;
      void load('silent').then(startRealtime);
    }, FALLBACK_REFRESH_MS);

    return () => {
      activeRef.current = false;
      requestRef.current += 1;
      clearInterval(refreshTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelKey, load]));

  return {
    orders,
    merchantProfile,
    loading,
    refreshing,
    error,
    realtimeError,
    refresh: () => load('refresh'),
    reloadSilently: () => load('silent'),
  };
}

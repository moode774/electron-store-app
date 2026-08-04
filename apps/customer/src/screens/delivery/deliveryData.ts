import { OrderSummary, supabase } from '@marketplace/shared-hooks';
import { t, tv } from '@marketplace/shared-i18n';

export interface DeliveryRuntimeProfile {
  id: string;
  is_online: boolean;
  is_approved: boolean;
  /** مدينة عمل المندوب — تُستخدم لترتيب العروض القريبة أولاً */
  work_city?: string | null;
}

export interface DeliveryCoordinates {
  latitude: number;
  longitude: number;
  speed?: number | null;
}

export async function getDeliveryRuntimeProfile(userId: string): Promise<DeliveryRuntimeProfile | null> {
  const { data, error } = await supabase
    .from('delivery_profiles')
    .select('id, is_online, is_approved, work_city')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as DeliveryRuntimeProfile | null;
}

export async function setDeliveryRuntimeOnline(
  userId: string,
  isOnline: boolean,
  coordinates?: DeliveryCoordinates | null,
): Promise<DeliveryRuntimeProfile> {
  void userId;
  const { data, error } = await supabase.rpc('set_my_delivery_presence', {
    p_online: isOnline,
    p_latitude: coordinates?.latitude ?? null,
    p_longitude: coordinates?.longitude ?? null,
  });

  if (error) throw error;
  return data as DeliveryRuntimeProfile;
}

// Keep unassigned offers intentionally sparse. The exact customer address must
// only be loaded after the delivery has been claimed by this courier.
export async function getAvailableDeliveryOffers(): Promise<OrderSummary[]> {
  const { data, error } = await supabase.rpc('list_available_delivery_orders');

  if (error) throw error;
  return data as unknown as OrderSummary[];
}

export async function recordDeliveryLocation(
  deliveryProfileId: string,
  orderId: string,
  sampleId: string,
  coordinates: DeliveryCoordinates,
): Promise<void> {
  void deliveryProfileId;
  const { error } = await supabase.rpc('record_my_delivery_location', {
    p_order_id: orderId,
    p_sample_id: sampleId,
    p_latitude: coordinates.latitude,
    p_longitude: coordinates.longitude,
    p_speed: coordinates.speed ?? null,
  });
  if (error) throw new Error(t('تعذّر حفظ تحديث الموقع: {0}', [tv(error.message)]));
}

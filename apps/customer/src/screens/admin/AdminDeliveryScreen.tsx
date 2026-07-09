import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAdminDrivers, approveDriver, AdminDriver } from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
  danger: '#DC2626',
  warning: '#D97706',
};

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'pending', label: 'بانتظار الموافقة' },
  { key: 'approved', label: 'معتمد' },
] as const;

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: 'دراجة نارية',
  car: 'سيارة',
  bicycle: 'دراجة هوائية',
  truck: 'شاحنة',
};

export default function AdminDeliveryScreen({ navigation }: any) {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminDrivers(filter);
      setDrivers(data);
    } catch { Alert.alert('خطأ', 'فشل تحميل السائقين'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [filter]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = (driver: AdminDriver, approve: boolean) => {
    const name = (driver.users as any)?.full_name ?? 'السائق';
    Alert.alert(
      approve ? 'تأكيد الموافقة' : 'تأكيد الرفض',
      `هل تريد ${approve ? 'الموافقة على' : 'رفض'} "${name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: approve ? 'موافقة' : 'رفض',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setProcessing(driver.id);
            try {
              await approveDriver(driver.id, approve);
              load();
            } catch { Alert.alert('خطأ', 'فشل تحديث حالة السائق'); }
            finally { setProcessing(null); }
          },
        },
      ]
    );
  };

  const filtered = drivers.filter(d => {
    const name = (d.users as any)?.full_name ?? '';
    const phone = (d.users as any)?.phone ?? '';
    return name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search);
  });

  const renderDriver = ({ item }: { item: AdminDriver }) => {
    const name = (item.users as any)?.full_name ?? 'غير متوفر';
    const phone = (item.users as any)?.phone ?? 'غير متوفر';
    const vehicle = VEHICLE_LABELS[item.vehicle_type ?? ''] ?? item.vehicle_type ?? 'غير محدد';
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.avatar}>
            <Ionicons name="bicycle" size={24} color={UI.primary} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.driverName}>{name}</Text>
            <View style={s.infoRow}>
              <Ionicons name="call-outline" size={12} color={UI.textMuted} />
              <Text style={s.phoneText}>{phone}</Text>
            </View>
            <View style={s.vehicleRow}>
              <Ionicons name="car-sport-outline" size={13} color={UI.textMuted} />
              <Text style={s.vehicleText}>{vehicle}</Text>
              {item.vehicle_plate && <Text style={s.plateText}>{item.vehicle_plate}</Text>}
            </View>
          </View>
          <View style={[s.statusBadge, { backgroundColor: item.is_approved ? '#ECFDF5' : '#FFFBEB' }]}>
            <Text style={[s.statusText, { color: item.is_approved ? UI.success : UI.warning }]}>
              {item.is_approved ? 'معتمد' : 'انتظار'}
            </Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{item.total_deliveries}</Text>
            <Text style={s.statLabel}>عدد التوصيلات</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: UI.success }]}>{item.wallet_balance.toFixed(2)}</Text>
            <Text style={s.statLabel}>الرصيد المتاح (ر.س)</Text>
          </View>
        </View>

        {processing === item.id ? (
          <View style={s.actionsRow}><ActivityIndicator size="small" color={UI.primary} /></View>
        ) : !item.is_approved ? (
          <View style={s.actionsRow}>
            <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(item, true)} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              <Text style={s.approveBtnText}>موافقة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.rejectBtn} onPress={() => handleApprove(item, false)} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={18} color={UI.danger} />
              <Text style={s.rejectBtnText}>رفض</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.actionsRow}>
            <View style={s.approvedRow}>
              <Ionicons name="shield-checkmark" size={18} color={UI.success} />
              <Text style={s.approvedText}>تمت الموافقة وهو نشط في المنصة</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>السائقين</Text>
          </View>
          <Text style={s.headerCount}>{drivers.length} سائق</Text>
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={20} color={UI.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="البحث بالاسم أو الهاتف..."
            placeholderTextColor={UI.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </View>

      <View style={s.filterRowWrap}>
        <FlatList
          horizontal
          inverted
          data={FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          keyExtractor={f => f.key}
          renderItem={({ item: f }) => {
            const isActive = filter === f.key;
            return (
              <TouchableOpacity
                style={[s.filterBtn, isActive && s.filterBtnActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.filterText, isActive && s.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderDriver}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
               <Ionicons name="bicycle-outline" size={48} color={UI.border} />
               <Text style={s.emptyText}>لا يوجد سائقون لعرضهم</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { 
    backgroundColor: UI.card, 
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20, 
    borderBottomWidth: 1, borderColor: UI.border,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
    zIndex: 10
  },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  backBtn: { padding: 4 },
  headerCount: { fontSize: 13, color: UI.primary, fontWeight: '700', backgroundColor: UI.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: UI.bg, marginHorizontal: 20, paddingHorizontal: 16, borderRadius: 16, height: 50, borderWidth: 1, borderColor: UI.border },
  searchInput: { flex: 1, fontSize: 15, color: UI.text, fontWeight: '600' },
  filterRowWrap: { backgroundColor: UI.bg, paddingVertical: 14 },
  filterRow: { paddingHorizontal: 20, gap: 10 },
  filterBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: UI.card, borderWidth: 1, borderColor: UI.border, shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  filterTextActive: { color: '#FFFFFF' },
  list: { padding: 20, paddingTop: 6, gap: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: UI.textMuted, fontWeight: '600' },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 18, gap: 14, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, alignItems: 'flex-end' },
  driverName: { fontSize: 16, fontWeight: '800', color: UI.text, textAlign: 'right', marginBottom: 6 },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginBottom: 4 },
  phoneText: { fontSize: 13, color: UI.textMuted, marginTop: 2, textAlign: 'right', fontWeight: '600' },
  vehicleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  vehicleText: { fontSize: 13, color: UI.textMuted, fontWeight: '600' },
  plateText: { fontSize: 11, color: UI.text, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '800' },
  statsRow: { flexDirection: 'row-reverse', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: UI.border },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900', color: UI.text },
  statLabel: { fontSize: 12, color: UI.textMuted, marginTop: 4, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: UI.border, marginVertical: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center', justifyContent: 'center' },
  approveBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: UI.success, borderRadius: 16, paddingVertical: 12, shadowColor: UI.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  rejectBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#FEE2E2' },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: UI.danger },
  approvedRow: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ECFDF5', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  approvedText: { fontSize: 14, fontWeight: '800', color: UI.success },
});

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@marketplace/shared-utils';
import { Card, Button } from '@marketplace/shared-ui';
import { useAuthStore, getAddresses, deleteAddress, setDefaultAddress, Address } from '@marketplace/shared-hooks';

export default function AddressBookScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { setAddresses(await getAddresses(user.id)); } catch { setAddresses([]); }
    finally { setLoading(false); }
  }, [user?.id]);

  // تحديث عند العودة ليظهر العنوان المُضاف حديثاً
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const makeDefault = async (id: string) => {
    if (!user?.id) return;
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
    try { await setDefaultAddress(user.id, id); } catch { load(); }
  };

  const confirmDelete = (id: string) => {
    Alert.alert('حذف العنوان', 'هل تريد حذف هذا العنوان؟', [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setAddresses((prev) => prev.filter((a) => a.id !== id));
          try { await deleteAddress(id); } catch { load(); }
        },
      },
    ]);
  };

  const renderAddress = ({ item }: { item: Address }) => (
    <Card style={styles.addressCard} variant="outlined">
      <View style={styles.addressHeader}>
        <View style={styles.labelRow}>
          <Text style={styles.labelIcon}>{item.label === 'home' ? '🏠' : '🏢'}</Text>
          <Text style={styles.labelText}>{item.label === 'home' ? 'المنزل' : item.label}</Text>
          {item.is_default && <View style={styles.defaultBadge}><Text style={styles.defaultText}>الافتراضي</Text></View>}
        </View>
        <TouchableOpacity onPress={() => confirmDelete(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <View style={styles.addressBody}>
        <Text style={styles.areaText}>📍 {item.city ?? ''}</Text>
        <Text style={styles.streetText}>{item.full_address}</Text>
      </View>
      {!item.is_default && (
        <TouchableOpacity style={styles.defaultBtn} onPress={() => makeDefault(item.id)} activeOpacity={0.8}>
          <Ionicons name="star-outline" size={15} color={COLORS.primary} />
          <Text style={styles.defaultBtnText}>تعيين كافتراضي</Text>
        </TouchableOpacity>
      )}
    </Card>
  );

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>→</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>عناويني</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        renderItem={renderAddress}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyText}>لم تقم بإضافة أي عناوين بعد</Text>
          </View>
        }
      />

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <Button 
          title="+ إضافة عنوان جديد" 
          onPress={() => navigation.navigate('AddAddress')} 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: 60, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.background },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'El Messiri' },
  listContent: { padding: SPACING.md, paddingBottom: 100 },
  addressCard: { marginBottom: SPACING.md, padding: SPACING.md },
  addressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelIcon: { fontSize: 18 },
  labelText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  defaultBadge: { backgroundColor: `${COLORS.success}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  defaultText: { fontSize: 10, color: COLORS.success, fontWeight: '700' },
  editIcon: { fontSize: 18 },
  addressBody: { gap: 6 },
  areaText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  streetText: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 22 },
  defaultBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  defaultBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyText: { fontSize: 16, color: COLORS.textMuted },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, padding: SPACING.md, paddingBottom: 30, borderTopWidth: 1, borderTopColor: COLORS.border },
});

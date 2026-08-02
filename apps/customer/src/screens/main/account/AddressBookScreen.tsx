import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, RADIUS, FONTS } from '@marketplace/shared-utils';
import { Card, Button } from '@marketplace/shared-ui';
import { useAuthStore, getAddresses, deleteAddress, setDefaultAddress, Address } from '@marketplace/shared-hooks';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { Alert } from '../../../components/appAlert';

export default function AddressBookScreen({ navigation }: any) {
  const layout = useCustomerLayout(1040);
  const columns = layout.tablet ? 2 : 1;
  const gap = layout.compact ? 12 : 16;
  const cardWidth = columns === 1 ? layout.usableWidth : (layout.usableWidth - gap) / 2;
  const user = useAuthStore((s) => s.user);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoadError('');
    try {
      setAddresses(await getAddresses(user.id));
    } catch (e: any) {
      // لا نعرض قائمة فارغة عند فشل الشبكة — ذلك يوهم بعدم وجود عناوين
      setLoadError(e?.message ?? 'تعذّر تحميل العناوين. تحقق من الاتصال.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (item: Address) => {
    Alert.alert('حذف العنوان', `هل تريد حذف "${item.full_address}"؟`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setBusyId(item.id);
          try { await deleteAddress(item.id); await load(); }
          catch (e: any) { Alert.alert('تعذّر الحذف', e?.message ?? 'أعد المحاولة.'); }
          finally { setBusyId(null); }
        },
      },
    ]);
  };

  const handleSetDefault = async (item: Address) => {
    if (!user?.id || item.is_default) return;
    setBusyId(item.id);
    try { await setDefaultAddress(user.id, item.id); await load(); }
    catch (e: any) { Alert.alert('تعذّر التعيين', e?.message ?? 'أعد المحاولة.'); }
    finally { setBusyId(null); }
  };

  const renderAddress = ({ item }: { item: Address }) => (
    <Card style={{ ...styles.addressCard, width: cardWidth }} variant="outlined">
      <View style={styles.addressHeader}>
        <View style={styles.labelRow}>
          <Text style={styles.labelIcon}>{item.label === 'home' ? '🏠' : '🏢'}</Text>
          <Text style={styles.labelText}>{item.label === 'home' ? 'المنزل' : item.label}</Text>
          {item.is_default && <View style={styles.defaultBadge}><Text style={styles.defaultText}>الافتراضي</Text></View>}
        </View>
        {busyId === item.id ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => handleDelete(item)}
            accessibilityRole="button"
            accessibilityLabel="حذف العنوان"
          >
            <Text style={styles.editIcon}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.addressBody}>
        <Text style={styles.areaText}>📍 {item.city ?? ''}</Text>
        <Text style={styles.streetText}>{item.full_address}</Text>
      </View>
      {!item.is_default && (
        <TouchableOpacity
          style={styles.makeDefaultBtn}
          onPress={() => handleSetDefault(item)}
          disabled={busyId === item.id}
          accessibilityRole="button"
          accessibilityLabel="تعيين كعنوان افتراضي"
        >
          <Text style={styles.makeDefaultText}>تعيين كافتراضي</Text>
        </TouchableOpacity>
      )}
    </Card>
  );

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="العودة">
            <Text style={styles.backIcon}>→</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>عناويني</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {loading && (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
      <FlatList
        key={`addresses-${columns}`}
        data={addresses}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        renderItem={renderAddress}
        columnWrapperStyle={columns > 1 ? [styles.listRow, { gap }] : undefined}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: layout.gutter, gap }]}
        ListEmptyComponent={
          loading ? null : loadError ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyText}>{loadError}</Text>
              <TouchableOpacity onPress={load} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="إعادة المحاولة">
                <Text style={styles.retryText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>📍</Text>
              <Text style={styles.emptyText}>لم تقم بإضافة أي عناوين بعد</Text>
            </View>
          )
        }
      />

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={[styles.bottomBarInner, { paddingHorizontal: layout.gutter }]}>
          <Button
            title="+ إضافة عنوان جديد"
            onPress={() => navigation.navigate('AddAddress')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingTop: 48, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerInner: { width: '100%', maxWidth: 1040, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.background },
  headerSpacer: { width: 44 },
  backIcon: { fontSize: 24, color: COLORS.textPrimary },
  headerTitle: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.bold },
  listContent: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingTop: SPACING.md, paddingBottom: 132 },
  listRow: { flexDirection: 'row-reverse' },
  addressCard: { padding: SPACING.md },
  addressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelIcon: { fontSize: 18 },
  labelText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  defaultBadge: { backgroundColor: `${COLORS.success}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  defaultText: { fontSize: 10, color: COLORS.success, fontWeight: '700' },
  editIcon: { fontSize: 18 },
  editButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  makeDefaultBtn: { marginTop: 10, alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  makeDefaultText: { color: COLORS.primary, fontSize: 13, fontFamily: FONTS.bold },
  retryBtn: { marginTop: 14, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  retryText: { color: '#FFFFFF', fontSize: 14, fontFamily: FONTS.bold },
  addressBody: { gap: 6 },
  areaText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  streetText: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 22 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyText: { fontSize: 16, color: COLORS.textMuted },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  bottomBarInner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: 12, paddingBottom: 24 },
});

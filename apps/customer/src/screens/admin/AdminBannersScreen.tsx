import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, Image, KeyboardAvoidingView,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAppBanners, upsertAppBanner, deleteAppBanner, AppBanner } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  danger: COLORS.error,
  info: COLORS.info,
};

export default function AdminBannersScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // New Banner Form
  const [newTitle, setNewTitle] = useState('');
  const [newImage, setNewImage] = useState('');
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAppBanners(true); // true = admin mode (gets all banners including inactive)
      setBanners(data);
    } catch {
      Alert.alert('خطأ', 'فشل تحميل البنرات. تأكد من تشغيل ملف SQL لإنشاء الجدول.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleAddBanner = async () => {
    if (!newTitle.trim() || !newImage.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال عنوان ورابط الصورة للبنر');
      return;
    }
    setSaving(true);
    try {
      await upsertAppBanner({
        title: newTitle.trim(),
        image_url: newImage.trim(),
        target_url: newLink.trim() || null,
        is_active: true,
        sort_order: banners.length
      });
      setNewTitle('');
      setNewImage('');
      setNewLink('');
      load();
    } catch { Alert.alert('خطأ', 'فشل إضافة البنر'); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (banner: AppBanner) => {
    try {
      await upsertAppBanner({ id: banner.id, is_active: !banner.is_active });
      load();
    } catch { Alert.alert('خطأ', 'فشل تحديث الحالة'); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('تأكيد', 'هل أنت متأكد من حذف هذا البنر؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try {
          await deleteAppBanner(id);
          load();
        } catch { Alert.alert('خطأ', 'فشل الحذف'); }
      }}
    ]);
  };

  const renderBanner = ({ item }: { item: AppBanner }) => (
    <View style={[s.bannerCard, columns > 1 && s.gridCard]}>
      <Image source={{ uri: item.image_url }} style={s.bannerImg} resizeMode="cover" />
      <View style={s.bannerInfo}>
        <View style={s.bannerMeta}>
          <Text style={s.bannerTitle}>{item.title}</Text>
          {item.target_url ? <Text style={s.bannerLink} numberOfLines={1}>{item.target_url}</Text> : null}
        </View>
        <View style={s.actions}>
          <TouchableOpacity 
            style={[s.toggleBtn, item.is_active ? s.toggleActive : s.toggleInactive]}
            onPress={() => handleToggleStatus(item)}
          >
            <Text style={[s.toggleText, item.is_active && s.toggleTextActive]}>{item.is_active ? 'نشط' : 'مخفي'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash" size={18} color={UI.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View style={[s.headerContent, { width: contentWidth }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={24} color={UI.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>إدارة البنرات والإعلانات</Text>
        </View>
      </View>

      <FlatList
        data={banners}
        key={`banners-${columns}`}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
        keyExtractor={i => i.id}
        contentContainerStyle={[s.list, { paddingHorizontal: pagePadding, width: contentWidth }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={s.addCard}>
            <Text style={s.addTitle}>إضافة بنر جديد</Text>
            <TextInput style={s.input} placeholder="عنوان الإعلان" value={newTitle} onChangeText={setNewTitle} textAlign="right" />
            <TextInput style={s.input} placeholder="رابط الصورة (URL)" value={newImage} onChangeText={setNewImage} textAlign="right" />
            <TextInput style={s.input} placeholder="رابط التوجيه عند الضغط (اختياري)" value={newLink} onChangeText={setNewLink} textAlign="right" />
            <TouchableOpacity style={s.saveBtn} onPress={handleAddBanner} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>نشر البنر</Text>}
            </TouchableOpacity>
          </View>
        }
        renderItem={renderBanner}
        ListEmptyComponent={!loading ? <Text style={s.emptyText}>لا توجد بنرات حالياً</Text> : <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} />}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20, backgroundColor: UI.card, borderBottomWidth: 1, borderBottomColor: UI.border },
  headerContent: { maxWidth: 1280, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right' },
  list: { alignSelf: 'center', paddingTop: 20, paddingBottom: 112 },
  columnRow: { gap: 16 },
  
  addCard: { backgroundColor: UI.card, padding: 20, borderRadius: RADIUS.lg, marginBottom: 20, borderWidth: 1, borderColor: UI.border },
  addTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right', marginBottom: 16 },
  input: { minHeight: 48, borderWidth: 1, borderColor: UI.border, borderRadius: RADIUS.md, paddingHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.surfaceMuted, fontSize: 14, fontFamily: FONTS.regular, color: UI.text },
  saveBtn: { minHeight: 48, backgroundColor: UI.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnText: { color: UI.card, fontSize: 16, fontFamily: FONTS.semiBold },

  bannerCard: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: UI.border },
  gridCard: { maxWidth: 632 },
  bannerImg: { width: '100%', height: 160, backgroundColor: '#F1F5F9' },
  bannerInfo: { padding: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  bannerMeta: { flex: 1, alignItems: 'flex-end', marginLeft: 16 },
  bannerTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, marginBottom: 4, textAlign: 'right' },
  bannerLink: { fontSize: 12, color: UI.info, fontFamily: FONTS.medium },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  toggleBtn: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, justifyContent: 'center' },
  toggleActive: { backgroundColor: UI.primaryLight, borderColor: UI.primaryLight },
  toggleInactive: { backgroundColor: '#F8FAFC', borderColor: UI.border },
  toggleText: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.textMuted },
  toggleTextActive: { color: UI.primary },
  delBtn: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.accentCoralSoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: UI.textMuted, marginTop: 40, fontSize: 16, fontFamily: FONTS.medium }
});

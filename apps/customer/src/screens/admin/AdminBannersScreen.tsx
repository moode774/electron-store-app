import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, Image, KeyboardAvoidingView
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { getAppBanners, upsertAppBanner, deleteAppBanner, AppBanner } from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  danger: '#DC2626',
  info: '#2563EB',
};

export default function AdminBannersScreen({ navigation }: any) {
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
    <View style={s.bannerCard}>
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
        <View style={s.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={24} color={UI.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>إدارة البنرات والإعلانات</Text>
        </View>
      </View>

      <FlatList
        data={banners}
        keyExtractor={i => i.id}
        contentContainerStyle={s.list}
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
  header: { padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: UI.border },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: UI.text },
  list: { padding: 20, paddingBottom: 100 },
  
  addCard: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: UI.border },
  addTitle: { fontSize: 16, fontWeight: '900', color: UI.text, textAlign: 'right', marginBottom: 16 },
  input: { height: 48, borderWidth: 1, borderColor: UI.border, borderRadius: 12, paddingHorizontal: 16, marginBottom: 12, backgroundColor: '#F8FAFC', fontSize: 14 },
  saveBtn: { height: 48, backgroundColor: UI.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  bannerCard: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: UI.border },
  bannerImg: { width: '100%', height: 160, backgroundColor: '#F1F5F9' },
  bannerInfo: { padding: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  bannerMeta: { flex: 1, alignItems: 'flex-end', marginLeft: 16 },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: UI.text, marginBottom: 4 },
  bannerLink: { fontSize: 12, color: UI.info, fontWeight: '600' },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  toggleActive: { backgroundColor: UI.primaryLight, borderColor: UI.primaryLight },
  toggleInactive: { backgroundColor: '#F8FAFC', borderColor: UI.border },
  toggleText: { fontSize: 13, fontWeight: '700', color: UI.textMuted },
  toggleTextActive: { color: UI.primary },
  delBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: UI.textMuted, marginTop: 40, fontSize: 16 }
});

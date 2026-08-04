import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Platform, Share, ScrollView, Modal
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import {
  getMyApiKeys, createApiKey, revokeApiKey, deleteApiKey,
  ApiKeyInfo, API_V1_URL,
} from '@marketplace/shared-hooks';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';
import { t, tv, getLocale } from '@marketplace/shared-i18n';

const UI = {
  primary: '#1E3A8A', primaryLight: '#EEF2FF', bg: '#F8FAFC', card: '#FFFFFF',
  text: '#0F172A', textMuted: '#64748B', border: '#E2E8F0',
  success: '#059669', danger: '#DC2626', warning: '#D97706',
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—';

async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      const nav = (globalThis as any).navigator;
      await nav?.clipboard?.writeText?.(text);
      return true;
    } catch { return false; }
  }
  // على الجوال: مشاركة النص (يتيح النسخ من قائمة المشاركة)
  try { await Share.share({ message: text }); return true; } catch { return false; }
}

export default function ApiKeysScreen() {
  const layout = useResponsiveLayout(960);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  // المفتاح المُنشأ حديثاً — يُعرض مرة واحدة فقط
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setKeys(await getMyApiKeys()); }
    catch { Alert.alert('خطأ', 'فشل تحميل المفاتيح'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const name = newName.trim() || 'مفتاحي';
    setCreating(true);
    try {
      const { key } = await createApiKey(name);
      setFreshKey(key);
      setNewName('');
      await load();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      Alert.alert('خطأ', msg.includes('max 10') ? 'الحد الأقصى 10 مفاتيح نشطة. ألغِ مفتاحاً قديماً أولاً.' : 'فشل إنشاء المفتاح');
    } finally { setCreating(false); }
  };

  const handleRevoke = (k: ApiKeyInfo) => {
    Alert.alert('إلغاء المفتاح', t('إلغاء "{0}"؟ أي تكامل يستخدمه سيتوقف فوراً.', [tv(k.name)]), [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إلغاء المفتاح', style: 'destructive',
        onPress: async () => {
          try { await revokeApiKey(k.id); await load(); }
          catch { Alert.alert('خطأ', 'فشل إلغاء المفتاح'); }
        },
      },
    ]);
  };

  const handleDelete = (k: ApiKeyInfo) => {
    Alert.alert('حذف المفتاح', t('حذف "{0}" نهائياً من السجل؟', [tv(k.name)]), [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteApiKey(k.id); await load(); }
          catch { Alert.alert('خطأ', 'فشل حذف المفتاح'); }
        },
      },
    ]);
  };

  const renderKey = ({ item }: { item: ApiKeyInfo }) => (
    <View style={s.card}>
      <View style={s.cardRow}>
        <View style={[s.iconBox, { backgroundColor: item.is_active ? '#ECFDF5' : '#FEF2F2' }]}>
          <Ionicons name="key" size={20} color={item.is_active ? UI.success : UI.danger} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.keyName}>{tv(item.name)}</Text>
          <Text style={s.keyPrefix}>{tv(item.key_prefix)}</Text>
          <Text style={s.keyMeta}>{t('{0} · آخر استخدام: {1}', [item.is_active ? '🟢 نشط' : '🔴 ملغى', fmtDate(item.last_used_at)])}</Text>
        </View>
      </View>
      <View style={s.actionsRow}>
        {item.is_active && (
          <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#FFFBEB' }]} onPress={() => handleRevoke(item)}>
            <Text style={[s.smallBtnText, { color: UI.warning }]}>{t('إلغاء')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDelete(item)}>
          <Text style={[s.smallBtnText, { color: UI.danger }]}>{t('حذف')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingHorizontal: layout.gutter }, layout.desktop && s.headerDesktop]}>
        <Text style={s.headerTitle}>{t('مفاتيح API')}</Text>
        <Text style={s.headerSub}>{t('اربط حسابك مع Claude أو أي نموذج ذكاء اصطناعي. المفتاح يمنح صلاحيات حسابك فقط — لا تشاركه مع أحد.')}</Text>
      </View>

      {/* إنشاء مفتاح */}
      <View style={[s.createBox, { paddingHorizontal: layout.gutter }, layout.tablet && s.createBoxWide]}>
        <TextInput
          style={s.input}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('اسم المفتاح (مثل: تكامل كلود)')}
          placeholderTextColor={UI.textMuted}
          textAlign="right"
        />
        <TouchableOpacity style={[s.createBtn, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
          {creating ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={s.createBtnText}>{t('إنشاء مفتاح جديد')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={UI.primary} /></View>
      ) : (
        <FlatList
          data={keys}
          keyExtractor={k => k.id}
          renderItem={renderKey}
          contentContainerStyle={[s.list, { paddingHorizontal: layout.gutter }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UI.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="key-outline" size={48} color={UI.border} />
              <Text style={s.emptyText}>{t('لا توجد مفاتيح بعد — أنشئ أول مفتاح للربط مع الذكاء الاصطناعي')}</Text>
            </View>
          }
        />
      )}

      {/* عرض المفتاح الجديد — مرة واحدة فقط */}
      <Modal visible={!!freshKey} transparent animationType="fade" onRequestClose={() => setFreshKey(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, layout.compact && s.modalCardCompact]}>
            <Ionicons name="shield-checkmark" size={40} color={UI.success} style={{ alignSelf: 'center' }} />
            <Text style={s.modalTitle}>{t('تم إنشاء المفتاح ✓')}</Text>
            <Text style={s.modalWarn}>{t('انسخه الآن واحفظه في مكان آمن — لن يظهر مرة أخرى أبداً.')}</Text>
            <ScrollView style={s.keyBox} horizontal showsHorizontalScrollIndicator={false}>
              <Text style={s.keyText} selectable>{tv(freshKey)}</Text>
            </ScrollView>

            <TouchableOpacity
              style={s.copyBtn}
              onPress={async () => {
                const ok = await copyText(freshKey!);
                if (ok && Platform.OS === 'web') Alert.alert('تم', 'نُسخ المفتاح إلى الحافظة');
              }}
            >
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={s.copyBtnText}>{tv(Platform.OS === 'web' ? t('نسخ المفتاح') : t('مشاركة / نسخ'))}</Text>
            </TouchableOpacity>

            <Text style={s.usageTitle}>{t('طريقة الاستخدام مع أي AI:')}</Text>
            <ScrollView style={s.usageBox} horizontal showsHorizontalScrollIndicator={false}>
              <Text style={s.usageCode} selectable>
                {`GET ${API_V1_URL}/me\nx-api-key: ${freshKey}`}
              </Text>
            </ScrollView>

            <TouchableOpacity style={s.doneBtn} onPress={() => setFreshKey(null)}>
              <Text style={s.doneBtnText}>{t('حفظته، إغلاق')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: {
    backgroundColor: UI.card, paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderColor: UI.border,
    width: '100%', maxWidth: 960, alignSelf: 'center',
  },
  headerDesktop: { marginTop: 24, borderRadius: 22, borderWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text, textAlign: 'right' },
  headerSub: { fontSize: 13, color: UI.textMuted, textAlign: 'right', marginTop: 6, lineHeight: 20 },
  createBox: { padding: 16, gap: 10, width: '100%', maxWidth: 960, alignSelf: 'center' },
  createBoxWide: { flexDirection: 'row-reverse', alignItems: 'center' },
  input: {
    backgroundColor: UI.card, borderRadius: 14, borderWidth: 1, borderColor: UI.border,
    paddingHorizontal: 14, height: 48, fontSize: 14, color: UI.text, fontWeight: '600', flex: 1, minWidth: 0,
  },
  createBtn: {
    backgroundColor: UI.primary, borderRadius: 14, height: 48,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  list: { padding: 16, paddingTop: 0, gap: 12, paddingBottom: 60, width: '100%', maxWidth: 960, alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 30 },
  emptyText: { fontSize: 14, color: UI.textMuted, fontWeight: '600', textAlign: 'center' },
  card: {
    backgroundColor: UI.card, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 4,
  },
  cardRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  keyName: { fontSize: 15, fontWeight: '800', color: UI.text },
  keyPrefix: { fontSize: 12, color: UI.textMuted, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, marginTop: 2 },
  keyMeta: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  actionsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  smallBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  smallBtnText: { fontSize: 12, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: '#0F172A99', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: UI.card, borderRadius: 24, padding: 22, width: '100%', maxWidth: 480 },
  modalCardCompact: { padding: 16, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: UI.text, textAlign: 'center', marginTop: 8 },
  modalWarn: { fontSize: 13, color: UI.danger, fontWeight: '700', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  keyBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginTop: 14, maxHeight: 60 },
  keyText: { color: '#4ADE80', fontSize: 13, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  copyBtn: {
    backgroundColor: UI.primary, borderRadius: 14, height: 46, marginTop: 12,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  copyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  usageTitle: { fontSize: 13, fontWeight: '800', color: UI.text, textAlign: 'right', marginTop: 16 },
  usageBox: { backgroundColor: UI.bg, borderRadius: 12, padding: 12, marginTop: 8, maxHeight: 70 },
  usageCode: { fontSize: 11, color: UI.textMuted, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  doneBtn: { alignItems: 'center', marginTop: 14, paddingVertical: 10 },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: UI.textMuted },
});

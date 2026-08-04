import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, KeyboardAvoidingView,
  useWindowDimensions
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { 
  updateServiceArea, createServiceArea, getAllServiceAreas, ServiceArea,
  getSystemSettings, updateSystemSetting 
} from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv } from '@marketplace/shared-i18n';

const UI = {
  primary: COLORS.primary,
  primaryLight: COLORS.primarySoft,
  bg: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  danger: COLORS.error,
  info: COLORS.info,
};

export default function AdminSettingsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 960);
  const [activeTab, setActiveTab] = useState<'system' | 'areas'>('system');
  
  // Settings State
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Areas State
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [newCity, setNewCity] = useState('');
  const [savingArea, setSavingArea] = useState(false);

  const loadSettings = async () => {
    try {
      const data = await getSystemSettings();
      const s: Record<string, string> = {};
      Object.keys(data).forEach(k => s[k] = String(data[k]));
      setSettings(s);
    } catch {
      Alert.alert('خطأ', 'فشل تحميل الإعدادات من قاعدة البيانات');
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadAreas = async () => {
    try {
      const data = await getAllServiceAreas();
      setAreas(data);
    } catch {
      Alert.alert('خطأ', 'فشل تحميل مناطق الخدمة');
    } finally {
      setAreasLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'system') loadSettings();
    else loadAreas();
  }, [activeTab]);

  const handleUpdateSetting = async (key: string) => {
    setSavingKey(key);
    try {
      await updateSystemSetting(key, settings[key]);
      Alert.alert('تم', 'تم حفظ الإعداد بنجاح');
    } catch {
      Alert.alert('خطأ', 'فشل حفظ الإعداد. تأكد من إنشاء جدول system_settings');
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleArea = async (area: ServiceArea, field: 'is_active' | 'delivery_available') => {
    try {
      const val = !area[field];
      await updateServiceArea(area.id, { [field]: val });
      loadAreas();
    } catch { Alert.alert('خطأ', 'فشل تحديث المنطقة'); }
  };

  const handleAddArea = async () => {
    if (!newCity.trim()) { Alert.alert('تنبيه', 'أدخل اسم المدينة'); return; }
    setSavingArea(true);
    try {
      await createServiceArea({ city: newCity.trim(), delivery_available: true });
      setNewCity('');
      loadAreas();
    } catch { Alert.alert('خطأ', 'فشل إضافة المنطقة'); }
    finally { setSavingArea(false); }
  };

  const renderSettingRow = (key: string, label: string, icon: string, suffix: string) => (
    <View style={[s.settingRow, compact && s.settingRowCompact]}>
      <View style={s.settingInfo}>
        <View style={s.settingIconBox}><Ionicons name={icon as any} size={20} color={UI.primary} /></View>
        <Text style={s.settingLabel}>{tv(label)}</Text>
      </View>
      <View style={[s.settingInputWrap, compact && s.settingInputWrapCompact]}>
        <TextInput
          style={s.settingInput}
          value={settings[key] ?? ''}
          onChangeText={(v) => setSettings(prev => ({...prev, [key]: v}))}
          keyboardType="numeric"
          textAlign="center"
        />
        <Text style={s.settingSuffix}>{tv(suffix)}</Text>
        <TouchableOpacity 
          style={s.saveBtn} 
          onPress={() => handleUpdateSetting(key)}
          disabled={savingKey === key}
        >
          {savingKey === key ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.saveBtnText}>{t('حفظ')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('إعدادات النظام')}</Text>
      </View>

      <View style={[s.tabs, { width: contentWidth }]}>
        <TouchableOpacity style={[s.tab, activeTab === 'system' && s.tabActive]} onPress={() => setActiveTab('system')}>
          <Text style={[s.tabText, activeTab === 'system' && s.tabTextActive]}>{t('الإعدادات العامة')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'areas' && s.tabActive]} onPress={() => setActiveTab('areas')}>
          <Text style={[s.tabText, activeTab === 'areas' && s.tabTextActive]}>{t('مناطق الخدمة')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingHorizontal: pagePadding }]} keyboardShouldPersistTaps="handled">
        {activeTab === 'system' ? (
          settingsLoading ? <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} /> :
          <View style={s.card}>
            <Text style={s.cardTitle}>{t('التحكم بالإيرادات والرسوم')}</Text>
            {renderSettingRow('app_commission_percent', t('نسبة عمولة التطبيق'), 'pie-chart', '%')}
            <View style={s.divider} />
            {renderSettingRow('delivery_fee', t('رسوم التوصيل الافتراضية'), 'bicycle', t('ر.ي'))}
            <View style={s.divider} />
            {renderSettingRow('tax_percent', t('ضريبة القيمة المضافة'), 'receipt', '%')}
            <View style={s.divider} />
            {renderSettingRow('min_order_amount', t('الحد الأدنى للطلب'), 'cart', t('ر.ي'))}
          </View>
        ) : (
          areasLoading ? <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} /> :
          <View style={s.card}>
            <View style={[s.addAreaBox, compact && s.addAreaBoxCompact]}>
              <TextInput style={s.areaInput} placeholder={t('اسم المدينة الجديدة')} value={newCity} onChangeText={setNewCity} textAlign="right" />
              <TouchableOpacity style={s.addBtn} onPress={handleAddArea} disabled={savingArea}>
                {savingArea ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="add" size={20} color="#FFF" />}
              </TouchableOpacity>
            </View>
            {areas.map(item => (
              <View key={item.id} style={[s.areaItem, compact && s.areaItemCompact]}>
                <View style={s.areaMeta}>
                  <Ionicons name="location" size={20} color={UI.textMuted} />
                  <Text style={s.areaCity}>{tv(item.city)}</Text>
                </View>
                <View style={s.areaToggles}>
                  <TouchableOpacity 
                    style={[s.toggleBtn, item.delivery_available ? s.toggleActive : s.toggleInactive]}
                    onPress={() => handleToggleArea(item, 'delivery_available')}
                  >
                    <Text style={[s.toggleText, item.delivery_available && s.toggleTextActive]}>{t('توصيل')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[s.toggleBtn, item.is_active ? s.toggleActive : s.toggleInactive]}
                    onPress={() => handleToggleArea(item, 'is_active')}
                  >
                    <Text style={[s.toggleText, item.is_active && s.toggleTextActive]}>{tv(item.is_active ? t('نشطة') : t('موقوفة'))}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20, backgroundColor: UI.card, borderBottomWidth: 1, borderBottomColor: UI.border, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: FONTS.bold, color: UI.text },
  tabs: { maxWidth: 960, alignSelf: 'center', flexDirection: 'row-reverse', backgroundColor: UI.card, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: UI.border },
  tab: { flex: 1, minHeight: 48, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: UI.primary },
  tabText: { fontSize: 14, fontFamily: FONTS.semiBold, color: UI.textMuted },
  tabTextActive: { color: UI.primary, fontFamily: FONTS.bold },
  scroll: { alignItems: 'center', paddingTop: 20, paddingBottom: 112 },
  card: { width: '100%', maxWidth: 960, backgroundColor: UI.card, borderRadius: RADIUS.lg, padding: 20, borderWidth: 1, borderColor: UI.border },
  cardTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right', marginBottom: 20 },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 16 },
  
  settingRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  settingRowCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  settingInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  settingIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, fontSize: 14, fontFamily: FONTS.semiBold, color: UI.text, textAlign: 'right' },
  settingInputWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  settingInputWrapCompact: { justifyContent: 'flex-start' },
  settingInput: { width: 72, minHeight: 44, borderWidth: 1, borderColor: UI.border, borderRadius: RADIUS.sm, fontSize: 14, fontFamily: FONTS.semiBold, color: UI.text, backgroundColor: COLORS.surfaceMuted },
  settingSuffix: { fontSize: 13, color: UI.textMuted, fontFamily: FONTS.medium },
  saveBtn: { backgroundColor: UI.primary, paddingHorizontal: 16, minHeight: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: UI.card, fontSize: 13, fontFamily: FONTS.semiBold },

  addAreaBox: { flexDirection: 'row-reverse', gap: 12, marginBottom: 24 },
  addAreaBoxCompact: { flexDirection: 'column' },
  areaInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: UI.border, borderRadius: RADIUS.md, paddingHorizontal: 16, fontSize: 14, fontFamily: FONTS.regular, color: UI.text, backgroundColor: COLORS.surfaceMuted },
  addBtn: { minWidth: 48, minHeight: 48, backgroundColor: UI.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  
  areaItem: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  areaItemCompact: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  areaMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  areaCity: { fontSize: 15, fontFamily: FONTS.semiBold, color: UI.text },
  areaToggles: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  toggleBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1 },
  toggleActive: { backgroundColor: UI.primaryLight, borderColor: UI.primaryLight },
  toggleInactive: { backgroundColor: '#F8FAFC', borderColor: UI.border },
  toggleText: { fontSize: 12, fontFamily: FONTS.semiBold, color: UI.textMuted },
  toggleTextActive: { color: UI.primary },
});

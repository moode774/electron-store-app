import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Platform, KeyboardAvoidingView
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { 
  updateServiceArea, createServiceArea, getAllServiceAreas, ServiceArea,
  getSystemSettings, updateSystemSetting 
} from '@marketplace/shared-hooks';

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
  info: '#2563EB',
};

export default function AdminSettingsScreen({ navigation }: any) {
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
    <View style={s.settingRow}>
      <View style={s.settingInfo}>
        <View style={s.settingIconBox}><Ionicons name={icon as any} size={20} color={UI.primary} /></View>
        <Text style={s.settingLabel}>{label}</Text>
      </View>
      <View style={s.settingInputWrap}>
        <TextInput
          style={s.settingInput}
          value={settings[key] ?? ''}
          onChangeText={(v) => setSettings(prev => ({...prev, [key]: v}))}
          keyboardType="numeric"
          textAlign="center"
        />
        <Text style={s.settingSuffix}>{suffix}</Text>
        <TouchableOpacity 
          style={s.saveBtn} 
          onPress={() => handleUpdateSetting(key)}
          disabled={savingKey === key}
        >
          {savingKey === key ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.saveBtnText}>حفظ</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Text style={s.headerTitle}>إعدادات النظام</Text>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, activeTab === 'system' && s.tabActive]} onPress={() => setActiveTab('system')}>
          <Text style={[s.tabText, activeTab === 'system' && s.tabTextActive]}>الإعدادات العامة</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'areas' && s.tabActive]} onPress={() => setActiveTab('areas')}>
          <Text style={[s.tabText, activeTab === 'areas' && s.tabTextActive]}>مناطق الخدمة</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {activeTab === 'system' ? (
          settingsLoading ? <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} /> :
          <View style={s.card}>
            <Text style={s.cardTitle}>التحكم بالإيرادات والرسوم</Text>
            {renderSettingRow('app_commission_percent', 'نسبة عمولة التطبيق', 'pie-chart', '%')}
            <View style={s.divider} />
            {renderSettingRow('delivery_fee', 'رسوم التوصيل الافتراضية', 'bicycle', 'ر.س')}
            <View style={s.divider} />
            {renderSettingRow('tax_percent', 'ضريبة القيمة المضافة', 'receipt', '%')}
            <View style={s.divider} />
            {renderSettingRow('min_order_amount', 'الحد الأدنى للطلب', 'cart', 'ر.س')}
          </View>
        ) : (
          areasLoading ? <ActivityIndicator size="large" color={UI.primary} style={{marginTop: 50}} /> :
          <View style={s.card}>
            <View style={s.addAreaBox}>
              <TextInput style={s.areaInput} placeholder="اسم المدينة الجديدة" value={newCity} onChangeText={setNewCity} textAlign="right" />
              <TouchableOpacity style={s.addBtn} onPress={handleAddArea} disabled={savingArea}>
                {savingArea ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="add" size={20} color="#FFF" />}
              </TouchableOpacity>
            </View>
            {areas.map(item => (
              <View key={item.id} style={s.areaItem}>
                <View style={s.areaMeta}>
                  <Ionicons name="location" size={20} color={UI.textMuted} />
                  <Text style={s.areaCity}>{item.city}</Text>
                </View>
                <View style={s.areaToggles}>
                  <TouchableOpacity 
                    style={[s.toggleBtn, item.delivery_available ? s.toggleActive : s.toggleInactive]}
                    onPress={() => handleToggleArea(item, 'delivery_available')}
                  >
                    <Text style={[s.toggleText, item.delivery_available && s.toggleTextActive]}>توصيل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[s.toggleBtn, item.is_active ? s.toggleActive : s.toggleInactive]}
                    onPress={() => handleToggleArea(item, 'is_active')}
                  >
                    <Text style={[s.toggleText, item.is_active && s.toggleTextActive]}>{item.is_active ? 'نشطة' : 'موقوفة'}</Text>
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
  header: { padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: UI.border, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: UI.text },
  tabs: { flexDirection: 'row-reverse', backgroundColor: '#FFFFFF', paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: UI.border },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: UI.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: UI.textMuted },
  tabTextActive: { color: UI.primary, fontWeight: '900' },
  scroll: { padding: 20, paddingBottom: 100 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: UI.border },
  cardTitle: { fontSize: 16, fontWeight: '900', color: UI.text, textAlign: 'right', marginBottom: 20 },
  divider: { height: 1, backgroundColor: UI.border, marginVertical: 16 },
  
  settingRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  settingInfo: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  settingIconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 14, fontWeight: '700', color: UI.text },
  settingInputWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  settingInput: { width: 60, height: 40, borderWidth: 1, borderColor: UI.border, borderRadius: 8, fontSize: 14, fontWeight: '700', color: UI.text, backgroundColor: '#F8FAFC' },
  settingSuffix: { fontSize: 13, color: UI.textMuted, fontWeight: '600' },
  saveBtn: { backgroundColor: UI.primary, paddingHorizontal: 12, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  addAreaBox: { flexDirection: 'row-reverse', gap: 12, marginBottom: 24 },
  areaInput: { flex: 1, height: 48, borderWidth: 1, borderColor: UI.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 14, backgroundColor: '#F8FAFC' },
  addBtn: { width: 48, height: 48, backgroundColor: UI.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  
  areaItem: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  areaMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  areaCity: { fontSize: 15, fontWeight: '700', color: UI.text },
  areaToggles: { flexDirection: 'row-reverse', gap: 8 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  toggleActive: { backgroundColor: UI.primaryLight, borderColor: UI.primaryLight },
  toggleInactive: { backgroundColor: '#F8FAFC', borderColor: UI.border },
  toggleText: { fontSize: 12, fontWeight: '700', color: UI.textMuted },
  toggleTextActive: { color: UI.primary },
});

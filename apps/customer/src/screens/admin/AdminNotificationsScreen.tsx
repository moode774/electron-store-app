import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { broadcastNotification } from '@marketplace/shared-hooks';

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

const AUDIENCE_OPTIONS = [
  { key: '', label: 'الجميع', icon: 'people', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'customer', label: 'العملاء', icon: 'person', color: '#059669', bg: '#ECFDF5' },
  { key: 'merchant', label: 'التجار', icon: 'storefront', color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'delivery', label: 'السائقون', icon: 'bicycle', color: '#D97706', bg: '#FFFBEB' },
];

const QUICK_TEMPLATES = [
  { title: 'تحديث النظام', body: 'تم تحديث التطبيق بميزات جديدة. يُرجى التحديث للاستمتاع بأفضل تجربة.' },
  { title: 'عروض خاصة', body: 'استمتع بعروض حصرية اليوم فقط! تفضل بزيارة التطبيق الآن لتفقدها.' },
  { title: 'تنبيه مهم', body: 'هناك تحديث مهم يتعلق بحسابك. يُرجى مراجعة التطبيق.' },
  { title: 'شكر وتقدير', body: 'شكراً لثقتكم بنا. نحن نسعى دائماً لتحسين تجربتكم معنا.' },
];

export default function AdminNotificationsScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const handleSend = async () => {
    if (!title.trim()) { Alert.alert('تنبيه', 'أدخل عنوان الإشعار'); return; }
    if (!body.trim()) { Alert.alert('تنبيه', 'أدخل نص الإشعار'); return; }

    const targetLabel = AUDIENCE_OPTIONS.find(a => a.key === audience)?.label ?? 'الجميع';
    Alert.alert(
      'تأكيد الإرسال',
      `إرسال إشعار إلى: ${targetLabel}\nالعنوان: ${title}`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد وإرسال',
          onPress: async () => {
            setSending(true);
            setSentCount(null);
            try {
              const result = await broadcastNotification({
                title: title.trim(),
                body: body.trim(),
                role: audience || undefined,
              });
              setSentCount(result.sent);
              setTitle('');
              setBody('');
            } catch {
              Alert.alert('خطأ', 'فشل إرسال الإشعارات');
            } finally { setSending(false); }
          },
        },
      ]
    );
  };

  const applyTemplate = (t: { title: string; body: string }) => {
    setTitle(t.title);
    setBody(t.body);
    setSentCount(null);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Modern Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 12}}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Ionicons name="arrow-forward" size={24} color={UI.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>إرسال الإشعارات</Text>
          </View>
          <View style={s.headerIcon}>
            <Ionicons name="notifications" size={20} color={UI.primary} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {sentCount !== null && (
          <View style={s.successBanner}>
            <Ionicons name="checkmark-circle" size={22} color={UI.success} />
            <Text style={s.successText}>نجاح! تم إرسال {sentCount} إشعار.</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.sectionTitle}>الجمهور المستهدف</Text>
          <View style={s.audienceGrid}>
            {AUDIENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.audienceCard, audience === opt.key && { borderColor: opt.color, backgroundColor: opt.bg }]}
                onPress={() => setAudience(opt.key)}
                activeOpacity={0.8}
              >
                <View style={[s.audienceIcon, { backgroundColor: audience === opt.key ? opt.color : '#F1F5F9' }]}>
                  <Ionicons name={opt.icon as any} size={20} color={audience === opt.key ? '#FFFFFF' : UI.textMuted} />
                </View>
                <Text style={[s.audienceLabel, audience === opt.key && { color: opt.color, fontWeight: '800' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>قوالب الإشعارات الجاهزة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.templatesRow}>
            {QUICK_TEMPLATES.map((t, idx) => (
              <TouchableOpacity key={idx} style={s.templateChip} onPress={() => applyTemplate(t)} activeOpacity={0.8}>
                <Ionicons name="flash" size={14} color={UI.primary} />
                <Text style={s.templateChipText}>{t.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>محتوى الإشعار</Text>
          <View style={s.inputWrapper}>
             <TextInput
               style={s.input}
               placeholder="عنوان الإشعار (مثال: خصم جديد!)"
               placeholderTextColor={UI.textMuted}
               value={title}
               onChangeText={setTitle}
               textAlign="right"
               maxLength={80}
             />
             <Text style={s.charCount}>{title.length}/80</Text>
          </View>

          <View style={s.inputWrapper}>
             <TextInput
               style={[s.input, s.textArea]}
               placeholder="اكتب نص وتفاصيل الإشعار هنا..."
               placeholderTextColor={UI.textMuted}
               value={body}
               onChangeText={setBody}
               textAlign="right"
               multiline
               numberOfLines={4}
               textAlignVertical="top"
               maxLength={300}
             />
             <Text style={s.charCount}>{body.length}/300</Text>
          </View>
        </View>

        <View style={s.previewBox}>
          <Text style={s.previewLabel}>شكل الإشعار على هواتف المستخدمين</Text>
          <View style={s.previewCard}>
            <View style={s.previewIconCircle}>
              <Ionicons name="notifications" size={20} color={UI.primary} />
            </View>
            <View style={s.previewContent}>
              <Text style={s.previewTitle}>{title || 'عنوان الإشعار'}</Text>
              <Text style={s.previewBody} numberOfLines={2}>{body || 'نص الإشعار سيظهر هنا...'}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[s.sendBtn, (sending || !title.trim() || !body.trim()) && s.sendBtnDisabled]}
          onPress={handleSend}
          disabled={sending || !title.trim() || !body.trim()}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={s.sendBtnText}>إرسال الآن</Text>
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI.text },
  backBtn: { padding: 4 },
  headerIcon: { width: 44, height: 44, backgroundColor: UI.primaryLight, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60, gap: 16 },
  successBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF5', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  successText: { fontSize: 15, fontWeight: '800', color: UI.success },
  card: { backgroundColor: UI.card, borderRadius: 24, padding: 20, shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F8FAFC' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: UI.text, marginBottom: 16, textAlign: 'right' },
  audienceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  audienceCard: { width: '48%', alignItems: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#F1F5F9' },
  audienceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  audienceLabel: { fontSize: 14, fontWeight: '700', color: UI.textMuted },
  templatesRow: { paddingBottom: 4, gap: 10 },
  templateChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: UI.primaryLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E0E7FF' },
  templateChipText: { fontSize: 13, fontWeight: '800', color: UI.primary },
  inputWrapper: { marginBottom: 12 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, fontSize: 15, color: UI.text, borderWidth: 1, borderColor: UI.border, fontWeight: '600' },
  textArea: { height: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#9CA3AF', textAlign: 'left', marginTop: 4, paddingHorizontal: 4 },
  previewBox: { marginTop: 8 },
  previewLabel: { fontSize: 13, color: UI.textMuted, fontWeight: '700', marginBottom: 8, textAlign: 'right' },
  previewCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: UI.primaryLight },
  previewIconCircle: { width: 46, height: 46, borderRadius: 14, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  previewContent: { flex: 1 },
  previewTitle: { fontSize: 15, fontWeight: '900', color: UI.text, textAlign: 'right', marginBottom: 6 },
  previewBody: { fontSize: 13, color: UI.textMuted, textAlign: 'right', lineHeight: 20, fontWeight: '500' },
  sendBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: UI.primary, borderRadius: 16, paddingVertical: 18, shadowColor: UI.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6, marginTop: 10 },
  sendBtnDisabled: { opacity: 0.6, shadowOpacity: 0 },
  sendBtnText: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
});

import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { broadcastNotification, createIdempotencyKey } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

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

const AUDIENCE_OPTIONS = [
  { key: '', label: 'الجميع', icon: 'people', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'customer', label: 'العملاء', icon: 'person', color: '#059669', bg: '#ECFDF5' },
  { key: 'merchant', label: 'التجار', icon: 'storefront', color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'delivery', label: 'السائقون', icon: 'bicycle', color: '#D97706', bg: '#FFFBEB' },
] as const;

const QUICK_TEMPLATES = [
  { title: 'تحديث النظام', body: 'تم تحديث التطبيق بميزات جديدة. يُرجى التحديث للاستمتاع بأفضل تجربة.' },
  { title: 'عروض خاصة', body: 'استمتع بعروض حصرية اليوم فقط! تفضل بزيارة التطبيق الآن لتفقدها.' },
  { title: 'تنبيه مهم', body: 'هناك تحديث مهم يتعلق بحسابك. يُرجى مراجعة التطبيق.' },
  { title: 'شكر وتقدير', body: 'شكراً لثقتكم بنا. نحن نسعى دائماً لتحسين تجربتكم معنا.' },
];

export default function AdminNotificationsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const desktop = width >= BREAKPOINTS.desktop;
  const pagePadding = compact ? 12 : 24;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 920);
  const audienceWidth = desktop ? '23.5%' : '48%';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'' | 'customer' | 'merchant' | 'delivery'>('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const pendingCampaign = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

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
              const fingerprint = JSON.stringify({ title: title.trim(), body: body.trim(), audience });
              if (pendingCampaign.current?.fingerprint !== fingerprint) {
                pendingCampaign.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
              }
              const result = await broadcastNotification({
                title: title.trim(),
                body: body.trim(),
                role: audience || undefined,
                channel: 'in_app',
                idempotencyKey: pendingCampaign.current.idempotencyKey,
              });
              pendingCampaign.current = null;
              setSentCount(result.sent);
              if (result.sent === 0) Alert.alert('لا يوجد مستلمون', 'لم يوجد مستخدمون مطابقون للجمهور المحدد.');
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
        <View style={[s.headerContent, { width: contentWidth }]}>
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

      <ScrollView contentContainerStyle={[s.scroll, { paddingHorizontal: pagePadding }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[s.content, { width: contentWidth }]}>
        {sentCount !== null && (
          <View style={s.successBanner}>
            <Ionicons name="checkmark-circle" size={22} color={UI.success} />
            <Text style={s.successText}>تم إنشاء {sentCount} إشعار داخل التطبيق.</Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.sectionTitle}>الجمهور المستهدف</Text>
          <View style={s.audienceGrid}>
            {AUDIENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.audienceCard, { width: audienceWidth }, audience === opt.key && { borderColor: opt.color, backgroundColor: opt.bg }]}
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
        </View>
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
  headerContent: { maxWidth: 920, alignSelf: 'center', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, color: UI.text },
  backBtn: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  headerIcon: { width: 44, height: 44, backgroundColor: UI.primaryLight, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingTop: 20, paddingBottom: 112 },
  content: { maxWidth: 920, gap: 16 },
  successBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF5', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  successText: { flex: 1, fontSize: 15, fontFamily: FONTS.semiBold, color: UI.success, textAlign: 'right' },
  card: { backgroundColor: UI.card, borderRadius: RADIUS.xl, padding: 20, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: UI.border },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: UI.text, marginBottom: 16, textAlign: 'right' },
  audienceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  audienceCard: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: RADIUS.md, backgroundColor: UI.card, borderWidth: 2, borderColor: UI.border },
  audienceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  audienceLabel: { fontSize: 14, fontFamily: FONTS.semiBold, color: UI.textMuted },
  templatesRow: { paddingBottom: 4, gap: 10 },
  templateChip: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: UI.primaryLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: UI.primaryLight },
  templateChipText: { fontSize: 13, fontFamily: FONTS.semiBold, color: UI.primary },
  inputWrapper: { marginBottom: 12 },
  input: { backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 16, fontSize: 15, fontFamily: FONTS.medium, color: UI.text, borderWidth: 1, borderColor: UI.border },
  textArea: { height: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 11, fontFamily: FONTS.regular, color: UI.textMuted, textAlign: 'left', marginTop: 4, paddingHorizontal: 4 },
  previewBox: { marginTop: 8 },
  previewLabel: { fontSize: 13, color: UI.textMuted, fontFamily: FONTS.semiBold, marginBottom: 8, textAlign: 'right' },
  previewCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: UI.primaryLight },
  previewIconCircle: { width: 46, height: 46, borderRadius: 14, backgroundColor: UI.primaryLight, alignItems: 'center', justifyContent: 'center' },
  previewContent: { flex: 1 },
  previewTitle: { fontSize: 15, fontFamily: FONTS.bold, color: UI.text, textAlign: 'right', marginBottom: 6 },
  previewBody: { fontSize: 13, color: UI.textMuted, textAlign: 'right', lineHeight: 20, fontFamily: FONTS.regular },
  sendBtn: { minHeight: 56, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: UI.primary, borderRadius: RADIUS.md, paddingVertical: 14, shadowColor: UI.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6, marginTop: 10 },
  sendBtnDisabled: { opacity: 0.6, shadowOpacity: 0 },
  sendBtnText: { fontSize: 18, fontFamily: FONTS.bold, color: UI.card },
});

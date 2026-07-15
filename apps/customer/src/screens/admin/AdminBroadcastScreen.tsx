import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { broadcastNotification, createIdempotencyKey } from '@marketplace/shared-hooks';

const UI = {
  primary: '#1E3A8A',
  primaryLight: '#EEF2FF',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#059669',
};

const AUDIENCES = [
  { id: '', label: 'الجميع', icon: 'people' },
  { id: 'customer', label: 'العملاء فقط', icon: 'person' },
  { id: 'merchant', label: 'التجار فقط', icon: 'storefront' },
  { id: 'delivery', label: 'السائقين فقط', icon: 'bicycle' },
] as const;

export default function AdminBroadcastScreen({ navigation }: any) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'' | 'customer' | 'merchant' | 'delivery'>('');
  const [sending, setSending] = useState(false);
  const pendingCampaign = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال عنوان ونص الإشعار');
      return;
    }
    
    Alert.alert('تأكيد الإرسال', 'هل أنت متأكد من إرسال هذا الإشعار للجمهور المحدد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إرسال الآن', onPress: async () => {
        setSending(true);
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
          Alert.alert(result.sent > 0 ? 'تم إنشاء الإشعارات' : 'لا يوجد مستلمون', result.sent > 0
            ? `تم إنشاء ${result.sent} إشعار داخل التطبيق من أصل ${result.matched} مستلم مطابق. لا يؤكد هذا وصول Push إلى الهاتف.`
            : 'لم يوجد مستخدمون مطابقون للجمهور المحدد، ولم يُنشأ أي إشعار.');
          setTitle('');
          setBody('');
        } catch {
          Alert.alert('خطأ', 'فشل الإرسال. تأكد من تشغيل جدول SQL الخاص بالإشعارات.');
        } finally {
          setSending(false);
        }
      }}
    ]);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View style={s.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={24} color={UI.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>حملات الإشعارات</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.card}>
          <Text style={s.cardTitle}>إنشاء إشعار داخل التطبيق</Text>
          <Text style={s.cardDesc}>يُنشئ هذا الإجراء إشعاراً في صندوق المستخدم. إرسال Push للهاتف يحتاج جهازاً مسجلاً ونتيجة منفصلة من خدمة الإرسال.</Text>
          
          <View style={s.formGroup}>
            <Text style={s.label}>الجمهور المستهدف</Text>
            <View style={s.audienceRow}>
              {AUDIENCES.map(aud => (
                <TouchableOpacity 
                  key={aud.id} 
                  style={[s.audBtn, audience === aud.id && s.audBtnActive]}
                  onPress={() => setAudience(aud.id)}
                >
                  <Ionicons name={aud.icon as any} size={18} color={audience === aud.id ? UI.primary : UI.textMuted} />
                  <Text style={[s.audText, audience === aud.id && s.audTextActive]}>{aud.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.formGroup}>
            <Text style={s.label}>عنوان الإشعار</Text>
            <TextInput 
              style={s.input} 
              placeholder="مثال: خصم 50% بمناسبة العيد!" 
              value={title} 
              onChangeText={setTitle} 
              textAlign="right"
              maxLength={50}
            />
          </View>

          <View style={s.formGroup}>
            <Text style={s.label}>محتوى الإشعار</Text>
            <TextInput 
              style={[s.input, s.inputArea]} 
              placeholder="اكتب تفاصيل الإشعار هنا..." 
              value={body} 
              onChangeText={setBody} 
              textAlign="right"
              multiline
              numberOfLines={4}
              maxLength={200}
            />
            <Text style={s.charCount}>{body.length}/200</Text>
          </View>

          <TouchableOpacity style={s.sendBtn} onPress={handleSend} disabled={sending}>
            {sending ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Text style={s.sendBtnText}>إرسال الإشعار الآن</Text>
                <Ionicons name="send" size={20} color="#FFF" />
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
  header: { padding: 24, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: UI.border },
  headerContent: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: UI.text },
  scroll: { padding: 20 },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: UI.border },
  cardTitle: { fontSize: 18, fontWeight: '900', color: UI.text, textAlign: 'right', marginBottom: 8 },
  cardDesc: { fontSize: 13, color: UI.textMuted, textAlign: 'right', marginBottom: 24, lineHeight: 20 },
  
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '800', color: UI.text, textAlign: 'right', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: UI.border, borderRadius: 12, paddingHorizontal: 16, height: 50, backgroundColor: '#F8FAFC', fontSize: 15, color: UI.text },
  inputArea: { height: 120, paddingTop: 16, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: UI.textMuted, textAlign: 'left', marginTop: 8 },
  
  audienceRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  audBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: UI.border, backgroundColor: '#FFFFFF' },
  audBtnActive: { borderColor: UI.primary, backgroundColor: UI.primaryLight },
  audText: { fontSize: 14, fontWeight: '700', color: UI.textMuted },
  audTextActive: { color: UI.primary },
  
  sendBtn: { flexDirection: 'row-reverse', height: 56, backgroundColor: UI.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 12 },
  sendBtnText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
});

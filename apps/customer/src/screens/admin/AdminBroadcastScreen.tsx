import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { Alert } from '../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { sendBroadcastNotification, useAuthStore } from '@marketplace/shared-hooks';

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
  { id: 'all', label: 'الجميع', icon: 'people' },
  { id: 'customers', label: 'العملاء فقط', icon: 'person' },
  { id: 'merchants', label: 'التجار فقط', icon: 'storefront' },
  { id: 'drivers', label: 'السائقين فقط', icon: 'bicycle' },
];

export default function AdminBroadcastScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [sending, setSending] = useState(false);

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
          await sendBroadcastNotification({
            title: title.trim(),
            body: body.trim(),
            target_audience: audience,
            user_id: user?.id || ''
          });
          Alert.alert('نجاح', 'تم إرسال حملة الإشعارات بنجاح!');
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
          <Text style={s.cardTitle}>إنشاء إشعار جديد (Push Notification)</Text>
          <Text style={s.cardDesc}>سيتم إرسال هذا الإشعار فوراً كرسالة تنبيه للهواتف (Push Notification) بالإضافة لظهوره داخل التطبيق.</Text>
          
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

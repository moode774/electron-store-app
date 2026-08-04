import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { t, tv } from '@marketplace/shared-i18n';

const CONTENT = {
  privacy: {
    title: 'سياسة الخصوصية',
    sections: [
      { h: '1. جمع البيانات', p: 'نجمع رقم جوالك واسمك وعناوين التوصيل فقط لغرض تنفيذ طلباتك وتحسين تجربتك داخل التطبيق.' },
      { h: '2. استخدام البيانات', p: 'تُستخدم بياناتك لمعالجة الطلبات والتواصل معك بخصوصها وإرسال الإشعارات المتعلقة بالخدمة. لا نبيع بياناتك لأي طرف ثالث.' },
      { h: '3. مشاركة البيانات', p: 'نشارك اسمك وعنوانك ورقمك مع المتجر والمندوب المعنيين بطلبك فقط، وبالقدر اللازم لإتمام التوصيل.' },
      { h: '4. حماية البيانات', p: 'نستخدم تشفيراً وتقنيات حماية حديثة لتأمين بياناتك وجلساتك داخل التطبيق.' },
      { h: '5. حقوقك', p: 'يمكنك طلب تعديل بياناتك أو حذف حسابك نهائياً في أي وقت عبر التواصل مع الدعم.' },
    ],
  },
  terms: {
    title: 'الشروط والأحكام',
    sections: [
      { h: '1. استخدام التطبيق', p: 'باستخدامك التطبيق فأنت توافق على هذه الشروط. يجب أن تكون المعلومات المقدمة عند التسجيل صحيحة ودقيقة.' },
      { h: '2. الطلبات والأسعار', p: 'الأسعار المعروضة تحددها المتاجر وقد تتغير. يُعد الطلب مؤكداً بعد قبول المتجر له.' },
      { h: '3. التوصيل', p: 'رسوم التوصيل تُحسب حسب المنطقة وتظهر قبل تأكيد الطلب. مدة التوصيل تقديرية وقد تتأثر بظروف خارجة عن إرادتنا.' },
      { h: '4. الإرجاع والاسترداد', p: 'يمكن طلب إرجاع المنتج خلال 3 أيام من الاستلام بشرط بقائه بحالته الأصلية، وفق سياسة كل متجر.' },
      { h: '5. المسؤولية', p: 'التطبيق وسيط بين العميل والمتاجر. جودة المنتجات مسؤولية المتجر، ونلتزم بمساعدتك في حل أي نزاع.' },
      { h: '6. إلغاء الحساب', p: 'نحتفظ بحق تعليق أي حساب يسيء استخدام الخدمة أو ينتهك هذه الشروط.' },
    ],
  },
} as const;

export default function LegalScreen({ navigation, route }: any) {
  const layout = useCustomerLayout(820);
  const type: 'privacy' | 'terms' = route?.params?.type ?? 'terms';
  const content = CONTENT[type];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('العودة')}>
            <Ionicons name="arrow-forward" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{tv(content.title)}</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>{t('آخر تحديث: يونيو 2026')}</Text>
        {content.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{tv(s.h)}</Text>
            <Text style={styles.sectionBody}>{tv(s.p)}</Text>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: Platform.OS === 'ios' ? 48 : 32 },
  headerInner: { width: '100%', maxWidth: 820, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, paddingHorizontal: 12, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.textPrimary, textAlign: 'center' },
  scrollContent: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingTop: 24, paddingBottom: 48 },
  updated: { fontSize: 12, color: '#9CA3AF', marginBottom: 20, fontWeight: '600' },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.textPrimary, marginBottom: 8 },
  sectionBody: { fontSize: 13.5, fontFamily: FONTS.regular, color: COLORS.textSecondary, lineHeight: 23, textAlign: 'right' },
});

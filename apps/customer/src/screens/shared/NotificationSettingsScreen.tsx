import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { NotificationPreferencesCard } from '../../components/NotificationPreferencesCard';
import { useResponsiveLayout } from '../../components/ResponsiveLayout';

export default function NotificationSettingsScreen({ navigation }: any) {
  const layout = useResponsiveLayout(720);
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="العودة">
          <Ionicons name="arrow-forward" size={23} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>إعدادات الإشعارات</Text>
          <Text style={styles.subtitle}>اختر التنبيهات التي تريد استلامها</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingHorizontal: layout.gutter }]}>
        <View style={styles.settingsCard}><NotificationPreferencesCard embedded /></View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.canvas},
  header:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingTop:Platform.OS==='ios'?58:38,paddingBottom:18,width:'100%',maxWidth:720,alignSelf:'center'},
  backBtn:{width:42,height:42,borderRadius:14,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:COLORS.hairline,alignItems:'center',justifyContent:'center'},
  headerCopy:{flex:1,alignItems:'center',paddingHorizontal:10},
  title:{fontSize:20,fontFamily:FONTS.bold,color:COLORS.ink},
  subtitle:{fontSize:10.5,color:COLORS.inkSecondary,marginTop:2},
  content:{width:'100%',maxWidth:720,alignSelf:'center',paddingBottom:80},
  settingsCard:{backgroundColor:'#FFFFFF',borderRadius:22,borderWidth:1,borderColor:COLORS.hairline,padding:18},
});
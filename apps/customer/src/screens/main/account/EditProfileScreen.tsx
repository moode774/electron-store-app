import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ActivityIndicator, Image } from 'react-native';
import { Alert } from '../../../components/appAlert';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore, updateUserProfile, uploadImageToStorage } from '@marketplace/shared-hooks';
import { Input } from '@marketplace/shared-ui';
import { useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { useTranslation } from '../../../i18n';

export default function EditProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
  const layout = useCustomerLayout(720);
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [name, setName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleChangeAvatar = async () => {
    if (!user?.id || uploadingAvatar) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('customer.photosPermission'), t('customer.photosPermissionText'));
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (picked.canceled || !picked.assets?.length) return;

      setUploadingAvatar(true);
      const url = await uploadImageToStorage('avatars', `${user.id}/${Date.now()}`, picked.assets[0].uri);
      await updateUserProfile(user.id, { avatar_url: url });
      await refreshUser();
      setAvatarUrl(url);
      Alert.alert(t('customer.photoUpdated'), t('customer.photoUpdatedText'));
    } catch (e: any) {
      Alert.alert(t('customer.photoUpdateFailed'), e?.message ?? t('customer.tryAgain'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('auth.alert'), t('customer.enterName'));
      return;
    }
    if (!user?.id) { Alert.alert(t('common.error'), t('customer.loginFirst')); return; }
    setIsSaving(true);
    try {
      await updateUserProfile(user.id, {
        full_name: name.trim(),
        email: email.trim() || undefined,
      });
      await refreshUser();
      Alert.alert(t('customer.profileSaved'), t('customer.profileSavedText'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('customer.saveProfileFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <View style={[styles.headerInner, { paddingHorizontal: layout.gutter }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('merchant.back')}>
            <Ionicons name="arrow-forward" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('customer.editProfile')}</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.gutter }]} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{name.charAt(0) || t('merchant.user').charAt(0)}</Text>
            )}
            <TouchableOpacity
              style={styles.cameraBtn}
              activeOpacity={0.8}
              onPress={handleChangeAvatar}
              disabled={uploadingAvatar}
              accessibilityRole="button"
              accessibilityLabel={t('customer.changePhoto')}
              accessibilityState={{ disabled: uploadingAvatar, busy: uploadingAvatar }}
            >
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Ionicons name="camera" size={14} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>

        <Input label={t('customer.fullName')} placeholder={t('customer.namePlaceholder')} value={name} onChangeText={setName} />
        <Input label={t('customer.emailOptional')} placeholder="example@mail.com" keyboardType="email-address" value={email ?? ''} onChangeText={setEmail} />

        {/* Phone (read-only) */}
        <Text style={styles.label}>{t('customer.phone')}</Text>
        <View style={styles.phoneBox}>
          <Text style={styles.phoneText}>{user?.phone ?? '+967xxxxxxxxx'}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#059669" />
            <Text style={styles.verifiedText}>{t('customer.verified')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>{t('customer.saveChangesProfile')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: Platform.OS === 'ios' ? 48 : 32 },
  headerInner: { width: '100%', maxWidth: 720, minHeight: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, paddingHorizontal: 12, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.textPrimary, textAlign: 'center' },
  scrollContent: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: 24, paddingBottom: 48 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 999 },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: '#FFFFFF' },
  cameraBtn: {
    position: 'absolute', bottom: -4, left: -4, width: 44, height: 44, borderRadius: 16,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F9FAFB',
  },
  label: { fontSize: 13, color: COLORS.textPrimary, marginBottom: 8, fontFamily: FONTS.semiBold },
  phoneBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.md, paddingHorizontal: 16, minHeight: 52, marginBottom: 24,
  },
  phoneText: { fontSize: 14, color: '#6B7280', fontWeight: '600', letterSpacing: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 11.5, fontWeight: '700', color: '#059669' },
  saveBtn: {
    backgroundColor: COLORS.primary, minHeight: 52, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

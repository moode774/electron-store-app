import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Switch, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, getMerchantProfile, updateMerchantProfileByUser } from '@marketplace/shared-hooks';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { Alert } from '../../components/appAlert';
import { EmptyState, ScreenHeader, ui, useIsDesktop } from './merchantUi';
import { useTranslation } from '../../i18n';

function Section({ title, icon, children, hint }: { title: string; icon: any; children: React.ReactNode; hint?: string }) {
  return (
    <View style={ui.card}>
      <View style={s.sectionHead}>
        <View style={s.sectionIcon}><Ionicons name={icon} size={17} color={COLORS.primary} /></View>
        <View style={s.flexEnd}>
          <Text style={ui.cardTitle}>{title}</Text>
          {hint ? <Text style={ui.muted}>{hint}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function InputField({ label, value, onChangeText, multiline = false, placeholder = '', keyboardType = 'default' as any }: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={[ui.input, multiline && s.area, focused && s.focused]}
        value={value ?? ''}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={COLORS.inkTertiary}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
      />
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function StoreSettingsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const user     = useAuthStore((s) => s.user);
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const [savedSnapshot, setSavedSnapshot] = useState('');

  // Basic
  const [storeName,    setStoreName]    = useState('');
  const [storeCategory, setStoreCategory] = useState('');
  const [description,  setDescription]  = useState('');
  const [isOpen,       setIsOpen]       = useState(true);

  // Location & Contact
  const [city,        setCity]        = useState('');
  const [address,     setAddress]     = useState('');
  const [storePhone,  setStorePhone]  = useState('');
  const [whatsapp,    setWhatsapp]    = useState('');

  // Legal
  const [ownerName,          setOwnerName]          = useState('');
  const [nationalId,         setNationalId]         = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [taxNumber,          setTaxNumber]          = useState('');

  // Banking
  const [bankName,        setBankName]        = useState('');
  const [bankAccount,     setBankAccount]     = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    getMerchantProfile(user.id).then((p) => {
      if (p) {
        setStoreName(p.store_name ?? '');
        setStoreCategory(p.store_category ?? '');
        // strip JSON wrapper if description was stored encoded
        try {
          const parsed = JSON.parse(p.store_description ?? '{}');
          setDescription(parsed.desc ?? p.store_description ?? '');
        } catch { setDescription(p.store_description ?? ''); }
        setIsOpen(p.is_open !== false);
        setCity(p.city ?? '');
        setAddress(p.address ?? '');
        setStorePhone(p.store_phone ?? '');
        setWhatsapp(p.whatsapp ?? '');
        setOwnerName(p.owner_name ?? '');
        setNationalId(p.national_id ?? '');
        setCommercialRegister(p.commercial_register ?? '');
        setTaxNumber(p.tax_number ?? '');
        setBankName(p.bank_name ?? '');
        setBankAccount(p.bank_account ?? '');
        setBankAccountName(p.bank_account_name ?? '');
        setSavedSnapshot('');
      }
    }).catch((error: unknown) => setLoadError(error instanceof Error && error.message ? error.message : t('merchant.merchantLoadingFailed'))).finally(() => setLoading(false));
  }, [user?.id, loadAttempt]);

  const handleSave = async (): Promise<boolean> => {
    if (!storeName.trim()) { Alert.alert(t('auth.alert'), t('merchant.storeNameRequired')); return false; }
    if (!user?.id) return false;
    setSaving(true);
    try {
      await updateMerchantProfileByUser(user.id, {
        is_open:             isOpen,
        store_name:          storeName.trim(),
        store_category:      storeCategory.trim() || undefined,
        store_description:   description.trim()   || undefined,
        city:                city.trim()           || undefined,
        address:             address.trim()        || undefined,
        store_phone:         storePhone.trim()     || undefined,
        whatsapp:            whatsapp.trim()        || undefined,
        owner_name:          ownerName.trim()       || undefined,
        national_id:         nationalId.trim()      || undefined,
        commercial_register: commercialRegister.trim() || undefined,
        tax_number:          taxNumber.trim()       || undefined,
        bank_name:           bankName.trim()        || undefined,
        bank_account:        bankAccount.trim()     || undefined,
        bank_account_name:   bankAccountName.trim() || undefined,
      });
      Alert.alert(t('merchant.saveSuccess'), t('merchant.storeUpdated'));
      return true;
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? t('merchant.saveFailed'));
      return false;
    } finally { setSaving(false); }
  };

  const values = [storeName, storeCategory, description, isOpen, city, address, storePhone, whatsapp,
    ownerName, nationalId, commercialRegister, taxNumber, bankName, bankAccount, bankAccountName];
  const snapshot = JSON.stringify(values);
  // The first render after loading defines the saved state.
  React.useEffect(() => {
    if (!loading && !savedSnapshot) setSavedSnapshot(snapshot);
  }, [loading, savedSnapshot, snapshot]);
  const dirty = !!savedSnapshot && snapshot !== savedSnapshot;

  const completeness = [
    { label: t('merchant.storeNameCheck'), done: !!storeName.trim() },
    { label: t('merchant.storeDescriptionCheck'), done: description.trim().length >= 30 },
    { label: t('merchant.cityAddressCheck'), done: !!city.trim() && !!address.trim() },
    { label: t('merchant.contactNumberCheck'), done: !!storePhone.trim() || !!whatsapp.trim() },
    { label: t('merchant.ownerDataCheck'), done: !!ownerName.trim() && !!nationalId.trim() },
    { label: t('merchant.bankAccountCheck'), done: !!bankName.trim() && !!bankAccount.trim() && !!bankAccountName.trim() },
  ];
  const score = Math.round((completeness.filter((c) => c.done).length / completeness.length) * 100);
  const missing = completeness.filter((c) => !c.done).map((c) => c.label);

  const save = async () => {
    if (await handleSave()) setSavedSnapshot(JSON.stringify(values));
  };

  if (loading) {
    return (
      <View style={[ui.screen, s.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={ui.screen}>
        <ScreenHeader title={t('merchant.storeData')} onBack={() => navigation.goBack()} />
        <View style={ui.content}>
          <EmptyState icon="cloud-offline-outline" title={t('merchant.loadDataFailed')} text={loadError} action={{ label: t('common.retry'), onPress: () => setLoadAttempt((v) => v + 1) }} />
        </View>
      </View>
    );
  }

  const statusCard = (
    <View style={[ui.card, s.status, !isOpen && s.statusClosed]}>
      <View style={[s.statusIcon, { backgroundColor: isOpen ? '#DCFCE7' : '#FEE2E2' }]}>
        <Ionicons name={isOpen ? 'storefront' : 'lock-closed'} size={22} color={isOpen ? '#15803D' : '#B91C1C'} />
      </View>
      <View style={s.flexEnd}>
        <Text style={ui.cardTitle}>{isOpen ? t('merchant.storeOpen') : t('merchant.storeClosed')}</Text>
        <Text style={ui.muted}>{isOpen ? t('merchant.storeAccepting') : t('merchant.storeNotAccepting')}</Text>
      </View>
      <Switch
        value={isOpen}
        onValueChange={setIsOpen}
        trackColor={{ false: '#FECACA', true: '#86EFAC' }}
        thumbColor={COLORS.surface}
        {...({ activeThumbColor: COLORS.surface } as any)}
        accessibilityLabel={t('merchant.storeStatus')}
      />
    </View>
  );

  const completenessCard = (
    <View style={ui.card}>
      <View style={s.scoreHead}>
        <View style={[s.ring, { borderColor: score === 100 ? COLORS.statusOnline : score >= 50 ? '#F59E0B' : COLORS.inkTertiary }]}>
          <Text style={s.ringText}>{score}%</Text>
        </View>
        <View style={s.flexEnd}>
          <Text style={ui.cardTitle}>{score === 100 ? t('merchant.profileComplete') : t('merchant.profileCompletion')}</Text>
          <Text style={ui.muted}>{missing.length ? `${t('merchant.missingPrefix')}: ${missing.join(', ')}` : t('merchant.completeDataTrust')}</Text>
        </View>
      </View>
      <View style={s.bar}><View style={[s.barFill, { width: `${score}%` }]} /></View>
    </View>
  );

  const basics = (
    <Section title={t('merchant.identity')} icon="storefront-outline" hint={t('merchant.storeIdentityHint')}>
      <InputField label={t('merchant.commercialName')} value={storeName} onChangeText={setStoreName} placeholder={t('merchant.storeNamePlaceholder')} />
      <InputField label={t('merchant.category')} value={storeCategory} onChangeText={setStoreCategory} placeholder={t('merchant.categoryPlaceholder')} />
      <InputField label={t('merchant.storeBio')} value={description} onChangeText={setDescription} multiline placeholder={t('merchant.storeBioPlaceholder')} />
    </Section>
  );

  const contact = (
    <Section title={t('merchant.locationContact')} icon="location-outline" hint={t('merchant.locationHint')}>
      <View style={s.pair}>
        <View style={s.pairItem}><InputField label={t('merchant.city')} value={city} onChangeText={setCity} placeholder={t('customer.sanaa')} /></View>
        <View style={s.pairItem}><InputField label={t('merchant.storePhone')} value={storePhone} onChangeText={setStorePhone} placeholder="7XXXXXXXX" keyboardType="phone-pad" /></View>
      </View>
      <InputField label={t('merchant.detailedAddress')} value={address} onChangeText={setAddress} placeholder={t('merchant.addressPlaceholder')} />
      <InputField label={t('merchant.whatsappOptional')} value={whatsapp} onChangeText={setWhatsapp} placeholder="7XXXXXXXX" keyboardType="phone-pad" />
    </Section>
  );

  const legal = (
    <Section title={t('merchant.officialData')} icon="document-text-outline" hint={t('merchant.confidentialHint')}>
      <View style={s.pair}>
        <View style={s.pairItem}><InputField label={t('merchant.ownerName')} value={ownerName} onChangeText={setOwnerName} placeholder={t('customer.fullName')} /></View>
        <View style={s.pairItem}><InputField label={t('merchant.nationalId')} value={nationalId} onChangeText={setNationalId} placeholder={t('merchant.nationalId')} keyboardType="numeric" /></View>
      </View>
      <View style={s.pair}>
        <View style={s.pairItem}><InputField label={t('merchant.commercialRegister')} value={commercialRegister} onChangeText={setCommercialRegister} placeholder={t('merchant.optional')} keyboardType="numeric" /></View>
        <View style={s.pairItem}><InputField label={t('merchant.taxNumber')} value={taxNumber} onChangeText={setTaxNumber} placeholder="اختياري" keyboardType="numeric" /></View>
      </View>
    </Section>
  );

  const bank = (
    <Section title={t('merchant.receiveEarnings')} icon="wallet-outline" hint={t('merchant.receiveEarningsHint')}>
      <InputField label={t('merchant.bankWallet')} value={bankName} onChangeText={setBankName} placeholder={t('merchant.bankExample')} />
      <InputField label={t('merchant.accountHolder')} value={bankAccountName} onChangeText={setBankAccountName} placeholder={t('merchant.accountNamePlaceholder')} />
      <InputField label={t('merchant.accountNumber')} value={bankAccount} onChangeText={setBankAccount} placeholder={t('merchant.accountNumber')} keyboardType="numeric" />
    </Section>
  );

  const saveBar = (
    <View style={[s.saveBar, isDesktop ? s.saveBarDesktop : { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Text style={[s.saveHint, dirty && s.saveHintDirty]}>{dirty ? t('merchant.unsaved') : t('merchant.saved')}</Text>
      <TouchableOpacity
        style={[ui.primaryBtn, s.saveBtn, (saving || !dirty) && s.saveBtnIdle]}
        onPress={() => void save()}
        disabled={saving || !dirty}
        accessibilityRole="button"
        accessibilityLabel={t('merchant.saveChanges')}
        accessibilityState={{ disabled: saving || !dirty }}
      >
        {saving ? <ActivityIndicator color={COLORS.surface} size="small" /> : <Ionicons name="checkmark" size={18} color={COLORS.surface} />}
        <Text style={ui.primaryBtnText}>{t('common.save')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={ui.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenHeader title={t('merchant.storeData')} subtitle={storeName || undefined} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[ui.content, isDesktop && ui.contentDesktop, s.padForBar]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isDesktop ? (
          <View style={s.grid}>
            <View style={s.main}>{basics}{contact}{legal}</View>
            <View style={s.side}>{statusCard}{completenessCard}{bank}</View>
          </View>
        ) : (
          <>{statusCard}{completenessCard}{basics}{contact}{bank}{legal}</>
        )}
      </ScrollView>
      {saveBar}
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  flexEnd: { flex: 1, alignItems: 'flex-end', gap: 2 },
  padForBar: { paddingBottom: 130 },
  grid: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 20 },
  main: { flex: 3, gap: 14 },
  side: { flex: 2, gap: 14 },

  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: 12 },
  area: { minHeight: 96, paddingTop: 12 },
  focused: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  pair: { flexDirection: 'row-reverse', gap: 10 },
  pairItem: { flex: 1 },

  status: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderColor: '#BBF7D0' },
  statusClosed: { borderColor: '#FECACA' },
  statusIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  scoreHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  ring: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 12, fontFamily: FONTS.bold, color: COLORS.ink },
  bar: { height: 6, borderRadius: 3, backgroundColor: COLORS.hairline, marginTop: 14, overflow: 'hidden', flexDirection: 'row-reverse' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.primary },

  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.hairline,
  },
  saveBarDesktop: { paddingVertical: 14, paddingHorizontal: 24 },
  saveHint: { flex: 1, fontSize: 12, fontFamily: FONTS.medium, color: COLORS.inkTertiary, textAlign: 'right' },
  saveHintDirty: { color: '#B45309', fontFamily: FONTS.semiBold },
  saveBtn: { minWidth: 120 },
  saveBtnIdle: { opacity: 0.5 },
});

// ============================================================
// أزرار تغيير اللغة — مكوّنات جاهزة تُستخدم في كل الشاشات
// Ready-made language switchers used across every role.
// ============================================================
import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';

import { useTranslation } from '../useTranslation';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, type Language } from '../types';

// ---- زر مُصغّر (شريط علوي / شاشة البداية) --------------------

export interface LanguageToggleButtonProps {
  /** `solid` أزرق معبّأ، `soft` خلفية فاتحة، `outline` بإطار فقط. */
  variant?: 'solid' | 'soft' | 'outline';
  /** يظهر اسم اللغة بجانب الأيقونة (افتراضياً: نعم). */
  showLabel?: boolean;
  /** لون الأيقونة — يُستخدم فوق الخلفيات الداكنة. */
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** يُستدعى بعد تغيير اللغة (مثلاً لإيقاف مؤقّت شاشة البداية). */
  onChange?: (language: Language) => void;
}

/**
 * زر مُصغّر يبدّل بين العربية والإنجليزية.
 * يعرض اسم اللغة التي سينتقل إليها حتى يكون أثر الضغط واضحاً.
 */
export const LanguageToggleButton = ({
  variant = 'soft',
  showLabel = true,
  iconColor,
  style,
  textStyle,
  onChange,
}: LanguageToggleButtonProps): React.JSX.Element => {
  const { t, nextLanguage, nextLanguageName, toggleLanguage } = useTranslation();

  const handlePress = useCallback(() => {
    toggleLanguage();
    onChange?.(nextLanguage);
  }, [nextLanguage, onChange, toggleLanguage]);

  const solid = variant === 'solid';
  const outline = variant === 'outline';

  return (
    <TouchableOpacity
      style={[
        pillStyles.pill,
        solid && pillStyles.pillSolid,
        outline && pillStyles.pillOutline,
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${t('تغيير اللغة')} — ${nextLanguageName}`}
      testID="language-toggle-button"
    >
      <Ionicons name="language-outline" size={16} color={iconColor ?? (solid ? '#FFFFFF' : COLORS.primary)} />
      {showLabel && (
        <Text style={[pillStyles.pillText, solid && pillStyles.pillTextSolid, textStyle]} numberOfLines={1}>
          {nextLanguageName}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillSolid: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pillOutline: {
    backgroundColor: 'transparent',
    borderColor: COLORS.borderStrong,
  },
  pillText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  pillTextSolid: {
    color: '#FFFFFF',
  },
});

// ---- صف الإعدادات (شاشات الحساب لكل الأدوار) -----------------

export interface LanguageSettingRowProps {
  /** يُخفي الأيقونة الجانبية إن كان الصف داخل بطاقة مُصغّرة. */
  showIcon?: boolean;
  style?: StyleProp<ViewStyle>;
  /** يُستدعى بعد تغيير اللغة. */
  onChange?: (language: Language) => void;
}

/**
 * صف "تغيير اللغة" لشاشات الحساب/الإعدادات.
 * يعرض خياري اللغة صراحةً بدل التخمين، ويميّز اللغة الفعّالة.
 */
export const LanguageSettingRow = ({
  showIcon = true,
  style,
  onChange,
}: LanguageSettingRowProps): React.JSX.Element => {
  const { t, language, setLanguage } = useTranslation();

  const handleSelect = useCallback(
    (next: Language) => {
      setLanguage(next);
      onChange?.(next);
    },
    [onChange, setLanguage],
  );

  return (
    <View style={[rowStyles.row, style]} testID="language-setting-row">
      <View style={rowStyles.labelSide}>
        {showIcon && (
          <View style={rowStyles.iconBox}>
            <Ionicons name="language-outline" size={20} color={COLORS.primary} />
          </View>
        )}
        <View style={rowStyles.labelCol}>
          <Text style={rowStyles.title}>{t('تغيير اللغة')}</Text>
          <Text style={rowStyles.subtitle} numberOfLines={1}>
            {t('من اللغة العربية إلى اللغة الإنجليزية')}
          </Text>
        </View>
      </View>

      <View style={rowStyles.segment}>
        {SUPPORTED_LANGUAGES.map((option) => {
          const active = option === language;
          return (
            <TouchableOpacity
              key={option}
              style={[rowStyles.segmentItem, active && rowStyles.segmentItemActive]}
              onPress={() => handleSelect(option)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={LANGUAGE_NATIVE_NAMES[option]}
              testID={`language-option-${option}`}
            >
              <Text style={[rowStyles.segmentText, active && rowStyles.segmentTextActive]} numberOfLines={1}>
                {LANGUAGE_NATIVE_NAMES[option]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const rowStyles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  labelSide: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelCol: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  segment: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.full,
    padding: 3,
    gap: 2,
  },
  segmentItem: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    fontFamily: FONTS.semiBold,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
});

// ---- بطاقة كاملة (تُستخدم حيث لا توجد قائمة إعدادات جاهزة) ----

export interface LanguageSettingCardProps {
  style?: StyleProp<ViewStyle>;
  onChange?: (language: Language) => void;
}

/** بطاقة مستقلة تحتوي صف تغيير اللغة، بنفس شكل بطاقات الإعدادات. */
export const LanguageSettingCard = ({ style, onChange }: LanguageSettingCardProps): React.JSX.Element => (
  <View style={[cardStyles.card, style]} testID="language-setting-card">
    <LanguageSettingRow onChange={onChange} />
  </View>
);

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});

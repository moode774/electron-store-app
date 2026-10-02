import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';
import { directional } from '../../i18n/directionalStyles';

type Props = Omit<TextInputProps, 'style'> & {
  containerStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onClear?: () => void;
  showFilter?: boolean;
  onFilterPress?: () => void;
};

export function CustomerSearchField({
  containerStyle,
  onPress,
  onClear,
  showFilter = false,
  onFilterPress,
  value,
  placeholder,
  ...inputProps
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder || t('customer.searchPlaceholder');
  const content = (
    <>
      <View style={styles.searchIcon}>
        <Ionicons name="search" size={19} color="#2F5BFF" />
      </View>
      {onPress ? (
        <Text style={styles.placeholder} numberOfLines={1}>{resolvedPlaceholder}</Text>
      ) : (
        <TextInput
          {...inputProps}
          value={value}
          placeholder={resolvedPlaceholder}
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
        />
      )}
      {!onPress && typeof value === 'string' && value.length > 0 && onClear ? (
        <TouchableOpacity
          style={styles.trailingButton}
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('customer.clearSearchAccessibility')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={19} color={COLORS.textMuted} />
        </TouchableOpacity>
      ) : null}
      {showFilter && onFilterPress ? (
        <TouchableOpacity
          style={styles.filterButton}
          onPress={onFilterPress}
          accessibilityRole="button"
          accessibilityLabel={t('customer.sortOptions')}
        >
          <Ionicons name="options-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.container, containerStyle]}
        onPress={onPress}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel={resolvedPlaceholder}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.container, containerStyle]}>{content}</View>;
}

const styles = directional(StyleSheet.create({
  container: {
    minHeight: 50,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#E8EBF0',
    borderRadius: 15,
    backgroundColor: '#F7F8FA',
  },
  searchIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#EEF2FF',
  },
  placeholder: {
    flex: 1,
    color: '#9398A3',
    fontFamily: FONTS.regular,
    fontSize: 13,
    textAlign: 'right',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: '#1B1D22',
    fontFamily: FONTS.medium,
    fontSize: 14,
    textAlign: 'right',
  },
  trailingButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#2F5BFF',
  },
}), 'rtl');

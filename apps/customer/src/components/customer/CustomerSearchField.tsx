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
import { FONTS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';
import { directional } from '../../i18n/directionalStyles';
import { CT, CT_RADIUS } from '../../theme/customerTheme';

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
      <Ionicons name="search-outline" size={20} color={CT.navy} style={styles.searchIcon} />
      {onPress ? (
        <Text style={styles.placeholder} numberOfLines={1}>{resolvedPlaceholder}</Text>
      ) : (
        <TextInput
          {...inputProps}
          value={value}
          placeholder={resolvedPlaceholder}
          placeholderTextColor={CT.inkMuted}
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
          <Ionicons name="close-circle" size={18} color={CT.inkMuted} />
        </TouchableOpacity>
      ) : null}
      {showFilter && onFilterPress ? (
        <TouchableOpacity
          style={styles.filterButton}
          onPress={onFilterPress}
          accessibilityRole="button"
          accessibilityLabel={t('customer.sortOptions')}
        >
          <Ionicons name="options-outline" size={18} color={CT.surface} />
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
    gap: 8,
    paddingLeft: 6,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: CT.hairline,
    borderRadius: CT_RADIUS.md,
    backgroundColor: CT.surface,
  },
  searchIcon: {
    marginLeft: 2,
  },
  placeholder: {
    flex: 1,
    color: CT.inkMuted,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    textAlign: 'right',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: CT.ink,
    fontFamily: FONTS.medium,
    fontSize: 14,
    textAlign: 'right',
  },
  trailingButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CT_RADIUS.sm,
    backgroundColor: CT.navy,
  },
}), 'rtl');

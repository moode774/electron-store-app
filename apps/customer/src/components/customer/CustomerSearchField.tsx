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
  placeholder = 'ابحث عن منتجات أو متاجر',
  ...inputProps
}: Props): React.JSX.Element {
  const content = (
    <>
      <View style={styles.searchIcon}>
        <Ionicons name="search" size={19} color={COLORS.primary} />
      </View>
      {onPress ? (
        <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
      ) : (
        <TextInput
          {...inputProps}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
        />
      )}
      {!onPress && typeof value === 'string' && value.length > 0 && onClear ? (
        <TouchableOpacity
          style={styles.trailingButton}
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="مسح البحث"
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
          accessibilityLabel="خيارات الترتيب"
        >
          <Ionicons name="options-outline" size={18} color={COLORS.textPrimary} />
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
        accessibilityLabel={placeholder}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.container, containerStyle]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    minHeight: 54,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  searchIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.primarySoft,
  },
  placeholder: {
    flex: 1,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 13,
    textAlign: 'right',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: COLORS.textPrimary,
    fontFamily: FONTS.medium,
    fontSize: 14,
    textAlign: 'right',
  },
  trailingButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.secondarySoft,
  },
});

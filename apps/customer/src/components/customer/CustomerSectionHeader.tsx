import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../theme/customerTheme';

type Props = {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function CustomerSectionHeader({
  title,
  eyebrow,
  actionLabel,
  onActionPress,
}: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.titleWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <View style={styles.titleRow}>
          <View style={styles.titleMarker} />
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onActionPress}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-back" size={15} color={COLORS.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 29,
    marginBottom: 14,
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  titleMarker: {
    width: 4,
    height: 22,
    borderRadius: 3,
    backgroundColor: COLORS.accentCoral,
  },
  eyebrow: {
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    marginBottom: 2,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 20,
    textAlign: 'right',
  },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  actionText: {
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
    fontSize: 12,
  },
});

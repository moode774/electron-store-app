import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { COLORS, RADIUS, SPACING, FONT_SIZE } from '@marketplace/shared-utils';

interface BadgeProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'primary',
  style,
  textStyle,
}) => {
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: COLORS.primaryLight, text: COLORS.surface };
      case 'secondary':
        return { bg: COLORS.secondary, text: COLORS.surface };
      case 'success':
        return { bg: COLORS.success + '20', text: COLORS.success }; // 20% opacity
      case 'warning':
        return { bg: COLORS.warning + '20', text: COLORS.warning };
      case 'error':
        return { bg: COLORS.error + '20', text: COLORS.error };
      case 'info':
        return { bg: COLORS.info + '20', text: COLORS.info };
      default:
        return { bg: COLORS.border, text: COLORS.textSecondary };
    }
  };

  const { bg, text } = getColors();

  return (
    <View style={[styles.container, { backgroundColor: bg }, style]}>
      <Text style={[styles.label, { color: text }, textStyle]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    fontFamily: 'IBM Plex Sans Arabic',
  },
});

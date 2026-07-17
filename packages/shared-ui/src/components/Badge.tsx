import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { COLORS, RADIUS, SPACING, FONT_SIZE, FONTS } from '@marketplace/shared-utils';

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
        return { bg: COLORS.primarySoft, text: COLORS.primary };
      case 'secondary':
        return { bg: COLORS.secondarySoft, text: '#556B05' };
      case 'success':
        return { bg: COLORS.accentMintSoft, text: COLORS.success };
      case 'warning':
        return { bg: '#FFF4D7', text: '#A56300' };
      case 'error':
        return { bg: COLORS.accentCoralSoft, text: COLORS.error };
      case 'info':
        return { bg: COLORS.primarySoft, text: COLORS.info };
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
    minHeight: 26,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONTS.semiBold,
  },
});

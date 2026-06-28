import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, TouchableOpacityProps, ViewStyle, TextStyle } from 'react-native';
import { COLORS, RADIUS, SPACING, FONT_SIZE } from '@marketplace/shared-utils';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  isLoading = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  disabled,
  ...props
}) => {
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: COLORS.primary, borderColor: COLORS.primary, borderWidth: 1 };
      case 'secondary':
        return { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary, borderWidth: 1 };
      case 'outline':
        return { backgroundColor: 'transparent', borderColor: COLORS.primary, borderWidth: 1 };
      case 'ghost':
        return { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 };
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'primary':
      case 'secondary':
        return { color: COLORS.surface };
      case 'outline':
      case 'ghost':
        return { color: COLORS.primary };
    }
  };

  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        getContainerStyle(),
        isDisabled && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={getTextStyle().color} />
      ) : (
        <>
          {leftIcon}
          <Text style={[styles.text, getTextStyle(), textStyle]}>
            {title}
          </Text>
          {rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  text: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    fontFamily: 'El Messiri', // Custom font as per design guidelines
  },
  disabled: {
    opacity: 0.6,
  },
});

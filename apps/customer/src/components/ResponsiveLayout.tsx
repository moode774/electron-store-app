import React from 'react';
import {
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BREAKPOINTS } from '@marketplace/shared-utils';

export type ResponsiveLayout = {
  width: number;
  height: number;
  compact: boolean;
  tablet: boolean;
  desktop: boolean;
  wide: boolean;
  gutter: number;
  contentWidth: number;
  usableWidth: number;
};

export function useResponsiveLayout(maxWidth = 1200): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const tablet = width >= BREAKPOINTS.tablet;
  const desktop = width >= BREAKPOINTS.desktop;
  const wide = width >= BREAKPOINTS.wide;
  const gutter = desktop ? 32 : tablet ? 24 : compact ? 16 : 20;
  const contentWidth = Math.min(width, maxWidth);

  return {
    width,
    height,
    compact,
    tablet,
    desktop,
    wide,
    gutter,
    contentWidth,
    usableWidth: Math.max(0, contentWidth - gutter * 2),
  };
}

type ResponsiveContentProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  maxWidth?: number;
  padded?: boolean;
};

export function ResponsiveContent({
  children,
  style,
  maxWidth = 1200,
  padded = true,
}: ResponsiveContentProps): React.JSX.Element {
  const layout = useResponsiveLayout(maxWidth);

  return (
    <View
      style={[
        styles.content,
        { maxWidth, paddingHorizontal: padded ? layout.gutter : 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    alignSelf: 'center',
  },
});

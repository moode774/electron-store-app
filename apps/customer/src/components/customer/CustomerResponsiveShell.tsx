import React from 'react';
import {
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BREAKPOINTS } from '@marketplace/shared-utils';

const MAX_CONTENT_WIDTH = 1320;

export type CustomerLayout = {
  width: number;
  compact: boolean;
  tablet: boolean;
  desktop: boolean;
  wide: boolean;
  gutter: number;
  contentWidth: number;
  usableWidth: number;
};

export function useCustomerLayout(maxWidth = MAX_CONTENT_WIDTH): CustomerLayout {
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const tablet = width >= BREAKPOINTS.tablet;
  const desktop = width >= BREAKPOINTS.desktop;
  const wide = width >= BREAKPOINTS.wide;
  const gutter = desktop ? 32 : tablet ? 24 : compact ? 16 : 20;
  const contentWidth = Math.min(width, maxWidth);

  return {
    width,
    compact,
    tablet,
    desktop,
    wide,
    gutter,
    contentWidth,
    usableWidth: Math.max(0, contentWidth - gutter * 2),
  };
}

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  maxWidth?: number;
  padded?: boolean;
};

export function CustomerResponsiveShell({
  children,
  style,
  maxWidth = MAX_CONTENT_WIDTH,
  padded = true,
}: Props): React.JSX.Element {
  const layout = useCustomerLayout(maxWidth);

  return (
    <View
      style={[
        styles.shell,
        { maxWidth, paddingHorizontal: padded ? layout.gutter : 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'center',
  },
});

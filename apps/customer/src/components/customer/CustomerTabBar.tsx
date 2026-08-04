import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@marketplace/shared-hooks';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { tv } from '@marketplace/shared-i18n';

const ITEMS: Record<string, { label: string; active: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }> = {
  Cart: { label: 'السلة', active: 'bag-handle', idle: 'bag-handle-outline' },
  Orders: { label: 'طلباتي', active: 'receipt', idle: 'receipt-outline' },
  Home: { label: 'الرئيسية', active: 'home', idle: 'home-outline' },
  Categories: { label: 'المتاجر', active: 'storefront', idle: 'storefront-outline' },
  More: { label: 'حسابي', active: 'person', idle: 'person-outline' },
};

export function CustomerTabBar({ state, navigation, insets }: BottomTabBarProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const floating = width >= BREAKPOINTS.tablet;
  const cartCount = useCartStore((store) => store.items.reduce((count, item) => count + item.quantity, 0));

  return (
    <View style={[styles.shell, floating && styles.shellFloating, { paddingBottom: Math.max(insets.bottom, floating ? 12 : 8) }]}>
      <View style={[styles.bar, floating && styles.barFloating]}>
        {state.routes.map((route, index) => {
          const item = ITEMS[route.name] ?? ITEMS.Home;
          const focused = state.index === index;
          const badge = route.name === 'Cart' ? cartCount : 0;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.item}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel={tv(item.label)}
              accessibilityState={focused ? { selected: true } : {}}
            >
              <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
                <Ionicons
                  name={focused ? item.active : item.idle}
                  size={21}
                  color={focused ? COLORS.primary : COLORS.textMuted}
                />
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tv(badge > 99 ? '99+' : badge)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, focused && styles.labelFocused]}>{tv(item.label)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  shellFloating: {
    paddingTop: 10,
    borderTopWidth: 0,
    backgroundColor: COLORS.background,
  },
  bar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    direction: 'ltr',
  },
  barFloating: {
    width: '100%',
    maxWidth: 680,
    minHeight: 70,
    alignSelf: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
    elevation: 5,
  },
  item: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWrap: {
    minWidth: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
  },
  iconWrapFocused: {
    backgroundColor: COLORS.primarySoft,
  },
  label: {
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
    fontSize: 10,
    textAlign: 'center',
  },
  labelFocused: {
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: 0,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentCoral,
  },
  badgeText: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 8,
  },
});

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@marketplace/shared-hooks';
import { BREAKPOINTS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { CT, CT_SHADOW } from '../../theme/customerTheme';
import { useTranslation } from '../../i18n';
import { directional } from '../../i18n/directionalStyles';

const ITEMS: Record<string, { labelKey: string; active: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }> = {
  Cart: { labelKey: 'common.cart', active: 'bag-handle', idle: 'bag-handle-outline' },
  Orders: { labelKey: 'common.myOrders', active: 'receipt', idle: 'receipt-outline' },
  Home: { labelKey: 'common.home', active: 'home', idle: 'home-outline' },
  Categories: { labelKey: 'common.stores', active: 'storefront', idle: 'storefront-outline' },
  More: { labelKey: 'common.account', active: 'person', idle: 'person-outline' },
};

export function CustomerTabBar({ state, navigation, insets }: BottomTabBarProps): React.JSX.Element {
  const { t } = useTranslation();
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
              accessibilityLabel={t(item.labelKey)}
              accessibilityState={focused ? { selected: true } : {}}
            >
              <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
                <Ionicons
                  name={focused ? item.active : item.idle}
                  size={21}
                  color={focused ? CT.navy : CT.inkMuted}
                />
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, focused && styles.labelFocused]}>{t(item.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = directional(StyleSheet.create({
  shell: {
    paddingTop: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: CT.hairline,
    backgroundColor: CT.surface,
  },
  shellFloating: {
    paddingTop: 10,
    borderTopWidth: 0,
    backgroundColor: CT.paper,
  },
  bar: {
    minHeight: 62,
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
    borderColor: CT.hairline,
    borderRadius: RADIUS.xl,
    backgroundColor: CT.surface,
    ...CT_SHADOW.floating,
  },
  item: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWrap: {
    minWidth: 42,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
  },
  iconWrapFocused: {
    backgroundColor: CT.navySoft,
  },
  label: {
    color: CT.inkMuted,
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    textAlign: 'center',
  },
  labelFocused: {
    color: CT.navy,
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
    borderColor: CT.surface,
    borderRadius: RADIUS.full,
    backgroundColor: CT.sand,
  },
  badgeText: {
    color: CT.navyDeep,
    fontFamily: FONTS.bold,
    fontSize: 8,
  },
}), 'ltr');

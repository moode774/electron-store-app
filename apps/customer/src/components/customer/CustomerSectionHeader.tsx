import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DirectionalIcon } from '../DirectionalIcon';
import { FONTS } from '@marketplace/shared-utils';
import { directional } from '../../i18n/directionalStyles';
import { CT } from '../../theme/customerTheme';

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
        <Text style={styles.title}>{title}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onActionPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <DirectionalIcon name="chevron-back" size={14} color={CT.navy} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = directional(StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 14,
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eyebrow: {
    color: CT.inkMuted,
    fontFamily: FONTS.medium,
    fontSize: 11,
    marginBottom: 3,
    textAlign: 'right',
  },
  title: {
    color: CT.ink,
    fontFamily: FONTS.bold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'right',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 2,
  },
  actionText: {
    color: CT.navy,
    fontFamily: FONTS.semiBold,
    fontSize: 12.5,
  },
}), 'rtl');

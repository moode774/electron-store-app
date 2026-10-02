import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DirectionalIcon } from '../DirectionalIcon';
import { COLORS, FONTS } from '@marketplace/shared-utils';
import { directional } from '../../i18n/directionalStyles';

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
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <DirectionalIcon name="arrow-back" size={15} color="#2F5BFF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = directional(StyleSheet.create({
  container: {
    minHeight: 46,
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 12,
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eyebrow: {
    color: '#2F5BFF',
    fontFamily: FONTS.semiBold,
    fontSize: 10.5,
    marginBottom: 2,
  },
  title: {
    color: '#17191F',
    fontFamily: FONTS.bold,
    fontSize: 19,
    textAlign: 'right',
  },
  action: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  actionText: {
    color: '#2F5BFF',
    fontFamily: FONTS.semiBold,
    fontSize: 12,
  },
}), 'rtl');

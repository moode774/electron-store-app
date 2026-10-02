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
          <DirectionalIcon name="arrow-back" size={15} color="#5B5BF7" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = directional(StyleSheet.create({
  container: {
    minHeight: 50,
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 13,
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eyebrow: {
    color: '#5B5BF7',
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  title: {
    color: '#111318',
    fontFamily: FONTS.bold,
    fontSize: 20,
    textAlign: 'right',
  },
  action: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: '#F0F1FF',
  },
  actionText: {
    color: '#4F46E5',
    fontFamily: FONTS.semiBold,
    fontSize: 11.5,
  },
}), 'rtl');

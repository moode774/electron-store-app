import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../i18n';

type Props = React.ComponentProps<typeof Ionicons>;

// Screens are authored RTL-first (Arabic default), so `arrow-forward` is the
// back button and `chevron-back` is a row's "open" affordance. In LTR the
// horizontal direction flips.
export function DirectionalIcon({ name, ...props }: Props) {
  const isRTL = useLanguageStore((state) => state.isRTL);
  const resolved = isRTL
    ? name
    : (String(name).replace(/-(back|forward)/, (_, d) => (d === 'back' ? '-forward' : '-back')) as Props['name']);
  return <Ionicons name={resolved} {...props} />;
}

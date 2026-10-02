import React, { useRef } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { useLanguageStore } from '../../i18n';

// Horizontal lists are authored row-reverse while the platform scrolls LTR, so
// when the content overflows the first items sit at the far (right) end. Jump
// there whenever the content width changes so Arabic lists start at the start.
export function CustomerHorizontalList({ onContentSizeChange, ...props }: ScrollViewProps): React.JSX.Element {
  const isRTL = useLanguageStore((state) => state.isRTL);
  const ref = useRef<ScrollView>(null);
  const lastWidth = useRef(0);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      {...props}
      onContentSizeChange={(width, height) => {
        if (isRTL && width !== lastWidth.current) {
          lastWidth.current = width;
          ref.current?.scrollToEnd({ animated: false });
        }
        onContentSizeChange?.(width, height);
      }}
    />
  );
}

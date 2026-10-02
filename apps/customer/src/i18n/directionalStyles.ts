import { useLanguageStore } from './index';

// The platform always renders LTR (see applyDirection). Screens were written in
// one of two directions:
//   'rtl' – Arabic layout baked in (row-reverse, textAlign right, ...)
//   'ltr' – plain row/left styles that relied on the platform flipping to RTL
// directional() mirrors a stylesheet whenever the active language reads the
// other way, so each screen renders correctly in both Arabic and English.
type AuthoredDirection = 'rtl' | 'ltr';
type Style = Record<string, any>;

const SWAPPED_KEYS: Record<string, string> = {
  left: 'right',
  marginLeft: 'marginRight',
  paddingLeft: 'paddingRight',
  borderLeftWidth: 'borderRightWidth',
  borderLeftColor: 'borderRightColor',
  borderTopLeftRadius: 'borderTopRightRadius',
  borderBottomLeftRadius: 'borderBottomRightRadius',
  marginStart: 'marginEnd',
  paddingStart: 'paddingEnd',
  start: 'end',
};
for (const [a, b] of Object.entries(SWAPPED_KEYS)) SWAPPED_KEYS[b] = a;

const FLIPPED_VALUES: Record<string, Record<string, string>> = {
  flexDirection: { row: 'row-reverse', 'row-reverse': 'row' },
  textAlign: { left: 'right', right: 'left' },
  writingDirection: { rtl: 'ltr', ltr: 'rtl' },
};

function mirror(style: Style, authored: AuthoredDirection): Style {
  const out: Style = {};
  for (const [key, value] of Object.entries(style)) {
    const target = SWAPPED_KEYS[key] ?? key;
    out[target] = FLIPPED_VALUES[key]?.[value as string] ?? value;
  }
  // In a column the cross axis is horizontal, so start/end alignment flips too.
  const isRow = out.flexDirection === 'row' || out.flexDirection === 'row-reverse';
  if (!isRow && (out.alignItems === 'flex-start' || out.alignItems === 'flex-end')) {
    out.alignItems = out.alignItems === 'flex-start' ? 'flex-end' : 'flex-start';
  }
  // Text in LTR-authored screens relied on the platform's natural RTL alignment.
  if (authored === 'ltr' && out.fontSize !== undefined && out.textAlign === undefined) {
    out.textAlign = 'right';
  }
  return out;
}

export function mirrorStyle<T extends Style | undefined>(style: T, authored: AuthoredDirection = 'rtl'): T {
  return style ? (mirror(style, authored) as T) : style;
}

function shouldMirror(authored: AuthoredDirection): boolean {
  const isRTL = useLanguageStore.getState().isRTL;
  return authored === 'rtl' ? !isRTL : isRTL;
}

export function directional<T extends Record<string, Style>>(sheet: T, authored: AuthoredDirection): T {
  const cache = new Map<PropertyKey, Style>();
  return new Proxy(sheet, {
    get(target, key) {
      const value = (target as any)[key];
      if (!value || typeof value !== 'object' || !shouldMirror(authored)) return value;
      if (!cache.has(key)) cache.set(key, mirror(value, authored));
      return cache.get(key);
    },
  });
}

export function useDirectionalStyle(authored: AuthoredDirection) {
  const isRTL = useLanguageStore((s) => s.isRTL);
  const flip = authored === 'rtl' ? !isRTL : isRTL;
  return <S extends Style | undefined>(style: S): S => (flip ? mirrorStyle(style, authored) : style);
}

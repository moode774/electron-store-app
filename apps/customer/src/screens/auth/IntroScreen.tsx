import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '@marketplace/shared-utils';
import { useTranslation } from '../../i18n';

/**
 * Brand intro (~5s): a light point draws Darb's path, the four promise words
 * appear one by one (Buy • Sell • Deliver • Earn), gather into one line, then
 * the path morphs into the Darb mark and the intro dissolves into the app.
 * Everything is driven by a single clock so timings match the storyboard.
 */

const DURATION = 5000;
const EXIT_START = 4700;

const COLORS = {
  bg: '#070B1F',
  bgGlow: '#13204A',
  white: '#FFFFFF',
  muted: '#8B95B5',
  accent: '#5B8CFF',
  sky: '#8FD3FF',
  ring: '#868A96',
};

type Pt = { x: number; y: number };
type Cubic = [Pt, Pt, Pt, Pt];

// Darb mark traced from the brand icon (1024 grid).
const MARK: Cubic[] = [
  [{ x: 346, y: 676 }, { x: 346, y: 578 }, { x: 468, y: 534 }, { x: 558, y: 494 }],
  [{ x: 558, y: 494 }, { x: 643, y: 454 }, { x: 676, y: 413 }, { x: 676, y: 346 }],
];
const MARK_STROKE = 96;
const MARK_RING = 77;
const MARK_BOX = { cx: 496.5, cy: 525.5, size: 455 };

// ---- timing helpers ---------------------------------------------------------
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const bump = (k: number) => Math.sin(Math.PI * clamp01(k));

// ---- bezier helpers ---------------------------------------------------------
const lp = (a: Pt, b: Pt, k: number): Pt => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
function cubicAt([p0, p1, p2, p3]: Cubic, k: number): Pt {
  const a = lp(p0, p1, k), b = lp(p1, p2, k), c = lp(p2, p3, k);
  return lp(lp(a, b, k), lp(b, c, k), k);
}
function splitAt([p0, p1, p2, p3]: Cubic, k: number): [Cubic, Cubic] {
  const a = lp(p0, p1, k), b = lp(p1, p2, k), c = lp(p2, p3, k);
  const d = lp(a, b, k), e = lp(b, c, k), m = lp(d, e, k);
  return [[p0, a, d, m], [m, e, c, p3]];
}
const toD = (curves: Cubic[]) =>
  curves.reduce(
    (d, [, c1, c2, p], i) =>
      `${d}${i === 0 ? `M ${curves[0][0].x} ${curves[0][0].y} ` : ''}C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p.x} ${p.y} `,
    '',
  );

/** Arc-length table so the light point and dash reveal move at even speed. */
function measure(curves: Cubic[]) {
  const pts: Pt[] = [];
  const lens: number[] = [0];
  const samples = 60;
  curves.forEach((c, ci) => {
    for (let i = ci === 0 ? 0 : 1; i <= samples; i++) pts.push(cubicAt(c, i / samples));
  });
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = lens[lens.length - 1];
  const at = (f: number): Pt => {
    const target = clamp01(f) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < target) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    return lp(pts[i - 1], pts[i], (target - lens[i - 1]) / seg);
  };
  // Length fraction reached at the end of each curve.
  const marks = curves.map((_, ci) => lens[(ci + 1) * samples] / total);
  return { total, at, marks };
}

// ---- word schedule ----------------------------------------------------------
// [enter start, settle into the line]
const WORD_TIMES: [number, number][] = [
  [450, 770],
  [960, 1270],
  [1460, 1800],
  [1990, 2550],
];
const ENTER_MS = 320;
const SETTLE_MS = 260;

interface IntroScreenProps {
  /** Start the clock once fonts are ready (falls back to a short timeout). */
  ready: boolean;
  onFinish: () => void;
}

export default function IntroScreen({ ready, onFinish }: IntroScreenProps) {
  const { t, isRTL } = useTranslation();
  const { width: W, height: H } = useWindowDimensions();
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const startRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const finishedRef = useRef(false);
  const [slots, setSlots] = useState<Record<string, { x: number; w: number }>>({});

  const words = [t('onboarding.introBuy'), t('onboarding.introSell'), t('onboarding.introDeliver'), t('onboarding.introEarn')];

  // Start when fonts are ready, but never hold the user on a blank screen.
  useEffect(() => {
    if (ready) setStarted(true);
    const timer = setTimeout(() => setStarted(true), 1200);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduce) => { if (reduce) offsetRef.current = 3900; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    let frame = 0;
    const tick = () => {
      // One clock source for both the frame loop and skip, on web and native.
      const now = performance.now();
      if (startRef.current === null) startRef.current = now - offsetRef.current;
      const elapsed = now - startRef.current;
      if (elapsed >= DURATION) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinish();
        }
        return;
      }
      setTime(elapsed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, onFinish]);

  const skip = () => {
    if (startRef.current === null) return;
    const now = performance.now();
    const elapsed = now - startRef.current;
    if (elapsed < EXIT_START) startRef.current = now - EXIT_START;
  };

  // ---- geometry -------------------------------------------------------------
  const geo = useMemo(() => {
    const cy = H * 0.45;
    const dir = isRTL ? -1 : 1; // travel direction of the path
    const x = (f: number) => (isRTL ? W * (1 - f) : W * f); // reading-order position
    const baseY = cy + 62;
    // The light point appears just under the centre, swings out to the
    // reading-start edge, then sweeps back along a gentle wave under the words.
    const start: Pt = { x: W / 2, y: cy + 30 };
    // x(f) runs in reading order, so x(0.1) is where reading starts.
    const turn: Pt = { x: x(0.1), y: baseY - 6 };
    const way: Pt[] = [turn, { x: x(0.367), y: baseY + 16 }, { x: x(0.633), y: baseY - 16 }, { x: x(0.9), y: baseY + 6 }];
    const hook: Cubic = [
      start,
      { x: start.x - dir * W * 0.2, y: start.y - 6 },
      { x: turn.x - dir * W * 0.1, y: turn.y - 34 },
      turn,
    ];
    const wave: Cubic[] = [
      hook,
      ...way.slice(1).map((p, i) => {
        const a = way[i];
        const dx = (p.x - a.x) / 2;
        // Leave the turn with a rounded U instead of a cusp.
        const c1 = i === 0 ? { x: a.x + dir * W * 0.1, y: a.y + 30 } : { x: a.x + dx, y: a.y };
        return [a, c1, { x: p.x - dx, y: p.y }, p] as Cubic;
      }),
    ];
    // Mark mapped to screen space, split to the same curve count as the wave.
    const L = Math.min(W, H) * 0.36;
    const s = L / MARK_BOX.size;
    const markCy = cy - 10;
    const toScreen = (p: Pt): Pt => ({
      x: W / 2 + (p.x - MARK_BOX.cx) * s,
      y: markCy + (p.y - MARK_BOX.cy) * s,
    });
    const markCurves = MARK.map((c) => c.map(toScreen) as Cubic);
    // Three mark curves for the three wave curves, run in the wave's direction;
    // the side hook retracts into the mark's first point.
    const split = [...splitAt(markCurves[0], 0.5), markCurves[1]];
    const mark3: Cubic[] = isRTL ? split.reverse().map((c) => [...c].reverse() as Cubic) : split;
    const tip = mark3[0][0];
    const mark4: Cubic[] = [[tip, tip, tip, tip], ...mark3];
    return {
      cy, dir, wave, mark4, s, markCy,
      ring: toScreen(MARK[0][0]),
      waveM: measure(wave),
      markM: measure(mark4),
      bigY: cy - 92,
      rowY: cy,
    };
  }, [W, H, isRTL]);

  const T = time;

  // ---- path state -------------------------------------------------------------
  const morph = easeInOut(span(T, 3250, 3900));
  const curves: Cubic[] = geo.wave.map((c, i) => c.map((p, j) => lp(p, geo.mark4[i][j], morph)) as Cubic);
  const pathD = toD(curves);
  const pathLen = lerp(geo.waveM.total, geo.markM.total, morph);
  const segEnds = [0, ...geo.waveM.marks];
  let drawn = 0;
  WORD_TIMES.forEach(([start], i) => {
    const next = i < 3 ? WORD_TIMES[i + 1][0] : 2550;
    const k = easeInOut(span(T, i === 0 ? 400 : start - 30, next - 30));
    if (k > 0) drawn = lerp(segEnds[i], segEnds[i + 1], k);
  });
  if (morph > 0) drawn = 1;
  const strokeW = lerp(2.5, MARK_STROKE * geo.s, easeInOut(span(T, 3350, 3900)));
  const head = geo.waveM.at(drawn);
  const exit = easeInOut(span(T, EXIT_START, DURATION));

  // light point
  const dotIn = easeOut(span(T, 0, 400));
  const dotFade = 1 - span(T, 2550, 2900);
  const dotR = 4 + 2 * bump(span(T, 0, 400)) + 3 * bump(span(T, 1950, 2300));

  // Comet sweeping under the full line (2.55–3.2s).
  const comet = span(T, 2600, 3250);

  // arrival pulse at the last waypoint
  const pulse = span(T, 2000, 2550);
  const lastPt = geo.waveM.at(1);

  // logo
  const ringIn = easeOutBack(span(T, 3700, 4050));
  const logoPulse = 1 + 0.05 * bump(span(T, 4500, 4800));
  const nameIn = easeOut(span(T, 3950, 4300));
  const tagIn = easeOut(span(T, 4100, 4450));

  // ---- word state --------------------------------------------------------------
  const BIG = Math.min(54, W * 0.13);
  const ROW = Math.min(26, W * 0.062);
  const rowScale = ROW / BIG;
  const gather = easeInOut(span(T, 3250, 3700));

  const wordStyle = (i: number) => {
    const [start, settle] = WORD_TIMES[i];
    const enter = span(T, start, start + ENTER_MS);
    const toRow = easeInOut(span(T, settle, settle + SETTLE_MS));
    const slot = slots[`w${i}`];
    const slotX = slot ? slot.x + slot.w / 2 - W / 2 : 0;
    let tx = lerp(0, slotX, toRow);
    let ty = lerp(geo.bigY - geo.rowY, 0, toRow);
    let scale = lerp(1, rowScale, toRow);
    let opacity = enter > 0 ? 1 : 0;

    // distinct entrance per word
    if (i === 0) { opacity *= easeOut(enter); ty += (1 - easeOut(enter)) * 22; }
    if (i === 1) { opacity *= clamp01(enter * 2); scale *= lerp(0.55, 1, easeOutBack(enter)); }
    if (i === 2) { opacity *= clamp01(enter * 1.6); tx += -geo.dir * (1 - easeOut(enter)) * 70; }
    if (i === 3) { opacity *= easeOut(enter); scale *= lerp(0.82, 1, easeOutBack(enter)); }

    // gather to the centre and dissolve into the mark
    tx = lerp(tx, 0, gather);
    scale *= lerp(1, 0.7, gather);
    opacity *= 1 - span(T, 3300, 3650);
    return { opacity, transform: [{ translateX: tx }, { translateY: ty }, { scale }] };
  };

  const earnGlow = 18 * bump(span(T, 2050, 2700));
  const deliverEnter = span(T, WORD_TIMES[2][0], WORD_TIMES[2][0] + ENTER_MS);

  const onSlot = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setSlots((prev) => (prev[key]?.x === x && prev[key]?.w === width ? prev : { ...prev, [key]: { x, w: width } }));
  };

  const bulletOpacity = (i: number) => {
    const shown = span(T, WORD_TIMES[i + 1][1] + 120, WORD_TIMES[i + 1][1] + SETTLE_MS + 60);
    const shimmer = 0.45 * bump(span(T, 2650 + i * 150, 2950 + i * 150));
    return Math.min(1, shown * 0.55 + shimmer) * (1 - span(T, 3250, 3550));
  };

  const icon = (name: keyof typeof Ionicons.glyphMap, a: number, b: number) => {
    const k = span(T, a, b);
    if (k <= 0 || k >= 1) return null;
    return (
      <View pointerEvents="none" style={[styles.iconWrap, { top: geo.bigY - BIG * 1.45, opacity: bump(k) }]}>
        <Ionicons name={name} size={22} color={COLORS.sky} />
      </View>
    );
  };

  const rowOrder = isRTL ? 'row-reverse' : 'row';

  return (
    <Pressable
      onPress={skip}
      accessibilityRole="button"
      accessibilityLabel={t('onboarding.skip')}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: 1 - exit }]}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <View style={[StyleSheet.absoluteFill, { transform: [{ scale: 1 + 0.08 * exit }] }]}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="bgGlow" cx="50%" cy="45%" r="60%">
              <Stop offset="0" stopColor={COLORS.bgGlow} stopOpacity={0.9} />
              <Stop offset="1" stopColor={COLORS.bg} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={COLORS.sky} stopOpacity={0.55} />
              <Stop offset="1" stopColor={COLORS.sky} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          <Circle cx={W / 2} cy={geo.cy} r={Math.max(W, H) * 0.7} fill="url(#bgGlow)" opacity={0.4 + 0.6 * dotIn} />

          {/* Path: soft halo + crisp line, morphing into the mark. */}
          {drawn > 0 && (
            <>
              <Path
                d={pathD}
                stroke={COLORS.accent}
                strokeOpacity={0.18 * (1 - morph)}
                strokeWidth={strokeW + 8}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={[pathLen, pathLen]}
                strokeDashoffset={pathLen * (1 - drawn)}
              />
              <Circle
                cx={geo.ring.x}
                cy={geo.ring.y}
                r={MARK_RING * geo.s * ringIn}
                fill={COLORS.ring}
                opacity={span(T, 3700, 3800)}
              />
              <Path
                d={pathD}
                stroke={COLORS.white}
                strokeOpacity={lerp(0.85, 1, morph)}
                strokeWidth={strokeW * (morph > 0.99 ? logoPulse : 1)}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={[pathLen, pathLen]}
                strokeDashoffset={pathLen * (1 - drawn)}
              />
            </>
          )}

          {comet > 0 && comet < 1 && (
            <Path
              d={pathD}
              stroke={COLORS.sky}
              strokeWidth={3.5}
              strokeLinecap="round"
              fill="none"
              opacity={bump(comet)}
              strokeDasharray={[pathLen * 0.14, pathLen * 2]}
              strokeDashoffset={-pathLen * (comet * 1.1 - 0.12)}
            />
          )}

          {pulse > 0 && pulse < 1 && (
            <Circle cx={lastPt.x} cy={lastPt.y} r={6 + 30 * easeOut(pulse)} stroke={COLORS.sky} strokeWidth={1.5} fill="none" opacity={0.7 * (1 - pulse)} />
          )}

          {dotFade > 0 && (
            <>
              <Circle cx={head.x} cy={head.y} r={dotR * 5} fill="url(#dotGlow)" opacity={dotIn * dotFade} />
              <Circle cx={head.x} cy={head.y} r={dotR} fill={COLORS.white} opacity={dotIn * dotFade} />
            </>
          )}
        </Svg>

        {/* Invisible line used to measure where each word settles. */}
        <View pointerEvents="none" style={[styles.row, { top: geo.rowY - ROW * 0.65, flexDirection: rowOrder, opacity: 0 }]}>
          {words.map((w, i) => (
            <React.Fragment key={w}>
              <Text onLayout={onSlot(`w${i}`)} style={[styles.word, { fontSize: ROW, lineHeight: ROW * 1.3 }]}>{w}</Text>
              {i < 3 && <Text onLayout={onSlot(`b${i}`)} style={[styles.bullet, { fontSize: ROW }]}>•</Text>}
            </React.Fragment>
          ))}
        </View>

        {/* Bullets between words */}
        {[0, 1, 2].map((i) => {
          const b = slots[`b${i}`];
          if (!b) return null;
          return (
            <View
              key={`b${i}`}
              pointerEvents="none"
              style={[styles.dot, { top: geo.rowY - 3, left: b.x + b.w / 2 - 3, opacity: bulletOpacity(i) }]}
            />
          );
        })}

        {icon('storefront-outline', 930, 1420)}
        {icon('location-outline', 1430, 1960)}

        {/* Motion trail for "deliver" */}
        {deliverEnter > 0 && deliverEnter < 1 && [0.22, 0.1].map((alpha, n) => (
          <Text
            key={`trail${n}`}
            pointerEvents="none"
            style={[styles.word, styles.big, { fontSize: BIG, lineHeight: BIG * 1.3, top: geo.rowY - BIG * 0.65, opacity: alpha * (1 - deliverEnter), transform: [{ translateX: -geo.dir * (1 - easeOut(deliverEnter)) * (70 + 26 * (n + 1)) }, { translateY: geo.bigY - geo.rowY }] }]}
          >
            {words[2]}
          </Text>
        ))}

        {words.map((w, i) => (
          <Text
            key={`word${i}`}
            pointerEvents="none"
            style={[
              styles.word,
              styles.big,
              { fontSize: BIG, lineHeight: BIG * 1.3, top: geo.rowY - BIG * 0.65 },
              i === 3 && earnGlow > 0 ? { textShadowColor: COLORS.sky, textShadowRadius: earnGlow, textShadowOffset: { width: 0, height: 0 } } : null,
              wordStyle(i),
            ]}
          >
            {w}
          </Text>
        ))}

        {/* Brand lock-up */}
        <View pointerEvents="none" style={[styles.lockup, { top: geo.markCy + MARK_BOX.size * geo.s * 0.62 }]}>
          <Text style={[styles.name, { opacity: nameIn, transform: [{ translateY: (1 - nameIn) * 12 }] }]}>{t('onboarding.appName')}</Text>
          <Text style={[styles.tagline, { opacity: tagIn * 0.85, transform: [{ translateY: (1 - tagIn) * 8 }] }]}>
            {words.join('  •  ')}
          </Text>
        </View>

        <Text style={[styles.skip, isRTL ? { right: 24 } : { left: 24 }, { opacity: 0.7 * span(T, 600, 1000) * (1 - span(T, 4400, 4700)) }]}>
          {t('onboarding.skip')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.bg, zIndex: 1000, overflow: 'hidden' },
  abs: { position: 'absolute' },
  row: { position: 'absolute', left: 0, right: 0, justifyContent: 'center', alignItems: 'center' },
  word: { color: COLORS.white, fontFamily: FONTS.bold, textAlign: 'center', includeFontPadding: false } as any,
  big: { position: 'absolute', left: 0, right: 0 },
  bullet: { color: COLORS.accent, fontFamily: FONTS.bold, textAlign: 'center', marginHorizontal: 10 },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  iconWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  lockup: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  name: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 34, letterSpacing: 0.5 },
  tagline: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 13, marginTop: 8, letterSpacing: 0.3 },
  skip: { position: 'absolute', top: 52, color: COLORS.white, fontFamily: FONTS.medium, fontSize: 14 },
});

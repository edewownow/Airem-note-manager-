/**
 * Lightbox — full-size photo viewer. Pinch to zoom, double-tap to zoom, drag while zoomed.
 * One tap closes when the photo is not zoomed. `onShare` adds Share (the Private folder).
 * Drawn over the screen, not in a separate window: Android does not deliver a second finger
 * into that window, so a pinch there never zoomed.
 */
import React, { useEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, Text, Animated, GestureResponderEvent } from 'react-native';
import { colors } from '../../theme/tokens';
import { Icon } from '../common/Icon';

function pinchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.hypot(dx, dy);
}

function ZoomPhoto({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const now = useRef({ s: 1, x: 0, y: 0 });
  const pinch = useRef<{ s: number; dist: number } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const apply = (s: number, x: number, y: number) => {
    now.current = { s, x, y };
    scale.setValue(s);
    pan.setValue({ x, y });
  };

  useEffect(() => {
    pinch.current = null;
    drag.current = null;
    apply(1, 0, 0);
  }, [uri]);

  const onTouch = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    if (touches.length >= 2) {
      moved.current = true;
      const d = pinchDistance(touches) || 1;
      if (!pinch.current) pinch.current = { s: now.current.s, dist: d };
      const next = Math.min(5, Math.max(1, pinch.current.s * (d / pinch.current.dist)));
      apply(next, now.current.x, now.current.y);
      drag.current = null;
      return;
    }
    pinch.current = null;
    const t = touches[0];
    if (!t || now.current.s <= 1) return;
    if (!drag.current) drag.current = { x: now.current.x, y: now.current.y, px: t.pageX, py: t.pageY };
    const dx = t.pageX - drag.current.px;
    const dy = t.pageY - drag.current.py;
    if (Math.hypot(dx, dy) > 8) moved.current = true;
    apply(now.current.s, drag.current.x + dx, drag.current.y + dy);
  };

  const onEnd = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length > 0) return;
    pinch.current = null;
    drag.current = null;
    if (moved.current) {
      moved.current = false;
      return;
    }
    const t = Date.now();
    if (t - lastTap.current < 300) {
      lastTap.current = 0;
      if (now.current.s > 1.05) apply(1, 0, 0);
      else apply(2.5, 0, 0);
      return;
    }
    lastTap.current = t;
    setTimeout(() => {
      if (lastTap.current !== t) return;
      if (now.current.s <= 1.05) closeRef.current();
    }, 300);
  };

  return (
    <View
      style={styles.stage}
      collapsable={false}
      onTouchStart={onTouch}
      onTouchMove={onTouch}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      <View pointerEvents="none" style={styles.img}>
        <Animated.Image
          source={{ uri }}
          resizeMode="contain"
          style={[styles.img, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] }]}
        />
      </View>
    </View>
  );
}

export function Lightbox({
  uri,
  onClose,
  onShare,
  held,
  onHold,
  loadingFull,
}: {
  uri: string | null;
  onClose: () => void;
  onShare?: (uri: string) => void;
  held?: boolean;
  onHold?: () => void;
  /** The small picture is showing while the full one is checked and loaded. Share waits for it. */
  loadingFull?: boolean;
}) {
  if (!uri) return null;
  return (
    <View style={styles.scrim}>
      <ZoomPhoto uri={uri} onClose={onClose} />
      {onShare ? (
        <Pressable style={styles.share} onPress={() => onShare(uri)} hitSlop={10}>
          <Text style={styles.shareTxt}>Share</Text>
        </Pressable>
      ) : null}
      {loadingFull ? (
        <View style={styles.share}>
          <Text style={styles.shareTxt}>Loading full photo…</Text>
        </View>
      ) : null}
      {onHold ? (
        <Pressable style={styles.hold} onPress={onHold} hitSlop={10}>
          {held ? <Icon name="lock" size={18} color={colors.accent} /> : <Text style={styles.shareTxt}>Pin it</Text>}
        </Pressable>
      ) : null}
      <Pressable style={styles.close} onPress={onClose} hitSlop={10}>
        <Text style={styles.closeTxt}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
    backgroundColor: colors.scrimDark,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%' },
  close: {
    position: 'absolute',
    top: 40,
    right: 22,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  closeTxt: { color: '#fff', fontSize: 24, lineHeight: 26 },
  share: {
    position: 'absolute',
    top: 46,
    left: 22,
    zIndex: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  hold: {
    position: 'absolute',
    top: 46,
    left: 108,
    zIndex: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shareTxt: { color: '#fff', fontSize: 15 },
});

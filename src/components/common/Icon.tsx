/**
 * Icon — ports the prototype's inline stroke SVGs to react-native-svg. All icons
 * are 24x24, stroke=currentColor (via `color`), width 2, no fill — matching the
 * prototype's visual language.
 */
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../../theme/tokens';

export type IconName =
  | 'camera'
  | 'file'
  | 'text'
  | 'mic'
  | 'star'
  | 'search'
  | 'save'
  | 'x'
  | 'close'
  | 'folder'
  | 'logCheck'
  | 'download'
  | 'gear'
  | 'speaker'
  | 'chevron'
  | 'back'
  | 'plus'
  | 'calendar'
  | 'flip'
  | 'lock';

export function Icon({
  name,
  size = 18,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render(name, p)}
    </Svg>
  );
}

function render(name: IconName, p: any) {
  switch (name) {
    case 'camera':
      return (
        <>
          <Path {...p} d="M14.5 4l1.5 2h3a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h3l1.5-2z" />
          <Circle {...p} cx="12" cy="12.5" r="3.2" />
        </>
      );
    case 'file':
      return (
        <>
          <Path {...p} d="M14 3v5h5" />
          <Path {...p} d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
        </>
      );
    case 'text':
      return <Path {...p} d="M4 6h16M4 12h16M4 18h10" />;
    case 'mic':
      return (
        <>
          <Rect {...p} x="9" y="3" width="6" height="11" rx="3" />
          <Path {...p} d="M5 11a7 7 0 0014 0M12 18v3" />
        </>
      );
    case 'star':
      return <Path {...p} d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 14 2 9.4h7.6z" />;
    case 'search':
      return (
        <>
          <Circle {...p} cx="11" cy="11" r="7" />
          <Path {...p} d="M21 21l-4.3-4.3" />
        </>
      );
    case 'save':
      return (
        <>
          <Path {...p} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
          <Path {...p} d="M17 21v-8H7v8M7 3v5h8" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect {...p} x={5} y={11} width={14} height={10} rx={2} />
          <Path {...p} d="M8 11V7a4 4 0 018 0v4" />
        </>
      );
    case 'x':
      return <Path {...p} d="M18 6L6 18M6 6l12 12" />;
    case 'close':
      return <Path {...p} d="M18 6L6 18M6 6l12 12" />;
    case 'folder':
      return <Path {...p} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />;
    case 'logCheck':
      return (
        <>
          <Path {...p} d="M9 11l3 3 8-8" />
          <Path {...p} d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </>
      );
    case 'download':
      return (
        <>
          <Path {...p} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <Path {...p} d="M7 10l5 5 5-5" />
          <Path {...p} d="M12 15V3" />
        </>
      );
    case 'gear':
      return (
        <>
          <Circle {...p} cx="12" cy="12" r="3" />
          <Path
            {...p}
            d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"
          />
        </>
      );
    case 'speaker':
      return (
        <>
          <Path {...p} d="M11 5L6 9H3v6h3l5 4V5z" />
          <Path {...p} d="M16 9a4 4 0 010 6M19 6a8 8 0 010 12" />
        </>
      );
    case 'chevron':
      return <Path {...p} d="M6 9l6 6 6-6" />;
    case 'back':
      return <Path {...p} d="M19 12H5M12 19l-7-7 7-7" />;
    case 'plus':
      return <Path {...p} d="M12 3v18M3 12h18" />;
    case 'calendar':
      return (
        <>
          <Rect {...p} x="3" y="4" width="18" height="17" rx="2" />
          <Path {...p} d="M3 9h18M8 2v4M16 2v4" />
        </>
      );
    case 'flip':
      return (
        <>
          <Path {...p} d="M3 7h3l2-2h8l2 2h3v12H3z" />
          <Circle {...p} cx="12" cy="13" r="3" />
        </>
      );
    default:
      return null;
  }
}

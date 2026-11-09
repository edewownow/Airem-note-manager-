/**
 * Design tokens — ported verbatim from the prototype's CSS `:root`
 * (snap-schedule-phone.html). Teal primary, clay accent, "cloud" = online,
 * "device" = on-device. Do not invent new colors; match the prototype.
 */
export const colors = {
  ink: '#14201E',
  canvas: '#EBEFEE',
  surface: '#FFFFFF',
  surface2: '#F5F8F7',
  primary: '#0E7C66',
  primaryInk: '#0A5A4A',
  accent: '#E8643C', // clay
  muted: '#5E6E69',
  line: '#DCE3E0',
  cloud: '#7F77DD', // online
  cloudBg: '#EEEDFE',
  cloudInk: '#3C3489',
  device: '#0E7C66', // on-device
  deviceBg: '#E1F5EE',

  // status lines (.status.work uses cloud; .warn/.err below)
  warnBg: '#FBF1DC',
  warnInk: '#8A5A00',
  errBg: '#FCEBEB',
  errInk: '#A32D2D',

  // verdict badges (.lb.ok / .warn / .fail)
  good: '#0E7C66',
  warn: '#8A5A00',
  fail: '#C0392B',

  // overlays
  scrim: 'rgba(10,16,15,0.6)',
  scrimDark: 'rgba(10,16,15,0.85)',
  imageBg: '#0C1413',
} as const;

export const radius = {
  card: 14,
  control: 10,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const shadow = {
  // RN elevation-equivalent of the prototype's soft card shadow
  shadowColor: '#14201E',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation: 3,
} as const;

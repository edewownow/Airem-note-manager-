/**
 * Typography — the prototype's three families:
 *   Space Grotesk (headings/brand), Inter (body/UI), Space Mono (meta/labels).
 * Font family keys match the names exported by @expo-google-fonts/* and are
 * loaded in App.tsx via useFonts(). Until fonts load we fall back to system.
 */
export const fonts = {
  // Space Grotesk
  grotesk: 'SpaceGrotesk_500Medium',
  groteskSemi: 'SpaceGrotesk_600SemiBold',
  groteskBold: 'SpaceGrotesk_700Bold',
  // Inter
  inter: 'Inter_400Regular',
  interItalic: 'Inter_400Regular_Italic',
  interMedium: 'Inter_500Medium',
  interSemi: 'Inter_600SemiBold',
  // Space Mono
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const fontSize = {
  h1: 18, // brand title (phone)
  h2: 14, // card heads
  body: 14,
  small: 12.5,
  meta: 12,
  tiny: 11,
  micro: 10.5,
} as const;

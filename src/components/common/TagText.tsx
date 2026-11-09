/**
 * TagText — record text with its #tags standing out (variant experiment).
 * Tags render in the category color with a semibold weight; the rest of the
 * text is unchanged. Same word rules as lib/categories (splitTags).
 */
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { splitTags, TAG_COLOR } from '../../lib/categories';
import { fonts } from '../../theme/typography';

export function TagText({
  text,
  style,
  tagStyle,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  tagStyle?: StyleProp<TextStyle>;
}) {
  const segs = splitTags(text);
  return (
    <Text style={style}>
      {segs.map((s, i) =>
        s.tag ? (
          <Text key={i} style={[{ color: TAG_COLOR, fontFamily: fonts.interSemi }, tagStyle]}>
            {s.text}
          </Text>
        ) : (
          <Text key={i}>{s.text}</Text>
        ),
      )}
    </Text>
  );
}

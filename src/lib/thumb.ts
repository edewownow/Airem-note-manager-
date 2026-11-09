/**
 * Thumbnailing — downscale a captured photo to a small JPEG that persists with
 * the record + log (the RN replacement for the prototype's canvas makeThumb).
 * Returns a `data:` URI so it renders directly in <Image>. Full-res images stay
 * in the session map only (and are dropped on save) — only thumbs persist.
 *
 * Needs a file URI as input (image-manipulator can't take raw base64 reliably),
 * which is why capture yields both base64 (for Gemini) and a uri (for this).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export async function makeThumb(uri: string, maxWidth = 240): Promise<string | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: maxWidth }); // height auto — preserves aspect ratio
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
    return result.base64 ? 'data:image/jpeg;base64,' + result.base64 : null;
  } catch {
    return null;
  }
}

/**
 * Downscale an image to a Gemini-upload-friendly size BEFORE the API call — this is
 * SEPARATE from the 240px storage thumb above. Full-res phone photos are multiple MB;
 * sent as a single inline base64 POST they routinely blow past the request deadline
 * (the confirmed parse-timeout root cause — see invariant 16). Gemini reads flyers /
 * menus / cards fine at ~1500px on the long edge (and downsamples large images itself
 * anyway), so we cap there and re-encode JPEG at moderate quality. (1500 matches eOrderPad,
 * which parses reliably on the same satellite/ship link — smaller payload = faster upload.)
 *
 * Returns the resized RAW base64 (NO `data:` prefix — `inline_data` wants raw base64)
 * with a reason:
 *   - 'resized' → downscaled; caller sends `base64`.
 *   - 'small'   → already ≤ target; `base64` is null, caller keeps the original (never UPscale).
 *   - 'error'   → manipulation failed; `base64` is null, caller falls back to full-res (logged).
 * NEVER throws — a broken resize must not block the parse (better slow than no parse).
 */
export interface UploadImage {
  base64: string | null;
  reason: 'resized' | 'small' | 'error';
}
export async function resizeForUpload(uri: string, maxEdge = 1500): Promise<UploadImage> {
  try {
    // Decode once to read the real dimensions (ImageRef carries width/height); reuse
    // that ref for the resize so we don't decode from disk twice.
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const longEdge = Math.max(original.width, original.height);
    if (longEdge <= maxEdge) return { base64: null, reason: 'small' }; // don't upscale
    const ref = await ImageManipulator.manipulate(original)
      .resize(original.width >= original.height ? { width: maxEdge } : { height: maxEdge })
      .renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    return out.base64 ? { base64: out.base64, reason: 'resized' } : { base64: null, reason: 'error' };
  } catch {
    return { base64: null, reason: 'error' };
  }
}

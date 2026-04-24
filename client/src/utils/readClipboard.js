import { isIOS } from './device';

/**
 * Reads clipboard content using the async Clipboard API (requires a user gesture).
 * Returns { type, content, fileName?, mimeType? } — same shape as useClipboardPaste
 * and useDrop — or null if the clipboard is empty or access is denied.
 */
export async function readClipboard() {
  // if (!isIOS()) return null;

  try {
    // Full read: supports images + text (not available in all browsers)
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();

      // First pass: images (a text/plain filename item can precede the actual image item)
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (!imageType) continue;
        try {
          const blob = await item.getType(imageType);
          const content = await blobToDataURL(blob);
          const ext = imageType.split('/')[1] || 'png';
          return { type: 'image', content, fileName: `image.${ext}`, mimeType: imageType };
        } catch {
          // This image type isn't readable — keep scanning
        }
      }

      // Second pass: text (only reached if no image was found/readable)
      for (const item of items) {
        if (!item.types.includes('text/plain')) continue;
        try {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          // Skip bare filenames the OS injects alongside file copies (e.g. "photo.jpg")
          if (text.trim() && !isImageFilename(text)) return { type: 'snippet', content: text };
        } catch {
          // skip unreadable item
        }
      }

      return null;
    }

    // Fallback: text only
    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text.trim()) return { type: 'snippet', content: text };
    }

    return null;
  } catch {
    // Permission denied or API unavailable — open modal empty
    return null;
  }
}

// A bare filename with an image extension — injected by macOS/Windows alongside file copies.
// Not meaningful text content from the user's perspective.
function isImageFilename(text) {
  const t = text.trim();
  return /^[^\s/\\]+\.(png|jpe?g|gif|webp|heic|bmp|tiff?|svg|avif)$/i.test(t);
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => resolve(result);
    reader.readAsDataURL(blob);
  });
}

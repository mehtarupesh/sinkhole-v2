/**
 * Share utilities for units and categories.
 *
 * shareUnits(units, uidToCategoryName?)
 *   Share an array of Unit objects. uidToCategoryName maps unit.uid → category title.
 *
 * shareCategories(groups, unitsByUid)
 *   Share one or more category groups with their units.
 *
 * Returns:
 *   {}                   Web Share API was used (or nothing to share)
 *   { copied: true }     Clipboard fallback was used
 *   { downloaded: true } Image was triggered as a browser download
 *
 * Throws on failure. Callers should ignore AbortError (user cancelled).
 */

function maskPassword(unit) {
  return '•'.repeat(Math.min(unit.content?.length || 8, 12));
}

// Format a single unit as a shareable text block (passwords masked).
function unitText(unit, categoryName) {
  let content;
  if (unit.type === 'snippet')       content = unit.content || '';
  else if (unit.type === 'password') content = maskPassword(unit);
  else if (unit.type === 'image')    content = unit.fileName || 'Image';
  else content = '';

  const meta = [
    unit.quote   && `> ${unit.quote}`,
    categoryName && `#${categoryName}`,
  ].filter(Boolean).join('\n');

  if (!meta) return content;
  // Blank line between content and meta for snippets, single newline otherwise
  const sep = (unit.type === 'snippet' && content) ? '\n\n' : '\n';
  return `${content}${sep}${meta}`;
}

// Format a unit as a bullet-point line inside a category block.
function categoryItemText(unit) {
  let content;
  if (unit.type === 'snippet')       content = unit.content || '';
  else if (unit.type === 'password') content = maskPassword(unit);
  else if (unit.type === 'image')    content = unit.fileName || 'Image';
  else content = '';

  const line = `• ${content}`;
  return unit.quote ? `${line}\n  > ${unit.quote}` : line;
}

async function buildImageFiles(imageUnits) {
  return Promise.all(
    imageUnits.map(async (u) => {
      const res  = await fetch(u.content);
      const blob = await res.blob();
      return new File([blob], u.fileName || 'image', { type: u.mimeType || blob.type });
    })
  );
}

export async function shareUnits(units, uidToCategoryName = {}) {
  if (!units.length) return {};

  const catName = (unit) => uidToCategoryName[unit.uid] || '';

  // One or more images (all images selected): try file share, fall back to download
  const imageUnits = units.filter((u) => u.type === 'image' && u.content);
  if (imageUnits.length === units.length && imageUnits.length > 0) {
    // Build combined note/category text from all images
    const metaText = imageUnits
      .map((u) => [u.quote && `> ${u.quote}`, catName(u) && `#${catName(u)}`].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n---\n\n') || undefined;

    if (navigator.share && navigator.canShare) {
      try {
        const files = await buildImageFiles(imageUnits);
        if (navigator.canShare({ files })) {
          await navigator.share({ files, text: metaText });
          return {};
        }
      } catch {
        // fall through to download (single image only)
      }
    }
    // Desktop fallback: trigger download for each image
    for (const u of imageUnits) {
      const a = document.createElement('a');
      a.href = u.content;
      a.download = u.fileName || 'image';
      a.click();
    }
    return { downloaded: true };
  }

  // Mixed or non-image types: text share (images represented by filename)
  const text = units
    .map((u) => unitText(u, catName(u)))
    .filter(Boolean)
    .join('\n\n---\n\n');

  if (!text) return {};

  if (navigator.share) {
    await navigator.share({ text });
    return {};
  }

  await navigator.clipboard.writeText(text);
  return { copied: true };
}

export async function shareCategories(groups, unitsByUid) {
  const blocks = groups
    .map((g) => {
      const items = g.uids
        .map((uid) => unitsByUid[uid])
        .filter(Boolean)
        .map(categoryItemText)
        .filter(Boolean);
      if (!items.length) return '';
      return `#${g.title}\n${items.join('\n')}`;
    })
    .filter(Boolean);

  const text = blocks.join('\n\n');
  if (!text) return {};

  if (navigator.share) {
    await navigator.share({ text });
    return {};
  }

  await navigator.clipboard.writeText(text);
  return { copied: true };
}

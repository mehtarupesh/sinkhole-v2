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
    categoryName && `[${categoryName}]`,
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

export async function shareUnits(units, uidToCategoryName = {}) {
  if (!units.length) return {};

  const catName = (unit) => uidToCategoryName[unit.uid] || '';

  // Single image: try Web Share with file + metadata text, fall back to download
  if (units.length === 1 && units[0].type === 'image' && units[0].content) {
    const unit = units[0];
    const metaParts = [
      unit.quote    && `> ${unit.quote}`,
      catName(unit) && `[${catName(unit)}]`,
    ].filter(Boolean);
    const metaText = metaParts.join('\n') || undefined;

    if (navigator.share && navigator.canShare) {
      try {
        const res  = await fetch(unit.content);
        const blob = await res.blob();
        const file = new File([blob], unit.fileName || 'image', {
          type: unit.mimeType || blob.type,
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: metaText });
          return {};
        }
      } catch {
        // fall through to download
      }
    }
    const a = document.createElement('a');
    a.href = unit.content;
    a.download = unit.fileName || 'image';
    a.click();
    return { downloaded: true };
  }

  // All other types (snippets, passwords masked, multi-select mix)
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
      return `[${g.title}]\n${items.join('\n')}`;
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

import { useState, useRef } from 'react';
import { getSetting } from '../utils/db';
import { suggestCategory } from '../utils/suggestCategory';

const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Manages the AI category-suggestion state machine.
 *
 * Returns:
 *   suggestState    'idle'|'needs-selection'|'loading'|'done'|'error'|'no-key'
 *   shareContent    bool — user consent to send content to AI
 *   setShareContent fn
 *   newCategory     { id, title } | null — new category queued for creation (pre-accepted)
 *   editingGhost    bool — ghost chip is in inline-edit mode
 *   ghostEditValue  string
 *   setGhostEditValue fn
 *   runSuggest({ content, mimeType, note, type, existingCategories })
 *     → Promise<{ type: 'existing', categoryId } | { type: 'new' } | { type: 'none' } | null>
 *     Returns null on error. Parent should update categoryId based on result.type === 'existing'.
 *   startAddManual()    — "+" button: open ghost chip in edit mode (empty)
 *   startEditGhost()    — tap existing ghost chip to rename it
 *   commitGhostEdit(value)
 *   dismissGhost()      — "✕" button: clear newCategory, keep shareContent
 *   clearGhost()        — clear ghost chip state without resetting shareContent/suggestState
 *   reset()             — full reset (use on type switch)
 */
export function useSuggest() {
  const [suggestState, setSuggestState] = useState('idle');
  const [shareContent, setShareContent] = useState(false);
  const [newCategory, setNewCategory] = useState(null);
  const [editingGhost, setEditingGhost] = useState(false);
  const [ghostEditValue, setGhostEditValue] = useState('');

  const blinkTimerRef = useRef(null);

  const runSuggest = async ({ content, mimeType, note, type, existingCategories }) => {
    const willShareNote = !!note?.trim();

    if (!shareContent && !willShareNote) {
      setSuggestState('needs-selection');
      clearTimeout(blinkTimerRef.current);
      blinkTimerRef.current = setTimeout(() => setSuggestState('idle'), 2500);
      return null;
    }

    setSuggestState('loading');
    try {
      const apiKey = await getSetting('gemini_key');
      if (!apiKey) throw new Error('no-key');

      const result = await suggestCategory({
        content: shareContent && content ? content : null,
        mimeType,
        quote: willShareNote ? note : null,
        type,
        existingCategories: existingCategories ?? [],
      }, apiKey);

      if (result.categoryId) {
        setNewCategory(null);
        setSuggestState('done');
        return { type: 'existing', categoryId: result.categoryId };
      }

      if (result.suggestedTitle) {
        setNewCategory({ id: slugify(result.suggestedTitle), title: result.suggestedTitle });
        setSuggestState('done');
        return { type: 'new' };
      }

      setSuggestState('done');
      return { type: 'none' };
    } catch (e) {
      setSuggestState(e.message === 'no-key' ? 'no-key' : 'error');
      return null;
    }
  };

  // "+" button — open an empty ghost chip in edit mode
  const startAddManual = () => {
    setNewCategory(null);
    setGhostEditValue('');
    setEditingGhost(true);
    setSuggestState('done');
  };

  // Tap accepted ghost chip to rename it
  const startEditGhost = () => {
    setGhostEditValue(newCategory?.title ?? '');
    setEditingGhost(true);
  };

  // Called on Enter / blur of ghost input
  const commitGhostEdit = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setNewCategory(null);
      setEditingGhost(false);
      setSuggestState('idle');
    } else {
      setNewCategory({ id: slugify(trimmed), title: trimmed });
      setEditingGhost(false);
    }
  };

  // "✕" dismiss — clears ghost chip but preserves shareContent + suggestState
  const dismissGhost = () => {
    setNewCategory(null);
    setEditingGhost(false);
    setGhostEditValue('');
  };

  // Clear ghost chip without touching shareContent or suggestState (used on chip deselect)
  const clearGhost = () => {
    setNewCategory(null);
    setEditingGhost(false);
    setGhostEditValue('');
  };

  // Apply a pre-fetched result (e.g. from transcribeAndSuggest) without an LLM call
  const applyResult = ({ categoryId, suggestedTitle }) => {
    if (categoryId) {
      setNewCategory(null);
      setSuggestState('done');
      return { type: 'existing', categoryId };
    }
    if (suggestedTitle) {
      setNewCategory({ id: slugify(suggestedTitle), title: suggestedTitle });
      setSuggestState('done');
      return { type: 'new' };
    }
    setSuggestState('done');
    return { type: 'none' };
  };

  // Full reset — use when switching content type
  const reset = () => {
    setNewCategory(null);
    setEditingGhost(false);
    setGhostEditValue('');
    setSuggestState('idle');
    setShareContent(false);
    clearTimeout(blinkTimerRef.current);
  };

  return {
    suggestState,
    shareContent,
    setShareContent,
    newCategory,
    editingGhost,
    ghostEditValue,
    setGhostEditValue,
    runSuggest,
    applyResult,
    startAddManual,
    startEditGhost,
    commitGhostEdit,
    dismissGhost,
    clearGhost,
    reset,
  };
}

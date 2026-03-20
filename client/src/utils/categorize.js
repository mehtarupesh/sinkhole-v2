import { GoogleGenAI, Type } from '@google/genai';
import { buildRecentCarousel, finalizeCarousels } from './carouselGroups';

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id:    { type: Type.STRING, description: 'URL-safe slug for this group' },
      title: { type: Type.STRING, description: "Short label in the user's own voice" },
      uids:  { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    propertyOrdering: ['id', 'title', 'uids'],
  },
};

const SYSTEM_PROMPT = `You help organize a personal stash app called "1Burrow".
The user saves snippets, passwords, files, and links with short context notes.
Your job: group the supplied items into 2–6 carousels that reflect how THIS user thinks.
Rules:
- Use the user's own words/phrases for titles — avoid generic labels like "Misc"
- Every uid must appear in exactly one group
- Short titles (2–4 words) work best`;

/**
 * Groups units into labelled carousels using the Gemini API.
 * Only context notes (quote) are sent to the LLM — never raw content.
 *
 * Returns carousels with:
 * - "Recent" first (deterministic, no LLM)
 * - LLM-suggested groups in the middle (sorted newest-first, capped)
 * - "Add Some Context?" last (units without a quote, no LLM)
 *
 * @param {object[]} units  - units to categorize (must have uid, type, quote, createdAt)
 * @param {string}   apiKey - Gemini API key
 * @returns {Promise<{id:string, title:string, units:object[]}[]>}
 */
export async function categorizeUnits(units, apiKey) {
  if (!units.length) return [];

  const ai = new GoogleGenAI({ apiKey });

  const withNote    = units.filter((u) => u.quote);
  const withoutNote = units.filter((u) => !u.quote);

  let llmGroups = [];

  if (withNote.length > 0) {
    // Send only uid + type + note to the LLM — never raw content
    const payload = withNote.map((u) => ({ uid: u.uid, type: u.type, note: u.quote }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Here are the items the user has saved (context notes only, no raw content):\n\n${JSON.stringify(payload, null, 2)}\n\nGroup them into carousels.`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    llmGroups = JSON.parse(response.text);
  }

  // Map uid → full unit for fast lookups
  const byUid = Object.fromEntries(units.map((u) => [u.uid, u]));

  const rawCarousels = [
    ...llmGroups.map((g) => ({
      id:    g.id,
      title: g.title,
      units: (g.uids ?? []).map((uid) => byUid[uid]).filter(Boolean),
    })),
    // Items without a note go to their own carousel, bypassing the LLM
    ...(withoutNote.length > 0
      ? [{ id: 'needs-context', title: 'Add Some Context?', units: withoutNote }]
      : []),
  ];

  const recent     = buildRecentCarousel(units);
  const categorized = finalizeCarousels(rawCarousels);

  return [
    ...(recent ? [recent] : []),
    ...categorized,
  ];
}

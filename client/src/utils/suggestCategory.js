import { GoogleGenAI, Type } from '@google/genai';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    categoryId: {
      type: Type.STRING,
      description: 'ID of best matching existing category, or empty string if none fit',
    },
    suggestedTitle: {
      type: Type.STRING,
      description: '2-3 word category name to create, matching the user naming style. Empty if an existing category matched.',
    },
  },
  propertyOrdering: ['categoryId', 'suggestedTitle'],
};

/**
 * Suggests the best category for a new unit using Gemini.
 * Sends only what the user explicitly consented to share.
 *
 * For file types (image, pdf, audio, video…) content should be a base64 data URL —
 * it is sent as inlineData so the model can actually read/see the file.
 *
 * @param {object}  opts
 * @param {string|null}  opts.content            - text (snippet/password) or data URL (file)
 * @param {string|null}  opts.mimeType           - MIME type for file content
 * @param {string|null}  opts.quote              - context note
 * @param {string}       opts.type               - 'snippet' | 'password' | 'image'
 * @param {{id:string, title:string}[]} opts.existingCategories
 * @param {string}  apiKey
 * @returns {Promise<{categoryId:string|null, suggestedTitle:string|null}>}
 */
export async function suggestCategory({ content, mimeType, quote, type, existingCategories }, apiKey) {
  const ai = new GoogleGenAI({ apiKey });

  const isFile = type === 'image' || (mimeType && !mimeType.startsWith('text/'));
  const hasExisting = existingCategories?.length > 0;

  // Build the text prompt
  const itemLines = [`Type: ${type}`];
  if (quote) itemLines.push(`Context note: ${quote}`);
  if (content && !isFile) itemLines.push(`Content: ${content}`);

  const styleHint = hasExisting
    ? `Match the naming style of the existing categories (e.g. "${existingCategories.map((c) => c.title).join('", "')}").\n`
    : '';

  const categorySection = hasExisting
    ? `Existing categories:\n${JSON.stringify(existingCategories.map((c) => ({ id: c.id, title: c.title })), null, 2)}\n\nReturn the id of the best match, or empty string if none fit well.`
    : `No categories exist yet. Always return a suggestedTitle.`;

  const textPrompt = `You help organize items in a personal stash app called "1Burrow".

New item:
${itemLines.join('\n')}

${categorySection}

${styleHint}If suggesting a new title, keep it 2-3 words, concise, in the user's voice.`;

  // Build content parts — files go as inlineData so the model can read them
  const parts = [];
  if (content && isFile) {
    const [prefix, base64] = content.split(',');
    const mime = mimeType || prefix.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    parts.push({ inlineData: { data: base64, mimeType: mime } });
  }
  parts.push({ text: textPrompt });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const result = JSON.parse(response.text);
  return {
    categoryId: result.categoryId || null,
    suggestedTitle: result.suggestedTitle || null,
  };
}

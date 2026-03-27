import { GoogleGenAI, Type } from '@google/genai';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.STRING,
      description: 'Exact transcription of the audio, nothing added or removed',
    },
    categoryId: {
      type: Type.STRING,
      description: 'ID of best matching existing category, or empty string if none fit',
    },
    suggestedTitle: {
      type: Type.STRING,
      description: '2-3 word category name to create if no existing match, empty string otherwise',
    },
  },
  propertyOrdering: ['transcript', 'categoryId', 'suggestedTitle'],
};

function blobToBase64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(',')[1]);
    r.readAsDataURL(blob);
  });
}

/**
 * Transcribes audio AND suggests a category in a single Gemini call.
 *
 * @param {Blob}   audioBlob          - audio/webm from MediaRecorder
 * @param {string} apiKey             - Gemini API key
 * @param {object} opts
 * @param {string} opts.type          - 'snippet' | 'password' | 'image'
 * @param {{id:string, title:string}[]} opts.existingCategories
 * @param {string|null} [opts.content]  - text (snippet) or base64 data URL (image) if user consented
 * @param {string|null} [opts.mimeType] - MIME type for image content
 * @returns {Promise<{ transcript: string, categoryId: string|null, suggestedTitle: string|null }>}
 */
export async function transcribeAndSuggest(audioBlob, apiKey, { type, existingCategories = [], content = null, mimeType = null }) {
  const ai = new GoogleGenAI({ apiKey });
  const b64 = await blobToBase64(audioBlob);

  const isImage = type === 'image';
  const hasExisting = existingCategories.length > 0;
  const categorySection = hasExisting
    ? `Existing categories: ${JSON.stringify(existingCategories.map((c) => ({ id: c.id, title: c.title })))}. Return the id of the best match, or empty string if none fit well. Match their naming style.`
    : `No categories yet — always return a suggestedTitle (2-3 words, user's voice).`;

  const contentLine = content && !isImage ? `\nContent: ${content}` : '';
  const textPrompt = `Transcribe the audio exactly, then suggest a category for this ${type} item in a personal stash app called "1Burrow".${contentLine}

${categorySection}`;

  // Build parts: audio first, then optional image, then text prompt
  const parts = [{ inlineData: { mimeType: 'audio/webm', data: b64 } }];
  if (content && isImage) {
    const [prefix, imgB64] = content.split(',');
    const mime = mimeType || prefix.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    parts.push({ inlineData: { data: imgB64, mimeType: mime } });
  }
  parts.push({ text: textPrompt });

  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }],
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const result = JSON.parse(r.text);
  return {
    transcript:     result.transcript?.trim()    || '',
    categoryId:     result.categoryId            || null,
    suggestedTitle: result.suggestedTitle        || null,
  };
}

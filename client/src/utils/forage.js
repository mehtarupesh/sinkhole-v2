import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `You are helping a user forage through their personal stash of saved information in an app called 1Burrow.
The user saves snippets, images, links, and notes with short context notes.
Answer the user's question based only on the provided items.
Be concise and specific. Use simple markdown: **bold** for key info, bullet lists for multiple items, ## for section headers only when needed.
If you cannot answer from the provided items, say so briefly.`;

/**
 * Extract base64 data and mimeType from a stored image content string.
 * Content may be a full data URL (data:image/jpeg;base64,...) or raw base64.
 */
function extractImageData(content, mimeType) {
  if (content.startsWith('data:')) {
    const [header, data] = content.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || mimeType || 'image/jpeg';
    return { data, mimeType: mime };
  }
  return { data: content, mimeType: mimeType || 'image/jpeg' };
}

/**
 * Ask a question about a collection of units using the Gemini streaming API.
 *
 * Privacy rules:
 * - Notes/quotes always included (user wrote them as context)
 * - Passwords never included in content even when shareContent=true
 * - When shareContent=true: images sent as inline multimodal data, text sent as-is
 *
 * @param {object[]} units        - units to query (uid, type, quote, content, mimeType)
 * @param {string}   question     - user's question
 * @param {boolean}  shareContent - include full content (images + text) beyond notes
 * @param {string}   apiKey       - Gemini API key
 * @returns {Promise<AsyncIterable>} streaming response
 */
export async function forageUnits({ units, question, shareContent, apiKey }) {
  if (!units.length) throw new Error('No units to forage.');
  if (!question.trim()) throw new Error('Ask a question first.');
  if (!apiKey) throw new Error('No Gemini API key. Add one in Settings ⚙');

  const ai = new GoogleGenAI({ apiKey });

  // Build multimodal parts array
  const parts = [];

  // Metadata header — always sent
  const metaLines = units.map((u, i) =>
    `Item ${i + 1}: type=${u.type}, note="${u.quote || '(no note)'}"`
  );
  parts.push({
    text: `Collection of ${units.length} item${units.length !== 1 ? 's' : ''}:\n${metaLines.join('\n')}\n\nQuestion: ${question}`,
  });

  // Content — only when shareContent=true
  if (shareContent) {
    units.forEach((u, i) => {
      if (u.type === 'password' || !u.content) return;

      if (u.type === 'image') {
        parts.push({ text: `\nItem ${i + 1} image (note: "${u.quote || ''}"):` });
        const { data, mimeType } = extractImageData(u.content, u.mimeType);
        parts.push({ inlineData: { mimeType, data } });
      } else {
        parts.push({ text: `\nItem ${i + 1} full text: ${u.content}` });
      }
    });
  }

  return ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
}

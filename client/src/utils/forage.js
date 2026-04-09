import { GoogleGenAI } from '@google/genai';

const SYSTEM_PROMPT = `You are helping a user forage through their personal stash of saved information in an app called 1Burrow.
The user saves snippets, images, links, and notes with short context notes.
Answer the user's question using the provided items. If any item contains a URL, fetch and read it to give a complete answer.
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
      tools: [{ urlContext: {} }, { googleSearch: {} }],
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
}

const EXPLORE_SYSTEM_PROMPT = `You are a personal assistant helping a user explore their saved information in 1Burrow.
Help them think through ideas, understand concepts, find connections, and brainstorm.
Be conversational but concise. Use simple markdown: **bold** for key info, bullet lists for multiple items.
If you cannot answer from the provided items, say so briefly and offer what you can.`;

/**
 * Multi-turn chat about a collection of units (Explore mode).
 *
 * @param {object[]} units        - units to use as context
 * @param {{ role: 'user'|'assistant', text: string }[]} messages - full conversation so far
 * @param {boolean}  shareContent - include full content beyond notes
 * @param {string}   apiKey       - Gemini API key
 * @returns {Promise<AsyncIterable>} streaming response
 */
export async function chatWithUnits({ units, messages, shareContent, apiKey }) {
  if (!units.length) throw new Error('No items selected for context.');
  if (!messages.length) throw new Error('No messages.');
  if (!apiKey) throw new Error('No Gemini API key. Add one in Settings ⚙');

  const ai = new GoogleGenAI({ apiKey });

  // Context parts — injected into the first user message only
  const contextParts = [];
  const metaLines = units.map((u, i) =>
    `Item ${i + 1}: type=${u.type}, note="${u.quote || '(no note)'}"`
  );
  contextParts.push({
    text: `Context — ${units.length} saved item${units.length !== 1 ? 's' : ''}:\n${metaLines.join('\n')}\n`,
  });

  if (shareContent) {
    units.forEach((u, i) => {
      if (u.type === 'password' || !u.content) return;
      if (u.type === 'image') {
        contextParts.push({ text: `\nItem ${i + 1} image (note: "${u.quote || ''}"):` });
        const { data, mimeType } = extractImageData(u.content, u.mimeType);
        contextParts.push({ inlineData: { mimeType, data } });
      } else {
        contextParts.push({ text: `\nItem ${i + 1} full text: ${u.content}` });
      }
    });
  }

  // Multi-turn contents: context is injected into the first user turn
  const contents = messages.map((msg, i) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: i === 0
      ? [...contextParts, { text: `\nQuestion: ${msg.text}` }]
      : [{ text: msg.text }],
  }));

  return ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents,
    config: {
      systemInstruction: EXPLORE_SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
}

import { GoogleGenAI } from '@google/genai';
import { isEncryptedContent } from './crypto';
import { getSetting } from './db';

const SYSTEM_PROMPT = `You are Personal Assistant whose job is to help the user consume pieces of information they have entered over time. The user will provide list of text/images with per-item notes for each. If any item contains a URL, fetch and read it to give a complete answer.
Use simple markdown: **bold** for key info, bullet lists for multiple items, ## for section headers only when needed`;

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

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'unknown';

// function buildUnitMeta(units) {
//   return units.map((u, i) =>
//     `Item ${i + 1}: type=${u.type}, saved=${fmtDate(u.createdAt)}, note="${u.quote || '(no note)'}"`
//   ).join('\n');
// }

const MODEL_FREE = 'gemini-2.5-flash';
const MODEL_PAID = 'gemini-3-flash-preview';

async function getModel() {
  const tier = await getSetting('gemini_key_tier').catch(() => null);
  const isPaid = tier === 'paid';
  console.log('isPaid', isPaid);
  return isPaid ? MODEL_PAID : MODEL_FREE;
}

async function buildContentParts(units, skipImages = false) {
  const parts = [];
  // Add today's date ISO format
  const today = new Date().toISOString();
  parts.push({ text: `Today's date: ${today}\n` });
  units.forEach((u, i) => {
    if (u.encrypted && isEncryptedContent(u.content)) return;
    if (u.type === 'image' && u.content) {
      parts.push({ text: `\nItem ${i + 1}, saved ${fmtDate(u.createdAt)}, (note: "${u.quote || ''}"):` });
     if (!skipImages) {
      const { data, mimeType } = extractImageData(u.content, u.mimeType);
      parts.push({ inlineData: { mimeType, data } });
     } 
    } else {
      parts.push({ text: `\nItem ${i + 1}, saved ${fmtDate(u.createdAt)}, (note: "${u.quote || ''}"): ${u.content}` });
    }
  });
  return parts;
}

async function generateFreeTier(ai, systemPrompt, contents) {
  return ai.models.generateContentStream({
    model: MODEL_FREE,
    contents,
    config: {
      systemInstruction: systemPrompt,
      // thinkingConfig: { thinkingLevel: 'MINIMAL' },
      tools: [{ urlContext: {} }, { googleSearch: {} }],
    },
  });
}

async function generatePaidTier(ai, systemPrompt, contents) {
  return ai.models.generateContentStream({
    model: MODEL_PAID,
    contents,
    config: {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
      tools: [{ urlContext: {} }, { googleSearch: {} }],
    },
  });
}

// test fucmtion which takes all units and runs synthesis prompt with PAID tier
export async function testPaidTier(units, question, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const plural = units.length !== 1 ? 's' : '';
  const parts = [
    { text: `Collection of ${units.length} item${plural}\n` },
    ...await buildContentParts(units, false),
    { text: `\n\nTASK: ${question}` },
  ];
  const contents = [{ role: 'user', parts }];
  return generatePaidTier(ai, SYSTEM_PROMPT, contents);
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
export async function synthesizeFromUnits({ units, question, shareContent, apiKey }) {
  console.log('synthesizeFromUnits', units, question, shareContent, apiKey);
  if (!units.length) throw new Error('No units to forage.');
  if (!question.trim()) throw new Error('Ask a question first.');
  if (!apiKey) throw new Error('No Gemini API key. Add one in Settings ⚙');

  const ai = new GoogleGenAI({ apiKey });

  const model = await getModel();
  const plural = units.length !== 1 ? 's' : '';
  const parts = [
    { text: `Collection of ${units.length} item${plural}\n` },
    ...await buildContentParts(units, model === MODEL_FREE ? true : false),
    { text: `\n\nTASK: ${question}` },
  ];

  const contents = [{ role: 'user', parts }];

  if (model === MODEL_FREE) {
    return generateFreeTier(ai, SYSTEM_PROMPT, contents);
  } else {
    return generatePaidTier(ai, SYSTEM_PROMPT, contents);
  }
}

const EXPLORE_SYSTEM_PROMPT = `${SYSTEM_PROMPT}
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

  const model = await getModel();
  const plural = units.length !== 1 ? 's' : '';
  const contextParts = [
    { text: `Context — ${units.length} saved item${plural}:\n` },
    ...await buildContentParts(units, model === MODEL_FREE ? true : false),
  ];

  // Multi-turn contents: context is injected into the first user turn
  const contents = messages.map((msg, i) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: i === 0
      ? [...contextParts, { text: `\nQuestion: ${msg.text}` }]
      : [{ text: msg.text }],
  }));

  if (model === MODEL_FREE) {
    return generateFreeTier(ai, EXPLORE_SYSTEM_PROMPT, contents);
  } else {
    return generatePaidTier(ai, EXPLORE_SYSTEM_PROMPT, contents);
  }
}

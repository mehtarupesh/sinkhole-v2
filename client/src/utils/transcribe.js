import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';

function blobToBase64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(',')[1]);
    r.readAsDataURL(blob);
  });
}

/**
 * Transcribe an audio blob using Gemini.
 * @param {Blob} audioBlob  - audio/webm blob from MediaRecorder
 * @param {string} apiKey   - Gemini API key
 * @returns {Promise<string>} transcript text
 */
export async function transcribeAudio(audioBlob, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const b64 = await blobToBase64(audioBlob);
  const r = await ai.models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: 'Transcribe this audio exactly. Return only the transcript, nothing else.' },
        { inlineData: { mimeType: 'audio/webm', data: b64 } },
      ],
    }],
  });
  return r.text?.trim() || '';
}

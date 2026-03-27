#!/usr/bin/env node
/**
 * Test Gemini URL context grounding.
 *
 * Usage:
 *   node scripts/test-url-context.js <gemini-api-key> <url>
 *
 * Example:
 *   node scripts/test-url-context.js AIza... https://example.com
 */

import { GoogleGenAI } from '../client/node_modules/@google/genai/dist/node/index.mjs';

const [,, apiKey, url] = process.argv;

if (!apiKey || !url) {
  console.error('Usage: node scripts/test-url-context.js <gemini-api-key> <url>');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

console.log(`\nTesting URL context grounding`);
console.log(`URL : ${url}`);
console.log(`─`.repeat(60));

// Test 1: Without URL context tool
console.log('\n[1] WITHOUT urlContext tool\n');
try {
  const r1 = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `What is the main topic of this page? ${url}` }] }],
    config: { thinkingConfig: { thinkingBudget: 0 } },
  });
  console.log(r1.text);
} catch (e) {
  console.error('Error:', e.message);
}

// Test 2: With URL context tool
console.log('\n[2] WITH urlContext tool\n');
try {
  const r2 = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `What is the main topic of this page? ${url}` }] }],
    config: {
      tools: [{ urlContext: {} }],
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  console.log(r2.text);

  // Show URL context metadata if present
  const meta = r2.candidates?.[0]?.urlContextMetadata;
  if (meta) {
    console.log('\n── URL context metadata ──');
    console.log(JSON.stringify(meta, null, 2));
  } else {
    console.log('\n(no urlContextMetadata in response — URL may not have been fetched)');
  }
} catch (e) {
  console.error('Error:', e.message);
}

// Test 3: Ask something only knowable from reading the page
console.log('\n[3] WITH urlContext — asks for specific detail only readable from page\n');
try {
  const r3 = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `Read this URL and give me the first sentence of its main content body: ${url}` }] }],
    config: {
      tools: [{ urlContext: {} }],
    },
  });
  console.log(r3.text);
} catch (e) {
  console.error('Error:', e.message);
}

// Test 4: With Google Search grounding
console.log('\n[4] WITH googleSearch tool\n');
try {
  const r4 = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `What is the main topic of this page? ${url}` }] }],
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  console.log(r4.text);

  const searchMeta = r4.candidates?.[0]?.groundingMetadata;
  if (searchMeta) {
    console.log('\n── Search grounding metadata ──');
    const chunks = searchMeta.groundingChunks ?? [];
    if (chunks.length) {
      chunks.forEach((c, i) => console.log(`  [${i + 1}] ${c.web?.title} — ${c.web?.uri}`));
    } else {
      console.log(JSON.stringify(searchMeta, null, 2));
    }
  } else {
    console.log('\n(no groundingMetadata in response)');
  }
} catch (e) {
  console.error('Error:', e.message);
}

// Test 5: Both tools together
console.log('\n[5] WITH urlContext + googleSearch together\n');
try {
  const r5 = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `Read this URL and summarise it, then tell me if there is related recent news: ${url}` }] }],
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }],
    },
  });
  console.log(r5.text);
} catch (e) {
  console.error('Error (tools may conflict):', e.message);
}

console.log(`\n${'─'.repeat(60)}`);
console.log('Done.');

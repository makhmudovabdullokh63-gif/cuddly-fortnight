"use strict";

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

async function completeChat({ system, user, language }) {
  if (!isConfigured()) {
    return null;
  }
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: language ? `[Language: ${language}]\n${user}` : user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`LLM request failed (${res.status})`);
      error.details = text.slice(0, 400);
      throw error;
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return content ? String(content).trim() : null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, completeChat };

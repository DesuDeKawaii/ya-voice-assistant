// netlify/functions/voice.js
const fetch = require("node-fetch"); // если нужен, в зависимости от версии Node
const { Buffer } = require("buffer");

const API_KEY   = process.env.YC_API_KEY;
const FOLDER_ID = process.env.YC_FOLDER_ID;

const STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";
const GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";
const TTS_URL = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
  }
  if (!API_KEY || !FOLDER_ID) {
    return { statusCode: 500, headers: CORS, body: "Missing Yandex config" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: "Bad JSON" };
  }
  const { audioBase64 } = body;
  if (!audioBase64) {
    return { statusCode: 400, headers: CORS, body: "No audioBase64" };
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  // 1) STT
  const sttResp = await fetch(
    `${STT_URL}?folderId=${encodeURIComponent(FOLDER_ID)}&lang=ru-RU&format=oggopus`,
    {
      method: "POST",
      headers: { Authorization: `Api-Key ${API_KEY}` },
      body: audioBuffer,
    }
  );
  const sttJson = await sttResp.json();
  if (!sttResp.ok || sttJson.error_code) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: "STT error", detail: sttJson }),
    };
  }
  const user_text = sttJson.result;

  // 2) GPT
  const gptResp = await fetch(GPT_URL, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${API_KEY}`,
      "Content-Type": "application/json",
      "x-folder-id": FOLDER_ID,
    },
    body: JSON.stringify({
      modelUri: `gpt://${FOLDER_ID}/yandexgpt/latest`,
      completionOptions: { stream: false, temperature: 0.3, maxTokens: 400 },
      messages: [
        { role: "system", text: "Ты — гид‑ассистент Смоленск-Guide. Отвечай дружелюбно, по существу." },
        { role: "user", text: user_text },
      ],
    }),
  });
  const gptJson = await gptResp.json();
  if (!gptResp.ok) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: "GPT error", detail: gptJson }),
    };
  }
  const answer_text = gptJson.result.alternatives[0].message.text.trim();

  // 3) TTS
  const ttsParams = new URLSearchParams({
    text: answer_text,
    lang: "ru-RU",
    voice: "filipp",
    format: "mp3",
    folderId: FOLDER_ID,
  });
  const ttsResp = await fetch(TTS_URL, {
    method: "POST",
    headers: { Authorization: `Api-Key ${API_KEY}` },
    body: ttsParams,
  });
  if (!ttsResp.ok) {
    const t = await ttsResp.text();
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: "TTS error", detail: t }) };
  }
  const ttsArray = await ttsResp.arrayBuffer();
  const ttsB64 = Buffer.from(ttsArray).toString("base64");

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      user_text,
      answer_text,
      answer_audio_b64: ttsB64,
    }),
  };
};

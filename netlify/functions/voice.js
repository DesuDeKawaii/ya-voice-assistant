// netlify/functions/voice.js

const API_KEY = process.env.YC_API_KEY;
const FOLDER_ID = process.env.YC_FOLDER_ID;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // потом можно ограничить доменом Тильды
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function callSTT(audioBytes) {
  const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?folderId=${encodeURIComponent(
    FOLDER_ID
  )}&lang=ru-RU&format=oggopus`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${API_KEY}`,
      "Content-Type": "application/octet-stream",
    },
    body: audioBytes,
  });

  const data = await resp.json();

  if (!resp.ok || data.error_code) {
    throw new Error(
      `STT error: ${resp.status} ${JSON.stringify(data)}`
    );
  }

  return data.result; // распознанный текст
}

async function callGPT(userText) {
  const url =
    "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

  const body = {
    modelUri: `gpt://${FOLDER_ID}/yandexgpt/latest`,
    completionOptions: {
      stream: false,
      temperature: 0.3,
      maxTokens: 400,
    },
    messages: [
      {
        role: "system",
        text:
          "Ты голосовой ассистент сайта по теме ландшафтного дизайна и outdoor-решений. " +
          "Отвечай кратко, по делу, дружелюбно, ориентируясь на услуги компании.",
      },
      {
        role: "user",
        text: userText,
      },
    ],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${API_KEY}`,
      "Content-Type": "application/json",
      "x-folder-id": FOLDER_ID,
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(
      `GPT error: ${resp.status} ${JSON.stringify(data)}`
    );
  }

  return data.result.alternatives[0].message.text.trim();
}

async function callTTS(answerText) {
  const url =
    "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize";

  // параметры идут в теле, как form-данные
  const params = new URLSearchParams({
    text: answerText,
    lang: "ru-RU",
    voice: "filipp",
    format: "mp3",
    folderId: FOLDER_ID,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${API_KEY}`,
    },
    body: params,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`TTS error: ${resp.status} ${text}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64"); // MP3 в base64
}

exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  if (!API_KEY || !FOLDER_ID) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: "YC_API_KEY and YC_FOLDER_ID must be set",
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { audioBase64 } = body;

    if (!audioBase64) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: "audioBase64 is required" }),
      };
    }

    const audioBytes = Buffer.from(audioBase64, "base64");

    // 1. Распознаём речь
    const userText = await callSTT(audioBytes);

    // 2. Ответ от YandexGPT
    const answerText = await callGPT(userText);

    // 3. Синтез голоса
    const answerAudioB64 = await callTTS(answerText);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ok: true,
        user_text: userText,
        answer_text: answerText,
        answer_audio_b64: answerAudioB64,
      }),
    };
  } catch (err) {
    console.error("Voice function error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: String(err),
      }),
    };
  }
};

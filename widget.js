// widget.js
(function () {
  const BACKEND_URL =
    "https://ВАШ-САЙТ.netlify.app/.netlify/functions/voice"; // подставь сюда URL своего Netlify-сайта

  // --- плавающая кнопка ---
  const btn = document.createElement("button");
  btn.id = "ya-voice-launcher";
  btn.innerText = "🎤";
  Object.assign(btn.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "#3f51b5",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    zIndex: 9999,
    fontSize: "24px",
  });
  document.body.appendChild(btn);

  // --- панель ассистента ---
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    right: "20px",
    bottom: "90px",
    width: "320px",
    maxHeight: "420px",
    background: "#fff",
    borderRadius: "16px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    display: "none",
    flexDirection: "column",
    overflow: "hidden",
    zIndex: 9999,
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  });

  panel.innerHTML = `
    <div style="padding: 10px 12px; background:#3f51b5; color:#fff; font-size:14px;">
      Voice assistant
    </div>
    <div id="ya-voice-log" style="padding: 8px 12px; font-size:13px; overflow-y:auto; flex:1; max-height:300px;">
      <div style="opacity:.7;">Нажмите на микрофон и задайте вопрос.</div>
    </div>
    <div style="padding: 8px 12px; border-top:1px solid #eee; display:flex; align-items:center; justify-content:space-between;">
      <button id="ya-voice-mic" style="
          width:40px;height:40px;border-radius:50%;border:none;
          background:#3f51b5;color:#fff;font-size:20px;cursor:pointer;
      ">🎙</button>
      <span id="ya-voice-status" style="font-size:12px; color:#555;">Ожидание…</span>
    </div>
  `;
  document.body.appendChild(panel);

  const logEl = panel.querySelector("#ya-voice-log");
  const micBtn = panel.querySelector("#ya-voice-mic");
  const statusEl = panel.querySelector("#ya-voice-status");

  let mediaRecorder = null;
  let chunks = [];
  let isRecording = false;

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.style.margin = "4px 0";
    div.innerHTML = `<strong>${role}:</strong> ${text}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // открыть/закрыть панель
  btn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Запись микрофона не поддерживается в этом браузере");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let options = {};
    if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
      options.mimeType = "audio/ogg;codecs=opus";
    }

    mediaRecorder = new MediaRecorder(stream, options);
    chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, {
        type: mediaRecorder.mimeType || "audio/ogg",
      });
      await sendAudio(blob);

      stream.getTracks().forEach((t) => t.stop());
      isRecording = false;
      micBtn.style.background = "#3f51b5";
      statusEl.textContent = "Ожидание…";
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.style.background = "#e53935";
    statusEl.textContent = "Запись… говорите";
  }

  async function sendAudio(blob) {
    statusEl.textContent = "Отправка и обработка…";

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);

      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audioBase64: base64 }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Backend error:", text);
        statusEl.textContent = "Ошибка на сервере";
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        console.error("App-level error:", data);
        statusEl.textContent = "Ошибка обработки";
        return;
      }

      addMessage("Вы", data.user_text);
      addMessage("Ассистент", data.answer_text);

      if (data.answer_audio_b64) {
        const byteChars = atob(data.answer_audio_b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const audioBlob = new Blob([byteArray], { type: "audio/mpeg" });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
      }

      statusEl.textContent = "Ожидание…";
    } catch (e) {
      console.error(e);
      statusEl.textContent = "Ошибка соединения";
    }
  }

  micBtn.addEventListener("click", async () => {
    if (!isRecording) {
      await startRecording();
    } else if (mediaRecorder) {
      mediaRecorder.stop();
    }
  });
})();

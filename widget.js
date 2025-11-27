// widget.js
(function () {
  const BACKEND_URL = "https://yc-assistant.netlify.app/netlify/functions/voice"; // <- подставьте свой URL

  const btn = document.createElement("button");
  btn.id = "ya-voice-launcher";
  btn.innerText = "🎤";
  Object.assign(btn.style, {
    position: "fixed", right: "20px", bottom: "20px",
    width: "56px", height: "56px", borderRadius: "50%",
    border: "none", background: "#3f51b5", color: "#fff",
    cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    zIndex: 9999, fontSize: "24px",
  });
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    right: "20px", bottom: "90px",
    width: "320px", maxHeight: "500px",
    background: "#fff", borderRadius: "16px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    display: "none", flexDirection: "column",
    overflow: "hidden", zIndex: 9999,
    fontFamily: "system-ui, sans-serif",
  });
  panel.innerHTML = `
    <div style="padding:10px 12px; background:#3f51b5; color:#fff; font-size:14px;">
      ГИД‑ассистент
    </div>
    <div id="ya-voice-log" style="padding:8px 12px; font-size:13px; overflow-y:auto; flex:1; max-height:300px;">
      <div style="opacity:.7;">Нажмите 🎙 и задайте вопрос или бронируйте экскурсию.</div>
    </div>
    <div id="ya-voice-controls" style="padding:8px 12px; border-top:1px solid #eee;">
      <button id="ya-voice-mic" style="
        width:40px; height:40px; border-radius:50%; border:none;
        background:#3f51b5; color:#fff; font-size:20px; cursor:pointer;
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

  btn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Микрофон не поддерживается");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = {};
    if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
      options.mimeType = "audio/ogg;codecs=opus";
    }
    mediaRecorder = new MediaRecorder(stream, options);
    chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/ogg" });
      await sendAudio(blob);
      stream.getTracks().forEach(t => t.stop());
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
    statusEl.textContent = "Обработка…";
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const audioBase64 = btoa(binary);

    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ audioBase64 })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Ошибка от сервера:", txt);
      statusEl.textContent = "Ошибка сервера";
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      console.error("Ошибка в ответе:", data);
      statusEl.textContent = "Ошибка обработки";
      return;
    }

    addMessage("Вы", data.user_text);
    addMessage("Гид‑ассистент", data.answer_text);

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
  }

  micBtn.addEventListener("click", async () => {
    if (!isRecording) await startRecording();
    else mediaRecorder.stop();
  });
})();

/* ==========================================================================
   یونیکالکت چت مینی · دستیار صوتی زنده (Vanilla JS خالص)
   ========================================================================== */
(function () {
  'use strict';

  const ROOT_PREFIX = document.body.getAttribute('data-root') || '../';
  const DEFAULT_KEY = 'sk-uc-7222f6a12db36a017b3e3d6ac8a6dc26';

  const vState = {
    mode: 'idle', // idle | listening | thinking | speaking
    baseUrl: '',
    publicKey: DEFAULT_KEY,
    history: [],
    recognition: null,
    micStream: null,
    audioCtx: null,
    analyser: null,
    rafId: 0,
    currentAudio: null,
    abortCtrl: null
  };

  const el = {
    orb: document.getElementById('voice-orb'),
    micBtn: document.getElementById('btn-orb-mic'),
    dot: document.getElementById('vs-dot'),
    label: document.getElementById('vs-label'),
    caption: document.getElementById('voice-live-caption'),
    handsfree: document.getElementById('vc-handsfree'),
    form: document.getElementById('voice-text-form'),
    input: document.getElementById('voice-text-input'),
    stopBtn: document.getElementById('btn-voice-stop'),
    clearBtn: document.getElementById('btn-voice-clear'),
    stream: document.getElementById('voice-stream'),
    empty: document.getElementById('voice-empty')
  };

  function setMode(mode, caption) {
    vState.mode = mode;
    if (el.orb) el.orb.setAttribute('data-state', mode);
    if (el.dot) el.dot.className = 'vs-dot ' + (mode === 'idle' ? '' : mode);
    const labels = {
      idle: 'آماده برای گفتگو',
      listening: 'در حال گوش دادن…',
      thinking: 'در حال پردازش و انتخاب مدل…',
      speaking: 'در حال صحبت کردن…'
    };
    if (el.label) el.label.textContent = labels[mode] || labels.idle;
    if (caption && el.caption) el.caption.textContent = caption;
    if (el.stopBtn) {
      const showStop = mode === 'speaking' || mode === 'thinking';
      el.stopBtn.hidden = !showStop;
      el.stopBtn.style.display = showStop ? '' : 'none';
    }
  }

  function isRtlText(s) {
    return /[\u0600-\u06FF]/.test(String(s || ''));
  }

  function cleanForSpeech(s) {
    return String(s || '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, ' ')
      .replace(/\\(?:frac|sqrt|sum|prod|int|mathbb|text|mathrm)\{([^{}]*)\}/g, '$1')
      .replace(/[*_`~#>$\\{}|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function resolveBackend() {
    if (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) {
      try {
        const r = await fetch('/api/v1/key', { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          vState.baseUrl = '';
          if (d.public_api_key) vState.publicKey = d.public_api_key;
          return '';
        }
      } catch (e) {}
    }
    const bust = '?t=' + Date.now();
    try {
      const r = await fetch(ROOT_PREFIX + 'api/links.json' + bust, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d.public_api_key) vState.publicKey = d.public_api_key;
        if (d.base_url) vState.baseUrl = String(d.base_url).replace(/\/+$/, '');
      }
    } catch (e) {}
    if (!vState.baseUrl) {
      try {
        const r2 = await fetch(ROOT_PREFIX + 'assets/status.json' + bust, { cache: 'no-store' });
        if (r2.ok) {
          const s = await r2.json();
          if (s.public_api_key) vState.publicKey = s.public_api_key;
          if (s.url_payload) vState.baseUrl = atob(s.url_payload).replace(/\/+$/, '');
        }
      } catch (e) {}
    }
    return vState.baseUrl;
  }

  function appendMsg(role, text, metaLabel, isMath) {
    if (!el.stream) return null;
    if (el.empty) { el.empty.hidden = true; el.empty.style.display = 'none'; }
    const wrap = document.createElement('div');
    wrap.className = 'v-msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'v-bubble';
    bubble.dir = isRtlText(text) ? 'rtl' : 'ltr';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    if (metaLabel) {
      const meta = document.createElement('div');
      meta.className = 'v-meta' + (isMath ? ' is-math' : '');
      meta.textContent = metaLabel;
      wrap.appendChild(meta);
    }
    el.stream.appendChild(wrap);
    el.stream.scrollTop = el.stream.scrollHeight;
    return { wrap: wrap, bubble: bubble };
  }

  function stopAudioAndRecognition() {
    if (vState.recognition) {
      try { vState.recognition.onend = null; vState.recognition.stop(); } catch (e) {}
      vState.recognition = null;
    }
    if (vState.rafId) { cancelAnimationFrame(vState.rafId); vState.rafId = 0; }
    if (el.orb) el.orb.style.setProperty('--orb-scale', '1');
    if (vState.currentAudio) {
      try { vState.currentAudio.pause(); vState.currentAudio.src = ''; } catch (e) {}
      vState.currentAudio = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    if (vState.abortCtrl) {
      try { vState.abortCtrl.abort(); } catch (e) {}
      vState.abortCtrl = null;
    }
  }

  async function ensureMicMeter() {
    if (vState.analyser || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      vState.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      vState.audioCtx = new Ctx();
      const src = vState.audioCtx.createMediaStreamSource(vState.micStream);
      vState.analyser = vState.audioCtx.createAnalyser();
      vState.analyser.fftSize = 64;
      src.connect(vState.analyser);
    } catch (e) {}
  }

  function pumpOrbMeter() {
    if (vState.mode !== 'listening' || !vState.analyser) return;
    const data = new Uint8Array(vState.analyser.frequencyBinCount);
    vState.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / Math.max(1, data.length);
    const scale = 1 + Math.min(0.65, avg / 95);
    if (el.orb) el.orb.style.setProperty('--orb-scale', scale.toFixed(3));
    vState.rafId = requestAnimationFrame(pumpOrbMeter);
  }

  async function speakText(rawText) {
    const clean = cleanForSpeech(rawText);
    if (!clean) return;
    setMode('speaking', 'در حال خواندن پاسخ…');

    const voice = isRtlText(clean) ? 'fa-IR-FaridNeural' : 'en-GB-RyanNeural';
    if (true) {
      try {
        const base = await resolveBackend();
        const headers = { 'Content-Type': 'application/json' };
        if (vState.publicKey) headers['X-API-Key'] = vState.publicKey;
        const r = await fetch(base + '/api/tts', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            text: clean,
            voice: voice,
            rate: '+0%'
          })
        });
        if (r.ok) {
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          await new Promise(function (resolve) {
            const audio = new Audio(url);
            vState.currentAudio = audio;
            audio.onended = function () { URL.revokeObjectURL(url); vState.currentAudio = null; resolve(); };
            audio.onerror = function () { URL.revokeObjectURL(url); vState.currentAudio = null; resolve(); };
            audio.play().catch(function () { resolve(); });
          });
          return;
        }
      } catch (e) {}
    }

    // Fallback to browser Web Speech API
    await new Promise(function (resolve) {
      if (!window.speechSynthesis) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = isRtlText(clean) ? 'fa-IR' : 'en-US';
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }

  async function sendVoiceTurn(userText) {
    const text = String(userText || "").trim();
    if (!text) return;
    stopAudioAndRecognition();
    appendMsg("user", text);
    setMode("thinking", "در حال پردازش و پاسخ زنده…");

    const ctrl = new AbortController();
    vState.abortCtrl = ctrl;
    let reply = "";
    let usedModel = "Unicollect Chat Mini";
    let isMath = false;
    let botEntry = null;

    // Live sentence-by-sentence TTS queue so voice starts immediately while streaming
    const ttsQueue = [];
    let spokenCursor = 0;
    let ttsRunning = false;
    let streamFinished = false;

    function ensureBotBubble(currentText) {
      if (!botEntry) {
        botEntry = appendMsg("bot", currentText || "…", usedModel, isMath);
      } else {
        botEntry.bubble.dir = isRtlText(currentText) ? "rtl" : "ltr";
        botEntry.bubble.textContent = currentText;
        if (el.stream) el.stream.scrollTop = el.stream.scrollHeight;
      }
      if (el.caption && currentText) {
        el.caption.dir = isRtlText(currentText) ? "rtl" : "ltr";
        el.caption.textContent = currentText.slice(-140);
      }
    }

    async function pumpTtsQueue() {
      if (ttsRunning) return;
      ttsRunning = true;
      while (ttsQueue.length && !ctrl.signal.aborted) {
        const sentence = ttsQueue.shift();
        if (sentence) await speakText(sentence);
      }
      ttsRunning = false;
      if (streamFinished && !ttsQueue.length && !ctrl.signal.aborted) {
        if (el.handsfree && el.handsfree.checked && vState.mode !== "idle") {
          startListening();
        } else {
          setMode("idle", "روی میکروفون بزنید و صحبت کنید…");
        }
      }
    }

    function enqueueReadySentences(forceAll) {
      const cleanAll = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
      if (!cleanAll) return;
      const pending = cleanAll.slice(spokenCursor);
      if (!pending) return;
      if (forceAll) {
        spokenCursor = cleanAll.length;
        ttsQueue.push(pending);
        pumpTtsQueue();
        return;
      }
      const m = pending.match(/^([\s\S]{12,}?[.!؟\n])\s*/);
      if (m) {
        spokenCursor += m[0].length;
        ttsQueue.push(m[1].trim());
        pumpTtsQueue();
      }
    }

    try {
      const base = await resolveBackend();
      const headers = { "Content-Type": "application/json" };
      if (vState.publicKey) headers["X-API-Key"] = vState.publicKey;
      const r = await fetch(base + "/api/chat/stream", {
        method: "POST",
        headers: headers,
        signal: ctrl.signal,
        body: JSON.stringify({
          message: text + "\n(پاسخ صوتی: کوتاه، روان و بدون مارک‌داون یا لیست طولانی پاسخ بده.)",
          history: vState.history.slice(-12)
        })
      });
      if (!r.ok || !r.body) throw new Error("HTTP " + r.status);

      const reader = r.body.getReader();
      const dec = new TextDecoder("utf-8");
      let buf = "";
      outer: while (true) {
        const res = await reader.read();
        if (res.done) break;
        buf += dec.decode(res.value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") break outer;
          let obj = null;
          try { obj = JSON.parse(payload); } catch (e) { continue; }
          if (obj && obj.meta && obj.meta.model) {
            usedModel = obj.meta.model;
            isMath = !!obj.meta.is_math;
          } else if (obj && typeof obj.t === "string" && obj.t) {
            reply += obj.t;
            const visible = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
            if (visible) {
              ensureBotBubble(visible);
              enqueueReadySentences(false);
            }
          }
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        appendMsg("bot", "ارتباط با سرور برقرار نشد؛ لطفاً وضعیت اتصال را بررسی کنید.");
      }
      setMode("idle", "روی میکروفون بزنید و صحبت کنید…");
      return;
    }

    streamFinished = true;
    const cleanDisplay = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim() || reply.trim();
    if (cleanDisplay) {
      ensureBotBubble(cleanDisplay);
      vState.history.push({ role: "user", content: text });
      vState.history.push({ role: "assistant", content: cleanDisplay });
      enqueueReadySentences(true);
    } else {
      setMode("idle", "روی میکروفون بزنید و صحبت کنید…");
    }
  }

  async function startListening() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMode('idle', 'مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند؛ از کادر متنی پایین استفاده کنید.');
      return;
    }
    stopAudioAndRecognition();
    await ensureMicMeter();

    const rec = new SpeechRec();
    rec.lang = (navigator.language && navigator.language.toLowerCase().startsWith('en')) ? 'en-US' : 'fa-IR';
    rec.interimResults = true;
    rec.continuous = false;
    vState.recognition = rec;

    let finalTranscript = '';
    setMode('listening', 'در حال گوش دادن… صحبت کنید');
    pumpOrbMeter();

    rec.onresult = function (evt) {
      let interim = '';
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const txt = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) finalTranscript += txt + ' ';
        else interim += txt;
      }
      const shown = (finalTranscript + interim).trim();
      if (shown && el.caption) {
        el.caption.dir = isRtlText(shown) ? 'rtl' : 'ltr';
        el.caption.textContent = shown;
      }
    };

    rec.onerror = function () {
      setMode('idle', 'صدایی دریافت نشد؛ دوباره روی میکروفون بزنید.');
    };

    rec.onend = function () {
      if (vState.rafId) { cancelAnimationFrame(vState.rafId); vState.rafId = 0; }
      if (el.orb) el.orb.style.setProperty('--orb-scale', '1');
      const spoken = finalTranscript.trim();
      if (spoken) {
        sendVoiceTurn(spoken);
      } else if (vState.mode === 'listening') {
        setMode('idle', 'روی میکروفون بزنید و صحبت کنید…');
      }
    };

    try { rec.start(); } catch (e) { setMode('idle'); }
  }

  if (el.micBtn) {
    el.micBtn.addEventListener('click', function () {
      if (vState.mode === 'idle') startListening();
      else {
        stopAudioAndRecognition();
        setMode('idle', 'متوقف شد؛ برای شروع دوباره کلیک کنید.');
      }
    });
  }

  if (el.stopBtn) {
    el.stopBtn.addEventListener('click', function () {
      stopAudioAndRecognition();
      setMode('idle', 'صدا متوقف شد.');
    });
  }

  if (el.clearBtn) {
    el.clearBtn.addEventListener('click', function () {
      stopAudioAndRecognition();
      vState.history = [];
      if (el.stream) {
        el.stream.innerHTML = '';
        if (el.empty) {
          el.empty.hidden = false;
          el.empty.style.display = '';
          el.stream.appendChild(el.empty);
        }
      }
      setMode('idle', 'گفتگو پاک شد؛ روی میکروفون بزنید.');
    });
  }

  if (el.form && el.input) {
    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      const val = el.input.value.trim();
      if (!val) return;
      el.input.value = '';
      sendVoiceTurn(val);
    });
  }
})();

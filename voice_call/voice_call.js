/*
 * Voice calls inside the chat window, shared by manager and manager_main.
 *
 * One voice WebSocket per page receives incoming calls and carries the
 * WebRTC signaling. Audio flows browser to browser (or through TURN); the
 * server only rings the callee and forwards descriptions and ICE candidates.
 * The call lives in the page: leaving the page asks for confirmation and,
 * if confirmed, ends the call.
 *
 * Config element:
 *   <div id="voiceCallConfig" hidden
 *        data-ws-auth-url="..." data-ice-url="..."
 *        data-slot="#voiceCallSlot"            (where the call card goes; floating card if absent)
 *        data-toggle="#supportWidgetToggle"     (optional: opens the chat panel on a call)
 *        data-panel="#supportWidgetPanel"></div>
 *
 * API: window.VoiceCall.start({kind, targetUserId, chatId, peerName}), window.VoiceCall.isBusy().
 * Event: "voicecall:change" on document, detail {busy}.
 */
(function () {
  "use strict";

  const config = document.getElementById("voiceCallConfig");
  if (!config || window.VoiceCall) {
    return;
  }

  const settings = {
    wsAuthUrl: config.dataset.wsAuthUrl || "",
    iceUrl: config.dataset.iceUrl || "",
    slot: config.dataset.slot || "",
    toggle: config.dataset.toggle || "",
    panel: config.dataset.panel || "",
  };

  const endMessages = {
    hangup: "A outra pessoa encerrou a chamada.",
    disconnected: "A conexão da outra pessoa caiu.",
    declined: "Chamada recusada.",
    busy: "A pessoa está ocupada em outra chamada.",
    no_microphone: "A outra pessoa não conseguiu usar o microfone.",
    missed: "Ninguém atendeu.",
    cancelled: "Chamada cancelada.",
  };

  const errorMessages = {
    already_in_call: "Você já está em outra chamada.",
    busy: "A pessoa está em outra chamada.",
    unavailable: "A pessoa não está conectada ao sistema agora.",
    attendant_unavailable: "O atendente não está disponível agora.",
    chat_unavailable: "O atendimento não está mais ativo.",
    not_attendant: "Somente o atendente deste chat pode ligar para o cliente.",
    disabled: "Chamadas de voz estão desativadas.",
    invalid_target: "Não é possível ligar para essa pessoa.",
    invalid_kind: "Chamada inválida.",
    call_not_found: "Esta chamada não existe mais.",
    call_not_ringing: "Esta chamada já foi atendida.",
    not_allowed: "Chamada não permitida.",
  };

  const phaseLabels = {
    preparing: "Ativando o microfone...",
    inviting: "Ligando...",
    ringing: "Chamando...",
    answering: "Atendendo...",
    connecting: "Conectando o áudio...",
    unstable: "Conexão instável, reconectando...",
    active: "Em chamada",
  };

  const state = {
    socket: null,
    authenticated: false,
    stopped: false,
    reconnectDelay: 2000,
    reconnectTimer: null,
    rings: new Map(),
    call: null,
    ended: null,
    endedTimer: null,
    peerConnection: null,
    localStream: null,
    iceServers: null,
    pendingCandidates: [],
    remoteDescriptionSet: false,
    connectedAt: 0,
    timer: null,
    muted: false,
    needsPlayClick: false,
    tone: null,
  };

  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.setAttribute("playsinline", "");
  audio.hidden = true;
  document.body.appendChild(audio);

  // ---------------------------------------------------------------- helpers

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0].toUpperCase()).join("") || "?";
  }

  function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function elapsedSeconds() {
    return state.connectedAt ? Math.floor((Date.now() - state.connectedAt) / 1000) : 0;
  }

  function send(payload) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "Falha na requisição.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  // ------------------------------------------------------------------ tones

  // Incoming: two 440+480 Hz bursts every 3 s. Outgoing ringback (Brazil):
  // 425 Hz, 1 s on, 4 s off. Browsers may block audio before any click.
  function startTone(kind) {
    if (state.tone && state.tone.kind === kind) {
      return;
    }
    stopTone();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    try {
      const context = new AudioContextClass();
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      const frequencies = kind === "incoming" ? [440, 480] : [425];
      frequencies.forEach((frequency) => {
        const oscillator = context.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
      });

      const level = kind === "incoming" ? 0.06 : 0.08;
      const play = () => {
        const now = context.currentTime;
        gain.gain.setValueAtTime(level, now);
        if (kind === "incoming") {
          gain.gain.setValueAtTime(0, now + 0.4);
          gain.gain.setValueAtTime(level, now + 0.6);
          gain.gain.setValueAtTime(0, now + 1.0);
        } else {
          gain.gain.setValueAtTime(0, now + 1.0);
        }
      };

      context.resume().catch(() => {});
      play();
      state.tone = { kind, context, interval: window.setInterval(play, kind === "incoming" ? 3000 : 5000) };
    } catch (error) {
      state.tone = null;
    }
  }

  function stopTone() {
    if (!state.tone) {
      return;
    }
    window.clearInterval(state.tone.interval);
    state.tone.context.close().catch(() => {});
    state.tone = null;
  }

  function updateTone() {
    if (state.call && state.call.phase === "ringing") {
      startTone("outgoing");
    } else if (!state.call && state.rings.size > 0) {
      startTone("incoming");
    } else {
      stopTone();
    }
  }

  // --------------------------------------------------------------- rendering

  function host() {
    const slot = settings.slot ? document.querySelector(settings.slot) : null;
    if (slot) {
      return slot;
    }

    let floating = document.getElementById("voiceCallFloating");
    if (!floating) {
      floating = document.createElement("div");
      floating.id = "voiceCallFloating";
      floating.className = "voice-call-floating";
      document.body.appendChild(floating);
    }
    return floating;
  }

  // Opens the chat panel so the call card is visible.
  function revealChat() {
    const panel = settings.panel ? document.querySelector(settings.panel) : null;
    const toggle = settings.toggle ? document.querySelector(settings.toggle) : null;
    if (panel && toggle && panel.hidden) {
      toggle.click();
    }
  }

  function ringCardHtml(ring) {
    const from = ring.from || {};
    return `
      <div class="voice-call-card" data-phase="incoming" role="alertdialog" aria-label="Chamada de voz de ${escapeHtml(from.name || "alguém")}">
        <span class="voice-call-card-avatar" aria-hidden="true"><i class="bi bi-telephone-inbound-fill"></i></span>
        <div class="voice-call-card-text">
          <strong class="voice-call-card-name">${escapeHtml(from.name || "Chamada de voz")}</strong>
          <span class="voice-call-card-status">${escapeHtml(ring.context || "Chamada de voz")}</span>
        </div>
        <div class="voice-call-card-actions">
          <button class="btn btn-success btn-sm" type="button" data-voice-action="answer" data-call-id="${escapeHtml(ring.call_id)}">
            <i class="bi bi-telephone-fill" aria-hidden="true"></i><span>Atender</span>
          </button>
          <button class="btn btn-outline-danger btn-sm" type="button" data-voice-action="decline" data-call-id="${escapeHtml(ring.call_id)}">
            <i class="bi bi-telephone-x-fill" aria-hidden="true"></i><span>Recusar</span>
          </button>
        </div>
      </div>
    `;
  }

  function callCardHtml(call) {
    const isActive = call.phase === "active" || call.phase === "unstable";
    const status = isActive
      ? `${escapeHtml(phaseLabels[call.phase])} · <span data-voice-call-timer>${formatDuration(elapsedSeconds())}</span>`
      : escapeHtml(phaseLabels[call.phase] || "");
    const hangupLabel = call.role === "caller" && !isActive && call.phase !== "connecting" ? "Cancelar chamada" : "Encerrar chamada";

    return `
      <div class="voice-call-card" data-phase="${escapeHtml(call.phase)}">
        <span class="voice-call-card-avatar" aria-hidden="true">${escapeHtml(initials(call.peerName))}</span>
        <div class="voice-call-card-text">
          <strong class="voice-call-card-name">${escapeHtml(call.peerName || "Chamada de voz")}</strong>
          <span class="voice-call-card-status" role="status" aria-live="polite">${status}</span>
        </div>
        <div class="voice-call-card-actions">
          ${state.needsPlayClick ? `
          <button class="btn btn-outline-primary btn-sm" type="button" data-voice-action="play">
            <i class="bi bi-volume-up-fill" aria-hidden="true"></i><span>Ativar áudio</span>
          </button>` : ""}
          <button class="voice-call-icon-button" type="button" data-voice-action="mute" aria-pressed="${state.muted ? "true" : "false"}"
            aria-label="${state.muted ? "Ativar microfone" : "Desativar microfone"}" title="${state.muted ? "Ativar microfone" : "Desativar microfone"}" ${isActive ? "" : "disabled"}>
            <i class="bi ${state.muted ? "bi-mic-mute-fill" : "bi-mic-fill"}" aria-hidden="true"></i>
          </button>
          <button class="voice-call-icon-button is-danger" type="button" data-voice-action="hangup" aria-label="${hangupLabel}" title="${hangupLabel}">
            <i class="bi bi-telephone-x-fill" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }

  function endedCardHtml(ended) {
    return `
      <div class="voice-call-card" data-phase="ended" role="status">
        <span class="voice-call-card-avatar" aria-hidden="true"><i class="bi ${ended.isError ? "bi-exclamation-lg" : "bi-telephone"}"></i></span>
        <div class="voice-call-card-text">
          <strong class="voice-call-card-name">${escapeHtml(ended.peerName || "Chamada de voz")}</strong>
          <span class="voice-call-card-status">${escapeHtml(ended.message)}</span>
        </div>
        <div class="voice-call-card-actions">
          <button class="btn-close" type="button" data-voice-action="dismiss" aria-label="Fechar aviso"></button>
        </div>
      </div>
    `;
  }

  function render() {
    let html = "";
    if (state.call) {
      html = callCardHtml(state.call);
    } else {
      state.rings.forEach((ring) => {
        html += ringCardHtml(ring);
      });
      if (!html && state.ended) {
        html = endedCardHtml(state.ended);
      }
    }

    const target = host();
    const floating = document.getElementById("voiceCallFloating");
    if (floating && floating !== target) {
      floating.innerHTML = "";
    }
    target.innerHTML = html;

    const live = Boolean(state.call) || state.rings.size > 0;
    const toggle = settings.toggle ? document.querySelector(settings.toggle) : null;
    if (toggle) {
      toggle.classList.toggle("voice-call-live", live);
    }

    updateTone();
    document.dispatchEvent(new CustomEvent("voicecall:change", { detail: { busy: Boolean(state.call) } }));
  }

  function showEnded(message, isError, peerName) {
    window.clearTimeout(state.endedTimer);
    state.ended = { message, isError, peerName };
    state.endedTimer = window.setTimeout(() => {
      state.ended = null;
      render();
    }, isError ? 9000 : 5000);
  }

  // ------------------------------------------------------------------ media

  function microphoneErrorMessage(error) {
    const name = error && error.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Permita o uso do microfone para fazer a chamada.";
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return "Nenhum microfone foi encontrado neste dispositivo.";
    }
    if (name === "NotReadableError") {
      return "O microfone está sendo usado por outro programa.";
    }
    return "Não foi possível acessar o microfone.";
  }

  // Returns an error message, or "" when the microphone is ready.
  async function prepareMedia() {
    if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return window.isSecureContext === false
        ? "Chamadas de voz exigem uma conexão segura (HTTPS)."
        : "Este navegador não suporta chamadas de voz.";
    }

    const icePromise = state.iceServers !== null || !settings.iceUrl
      ? Promise.resolve(state.iceServers || [])
      : fetchJson(settings.iceUrl).then((payload) => payload.iceServers || []).catch(() => []);

    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (error) {
      return microphoneErrorMessage(error);
    }

    // TURN credentials expire; fetch fresh ones for every call.
    state.iceServers = await icePromise;
    return "";
  }

  function createPeerConnection() {
    if (state.peerConnection) {
      return state.peerConnection;
    }

    const peerConnection = new RTCPeerConnection({ iceServers: state.iceServers || [] });
    state.localStream.getTracks().forEach((track) => peerConnection.addTrack(track, state.localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && state.call) {
        send({ type: "rtc_signal", call_id: state.call.id, data: { candidate: event.candidate.toJSON() } });
      }
    };

    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      audio.srcObject = stream || new MediaStream([event.track]);
      audio.play().then(() => {
        state.needsPlayClick = false;
      }).catch(() => {
        state.needsPlayClick = true;
        render();
      });
    };

    const onStateChange = () => {
      if (!state.call || state.peerConnection !== peerConnection) {
        return;
      }
      const connectionState = peerConnection.connectionState || peerConnection.iceConnectionState;
      if (connectionState === "connected" || connectionState === "completed") {
        markConnected();
      } else if (connectionState === "disconnected" && state.call.phase === "active") {
        state.call.phase = "unstable";
        render();
      } else if (connectionState === "failed") {
        send({ type: "call_hangup", call_id: state.call.id });
        endCall("Não foi possível conectar o áudio. A rede pode estar bloqueando a chamada.", true);
      }
    };
    peerConnection.onconnectionstatechange = onStateChange;
    peerConnection.oniceconnectionstatechange = onStateChange;

    state.peerConnection = peerConnection;
    return peerConnection;
  }

  async function addCandidate(candidate) {
    try {
      await state.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      // A candidate the browser cannot use is not fatal; others may connect.
    }
  }

  async function handleSignal(data) {
    const peerConnection = createPeerConnection();

    if (data.description) {
      await peerConnection.setRemoteDescription(data.description);
      state.remoteDescriptionSet = true;
      const queued = state.pendingCandidates.splice(0);
      for (const candidate of queued) {
        await addCandidate(candidate);
      }

      if (data.description.type === "offer") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        send({ type: "rtc_signal", call_id: state.call.id, data: { description: peerConnection.localDescription } });
      }
      return;
    }

    if (data.candidate) {
      if (state.remoteDescriptionSet) {
        await addCandidate(data.candidate);
      } else {
        state.pendingCandidates.push(data.candidate);
      }
    }
  }

  async function sendOffer() {
    const peerConnection = createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    send({ type: "rtc_signal", call_id: state.call.id, data: { description: peerConnection.localDescription } });
  }

  function markConnected() {
    if (!state.call) {
      return;
    }

    const wasActive = state.call.phase === "active";
    state.call.phase = "active";
    if (!state.connectedAt) {
      state.connectedAt = Date.now();
      state.timer = window.setInterval(() => {
        const timer = host().querySelector("[data-voice-call-timer]");
        if (timer) {
          timer.textContent = formatDuration(elapsedSeconds());
        }
      }, 1000);
    }
    if (!wasActive) {
      render();
    }
  }

  function releaseMedia() {
    window.clearInterval(state.timer);
    state.timer = null;
    if (state.peerConnection) {
      state.peerConnection.close();
    }
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
    }
    audio.srcObject = null;
    state.peerConnection = null;
    state.localStream = null;
    state.pendingCandidates = [];
    state.remoteDescriptionSet = false;
    state.connectedAt = 0;
    state.muted = false;
    state.needsPlayClick = false;
    state.iceServers = null;
  }

  function endCall(message, isError) {
    if (!state.call) {
      return;
    }

    const duration = state.connectedAt ? " Duração: " + formatDuration(elapsedSeconds()) + "." : "";
    const peerName = state.call.peerName;
    releaseMedia();
    state.call = null;
    showEnded(message + duration, isError, peerName);
    render();
  }

  // ---------------------------------------------------------------- actions

  async function startCall(options) {
    const settingsForCall = options || {};

    if (state.call) {
      showEnded("Você já está em uma chamada.", true, state.call.peerName);
      render();
      return false;
    }

    if (!state.authenticated) {
      showEnded("Conectando ao servidor de chamadas. Tente de novo em instantes.", true, settingsForCall.peerName);
      render();
      return false;
    }

    state.call = {
      id: "",
      role: "caller",
      phase: "preparing",
      kind: settingsForCall.kind,
      chatId: Number(settingsForCall.chatId || 0),
      peerName: settingsForCall.peerName || "",
    };
    state.ended = null;
    revealChat();
    render();

    const microphoneError = await prepareMedia();
    if (!state.call) {
      releaseMedia();
      return false;
    }
    if (microphoneError) {
      endCall(microphoneError, true);
      return false;
    }

    state.call.phase = "inviting";
    render();
    send({
      type: "call_invite",
      kind: settingsForCall.kind,
      target_user_id: Number(settingsForCall.targetUserId || 0),
      chat_id: Number(settingsForCall.chatId || 0),
    });
    return true;
  }

  async function answer(callId) {
    const ring = state.rings.get(callId);
    if (!ring || state.call) {
      return;
    }

    state.rings.delete(callId);
    state.call = {
      id: callId,
      role: "callee",
      phase: "answering",
      kind: ring.kind,
      chatId: Number(ring.chat_id || 0),
      peerName: (ring.from && ring.from.name) || "",
    };
    state.ended = null;
    render();

    const microphoneError = await prepareMedia();
    if (!state.call) {
      releaseMedia();
      return;
    }
    if (microphoneError) {
      send({ type: "call_reject", call_id: callId, reason: "no_microphone" });
      endCall(microphoneError, true);
      return;
    }

    send({ type: "call_accept", call_id: callId });
  }

  function decline(callId) {
    send({ type: "call_reject", call_id: callId, reason: "declined" });
    state.rings.delete(callId);
    render();
  }

  function hangup() {
    if (!state.call) {
      return;
    }
    if (state.call.id) {
      send({ type: "call_hangup", call_id: state.call.id });
    }
    endCall(state.call.phase === "active" || state.call.phase === "unstable" ? "Chamada encerrada." : "Chamada cancelada.", false);
  }

  function toggleMute() {
    if (!state.localStream) {
      return;
    }
    state.muted = !state.muted;
    state.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !state.muted;
    });
    render();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-voice-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.voiceAction;
    const callId = button.dataset.callId || "";

    if (action === "answer") {
      answer(callId);
    } else if (action === "decline") {
      decline(callId);
    } else if (action === "hangup") {
      hangup();
    } else if (action === "mute") {
      toggleMute();
    } else if (action === "play") {
      audio.play().then(() => {
        state.needsPlayClick = false;
        render();
      }).catch(() => {});
    } else if (action === "dismiss") {
      window.clearTimeout(state.endedTimer);
      state.ended = null;
      render();
    }
  });

  // --------------------------------------------------------------- protocol

  function isCurrentCall(callId) {
    return Boolean(state.call) && state.call.id !== "" && state.call.id === callId;
  }

  async function handleMessage(payload) {
    switch (payload.type) {
      case "auth_ok":
        state.authenticated = true;
        state.reconnectDelay = 2000;
        return;

      case "call_ringing":
        if (isCurrentCall(payload.call_id) || state.rings.has(payload.call_id)) {
          return;
        }
        state.rings.set(payload.call_id, payload);
        window.setTimeout(() => {
          if (state.rings.delete(payload.call_id)) {
            render();
          }
        }, (Math.max(5, Number(payload.expires_in || 45)) + 2) * 1000);
        revealChat();
        render();
        return;

      case "call_ring_stop":
        if (state.rings.delete(payload.call_id)) {
          render();
        }
        return;

      case "call_created":
        if (state.call && state.call.role === "caller" && state.call.id === "") {
          state.call.id = payload.call_id;
          state.call.phase = "ringing";
          state.call.peerName = (payload.peer && payload.peer.name) || state.call.peerName;
          render();
        }
        return;

      case "call_accepted":
        if (isCurrentCall(payload.call_id)) {
          state.call.phase = "connecting";
          render();
          await sendOffer();
        }
        return;

      case "call_joined":
        if (isCurrentCall(payload.call_id)) {
          state.call.phase = "connecting";
          state.call.peerName = (payload.peer && payload.peer.name) || state.call.peerName;
          createPeerConnection();
          render();
        }
        return;

      case "rtc_signal":
        if (isCurrentCall(payload.call_id) && payload.data) {
          await handleSignal(payload.data);
        }
        return;

      case "call_ended":
        if (isCurrentCall(payload.call_id)) {
          endCall(endMessages[payload.reason] || "Chamada encerrada.", payload.reason !== "hangup");
        }
        return;

      case "call_error":
        if (!state.call || payload.code === "invalid_signal") {
          return;
        }
        if (payload.call_id === "" || payload.call_id === state.call.id) {
          endCall(errorMessages[payload.code] || payload.message || "Não foi possível completar a chamada.", true);
        }
        return;

      default:
        return;
    }
  }

  function scheduleReconnect() {
    if (state.stopped || state.reconnectTimer) {
      return;
    }
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
  }

  async function connect() {
    let auth;
    try {
      auth = await fetchJson(settings.wsAuthUrl);
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 409) {
        // Logged out, no access or feature disabled: stop trying on this page.
        state.stopped = true;
        return;
      }
      scheduleReconnect();
      return;
    }

    const socket = new WebSocket(auth.websocketUrl);
    state.socket = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "authenticate", token: auth.token }));
    };

    socket.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      handleMessage(payload).catch(() => {
        if (state.call) {
          send({ type: "call_hangup", call_id: state.call.id });
          endCall("Falha ao negociar o áudio da chamada.", true);
        }
      });
    };

    socket.onclose = () => {
      if (state.socket !== socket) {
        return;
      }
      state.socket = null;
      state.authenticated = false;
      state.rings.clear();
      if (state.call) {
        endCall("A conexão com o servidor de chamadas caiu.", true);
      } else {
        render();
      }
      scheduleReconnect();
    };
  }

  // Leaving the page drops the call: ask first. The server ends the call
  // for the other person when this socket closes.
  window.addEventListener("beforeunload", (event) => {
    if (state.call) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  window.addEventListener("pagehide", () => {
    if (state.call && state.call.id) {
      send({ type: "call_hangup", call_id: state.call.id });
    }
  });

  window.VoiceCall = {
    enabled: true,
    start: startCall,
    isBusy() {
      return Boolean(state.call);
    },
  };

  if (settings.wsAuthUrl) {
    connect();
  }
})();

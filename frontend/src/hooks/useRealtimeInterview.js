import { useCallback, useRef, useState } from "react";
import { createRealtimeToken, completeInterview, reportRealtimeUsage, uploadWhiteboardSubmission } from "../lib/api.js";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const END_INTERVIEW_TOOL_NAME = "end_interview";
// Kept in sync with backend/src/services/openaiRealtime.service.js's
// SET_CURRENT_QUESTION_TOOL_NAME.
const SET_CURRENT_QUESTION_TOOL_NAME = "set_current_question";
// How long to wait after the data channel opens before nudging the model to
// start speaking, so we don't sit in silence waiting for the candidate's voice.
const GREETING_KICKOFF_DELAY_MS = 1500;
// How long to wait before nudging the model to respond to a text submission
// that came in while it was already speaking, so we don't talk over it.
const TEXT_RESPONSE_DELAY_WHILE_SPEAKING_MS = 2000;

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function micLog(...args) {
  console.log("[mic-interview]", ...args);
}

function reportRealtimeTurn(event, interviewId) {
  const response = event?.response || {};
  const rawStatus = typeof response.status === "string" ? response.status : "";
  let status = "success";
  if (event?.type === "response.cancelled" || rawStatus === "cancelled") status = "cancelled";
  else if (event?.type === "response.failed" || rawStatus === "failed" || rawStatus === "incomplete") status = "failed";
  const errorMessage = response.status_details?.error?.message || response.status_details?.reason || "";
  reportRealtimeUsage({
    model: typeof response.model === "string" ? response.model : undefined,
    status,
    usage: response.usage && typeof response.usage === "object" ? response.usage : null,
    interviewId,
    serviceTier: typeof response.service_tier === "string" ? response.service_tier : undefined,
    errorMessage: typeof errorMessage === "string" ? errorMessage : "",
  }).catch((err) => {
    console.error("Failed to record realtime usage:", err);
  });
}

export function useRealtimeInterview(interview) {
  const [status, setStatus] = useState("idle"); // idle | connecting | active | ending | ended | error
  const [errorMessage, setErrorMessage] = useState("");
  const [transcript, setTranscript] = useState([]);
  const [speakingSide, setSpeakingSide] = useState(null); // 'user' | 'assistant' | null
  const [questionIndex, setQuestionIndex] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micVolume, setMicVolume] = useState(0);
  // In-memory only (not part of `transcript`/persisted DB blob) - the full
  // compressed image is kept here just for this session's history panel so
  // the JSONB transcript column sent to the backend doesn't get bloated with
  // ~1-2MB images. The real, durable copy lives in the whiteboard_submissions
  // table (see uploadWhiteboardSubmission), which the Results page reads from.
  const [whiteboardHistory, setWhiteboardHistory] = useState([]);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const streamRef = useRef(null);
  const audioElRef = useRef(null);
  const transcriptRef = useRef([]);
  const endedRef = useRef(false);
  const pendingEndReasonRef = useRef(null);
  const endFallbackTimeoutRef = useRef(null);
  const assistantHasSpokenRef = useRef(false);
  const speakingSideRef = useRef(null);
  const questionIndexRef = useRef(0);
  const micEnabledRef = useRef(true);
  const micAudioCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const micRafRef = useRef(null);
  const recoverMicRef = useRef(async () => {});
  // If the candidate submits text while the assistant is mid-speech, the item
  // is still sent immediately (never blocked) - we just delay the
  // response.create nudge by a couple seconds so we don't talk over it.
  const pendingTextResponseTimeoutRef = useRef(null);
  // Tracks whether the server currently has an in-flight response, so we
  // never send response.create while one is already active (the API
  // rejects that with conversation_already_has_active_response, which was
  // silently swallowing the mic/response flow).
  const activeResponseRef = useRef(false);
  const responseRequestQueuedRef = useRef(false);
  const interviewIdRef = useRef(interview?.id);
  interviewIdRef.current = interview?.id;

  const updateSpeakingSide = useCallback((next) => {
    setSpeakingSide((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      speakingSideRef.current = value;
      return value;
    });
  }, []);

  const stopMicAnalyser = useCallback(() => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    micRafRef.current = null;
    micAudioCtxRef.current?.close().catch(() => {});
    micAudioCtxRef.current = null;
    micAnalyserRef.current = null;
    setMicVolume(0);
  }, []);

  // Live input-level meter for the "You" avatar's circular ring, reusing the
  // same stream that's already being sent over the peer connection (no extra
  // getUserMedia call needed).
  const attachMicAnalyser = useCallback(
    (stream) => {
      stopMicAnalyser();
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        micAudioCtxRef.current = audioCtx;
        micAnalyserRef.current = analyser;

        const tick = () => {
          const analyserNode = micAnalyserRef.current;
          if (!analyserNode) return;
          const data = new Uint8Array(analyserNode.frequencyBinCount);
          analyserNode.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i += 1) {
            const centered = (data[i] - 128) / 128;
            sumSquares += centered * centered;
          }
          const rms = Math.sqrt(sumSquares / data.length);
          setMicVolume(micEnabledRef.current ? Math.min(1, rms * 4) : 0);
          micRafRef.current = requestAnimationFrame(tick);
        };
        micRafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        console.error("Failed to set up mic level meter:", err);
      }
    },
    [stopMicAnalyser]
  );

  // Self-healing: if the mic track ends unexpectedly (device hiccup, OS-level
  // reclaim, etc - the reported cause of the mic "randomly stopping"), grab a
  // fresh stream and swap it into the existing peer connection without a full
  // renegotiation, instead of leaving the candidate silently unheard.
  const recoverMic = useCallback(async () => {
    if (!pcRef.current) return;
    try {
      micLog("attempting to recover microphone stream");
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const newTrack = newStream.getAudioTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === "audio");
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = newStream;
      if (newTrack) {
        newTrack.enabled = micEnabledRef.current;
        newTrack.addEventListener("ended", () => recoverMicRef.current());
      }
      attachMicAnalyser(newStream);
      micLog("microphone recovered");
    } catch (err) {
      console.error("Failed to recover microphone:", err);
      setErrorMessage("Lost microphone access and couldn't reconnect. Check your mic, then reload to retry.");
    }
  }, [attachMicAnalyser]);
  recoverMicRef.current = recoverMic;

  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => {
      const next = !prev;
      micEnabledRef.current = next;
      streamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
      if (!next) setMicVolume(0);
      return next;
    });
  }, []);

  const appendOrUpdate = useCallback((entry) => {
    setTranscript((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      let next;
      if (idx === -1) {
        next = [...prev, entry];
      } else {
        next = [...prev];
        next[idx] = { ...next[idx], ...entry };
      }
      transcriptRef.current = next;
      return next;
    });
  }, []);

  // conversation.item.created/added events fire in true chronological order,
  // before the transcript text for that item is available. Reserve the slot
  // here so later delta/completed events only fill in text without reordering.
  const ensureItemOrder = useCallback((id, role) => {
    setTranscript((prev) => {
      if (prev.some((e) => e.id === id)) return prev;
      const next = [...prev, { id, role, text: "", final: false, timestamp: new Date().toISOString() }];
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    if (pendingTextResponseTimeoutRef.current) {
      clearTimeout(pendingTextResponseTimeoutRef.current);
      pendingTextResponseTimeoutRef.current = null;
    }
    stopMicAnalyser();
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
  }, [stopMicAnalyser]);

  const finishInterview = useCallback(
    async (endedReason) => {
      if (endedRef.current) return;
      endedRef.current = true;
      if (endFallbackTimeoutRef.current) {
        clearTimeout(endFallbackTimeoutRef.current);
        endFallbackTimeoutRef.current = null;
      }
      pendingEndReasonRef.current = null;
      setStatus("ending");
      setSpeakingSide(null);
      cleanup();
      try {
        await completeInterview({
          interviewId: interview.id,
          transcript: transcriptRef.current,
          endedReason,
        });
      } catch (err) {
        console.error("Failed to report interview completion:", err);
      } finally {
        setStatus("ended");
      }
    },
    [cleanup, interview?.id]
  );

  const sendEvent = useCallback((event) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify(event));
    }
  }, []);

  // Guarded response.create: the Realtime API errors with
  // conversation_already_has_active_response if we ask for a new response
  // while one is still in flight (e.g. greeting kickoff racing a
  // VAD-triggered auto-response, or a text submission arriving mid-speech).
  // Instead of firing blindly, queue the request and flush it once
  // response.done tells us the previous response has finished.
  const requestResponse = useCallback(() => {
    if (activeResponseRef.current) {
      micLog("response already active, queueing response.create");
      responseRequestQueuedRef.current = true;
      return;
    }
    // Mark active optimistically (before the server round-trips
    // "response.created" back to us) so that a second call to
    // requestResponse() firing in that same window - e.g. server-side VAD
    // auto-creating a response right as our own greeting/tool-call nudge
    // fires - gets queued instead of also sending response.create and
    // triggering conversation_already_has_active_response.
    activeResponseRef.current = true;
    sendEvent({ type: "response.create" });
  }, [sendEvent]);

  const handleServerEvent = useCallback(
    (event) => {
      switch (event.type) {
        case "input_audio_buffer.speech_started":
          micLog("input_audio_buffer.speech_started (user started speaking)");
          updateSpeakingSide("user");
          break;
        case "input_audio_buffer.speech_stopped":
          micLog("input_audio_buffer.speech_stopped (user stopped speaking)");
          updateSpeakingSide((side) => (side === "user" ? null : side));
          break;
        case "input_audio_buffer.committed":
          micLog("input_audio_buffer.committed");
          break;

        case "response.created":
          activeResponseRef.current = true;
          break;

        case "response.done":
        case "response.cancelled":
        case "response.failed":
          reportRealtimeTurn(event, interviewIdRef.current);
          activeResponseRef.current = false;
          if (responseRequestQueuedRef.current) {
            responseRequestQueuedRef.current = false;
            micLog(`${event.type} - flushing queued response.create`);
            sendEvent({ type: "response.create" });
          }
          break;
        case "output_audio_buffer.started":
          micLog("output_audio_buffer.started (assistant started speaking)");
          assistantHasSpokenRef.current = true;
          updateSpeakingSide("assistant");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          micLog(`${event.type} (assistant stopped speaking)`);
          updateSpeakingSide((side) => (side === "assistant" ? null : side));
          if (pendingEndReasonRef.current) {
            const reason = pendingEndReasonRef.current;
            pendingEndReasonRef.current = null;
            if (endFallbackTimeoutRef.current) {
              clearTimeout(endFallbackTimeoutRef.current);
              endFallbackTimeoutRef.current = null;
            }
            console.log("tool end reason  ->", reason);
            // Give the audio element a moment to flush the last bit of
            // buffered audio before tearing down the connection.
            setTimeout(() => finishInterview(reason), 400);
          }
          break;

        case "conversation.item.created":
        case "conversation.item.added": {
          const item = event.item;
          if (item?.type === "message" && (item.role === "user" || item.role === "assistant")) {
            const id = item.role === "assistant" ? `assistant-${item.id}` : item.id;
            ensureItemOrder(id, item.role);
          }
          break;
        }

        case "conversation.item.input_audio_transcription.completed":
          appendOrUpdate({
            id: event.item_id || makeId(),
            role: "user",
            text: event.transcript || "",
            final: true,
            timestamp: new Date().toISOString(),
          });
          break;

        case "response.output_audio_transcript.delta": {
          const id = `assistant-${event.item_id}`;
          const prevEntry = transcriptRef.current.find((e) => e.id === id);
          appendOrUpdate({
            id,
            role: "assistant",
            text: (prevEntry?.text || "") + (event.delta || ""),
            final: false,
            timestamp: prevEntry?.timestamp || new Date().toISOString(),
          });
          break;
        }
        case "response.output_audio_transcript.done": {
          const id = `assistant-${event.item_id}`;
          appendOrUpdate({
            id,
            role: "assistant",
            text: event.transcript || "",
            final: true,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case "response.function_call_arguments.done":
          if (event.name === END_INTERVIEW_TOOL_NAME) {
            console.log("end_interview tool called", event.name);
            sendEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.call_id,
                output: JSON.stringify({ acknowledged: true }),
              },
            });
            // Don't end immediately: the assistant's closing remark audio may
            // still be streaming/playing. Wait for output_audio_buffer.stopped
            // (fired when playback actually finishes) before ending, with a
            // fallback timeout in case that event never arrives.
            pendingEndReasonRef.current = "model_completed";
            endFallbackTimeoutRef.current = setTimeout(() => {
              if (pendingEndReasonRef.current) {
                pendingEndReasonRef.current = null;
                finishInterview("model_completed");
              }
            }, 8000);
          } else if (event.name === SET_CURRENT_QUESTION_TOOL_NAME) {
            console.log("set_current_question tool called", event.name);
            let questionNumber = null;
            try {
              questionNumber = JSON.parse(event.arguments || "{}").questionNumber;
            } catch (err) {
              console.error("Failed to parse set_current_question arguments:", err);
            }
            sendEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.call_id,
                output: JSON.stringify({ acknowledged: true }),
              },
            });
            if (Number.isFinite(questionNumber)) {
              // Model speaks in 1-based question numbers (matching the
              // numbered list in its instructions); the app's questionIndex
              // and DB order_index are 0-based.
              const nextIndex = Math.max(0, Math.round(questionNumber) - 1);
              micLog(`${SET_CURRENT_QUESTION_TOOL_NAME} -> questionNumber=${questionNumber} (index=${nextIndex})`);
              questionIndexRef.current = nextIndex;
              setQuestionIndex(nextIndex);
            }
            // Calling a function ends the response that produced it (the
            // Realtime API always stops a response right after a function
            // call so we get a chance to supply its output). Since this tool
            // is called *before* the model has spoken the next question, we
            // must explicitly nudge it to continue - otherwise it silently
            // sits idle until the candidate happens to speak and triggers
            // VAD's auto-response, which looked like the model "stopping".
            requestResponse();
          }
          break;

        case "error":
          console.error("Realtime error event:", event.error);
          setErrorMessage(event.error?.message || "The interview session reported an error.");
          break;

        default:
          break;
      }
    },
    [appendOrUpdate, ensureItemOrder, finishInterview, requestResponse, sendEvent, updateSpeakingSide]
  );

  const submitText = useCallback(
    (text, language) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return false;
      if (!dcRef.current || dcRef.current.readyState !== "open") return false;

      // Wrap as a fenced code block when a language is selected so the
      // model can clearly tell it's code rather than plain spoken-style text.
      const messageText = language?.grammar ? `\`\`\`${language.grammar}\n${trimmed}\n\`\`\`` : trimmed;

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: messageText }],
        },
      });

      appendOrUpdate({
        id: `text-${makeId()}`,
        role: "user",
        text: trimmed,
        kind: "text",
        language: language?.label || null,
        // Which planned question was active when this was sent, so the
        // results page can show it alongside the matching question.
        questionOrderIndex: Math.max(0, questionIndexRef.current),
        final: true,
        timestamp: new Date().toISOString(),
      });

      if (pendingTextResponseTimeoutRef.current) {
        clearTimeout(pendingTextResponseTimeoutRef.current);
        pendingTextResponseTimeoutRef.current = null;
      }

      if (speakingSideRef.current === "assistant") {
        // Never block sending - the item above is already in the
        // conversation. Just delay the nudge to respond so we don't
        // interrupt the assistant's current speech.
        pendingTextResponseTimeoutRef.current = setTimeout(() => {
          pendingTextResponseTimeoutRef.current = null;
          requestResponse();
        }, TEXT_RESPONSE_DELAY_WHILE_SPEAKING_MS);
      } else {
        requestResponse();
      }
      return true;
    },
    [appendOrUpdate, requestResponse, sendEvent]
  );

  const submitWhiteboard = useCallback(
    async (imageDataUrl, sizeBytes) => {
      if (!imageDataUrl) return false;
      if (!dcRef.current || dcRef.current.readyState !== "open") return false;

      const questionOrderIndex = Math.max(0, questionIndexRef.current);
      const timestamp = new Date().toISOString();

      // Send straight to the model over the data channel - a short text note
      // plus the image in the same message, so the model knows to treat it
      // as a whiteboard/diagram answer rather than an arbitrary photo.
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "I've drawn this on the whiteboard as my answer:" },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      });

      const localId = `whiteboard-${makeId()}`;
      appendOrUpdate({
        id: localId,
        role: "user",
        text: "Submitted a whiteboard drawing.",
        kind: "whiteboard",
        questionOrderIndex,
        submissionId: null,
        final: true,
        timestamp,
      });

      setWhiteboardHistory((prev) => [
        ...prev,
        { id: localId, dataUrl: imageDataUrl, sizeBytes, questionOrderIndex, timestamp },
      ]);

      if (pendingTextResponseTimeoutRef.current) {
        clearTimeout(pendingTextResponseTimeoutRef.current);
        pendingTextResponseTimeoutRef.current = null;
      }
      if (speakingSideRef.current === "assistant") {
        pendingTextResponseTimeoutRef.current = setTimeout(() => {
          pendingTextResponseTimeoutRef.current = null;
          requestResponse();
        }, TEXT_RESPONSE_DELAY_WHILE_SPEAKING_MS);
      } else {
        requestResponse();
      }

      // Best-effort persistence to the DB for later viewing on the Results
      // page - doesn't block or fail the realtime submission above if it
      // errors (e.g. flaky network), since the model already has the image.
      try {
        const { submission } = await uploadWhiteboardSubmission(interview.id, imageDataUrl, questionOrderIndex);
        appendOrUpdate({ id: localId, submissionId: submission.id });
      } catch (err) {
        console.error("Failed to persist whiteboard submission:", err);
      }

      return true;
    },
    [appendOrUpdate, interview?.id, requestResponse, sendEvent]
  );

  const start = useCallback(async () => {
    if (!interview) return;
    setStatus("connecting");
    setErrorMessage("");
    endedRef.current = false;
    pendingEndReasonRef.current = null;
    assistantHasSpokenRef.current = false;
    speakingSideRef.current = null;
    questionIndexRef.current = 0;
    activeResponseRef.current = false;
    responseRequestQueuedRef.current = false;
    micEnabledRef.current = true;
    setMicEnabled(true);
    if (endFallbackTimeoutRef.current) {
      clearTimeout(endFallbackTimeoutRef.current);
      endFallbackTimeoutRef.current = null;
    }
    if (pendingTextResponseTimeoutRef.current) {
      clearTimeout(pendingTextResponseTimeoutRef.current);
      pendingTextResponseTimeoutRef.current = null;
    }

    try {
      const { clientSecret } = await createRealtimeToken(interview.id);
      const ephemeralKey = clientSecret.value;
      //  ## 1)  create a peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // Explicit constraints (not just `{ audio: true }`) so echo cancellation
      // is guaranteed on: without it, the assistant's own voice playing out of
      // the speakers can leak back into the mic and confuse the server's VAD
      // into thinking the candidate is talking over themselves, or drown out
      // real speech right when barge-in matters most.

      // ## 2) get the user media 
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      micLog(
        "mic stream acquired",
        stream.getAudioTracks().map((t) => ({ label: t.label, readyState: t.readyState, muted: t.muted }))
      );
      // ## 3) add the user media to the peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        track.enabled = micEnabledRef.current;
        track.addEventListener("ended", () => {
          micLog("mic track ended unexpectedly", track.label);
          recoverMicRef.current();
        });
        track.addEventListener("mute", () => micLog("mic track muted", track.label));
        track.addEventListener("unmute", () => micLog("mic track unmuted", track.label));
      });
      attachMicAnalyser(stream);
      // ## 4) create a data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      // ## 5) handle the server events
      dc.addEventListener("message", (e) => {
        try {
          handleServerEvent(JSON.parse(e.data));
        } catch (err) {
          console.error("Failed to parse realtime event:", err);
        }
      });
      // ## 6) handle the data channel open event
      dc.addEventListener("open", () => {
        setStatus("active");
        micLog("data channel open, interview is now active");
        // Nudge the model to start speaking the greeting itself instead of
        // silently waiting for the candidate to speak first.
        setTimeout(() => {
          if (dcRef.current && dcRef.current.readyState === "open" && !assistantHasSpokenRef.current) {
            micLog("kicking off greeting response.create (assistant hadn't spoken yet)");
            requestResponse();
          }
        }, GREETING_KICKOFF_DELAY_MS);
      }); 

      // ## 7) create an offer
      const offer = await pc.createOffer();
      // ## 8) set the local description
      await pc.setLocalDescription(offer);

      // ## 9) send the offer to the server
      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(`Failed to establish realtime call (${sdpResponse.status})`);
      }
      // ## 10) receive the answer
      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || "Failed to start the interview session.");
      setStatus("error");
      cleanup();
    }
  }, [interview, cleanup, handleServerEvent, sendEvent, requestResponse, attachMicAnalyser]);

  const end = useCallback(() => finishInterview("manual"), [finishInterview]);

  const clearError = useCallback(() => setErrorMessage(""), []);

  return {
    status,
    errorMessage,
    clearError,
    transcript,
    speakingSide,
    questionIndex: Math.min(questionIndex, interview?.numberOfQuestions || questionIndex),
    totalQuestions: interview?.numberOfQuestions,
    start,
    end,
    submitText,
    submitWhiteboard,
    whiteboardHistory,
    micEnabled,
    micVolume,
    toggleMic,
  };
}

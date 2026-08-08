import { useCallback, useEffect, useRef, useState } from "react";

function micLog(...args) {
  console.log("[mic-check]", ...args);
}

// Encapsulates mic permission checks + a live volume meter via the Web Audio API.
export function useMicMeter() {
  const [permissionState, setPermissionState] = useState("checking"); // checking | granted | denied | prompt
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState("");

  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const lastTickAtRef = useRef(0);
  const watchdogRef = useRef(null);

  const stopMeter = useCallback(() => {
    micLog("stopMeter() called", {
      hadStream: !!streamRef.current,
      hadAudioCtx: !!audioCtxRef.current,
    });
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => {
      micLog("stopping track", track.label || track.kind);
      track.stop();
    });
    streamRef.current = null;
    setVolume(0);
  }, []);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    lastTickAtRef.current = Date.now();
    setVolume(Math.min(1, rms * 4));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startMeter = useCallback(
    async (deviceId) => {
      setError("");
      micLog("startMeter() requesting getUserMedia", { deviceId: deviceId || "(default)" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        micLog("getUserMedia resolved", {
          tracks: stream.getAudioTracks().map((t) => ({ label: t.label, readyState: t.readyState, muted: t.muted })),
        });
        stopMeter();
        streamRef.current = stream;
        setPermissionState("granted");

        const track = stream.getAudioTracks()[0];
        if (track) {
          track.addEventListener("ended", () => {
            micLog("mic track ended unexpectedly (device disconnected/revoked)");
            setError("Microphone was disconnected. Please reconnect it and try again.");
            setPermissionState("denied");
          });
          track.addEventListener("mute", () => micLog("mic track muted"));
          track.addEventListener("unmute", () => micLog("mic track unmuted"));
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        micLog("AudioContext created", { state: audioCtx.state });
        if (audioCtx.state === "suspended") {
          // Browsers may create the context suspended if it wasn't triggered
          // directly by a user gesture; without resuming, the meter appears
          // to be "stuck" at zero even though the mic is working fine.
          audioCtx
            .resume()
            .then(() => micLog("AudioContext resumed", { state: audioCtx.state }))
            .catch((err) => micLog("AudioContext resume failed", err));
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
        lastTickAtRef.current = Date.now();
        rafRef.current = requestAnimationFrame(tick);

        // Watchdog: if the meter loop stalls (e.g. context stuck suspended,
        // tab backgrounded) or the context drifts back to suspended, try to
        // self-heal instead of leaving the UI looking frozen.
        watchdogRef.current = setInterval(() => {
          if (audioCtxRef.current?.state === "suspended") {
            micLog("watchdog: AudioContext is suspended, attempting resume");
            audioCtxRef.current.resume().catch((err) => micLog("watchdog resume failed", err));
          }
          const stalledMs = Date.now() - lastTickAtRef.current;
          if (stalledMs > 3000) {
            micLog("watchdog: meter tick stalled", { stalledMs });
          }
        }, 2000);

        const list = await navigator.mediaDevices.enumerateDevices();
        const inputs = list.filter((d) => d.kind === "audioinput");
        micLog("enumerated audio input devices", inputs.map((d) => d.label || d.deviceId));
        setDevices(inputs);
        if (!deviceId && inputs.length) {
          const activeTrack = stream.getAudioTracks()[0];
          setSelectedDeviceId(activeTrack?.getSettings()?.deviceId || inputs[0].deviceId);
        } else if (deviceId) {
          setSelectedDeviceId(deviceId);
        }
      } catch (err) {
        micLog("startMeter() failed", err.name, err.message);
        stopMeter();
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          setPermissionState("denied");
        } else if (err.name === "NotFoundError") {
          setPermissionState("denied");
          setError("No microphone was found on this device.");
        } else {
          setPermissionState("denied");
          setError(err.message || "Could not access the microphone.");
        }
      }
    },
    [stopMeter, tick]
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState("denied");
      setError("This browser does not support microphone access.");
      return;
    }
    startMeter();
    return () => stopMeter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    setPermissionState("checking");
    startMeter(selectedDeviceId || undefined);
  }

  function switchDevice(deviceId) {
    startMeter(deviceId);
  }

  return {
    permissionState,
    devices,
    selectedDeviceId,
    volume,
    error,
    retry,
    switchDevice,
    stopMeter,
  };
}

// Tap-to-talk mic button for the Observation field (RS Quick Entry) — see
// CLAUDE.md's "Planned — local voice observation" note and the "Local
// Voice Observation" artifact for the full design. Tap to start recording,
// tap again to stop; the clip is transcribed entirely on-device
// (lib/voiceTranscription.ts) and handed back via onTranscript for the
// caller to insert — this component never touches the observation text
// itself, just capture/transcribe/discard.
import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, MicOff } from "lucide-react";
import { toast } from "sonner";
import {
  transcribeVoiceClip,
  getVoiceModelStatus,
  applyShortcutsToTranscript,
} from "@/lib/voiceTranscription";

type VoiceState =
  | "checking"
  | "missing"
  | "incomplete"
  | "idle"
  | "recording"
  | "busy";

// Shared with the Keyboard/Undo buttons next to this one in RS Quick
// Entry's Observation header (IntelligenceMapping.tsx) — all three use
// this exact size so they read as one consistent row rather than
// mismatched buttons, and so each has a genuinely easy-to-hit tap target
// on a phone (the previous px-1.5 py-0.5 / text-[9px] sizing was too
// small to tap reliably in a hurry).
export const QE_HEADER_BUTTON_SIZE =
  "flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[11px] md:text-xs font-semibold border transition-all active:scale-95";

export function VoiceInputButton({
  onTranscript,
  shortcutMap,
  className = "",
}: {
  /** recordingStartedAt is when the mic actually started capturing — the
   * moment the officer began speaking about the event — not when
   * transcription finished (which can trail the real event by several
   * seconds once WASM inference is factored in). Callers that pre-fill a
   * time field from voice input should use this, not `new Date()`. */
  onTranscript: (text: string, recordingStartedAt: Date) => void;
  /** Same trigger->expansion map already used for typed shortcuts in this
   * form (e.g. mapQeShortcutMap) — applied as a single batch pass over the
   * transcript before onTranscript fires. Omit to skip expansion. */
  shortcutMap?: Record<string, string>;
  className?: string;
}) {
  const [state, setState] = useState<VoiceState>("checking");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVoiceModelStatus().then(status => {
      if (!cancelled) setState(status === "ready" ? "idle" : status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Belt-and-braces: release the mic and drop any in-flight recording if
  // this button unmounts mid-recording (e.g. the popup closes) — nothing
  // about a voice clip should outlive the component that captured it.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access denied — enable it in browser settings");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      setState("busy");
      try {
        const raw = await transcribeVoiceClip(blob);
        const text = shortcutMap
          ? applyShortcutsToTranscript(raw, shortcutMap)
          : raw;
        if (text.trim()) {
          onTranscript(text, recordingStartedAtRef.current ?? new Date());
        } else {
          toast.error("Didn't catch that — try again");
        }
      } catch (err) {
        console.error("[VoiceInputButton] transcription failed", err);
        // Surfaced directly in the toast, not just the console — on a
        // phone in the field there's no devtools to check, so a generic
        // "failed" message is a dead end for diagnosing what actually
        // went wrong (missing model asset, WASM engine 404, unsupported
        // audio codec, etc.).
        const detail = err instanceof Error ? err.message : String(err);
        toast.error(`Voice transcription failed: ${detail}`);
      } finally {
        setState("idle");
      }
    };
    mediaRecorderRef.current = recorder;
    recordingStartedAtRef.current = new Date();
    recorder.start();
    setState("recording");
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  if (state === "checking") return null;

  if (state === "missing" || state === "incomplete") {
    const title =
      state === "incomplete"
        ? "Voice model files are present but incomplete on this deployment (looks like Git LFS pointer stubs, not the real weights — see scripts/dev/voice-model-setup.md)"
        : "Voice model not installed on this deployment";
    return (
      <button
        type="button"
        disabled
        title={title}
        className={`${QE_HEADER_BUTTON_SIZE} border-border text-muted-foreground opacity-40 cursor-not-allowed ${className}`}
      >
        <MicOff className="h-4 w-4" />
        Voice
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={state === "recording" ? stopRecording : startRecording}
      disabled={state === "busy"}
      title={
        state === "recording"
          ? "Stop recording"
          : state === "busy"
            ? "Transcribing…"
            : "Record a voice observation"
      }
      className={`${QE_HEADER_BUTTON_SIZE} disabled:opacity-60 disabled:pointer-events-none ${
        state === "recording"
          ? "border-red-500/60 text-red-500 bg-red-500/10 animate-pulse"
          : "border-border text-muted-foreground hover:bg-accent/50"
      } ${className}`}
    >
      {state === "busy" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      {state === "recording"
        ? "Stop"
        : state === "busy"
          ? "Transcribing"
          : "Voice"}
    </button>
  );
}

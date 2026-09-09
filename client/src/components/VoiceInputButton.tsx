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
  isVoiceModelAvailable,
  applyShortcutsToTranscript,
} from "@/lib/voiceTranscription";

type VoiceState = "checking" | "unavailable" | "idle" | "recording" | "busy";

export function VoiceInputButton({
  onTranscript,
  shortcutMap,
  className = "",
}: {
  onTranscript: (text: string) => void;
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

  useEffect(() => {
    let cancelled = false;
    isVoiceModelAvailable().then(available => {
      if (!cancelled) setState(available ? "idle" : "unavailable");
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
          onTranscript(text);
        } else {
          toast.error("Didn't catch that — try again");
        }
      } catch (err) {
        console.error("[VoiceInputButton] transcription failed", err);
        toast.error("Voice transcription failed");
      } finally {
        setState("idle");
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setState("recording");
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  if (state === "checking") return null;

  if (state === "unavailable") {
    return (
      <button
        type="button"
        disabled
        title="Voice model not installed on this deployment"
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-border text-muted-foreground opacity-40 cursor-not-allowed ${className}`}
      >
        <MicOff className="h-3 w-3" />
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
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-all active:scale-95 disabled:opacity-60 disabled:pointer-events-none ${
        state === "recording"
          ? "border-red-500/60 text-red-500 bg-red-500/10 animate-pulse"
          : "border-border text-muted-foreground hover:bg-accent/50"
      } ${className}`}
    >
      {state === "busy" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Mic className="h-3 w-3" />
      )}
      {state === "recording"
        ? "Stop"
        : state === "busy"
          ? "Transcribing"
          : "Voice"}
    </button>
  );
}

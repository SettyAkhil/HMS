"""Local speech-to-text via faster-whisper. Separate from vllm_provider.py --
Qwen2.5-VL is a vision-language model and has no audio path at all, so
transcription needs its own model entirely, not a different prompt to the
same one."""

import os
import tempfile

# Whisper's accuracy on lower-resource languages (Telugu, Kannada, etc.)
# scales hard with model size -- "small"/"medium" are both noticeably weaker
# than "large-v3" specifically for these, and this host has the CPU/RAM
# headroom (16 threads, tens of GB free) to run it. Slower per request than
# medium, but still self-hosted and not real-time-critical for a doctor's
# dictated note.
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "large-v3")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
# Whisper auto-detects language from the first few seconds of audio when
# none is given -- on a short clinical dictation (a sentence or two, often
# with background noise) that guess is unreliable and can land on a
# completely different language. Pin a default rather than guessing; a
# caller can still override per-request.
WHISPER_DEFAULT_LANGUAGE = os.getenv("WHISPER_DEFAULT_LANGUAGE", "en")


class WhisperTranscriptionProvider:
    def __init__(self):
        # Loaded lazily on first use, not at import time -- importing this
        # module (e.g. just to register the blueprint) must never block on
        # downloading/loading a model that might not be needed this request.
        self._model = None

    def _get_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                WHISPER_MODEL_SIZE, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE
            )
        return self._model

    def transcribe(self, file_bytes, filename=None, language=None):
        model = self._get_model()
        suffix = os.path.splitext(filename or "")[1] or ".webm"
        # faster-whisper reads from a path (it shells out to ffmpeg via
        # av/PyAV internally for decoding), so the uploaded bytes -- whatever
        # format the browser's MediaRecorder produced -- need to land on disk
        # first; deleted as soon as transcription finishes either way.
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(file_bytes)
            tmp.flush()
            segments, _info = model.transcribe(
                tmp.name,
                beam_size=5,
                language=language or WHISPER_DEFAULT_LANGUAGE,
                # Strips leading/trailing silence and dead air mid-recording
                # (very common on a doctor's phone/laptop mic) that otherwise
                # gets mis-transcribed as hallucinated words -- particularly
                # bad on lower-resource languages where the model has less
                # to anchor a confident "silence" prediction on.
                vad_filter=True,
                # Off by default: without this, one bad early guess (wrong
                # word, wrong language drift) can bias every later segment
                # in the same recording to keep repeating it.
                condition_on_previous_text=False,
            )
            return " ".join(segment.text.strip() for segment in segments).strip()

#!/usr/bin/env python3
"""
generate_subs.py — produce WebVTT subtitles for a BirgenAI title.

Pipeline (all free / open source):
  1. Transcribe the movie audio to timed English cues with faster-whisper.
  2. Translate each cue to Kiswahili (sw) and French (fr) with NLLB-200.
  3. Emit WebVTT files into the R2 upload layout:
        out/Subtitles/en/<assetKey>-en.vtt
        out/Subtitles/sw/<assetKey>-sw.vtt
        out/Subtitles/fr/<assetKey>-fr.vtt

Example:
  python generate_subs.py \
      --input "/media/get-out-2017.mp4" \
      --asset-key get-out-2017 \
      --model large-v3 \
      --langs sw,fr \
      --out ./out

Then upload ./out/Subtitles/** to the R2 bucket root (see README.md), so the
player resolves e.g. https://assets.birgenai.com/Subtitles/sw/get-out-2017-sw.vtt

Notes
-----
* Whisper timestamps come straight from the audio, so cues line up with the
  HLS transcode automatically — no manual sync.
* This script transcribes the *actual audio you own/licensed*. It does not embed
  any dialogue itself; the text is whatever Whisper hears in your file.
* Quality: use --model large-v3 for the English pass (best timing + accuracy).
  Review the Kiswahili pass with a fluent speaker before publishing — machine
  translation is a strong first draft, not a final cut.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass


# ── WebVTT helpers ──────────────────────────────────────────────────────────
@dataclass
class Cue:
    start: float  # seconds
    end: float    # seconds
    text: str


def fmt_ts(seconds: float) -> str:
    """Seconds -> 'HH:MM:SS.mmm' (WebVTT timestamp)."""
    if seconds < 0:
        seconds = 0.0
    ms = int(round((seconds - int(seconds)) * 1000))
    s = int(seconds) % 60
    m = (int(seconds) // 60) % 60
    h = int(seconds) // 3600
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def write_vtt(path: str, cues: list[Cue]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, c in enumerate(cues, 1):
            text = c.text.strip()
            if not text:
                continue
            f.write(f"{i}\n")
            f.write(f"{fmt_ts(c.start)} --> {fmt_ts(c.end)}\n")
            f.write(f"{text}\n\n")
    print(f"  wrote {path}  ({len(cues)} cues)")


# ── Cue segmentation (from word timestamps) ─────────────────────────────────
# Whisper's *segment* end-time often runs far past the last spoken word — across
# a silent/musical stretch it stretches to the next line, so a caption like
# "I'm a beast." can sit on screen for minutes. We instead rebuild cues from
# *word-level* timestamps: every cue ends when its words end, capped to a
# readable length and split on natural pauses/sentence ends.
MAX_CUE_CHARS = 84       # ~2 lines x 42 chars
MAX_CUE_SEC   = 6.0      # no caption stays up longer than this
GAP_SPLIT_SEC = 0.8      # a silence gap at least this long forces a new cue
MIN_CUE_SEC   = 1.2      # don't break on punctuation before a cue is this long
SENT_END      = (".", "!", "?", "…")


def _flush(words: list) -> "Cue | None":
    text = "".join(w.word for w in words).strip()
    if not text:
        return None
    return Cue(words[0].start, words[-1].end, text)


def build_cues_from_words(words: list) -> list[Cue]:
    """Group Whisper word objects (.start/.end/.word) into well-timed cues."""
    cues: list[Cue] = []
    cur: list = []
    for w in words:
        if cur:
            gap = w.start - cur[-1].end
            cur_text = "".join(x.word for x in cur).strip()
            cur_dur = cur[-1].end - cur[0].start
            ends_sentence = cur_text.endswith(SENT_END)
            too_long_text = len(cur_text) + len(w.word) > MAX_CUE_CHARS
            too_long_time = (w.end - cur[0].start) > MAX_CUE_SEC
            if gap >= GAP_SPLIT_SEC or too_long_text or too_long_time or (
                ends_sentence and cur_dur >= MIN_CUE_SEC
            ):
                c = _flush(cur)
                if c:
                    cues.append(c)
                cur = []
        cur.append(w)
    c = _flush(cur)
    if c:
        cues.append(c)
    return cues


# ── Transcription (faster-whisper) ──────────────────────────────────────────
# Whisper's feature extractor builds the mel-spectrogram (STFT) over the WHOLE
# audio array up front. For a feature-length film that single float64 array is
# >1 GiB and OOMs on machines without much RAM. We therefore decode the audio in
# overlapping windows with ffmpeg and transcribe each window separately, offsetting
# every timestamp back to the absolute timeline, then stitch the words together.
SAMPLE_RATE = 16000


class _Word:
    """Mutable stand-in for faster-whisper's Word (which is an immutable tuple),
    so we can offset its timestamps onto the absolute timeline."""
    __slots__ = ("start", "end", "word")

    def __init__(self, start: float, end: float, word: str):
        self.start = start
        self.end = end
        self.word = word


def _fftool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(
            f"'{name}' not found on PATH. ffmpeg/ffprobe are required to chunk the audio. "
            "Install ffmpeg and re-run."
        )
    return path


def _media_duration(path: str) -> float | None:
    """Total duration in seconds via ffprobe, or None if it can't be read."""
    try:
        out = subprocess.run(
            [_fftool("ffprobe"), "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nokey=1:noprint_wrappers=1", path],
            capture_output=True, text=True, check=True,
        )
        return float(out.stdout.strip())
    except Exception:
        return None


def _read_audio_window(path: str, start: float, dur: float):
    """Decode [start, start+dur] to a mono 16 kHz float32 numpy array via ffmpeg."""
    import numpy as np
    cmd = [
        _fftool("ffmpeg"), "-v", "error",
        "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", path,
        "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-",
    ]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "ignore")[-500:])
    return np.frombuffer(proc.stdout, dtype=np.float32)


def transcribe(input_path: str, model_size: str) -> list[Cue]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("Missing dep: pip install faster-whisper")

    # int8 runs on CPU; switch device='cuda', compute_type='float16' on a GPU.
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute = os.environ.get("WHISPER_COMPUTE", "int8" if device == "cpu" else "float16")
    chunk_sec = float(os.environ.get("WHISPER_CHUNK_SEC", "600"))   # 10 min windows
    overlap = float(os.environ.get("WHISPER_CHUNK_OVERLAP", "5"))   # lead-in for context
    print(f"[1/3] Transcribing with faster-whisper ({model_size}, {device}/{compute}) …")

    model = WhisperModel(model_size, device=device, compute_type=compute)

    duration = _media_duration(input_path)
    if duration is None:
        # Couldn't probe — fall back to whole-file decode (original behaviour).
        print("      (could not probe duration; transcribing whole file in one pass)")
        windows = [(0.0, None)]
    else:
        windows = []
        start = 0.0
        while start < duration:
            windows.append((start, min(chunk_sec + overlap, duration - start)))
            start += chunk_sec
        print(f"      ~{duration/60:.1f} min → {len(windows)} window(s) of {chunk_sec/60:.0f} min")

    words: list = []
    fallback: list[Cue] = []
    for idx, (wstart, wdur) in enumerate(windows):
        audio = input_path if wdur is None else _read_audio_window(input_path, wstart, wdur)
        segments, _info = model.transcribe(
            audio,
            language="en",            # all five titles are English audio
            vad_filter=True,          # drop long silences for cleaner cue boundaries
            beam_size=5,
            word_timestamps=True,     # needed to end cues at the last spoken word
        )
        # Skip the overlap region on every window after the first — it was already
        # transcribed by the previous window's tail — to avoid duplicate cues.
        keep_from = 0.0 if idx == 0 else wstart + overlap
        for seg in segments:
            if getattr(seg, "words", None):
                for w in seg.words:
                    aw_start = w.start + wstart
                    if aw_start < keep_from:
                        continue
                    words.append(_Word(aw_start, w.end + wstart, w.word))
            else:
                # No word timing for this segment — keep it but cap its duration.
                s = seg.start + wstart
                if s < keep_from:
                    continue
                e = min(seg.end, seg.start + MAX_CUE_SEC) + wstart
                fallback.append(Cue(s, e, seg.text))
        if wdur is not None:
            print(f"      window {idx+1}/{len(windows)} done", end="\r")
    if windows and windows[0][1] is not None:
        print()

    cues = build_cues_from_words(words)
    cues.extend(fallback)
    cues.sort(key=lambda c: c.start)
    total = duration if duration else (cues[-1].end if cues else 0.0)
    print(f"      detected {len(cues)} cues, ~{total/60:.1f} min")
    return cues


# ── Translation (NLLB-200) ──────────────────────────────────────────────────
# NLLB language codes. English source -> target.
NLLB_CODE = {"en": "eng_Latn", "sw": "swh_Latn", "fr": "fra_Latn"}


def translate(cues: list[Cue], target: str) -> list[Cue]:
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        import torch
    except ImportError:
        sys.exit("Missing dep: pip install transformers sentencepiece torch")

    model_name = os.environ.get("NLLB_MODEL", "facebook/nllb-200-distilled-600M")
    print(f"[2/3] Translating en -> {target} with {model_name} …")
    tok = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    tgt_id = tok.convert_tokens_to_ids(NLLB_CODE[target])

    out: list[Cue] = []
    BATCH = 16
    for i in range(0, len(cues), BATCH):
        chunk = cues[i : i + BATCH]
        tok.src_lang = NLLB_CODE["en"]
        enc = tok([c.text.strip() for c in chunk], return_tensors="pt", padding=True, truncation=True)
        with torch.no_grad():
            gen = model.generate(**enc, forced_bos_token_id=tgt_id, max_length=512)
        texts = tok.batch_decode(gen, skip_special_tokens=True)
        out.extend(Cue(c.start, c.end, t) for c, t in zip(chunk, texts))
        print(f"      {min(i+BATCH, len(cues))}/{len(cues)}", end="\r")
    print()
    return out


# ── Main ────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="Generate VTT subtitles for a BirgenAI title.")
    ap.add_argument("--input", required=True, help="Path to the movie file (mp4/mkv/wav).")
    ap.add_argument("--asset-key", required=True, help="e.g. get-out-2017 (drives output filenames).")
    ap.add_argument("--model", default="large-v3", help="Whisper model size (large-v3 recommended).")
    ap.add_argument("--langs", default="sw,fr", help="Target translation langs, comma-separated.")
    ap.add_argument("--out", default="./out", help="Output dir (R2 layout is created beneath it).")
    args = ap.parse_args()

    if not os.path.exists(args.input):
        sys.exit(f"Input not found: {args.input}")

    targets = [l.strip() for l in args.langs.split(",") if l.strip()]
    for t in targets:
        if t not in NLLB_CODE:
            sys.exit(f"Unsupported lang '{t}'. Supported: {', '.join(NLLB_CODE)}")

    # 1. English from audio
    en = transcribe(args.input, args.model)
    write_vtt(os.path.join(args.out, "Subtitles", "en", f"{args.asset_key}-en.vtt"), en)

    # 2. Translations
    for t in targets:
        tr = translate(en, t)
        write_vtt(os.path.join(args.out, "Subtitles", t, f"{args.asset_key}-{t}.vtt"), tr)

    print("[3/3] Done. Review the Kiswahili pass with a fluent speaker, then upload "
          f"{os.path.join(args.out, 'Subtitles')}/** to your R2 bucket root.")


if __name__ == "__main__":
    main()

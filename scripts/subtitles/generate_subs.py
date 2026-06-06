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


# ── Transcription (faster-whisper) ──────────────────────────────────────────
def transcribe(input_path: str, model_size: str) -> list[Cue]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("Missing dep: pip install faster-whisper")

    # int8 runs on CPU; switch device='cuda', compute_type='float16' on a GPU.
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute = os.environ.get("WHISPER_COMPUTE", "int8" if device == "cpu" else "float16")
    print(f"[1/3] Transcribing with faster-whisper ({model_size}, {device}/{compute}) …")

    model = WhisperModel(model_size, device=device, compute_type=compute)
    segments, info = model.transcribe(
        input_path,
        language="en",          # Get Out is English audio
        vad_filter=True,        # drop long silences for cleaner cue boundaries
        beam_size=5,
    )
    cues = [Cue(seg.start, seg.end, seg.text) for seg in segments]
    print(f"      detected {len(cues)} cues, ~{info.duration/60:.1f} min")
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

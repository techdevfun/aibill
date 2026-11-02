#!/usr/bin/env python3
"""Build examples/demo.gif + examples/demo-transcript.txt from REAL aibill runs.

Every command's output is captured verbatim from the built CLI
(`out/src/cli.js`, invoked through a temp `aibill` shim on PATH so the
prompt shows exactly what runs). Nothing is invented or reworded: the script
only adds a typing animation and hold frames.

Demo arc: scan a session -> cut candidates -> diff before/after a cut ->
budget gate on the cut session.
"""

import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_GIF = os.path.join(ROOT, "examples", "demo.gif")
OUT_TXT = os.path.join(ROOT, "examples", "demo-transcript.txt")
CLI = os.path.join(ROOT, "out", "src", "cli.js")

BG = (30, 30, 30)
FG = (212, 212, 212)
PROMPT = (126, 231, 135)
CMD = (255, 255, 255)
DIM = (150, 150, 150)

FPS = 12
FONT_SIZE = 18
LINE_H = 24
PAD = 16
COLS = 96
ROWS = 26
HOLD_FRAMES = 24  # 2s hold on each completed output


def load_font():
    for name in ["DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf"]:
        for d in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts"]:
            p = os.path.join(d, name)
            if os.path.exists(p):
                return ImageFont.truetype(p, FONT_SIZE)
    return ImageFont.load_default()


FONT = load_font()
CHAR_W = FONT.getbbox("M")[2]
WIDTH = PAD * 2 + COLS * CHAR_W
HEIGHT = PAD * 2 + ROWS * LINE_H


def sh(cmd, env):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=env)
    return r.returncode, r.stdout, r.stderr


def blank_screen():
    return [["", FG] for _ in range(ROWS)]


def render(lines):
    """lines: list of (text, color). Returns a PIL frame."""
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    d = ImageDraw.Draw(img)
    for i, (text, color) in enumerate(lines[:ROWS]):
        d.text((PAD, PAD + i * LINE_H), text[:COLS], font=FONT, fill=color)
    return img


def main():
    if not os.path.exists(CLI):
        sys.exit("build the CLI first: npm run build")

    bindir = tempfile.mkdtemp(prefix="aibill-demo-")
    shim = os.path.join(bindir, "aibill")
    with open(shim, "w") as f:
        f.write("#!/bin/sh\nexec node %s \"$@\"\n" % CLI)
    os.chmod(shim, 0o755)
    env = dict(os.environ, PATH=bindir + os.pathsep + os.environ.get("PATH", ""))

    steps = [
        "aibill scan examples/session-before.jsonl",
        "aibill cut examples/session-before.jsonl --top 3",
        "aibill cut examples/mcp-sample.jsonl --top 3",
        "aibill diff --before examples/session-before.jsonl --after examples/session-after.jsonl",
        "aibill budget --max-usd 20 examples/session-after.jsonl",
    ]

    # (frame, duration_ms) pairs; consecutive identical frames merge durations
    # instead of being dropped, so holds actually hold.
    segments: list = []
    transcript = []
    FRAME_MS = int(1000 / FPS)

    def push(img, times=1):
        sig = img.tobytes()
        if segments and segments[-1][0] == sig:
            segments[-1][1] += FRAME_MS * times
        else:
            segments.append([sig, FRAME_MS * times, img])

    for step in steps:
        rc, out, err = sh(["aibill"] + step.split()[1:], env)
        body = (out + err).rstrip("\n")
        transcript.append("$ " + step + "\n" + body + f"\n[exit {rc}]\n")

        # typing animation, 2 chars per frame
        typed = ""
        chars = list("$ " + step)
        for i in range(0, len(chars), 2):
            typed += "".join(chars[i:i + 2])
            screen2 = [["", FG] for _ in range(ROWS)]
            screen2[0] = [typed, CMD]
            push(render(screen2))
        push(render([["$ " + step, CMD]] + [["", FG]] * (ROWS - 1)), 6)

        # output scrolls in, 4 lines per frame
        out_lines = body.split("\n")
        shown = 0
        while shown < len(out_lines):
            shown = min(len(out_lines), shown + 4)
            scr = [["$ " + step, CMD]]
            for ln in out_lines[:shown][-(ROWS - 1):]:
                scr.append([ln, PROMPT if ln.startswith("Total:") or "OVER" in ln or "within budget" in ln else FG])
            while len(scr) < ROWS:
                scr.append(["", FG])
            push(render(scr))
        # hold the full screen so it can be read
        full = [["$ " + step, CMD]]
        for ln in out_lines[-(ROWS - 1):]:
            full.append([ln, PROMPT if ln.startswith("Total:") or "OVER" in ln or "within budget" in ln else FG])
        while len(full) < ROWS:
            full.append(["", FG])
        push(render(full), HOLD_FRAMES)
        # dim hold before next command
        dimmed = [[t, DIM] for t, _ in full]
        push(render(dimmed), 4)

    imgs = [seg[2] for seg in segments]
    durations = [seg[1] for seg in segments]
    imgs[0].save(
        OUT_GIF, save_all=True, append_images=imgs[1:],
        duration=durations, loop=0, optimize=True,
    )
    with open(OUT_TXT, "w") as f:
        f.write("\n".join(transcript))
    size = os.path.getsize(OUT_GIF)
    total_s = sum(durations) / 1000
    print(f"demo.gif: {len(imgs)} distinct frames, {total_s:.1f}s, {size/1024:.0f} KB")
    print(f"transcript: {OUT_TXT}")


if __name__ == "__main__":
    main()

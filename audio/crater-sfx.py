#!/usr/bin/env python3
"""Synthesise Crater Duel's sound effects (no recording needed).

Writes crater/*.mp3 for listening and src/audio/crater-sfx-data.js (CRATER_SFX) for the build.
Needs ffmpeg and numpy. Run: python3 audio/crater-sfx.py, then ./build.sh
Melodic parts stay in E minor, like the Sonic Pi sounds for the other games.
"""
import base64, json, subprocess
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
OUT_JS = HERE.parent / "src" / "audio" / "crater-sfx-data.js"
SR = 44100
rng = np.random.default_rng(7)   # fixed seed: the same sounds every run


def t(secs):
    return np.arange(int(secs * SR)) / SR


def sweep(f0, f1, secs, shape=2.0):
    """Phase for a pitch glide from f0 to f1 Hz; shape > 1 drops quickly at first."""
    x = t(secs) / secs
    f = f1 + (f0 - f1) * (1 - x) ** shape
    return 2 * np.pi * np.cumsum(f) / SR


def env(secs, attack=0.005, decay=None):
    """Fast attack, then exponential decay to about -60 dB at the end."""
    x = t(secs)
    a = np.minimum(1, x / attack) if attack else np.ones_like(x)
    return a * np.exp(-x / ((decay or secs) / 6.9))


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a number or an array that changes over time."""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    k = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += k[i] * (x[i] - acc); y[i] = acc
    return y


def noise(secs):
    return rng.uniform(-1, 1, len(t(secs)))


def square(phase):
    return np.sign(np.sin(phase))


def note(name):
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    n = names[name[0]] + (1 if "#" in name else 0) + 12 * (int(name[-1]) + 1)
    return 440 * 2 ** ((n - 69) / 12)


def tune(notes, step, hold, wave=square, gap=0.0):
    """Notes one after another, each `step` seconds apart, ringing for `hold` seconds."""
    out = np.zeros(int((step * (len(notes) - 1) + hold + 0.05) * SR))
    for i, n in enumerate(notes):
        s = (wave(2 * np.pi * note(n) * t(hold)) * env(hold, 0.003)) * 0.5
        a = int(i * step * SR); out[a:a + len(s)] += s
    return out


def mix(*parts):
    n = max(len(p) for p in parts); out = np.zeros(n)
    for p in parts: out[:len(p)] += p
    return out


def fire():          # cannon thump: falling sub tone, a noise crack, a short click
    thump = np.sin(sweep(140, 45, 0.45)) * env(0.45, 0.002)
    crack = lowpass(noise(0.25), 2500) * env(0.25, 0.001, 0.12)
    return mix(thump, crack * 0.8)


def whistle():       # falling shell: a high tone gliding down, with a little wobble
    x = t(1.3)
    ph = sweep(1900, 700, 1.3, 1.0) + 0.6 * np.sin(2 * np.pi * 6 * x)
    return np.sin(ph) * np.minimum(1, x / 0.15) * np.exp(-x / 1.6) * 0.5


def boom(secs=0.9, depth=1.0):   # explosion: noise closing from bright to dull, over a deep thud
    x = t(secs)
    body = lowpass(noise(secs), 3500 * np.exp(-x / (secs / 4)) + 150) * env(secs, 0.002)
    sub = np.sin(sweep(80 * depth, 30, secs)) * env(secs, 0.002, secs * 0.8)
    return mix(body * 1.4, sub * 0.9)


def bigboom():       # big shot: longer, deeper, with crackle
    b = boom(1.6, 0.8)
    crackle = np.zeros(len(b)); idx = rng.integers(int(0.1 * SR), len(b) - 50, 60)
    for i in idx: crackle[i:i + 40] += rng.uniform(-1, 1, 40) * np.exp(-(i / len(b)) * 3)
    return mix(b, lowpass(crackle, 4000) * 0.6)


def dirt():          # dirt bomb landing: a soft, dull thud with a rumble
    x = t(0.7)
    return mix(lowpass(noise(0.7), 450) * env(0.7, 0.01) * 2.2, np.sin(sweep(70, 40, 0.7)) * env(0.7, 0.01) * 0.6)


def clang():         # tank hit: metal ringing at inharmonic partials
    x = t(0.5)
    ring = sum(np.sin(2 * np.pi * 420 * r * x) * a for r, a in [(1, 1), (2.76, 0.6), (5.4, 0.35), (8.9, 0.2)])
    return mix(ring * env(0.5, 0.001, 0.35) * 0.35, lowpass(noise(0.05), 6000) * env(0.05, 0.001) * 0.4)


def destroyed():     # tank destroyed: a boom under a falling square-wave wail
    wail = square(sweep(420, 55, 1.0, 1.2)) * env(1.0, 0.01) * 0.25
    return mix(boom(1.2, 0.9), lowpass(wail, 1800))


def split():         # MIRV splitting: a pop and a rising chirp
    return mix(lowpass(noise(0.06), 5000) * env(0.06, 0.001), np.sin(sweep(900, 1600, 0.15, 0.5)) * env(0.15, 0.002) * 0.5)


def switch():        # weapon change: two quick blips
    a = square(2 * np.pi * 1200 * t(0.035)) * env(0.035, 0.001) * 0.3
    b = square(2 * np.pi * 1600 * t(0.035)) * env(0.035, 0.001) * 0.3
    return np.concatenate([a, np.zeros(int(0.02 * SR)), b])


def round_start():   # short fanfare
    return lowpass(tune(["E4", "E4", "B4", "E5"], 0.1, 0.35), 3000)


def win():           # rising arpeggio into a held chord
    up = tune(["E4", "G4", "B4", "E5", "G5", "B5"], 0.08, 0.5)
    chord = mix(*[np.sin(2 * np.pi * note(n) * t(1.0)) * env(1.0, 0.01) * 0.3 for n in ["G4", "B4", "D5"]])
    return lowpass(np.concatenate([up, chord]), 3500)


def lose():          # falling line and a low drone
    down = tune(["B4", "A4", "G4", "F#4", "E4"], 0.28, 0.32)
    drone = lowpass(square(2 * np.pi * note("E2") * t(1.4)) * env(1.4, 0.02), 900) * 0.4
    return np.concatenate([down, drone])


SOUNDS = {"round": round_start, "fire": fire, "whistle": whistle, "split": split, "boom": boom, "bigboom": bigboom,
          "dirt": dirt, "clang": clang, "destroyed": destroyed, "switch": switch, "win": win, "lose": lose}


QUIET = {"whistle": -26, "switch": -22}   # sounds that play under others: below the default loudness


def finish(x, name, rms_db=-16.0, peak_db=-2.0):
    """Level by average loudness, so a steady whistle isn't louder than a blast; never let the peak pass peak_db."""
    rms = np.sqrt(np.mean(x ** 2)) or 1
    gain = min(10 ** (QUIET.get(name, rms_db) / 20) / rms, 10 ** (peak_db / 20) / (np.abs(x).max() or 1))
    x = x * gain
    fade = int(0.01 * SR); x[-fade:] *= np.linspace(1, 0, fade)
    return x.astype(np.float32)


def encode(x, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-codec:a", "libmp3lame", "-b:a", "64k", str(path)], input=x.tobytes(), check=True)
    return base64.b64encode(path.read_bytes()).decode()


def main():
    data = {}
    for name, make in SOUNDS.items():
        x = finish(make(), name)
        data[name] = encode(x, HERE / "crater" / f"{name}.mp3")
        print(f"  {name:10s} {len(x) / SR:4.2f} s")
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("// Generated by audio/crater-sfx.py. Do not edit.\nconst CRATER_SFX = " + json.dumps(data) + ";\n")
    print(f"wrote {OUT_JS.relative_to(HERE.parent)} ({OUT_JS.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

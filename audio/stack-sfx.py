#!/usr/bin/env python3
"""Synthesise Stack Smash's sound effects and music (no recording needed).

Writes stack/*.mp3 for listening and src/audio/stack-sfx-data.js (STACK_SFX, STACK_MUSIC) for the build.
Needs ffmpeg and numpy. Run: python3 audio/stack-sfx.py, then ./build.sh
Reuses the synth helpers in crater-sfx.py. The music is Korobeiniki, a Russian folk song from the 1860s (public
domain), arranged here for two square-wave voices in E minor, like the other games' sounds.
"""
import base64, importlib.util, json, subprocess
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("crater_sfx", HERE / "crater-sfx.py")
C = importlib.util.module_from_spec(spec); spec.loader.exec_module(C)
t, sweep, env, lowpass, noise, square, note, tune, mix, finish, SR = C.t, C.sweep, C.env, C.lowpass, C.noise, C.square, C.note, C.tune, C.mix, C.finish, C.SR
OUT_JS = HERE.parent / "src" / "audio" / "stack-sfx-data.js"


def move():          # piece steps sideways: a tiny tick
    return square(2 * np.pi * 900 * t(0.025)) * env(0.025, 0.001) * 0.3


def rotate():        # piece turns: a short rising chirp
    return square(sweep(700, 1300, 0.05, 0.5)) * env(0.05, 0.001) * 0.3


def lock():          # piece settles: a soft wooden knock
    return mix(np.sin(sweep(260, 120, 0.12)) * env(0.12, 0.001), lowpass(noise(0.04), 2500) * env(0.04, 0.001) * 0.5)


def drop():          # hard drop: a heavy thump with a crack
    thump = np.sin(sweep(160, 45, 0.35)) * env(0.35, 0.001)
    return mix(thump, lowpass(noise(0.15), 3000) * env(0.15, 0.001, 0.08) * 0.9)


def shatter(secs=0.6, n=40):   # blocks breaking: many small bright clicks over a noise burst
    x = mix(lowpass(noise(secs), 5000 * np.exp(-t(secs) / (secs / 3)) + 300) * env(secs, 0.002) * 0.8)
    for i in C.rng.integers(0, int(secs * 0.7 * SR), n):
        f = C.rng.uniform(1500, 4000); s = np.sin(2 * np.pi * f * t(0.03)) * env(0.03, 0.0005) * 0.4
        x[i:i + len(s)] += s[:len(x) - i]
    return x


def clear():         # one to three lines
    return mix(shatter(), lowpass(tune(["E5", "B5"], 0.07, 0.25), 4000) * 0.6)


def smash():         # four lines at once: a bigger shatter under a rising arpeggio and a chord
    up = tune(["E4", "G4", "B4", "E5", "G5", "B5", "E6"], 0.06, 0.4)
    chord = mix(*[np.sin(2 * np.pi * note(n) * t(1.0)) * env(1.0, 0.01) * 0.3 for n in ["E5", "G5", "B5"]])
    return mix(shatter(1.2, 90) * 1.2, lowpass(np.concatenate([up, chord]), 4000))


def hold():          # swap into the hold box: a quick down-up blip
    return np.concatenate([square(2 * np.pi * 800 * t(0.04)) * env(0.04, 0.001) * 0.3,
                           square(2 * np.pi * 1200 * t(0.04)) * env(0.04, 0.001) * 0.3])


def level():         # level up
    return lowpass(tune(["B4", "E5", "G5", "B5"], 0.08, 0.3), 3500)


def start():         # game start fanfare
    return lowpass(tune(["E4", "E4", "B4", "E5"], 0.1, 0.35), 3000)


def over():          # game over: falling line and a low drone, like the other games
    down = tune(["B4", "A4", "G4", "F#4", "E4"], 0.28, 0.32)
    drone = lowpass(square(2 * np.pi * note("E2") * t(1.4)) * env(1.4, 0.02), 900) * 0.4
    return np.concatenate([down, drone])


SOUNDS = {"move": move, "rotate": rotate, "lock": lock, "drop": drop, "clear": clear, "smash": smash,
          "hold": hold, "level": level, "start": start, "over": over}
C.QUIET.update({"move": -30, "rotate": -27, "lock": -24, "hold": -26})   # played often, so kept below the rest

# Korobeiniki, A section then B section, in A minor as usually written; transposed down a fifth to E minor.
# Each entry is (note, beats); None is a rest.
MELODY = [("E5", 1), ("B4", .5), ("C5", .5), ("D5", 1), ("C5", .5), ("B4", .5),
          ("A4", 1), ("A4", .5), ("C5", .5), ("E5", 1), ("D5", .5), ("C5", .5),
          ("B4", 1.5), ("C5", .5), ("D5", 1), ("E5", 1),
          ("C5", 1), ("A4", 1), ("A4", 1), (None, 1),
          (None, .5), ("D5", 1), ("F5", .5), ("A5", 1), ("G5", .5), ("F5", .5),
          ("E5", 1.5), ("C5", .5), ("E5", 1), ("D5", .5), ("C5", .5),
          ("B4", 1), ("B4", .5), ("C5", .5), ("D5", 1), ("E5", 1),
          ("C5", 1), ("A4", 1), ("A4", 1), (None, 1)]
B_SECTION = [("E5", 2), ("C5", 2), ("D5", 2), ("B4", 2), ("C5", 2), ("A4", 2), ("G#4", 2), ("B4", 1), (None, 1),
             ("E5", 2), ("C5", 2), ("D5", 2), ("B4", 2), ("C5", 1), ("E5", 1), ("A5", 2), ("G#5", 3), (None, 1)]
BASS = ["E2", "A2", "E2", "A2", "D2", "C2", "E2", "A2",   # one root per bar, played as octave eighths
        "A2", "E2", "A2", "E2", "A2", "E2", "A2", "E2"]
BPM, SHIFT = 150, -5


def shifted(n):
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    i = names.index(n[:-1]) + 12 * int(n[-1]) + SHIFT
    return names[i % 12] + str(i // 12)


def voice(notes, beat, gain, cutoff, duty_hold=0.85):
    out = np.zeros(int(sum(b for _, b in notes) * beat * SR) + 1); pos = 0.0
    for n, b in notes:
        if n:
            hold = b * beat * duty_hold
            s = square(2 * np.pi * note(shifted(n)) * t(hold)) * env(hold, 0.004, hold * 1.5) * gain
            a = int(pos * SR); out[a:a + len(s)] += s[:len(out) - a]
        pos += b * beat
    return lowpass(out, cutoff)


def music():
    beat = 60 / BPM
    lead = voice(MELODY + MELODY + B_SECTION, beat, 0.35, 3200)
    bass = voice([(r if k % 2 == 0 else r[:-1] + str(int(r[-1]) + 1), .5) for r in BASS + BASS[:8] for k in range(8)], beat, 0.22, 900, 0.7)
    n = min(len(lead), len(bass))
    return lead[:n] + bass[:n]


def main():
    data = {}
    for name, make in SOUNDS.items():
        x = finish(make(), name)
        data[name] = C.encode(x, HERE / "stack" / f"{name}.mp3")
        print(f"  {name:10s} {len(x) / SR:4.2f} s")
    # The loop is followed by its first 3 seconds again and played from 1 s in, so the MP3 encoder's padding at the
    # very start and end never falls inside the loop.
    loop = music(); L = len(loop) / SR
    song = np.concatenate([loop, loop[:3 * SR]]); song = (song / np.abs(song).max() * 10 ** (-3 / 20)).astype(np.float32)
    path = HERE / "stack" / "music.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-codec:a", "libmp3lame", "-b:a", "32k", str(path)], input=song.tobytes(), check=True)
    tune_mp3 = base64.b64encode(path.read_bytes()).decode()
    print(f"  music      {L:4.2f} s loop")
    OUT_JS.write_text("// Generated by audio/stack-sfx.py. Do not edit.\nconst STACK_SFX = " + json.dumps(data) +
                      ";\nconst STACK_MUSIC = " + json.dumps({"data": tune_mp3, "loopStart": 1.0, "loopEnd": 1.0 + L}) + ";\n")
    print(f"wrote {OUT_JS.relative_to(HERE.parent)} ({OUT_JS.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

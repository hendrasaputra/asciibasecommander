#!/usr/bin/env python3
"""Synthesise Rover Patrol's sound effects and music (no recording needed).

Writes rover/*.mp3 for listening and src/audio/rover-sfx-data.js (ROVER_SFX, ROVER_MUSIC) for the build.
Needs ffmpeg and numpy. Run: python3 audio/rover-sfx.py, then ./build.sh
Reuses the synth helpers in crater-sfx.py. The music is an original bass groove in E minor.
"""
import base64, importlib.util, json, subprocess
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("crater_sfx", HERE / "crater-sfx.py")
C = importlib.util.module_from_spec(spec); spec.loader.exec_module(C)
t, sweep, env, lowpass, noise, square, note, tune, mix, finish, SR = C.t, C.sweep, C.env, C.lowpass, C.noise, C.square, C.note, C.tune, C.mix, C.finish, C.SR
OUT_JS = HERE.parent / "src" / "audio" / "rover-sfx-data.js"


def fire():          # twin cannon: a bright zap forward and a higher one upward
    return mix(square(sweep(1800, 500, 0.12, 1.5)) * env(0.12, 0.001) * 0.3,
               square(sweep(2600, 1200, 0.09, 1.5)) * env(0.09, 0.001) * 0.2)


def jump():          # springs pushing off: a rising boing
    x = t(0.3)
    return np.sin(sweep(180, 520, 0.3, 0.6) + 2 * np.sin(2 * np.pi * 18 * x)) * env(0.3, 0.005) * 0.6


def land():          # wheels hitting the ground: a dull thump
    return mix(np.sin(sweep(120, 50, 0.15)) * env(0.15, 0.001), lowpass(noise(0.08), 800) * env(0.08, 0.001) * 0.6)


def rock():          # a rock breaking: gritty crunch
    return mix(lowpass(noise(0.35), 2200) * env(0.35, 0.001, 0.2) * 1.2, np.sin(sweep(200, 70, 0.25)) * env(0.25, 0.001) * 0.5)


def explode():       # a UFO or bomb blowing up
    x = t(0.7)
    return mix(lowpass(noise(0.7), 4000 * np.exp(-x / 0.15) + 200) * env(0.7, 0.002) * 1.3, np.sin(sweep(90, 35, 0.7)) * env(0.7, 0.002) * 0.7)


def crash():         # the rover destroyed: a big boom under a falling wail
    wail = square(sweep(500, 60, 1.1, 1.2)) * env(1.1, 0.01) * 0.25
    x = t(1.3)
    body = lowpass(noise(1.3), 3500 * np.exp(-x / 0.3) + 150) * env(1.3, 0.002) * 1.4
    return mix(body, np.sin(sweep(70, 28, 1.3)) * env(1.3, 0.002) * 0.9, lowpass(wail, 1800))


def bomb():          # a bomb dropping: a short falling whistle
    x = t(0.6)
    return np.sin(sweep(2200, 900, 0.6, 1.0)) * np.minimum(1, x / 0.05) * np.exp(-x / 0.5) * 0.4


def ufo():           # a UFO wave arriving: a wobbling warble
    x = t(0.8)
    return np.sin(2 * np.pi * 600 * x + 8 * np.sin(2 * np.pi * 9 * x)) * env(0.8, 0.05) * 0.4


def point():         # checkpoint reached
    return lowpass(tune(["E5", "G5", "B5", "E6"], 0.07, 0.25), 4000)


def start():
    return lowpass(tune(["E4", "B4", "E5", "G5", "B5"], 0.09, 0.3), 3500)


def over():
    down = tune(["B4", "A4", "G4", "F#4", "E4"], 0.28, 0.32)
    drone = lowpass(square(2 * np.pi * note("E2") * t(1.4)) * env(1.4, 0.02), 900) * 0.4
    return np.concatenate([down, drone])


SOUNDS = {"fire": fire, "jump": jump, "land": land, "rock": rock, "explode": explode, "crash": crash,
          "bomb": bomb, "ufo": ufo, "point": point, "start": start, "over": over}
C.QUIET.update({"fire": -24, "land": -26, "bomb": -27, "jump": -22})   # played often, so kept below the rest

# Original groove: a bass riff over Em - C - D - Bm, with an off-beat arpeggio on top. One entry per eighth note.
BPM = 132
CHORDS = [("E2", ["E4", "G4", "B4"]), ("C2", ["C4", "E4", "G4"]), ("D2", ["D4", "F#4", "A4"]), ("B1", ["B3", "D4", "F#4"])]
RIFF = [0, 0, 12, 0, 7, 0, 10, 12]   # semitones above the chord's root


def semis(n, k):
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    i = names.index(n[:-1]) + 12 * int(n[-1]) + k
    return names[i % 12] + str(i // 12)


def music():
    e = 60 / BPM / 2
    bars = CHORDS * 2
    out = np.zeros(int(len(bars) * 8 * e * SR) + SR)
    for b, (root, tri) in enumerate(bars):
        for k in range(8):
            a = int((b * 8 + k) * e * SR)
            h = e * 0.8
            s = square(2 * np.pi * note(semis(root, RIFF[k])) * t(h)) * env(h, 0.003, h * 1.4) * 0.28
            out[a:a + len(s)] += lowpass(s, 900)
            if k % 2 == 1 or b >= 4:   # arpeggio on the off-beats, every eighth in the second half
                n = tri[(k // 2 + b) % 3]
                s = square(2 * np.pi * note(semis(n, 12)) * t(e * 0.5)) * env(e * 0.5, 0.002) * 0.12
                out[a:a + len(s)] += lowpass(s, 3000)
        a = int(b * 8 * e * SR)   # a soft hi-hat on every beat
        for k in range(4):
            s = lowpass(noise(0.03), 9000) * env(0.03, 0.0005) * 0.08
            o = a + int(k * 2 * e * SR); out[o:o + len(s)] += s
    return out[:int(len(bars) * 8 * e * SR)]


def main():
    data = {}
    for name, make in SOUNDS.items():
        x = finish(make(), name)
        data[name] = C.encode(x, HERE / "rover" / f"{name}.mp3")
        print(f"  {name:10s} {len(x) / SR:4.2f} s")
    # The loop is followed by its first 3 seconds again and played from 1 s in, so the MP3 encoder's padding at the
    # very start and end never falls inside the loop.
    loop = music(); L = len(loop) / SR
    song = np.concatenate([loop, loop[:3 * SR]]); song = (song / np.abs(song).max() * 10 ** (-3 / 20)).astype(np.float32)
    path = HERE / "rover" / "music.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-codec:a", "libmp3lame", "-b:a", "32k", str(path)], input=song.tobytes(), check=True)
    OUT_JS.write_text("// Generated by audio/rover-sfx.py. Do not edit.\nconst ROVER_SFX = " + json.dumps(data) +
                      ";\nconst ROVER_MUSIC = " + json.dumps({"data": base64.b64encode(path.read_bytes()).decode(), "loopStart": 1.0, "loopEnd": 1.0 + L}) + ";\n")
    print(f"  music      {L:4.2f} s loop")
    print(f"wrote {OUT_JS.relative_to(HERE.parent)} ({OUT_JS.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

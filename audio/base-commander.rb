# Base Commander - sound effects and music for Sonic Pi
#
# How to render a WAV:
#   1. Set `piece` below to what you want to render.
#   2. In Sonic Pi press Rec, then Run.
#   3. Wait until the log prints "DONE", press Stop, then press Rec again to save.
#   4. Save it as the file name listed next to the piece, into audio/raw/.
#
# Pieces:
#   :battle  -> battle.wav   gameplay loop, 132 bpm, 16 bars, E minor. Played 3 times
#                             so the middle pass can be cut out as a seamless loop.
#   :title   -> title.wav    launch-screen loop, 96 bpm, 8 bars. Also played 3 times.
#   :all_sfx -> sfx.wav      every sound effect in this order, 2 s of silence between:
#                             shoot, laser, bomb, hit, explode, shield, pickup, upgrade,
#                             life, death, plane, level_start, wave_clear, game_over
#   :shoot, :laser, ... any single effect name from the list above, to re-record one.
#
# All melodic parts stay in E minor so the effects sit on top of the music.

piece = :all_sfx

use_debug false

# ---------- sound effects (default 60 bpm: sleep 1 = 1 second) ----------

define :sfx_shoot do          # player shot: short, bright, falling blip
  s = synth :square, note: 91, note_slide: 0.07, release: 0.09, cutoff: 110, amp: 0.3
  control s, note: 72
  sleep 0.12
end

define :sfx_laser do          # enemy laser: lower, buzzier zap, easy to tell from yours
  s = synth :saw, note: 79, note_slide: 0.22, release: 0.25, cutoff: 100, amp: 0.35
  control s, note: 55
  sleep 0.3
end

define :sfx_bomb do           # enemy bomb: falling whistle
  s = synth :sine, note: 96, note_slide: 0.6, attack: 0.02, release: 0.6, amp: 0.25
  control s, note: 74
  sleep 0.65
end

define :sfx_hit do            # shot bounces off armour, enemy survives
  synth :fm, note: 76, divisor: 1.41, depth: 4, release: 0.12, amp: 0.4
  synth :chipnoise, freq_band: 12, release: 0.05, amp: 0.3
  sleep 0.15
end

define :sfx_explode do        # enemy destroyed
  sample :bd_tek, amp: 1, rate: 0.9
  with_fx :lpf, cutoff: 115, cutoff_slide: 0.45 do |f|
    synth :bnoise, release: 0.5, amp: 0.7
    control f, cutoff: 45
  end
  synth :chipnoise, freq_band: 5, release: 0.25, amp: 0.3
  sleep 0.55
end

define :sfx_shield do         # shield block takes a hit
  synth :chipnoise, freq_band: 9, release: 0.07, amp: 0.4
  synth :tri, note: 45, release: 0.1, amp: 0.4
  sleep 0.12
end

define :sfx_pickup do         # crate collected
  use_synth :chiplead
  [72, 76, 79, 84].each { |n| play n, release: 0.08, amp: 0.4; sleep 0.05 }
  sleep 0.1
end

define :sfx_upgrade do        # gun upgraded
  with_fx :reverb, room: 0.6, mix: 0.3 do
    use_synth :chiplead
    scale(:e4, :major_pentatonic, num_octaves: 2).each { |n| play n, release: 0.1, amp: 0.35; sleep 0.04 }
    synth :prophet, notes: chord(:e5, :major), release: 0.8, cutoff: 100, amp: 0.3
    sleep 0.9
  end
end

define :sfx_life do           # extra life
  use_synth :chiplead
  [:e5, :g5, :e6, :c6, :d6, :g6].each { |n| play n, release: 0.1, amp: 0.35; sleep 0.07 }
  sleep 0.15
end

define :sfx_death do          # player ship destroyed
  sample :bd_tek, amp: 1.5, rate: 0.6
  s = synth :square, note: 72, note_slide: 1.0, release: 1.1, cutoff: 90, amp: 0.4
  control s, note: 30
  with_fx :lpf, cutoff: 120, cutoff_slide: 1.2 do |f|
    synth :bnoise, release: 1.3, amp: 0.9
    control f, cutoff: 40
  end
  sleep 1.4
end

define :sfx_plane do          # supply plane flying over: fades in and out with a small pitch drop
  with_fx :slicer, phase: 0.06, mix: 0.7 do
    s = synth :saw, note: 40, note_slide: 4, attack: 1.5, sustain: 1, release: 1.5, cutoff: 70, amp: 0.4
    synth :pulse, note: 40.2, attack: 1.5, sustain: 1, release: 1.5, cutoff: 60, amp: 0.3
    control s, note: 38
  end
  sleep 4.1
end

define :sfx_level_start do    # short fanfare
  use_synth :square
  play_pattern_timed [:e4, :e4, :b4, :e5], [0.1, 0.1, 0.1, 0.1], release: 0.08, cutoff: 100, amp: 0.3
  play [:e5, :b5], release: 0.5, cutoff: 100, amp: 0.3
  sleep 0.6
end

define :sfx_wave_clear do     # rising arpeggio into a held chord
  with_fx :reverb, room: 0.5, mix: 0.3 do
    use_synth :chiplead
    [:e4, :g4, :b4, :e5, :g5, :b5].each { |n| play n, release: 0.12, amp: 0.35; sleep 0.08 }
    play chord(:g5, :major), release: 1.0, amp: 0.3
    sleep 1.1
  end
end

define :sfx_game_over do      # falling line and a low drone
  use_synth :square
  [:b4, :a4, :g4, :fs4, :e4].each { |n| play n, release: 0.3, cutoff: 85, amp: 0.3; sleep 0.3 }
  synth :saw, note: :e2, attack: 0.05, release: 1.5, cutoff: 70, amp: 0.4
  sleep 1.6
end

define :all_sfx do
  gap = 2
  puts "shoot";       sfx_shoot;       sleep gap
  puts "laser";       sfx_laser;       sleep gap
  puts "bomb";        sfx_bomb;        sleep gap
  puts "hit";         sfx_hit;         sleep gap
  puts "explode";     sfx_explode;     sleep gap
  puts "shield";      sfx_shield;      sleep gap
  puts "pickup";      sfx_pickup;      sleep gap
  puts "upgrade";     sfx_upgrade;     sleep gap
  puts "life";        sfx_life;        sleep gap
  puts "death";       sfx_death;       sleep gap
  puts "plane";       sfx_plane;       sleep gap
  puts "level_start"; sfx_level_start; sleep gap
  puts "wave_clear";  sfx_wave_clear;  sleep gap
  puts "game_over";   sfx_game_over;   sleep gap
end

# ---------- battle music: 132 bpm, 16 bars ----------
# Bars cycle Em - C - D - B. Sections of 4 bars: intro (bass, hats, arp), lead A with drums,
# break (arp, kick only), lead B with full drums.

define :battle_bar do |bar|
  use_bpm 132
  k = bar % 4
  sec = (bar / 4) % 4
  root = [:e2, :c2, :d2, :b1][k]
  ch = [chord(:e3, :minor), chord(:c3, :major), chord(:d3, :major), chord(:b2, :major)][k]
  lead_a = [
    [[:e5, :d5, :b4, :g4, :a4, :b4], [0.5, 0.5, 1, 0.5, 0.5, 1]],
    [[:c5, :b4, :g4, :e4, :g4],      [0.5, 0.5, 1, 1, 1]],
    [[:d5, :e5, :fs5, :e5, :d5, :a4], [0.5, 0.5, 1, 0.5, 0.5, 1]],
    [[:b4, :ds5, :fs5, :r],           [1.5, 0.5, 1, 1]]
  ]
  lead_b = [
    [[:g5, :fs5, :e5, :b4, :e5, :g5],  [0.5, 0.5, 1, 0.5, 0.5, 1]],
    [[:e5, :d5, :c5, :g4, :c5, :e5],   [0.5, 0.5, 1, 0.5, 0.5, 1]],
    [[:fs5, :e5, :d5, :a4, :d5, :fs5], [0.5, 0.5, 1, 0.5, 0.5, 1]],
    [[:ds5, :fs5, :b5, :r],            [1, 1, 1.5, 0.5]]
  ]

  in_thread do                # bass: eighth notes bouncing between octaves
    use_synth :chipbass
    8.times do |i|
      play (i.even? ? note(root) : note(root) + 12), release: 0.2, amp: 0.7
      sleep 0.5
    end
  end

  in_thread do                # hats
    8.times do |i|
      synth :chipnoise, freq_band: 14, release: (i.odd? ? 0.08 : 0.04), amp: (i.odd? ? 0.25 : 0.15)
      sleep 0.5
    end
  end

  if sec != 0
    in_thread do              # kick and snare
      4.times do |b|
        sample :bd_tek, amp: 0.9 if b.even? || (sec == 3 && b == 3)
        if b.odd? && sec != 2
          sample :sn_dolf, amp: 0.45
          synth :chipnoise, freq_band: 7, release: 0.12, amp: 0.3
        end
        sleep 1
      end
    end
  end

  if sec == 0 || sec == 2
    in_thread do              # sixteenth-note arpeggio
      use_synth :pulse
      16.times do |i|
        play ch[i] + (i >= 8 ? 12 : 0), release: 0.12, cutoff: 90, pulse_width: 0.25, amp: 0.25
        sleep 0.25
      end
    end
  end

  if sec == 1 || sec == 3
    in_thread do              # lead melody
      use_synth :chiplead
      notes, times = (sec == 1 ? lead_a : lead_b)[k]
      play_pattern_timed notes, times, release: 0.3, amp: 0.45
    end
  end

  sleep 4
end

# ---------- title music: 96 bpm, 8 bars ----------
# Pad, bass and arpeggio throughout; bell accents in the first half, melody in the second.

define :title_bar do |bar|
  use_bpm 96
  k = bar % 8
  root = [:e2, :c2, :g2, :d2, :e2, :c2, :b1, :b1][k]
  ch = [chord(:e3, :minor7), chord(:c3, :major7), chord(:g3, :major), chord(:d3, :major),
        chord(:e3, :minor), chord(:c3, :major), chord(:b2, :major), chord(:b2, :dom7)][k]
  melody = [
    [[:b4, :g4, :e4], [2, 1, 1]],
    [[:c5, :b4, :g4], [2, 1, 1]],
    [[:fs4, :a4, :b4, :ds5], [1, 1, 1, 1]],
    [[:fs5, :r], [3, 1]]
  ]

  synth :prophet, notes: ch, attack: 0.5, sustain: 2.5, release: 1.5, cutoff: 75, amp: 0.3
  synth :tri, note: root, attack: 0.05, sustain: 3, release: 0.9, amp: 0.5

  in_thread do                # soft arpeggio, up and back down
    use_synth :tri
    8.times do |i|
      play ch[[0, 1, 2, 3, 2, 1, 0, 1][i]] + 12, release: 0.3, amp: 0.2
      sleep 0.5
    end
  end

  if k < 4
    synth :pretty_bell, note: [:e5, :e5, :d5, :fs5][k], release: 2, amp: 0.25
  else
    sample :bd_haus, amp: 0.4
    in_thread do
      use_synth :blade
      notes, times = melody[k - 4]
      play_pattern_timed notes, times, release: 0.8, cutoff: 95, amp: 0.4
    end
  end

  sleep 4
end

# ---------- render ----------

case piece
when :battle
  3.times { 16.times { |b| battle_bar b } }
when :title
  with_fx :reverb, room: 0.7, mix: 0.35 do
    3.times { 8.times { |b| title_bar b } }
  end
when :all_sfx     then all_sfx
when :shoot       then sfx_shoot
when :laser       then sfx_laser
when :bomb        then sfx_bomb
when :hit         then sfx_hit
when :explode     then sfx_explode
when :shield      then sfx_shield
when :pickup      then sfx_pickup
when :upgrade     then sfx_upgrade
when :life        then sfx_life
when :death       then sfx_death
when :plane       then sfx_plane
when :level_start then sfx_level_start
when :wave_clear  then sfx_wave_clear
when :game_over   then sfx_game_over
end

sleep 2   # let reverb and release tails finish before you stop recording
puts "DONE"

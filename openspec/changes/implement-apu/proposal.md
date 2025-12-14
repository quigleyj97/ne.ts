# Change: Implement NES APU (Audio Processing Unit)

## Why

The current APU implementation in [`src/devices/apu.ts`](../../../src/devices/apu.ts) is a non-functional stub that uses high-level WebAudio oscillators and is not connected to the emulator bus. This prevents any NES ROM from producing audio, as all APU register writes ($4000-$4017) fall through to the cartridge instead of being handled by the APU.

A cycle-accurate APU implementation is essential for:
- Game compatibility (many games depend on precise APU timing)
- Authentic NES audio reproduction (non-linear mixing, hardware quirks)
- Complete emulator functionality (APU is 1 of 3 core NES components: CPU, PPU, APU)

## What Changes

This change implements a complete, cycle-accurate NES 2A03 APU with the following components:

**Core Implementation:**
- Implement [`IBusDevice`](../../../src/utils/types.ts) interface on [`Apu2A03`](../../../src/devices/apu.ts)
- Map APU to CPU bus at $4000-$4017 in [`NesEmulator`](../../../src/devices/nes.ts)
- Add register read/write handlers for all 24 APU registers
- Implement all 5 audio channels (2 pulse, triangle, noise, DMC)
- Implement frame counter and timing sequencer
- Create AudioWorklet-based audio output pipeline
- Implement non-linear mixing using authentic NES DAC formulas

**Audio Channels** (per [NESDev APU specifications](https://www.nesdev.org/wiki/APU)):
- **Pulse Channels (2)**: Square wave generators with duty cycle, envelope, sweep, length counter
- **Triangle Channel**: Triangle wave with linear counter and length counter
- **Noise Channel**: Pseudo-random noise using 15-bit LFSR
- **DMC Channel**: Delta modulation sample playback with CPU DMA

**Supporting Units** (justified by [NESDev Frame Counter documentation](https://www.nesdev.org/wiki/APU_Frame_Counter) - the NES APU requires precise timing control to maintain authentic audio output; the frame counter provides hardware-accurate clocking of envelope generators, sweep units, and length counters):
- **Frame Counter**: Clocks envelopes, sweeps, and length counters at 240 Hz (4-step) or 192 Hz (5-step)
- **Envelope Unit**: Volume control with attack/decay
- **Sweep Unit**: Automatic pitch adjustment for pulse channels
- **Length Counter**: Automatic note duration control

**Audio Output:**
- Sample-based generation at APU native rate (~894 kHz for NTSC, per [NESDev APU timing](https://www.nesdev.org/wiki/APU#Frame_Counter))
- Non-linear mixing per NES hardware specifications
- AudioWorklet processor for low-latency real-time output (Chrome 140+, Firefox 140+, Safari 26+)
- Dynamic rate control to prevent buffer underrun/overrun
- No fallback implementation - AudioWorklet required

**Testing Strategy:**
- Unit tests for each channel and component
- Integration tests using Blargg's APU test ROM suite
- Validation against known-good audio output from reference emulators
- Test with DMC-heavy games (Battletoads, Mega Man 3)
- Browser compatibility testing (Chrome, Firefox, Safari)

## Impact

**Affected Specs:**
- `apu-bus-integration` (new capability)
- `apu-pulse-channels` (new capability)
- `apu-triangle-channel` (new capability)
- `apu-noise-channel` (new capability)
- `apu-dmc-channel` (new capability)
- `apu-frame-counter` (new capability)
- `apu-audio-output` (new capability)

**Affected Code:**
- [`src/devices/apu.ts`](../../../src/devices/apu.ts) - Complete rewrite with cycle-accurate emulation
- [`src/devices/nes.ts`](../../../src/devices/nes.ts) - Map APU to bus, add clock() calls
- [`src/devices/cpu.ts`](../../../src/devices/cpu.ts) - Add DMC DMA stall support
- **New files** (under `src/devices/apu/`):
  - Channel classes: `pulse.ts`, `triangle.ts`, `noise.ts`, `dmc.ts`
  - Unit classes: `envelope.ts`, `sweep.ts`, `frame-counter.ts`
  - Audio pipeline: `worklet-processor.ts`, `resampler.ts`, `mixer.ts`
  - Constants: `constants.ts`, `tables.ts`

**Breaking Changes:**
- None (APU was non-functional before)

**Performance Impact:**
- Additional CPU usage for sample generation (~894 kHz rate)
- Memory: ~200 KB for audio buffers and state
- Audio latency target: <50ms

**Browser Requirements:**
- AudioWorklet support required (Chrome 140+, Firefox 140+, Safari 26+)
- Web Audio API required (no Node.js headless support without polyfill)
- No audio if browser lacks AudioWorklet support (acceptable tradeoff)

**Test Resources:**
- blargg's APU test suite: http://slack.net/~ant/nes-tests/ (public domain, available at https://github.com/christopherpow/nes-test-roms)
- bbbradsmith's audio tests: https://github.com/bbbradsmith/nes-audio-tests
- NESDev APU reference: https://www.nesdev.org/wiki/APU

**Known Limitations:**
- NTSC timing only (PAL support deferred)
- No expansion audio (VRC6, FDS, MMC5)
- Browser-only (requires Web Audio API)

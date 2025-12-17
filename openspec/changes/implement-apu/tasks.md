# Implementation Tasks: NES APU

**Updated based on PR #13 feedback** - This task list reflects:
- AudioWorklet-only approach (no ScriptProcessorNode fallback)
- Frame-accurate APU timing (not strict cycle-accuracy)
- DMC DMA handled at NES layer (following PPU DMA pattern)
- Type conventions: `number` for emulator-only tracking, `u8`/`u16` for hardware registers
- Clock calls following PPU pattern (see [`src/devices/ppu.ts`](../../../src/devices/ppu.ts))
- Browser requirements: Chrome 140+, Firefox 140+, Safari 26+

## 1. Foundation & Bus Integration
- [x] 1.1 Create `src/devices/apu/constants.ts` with register addresses and timing constants
- [x] 1.2 Create `src/devices/apu/tables.ts` with lookup tables (length counter, noise periods, DMC rates)
- [x] 1.3 Implement `IBusDevice` interface on `Apu2A03` class (read/write methods)
- [x] 1.4 Add register read handler for $4015 status register
- [x] 1.5 Add register write handler routing for $4000-$4017
- [x] 1.6 Map APU to CPU bus in `NesEmulator` constructor ($4000-$4017, mask 0xFFFF)
- [x] 1.7 Add `clock()` method stub to `Apu2A03` class
- [x] 1.8 Integrate `apu.clock()` call in `NesEmulator.tick()` every CPU cycle
- [x] 1.9 Write unit tests for bus integration and register mapping

## 2. Envelope Unit
- [x] 2.1 Create `src/devices/apu/units/envelope.ts`
- [x] 2.2 Implement envelope state variables using appropriate types: `number` for internal tracking (divider, decayLevel), flags as `boolean`
- [x] 2.3 Implement `write(data: u8)` method to configure envelope
- [x] 2.4 Implement `clock()` method for envelope timing
- [x] 2.5 Implement `restart()` method to reset envelope
- [x] 2.6 Implement `output()` method returning current volume (0-15)
- [x] 2.7 Write unit tests for envelope behavior (attack, decay, loop, constant volume)

## 3. Sweep Unit
- [x] 3.1 Create `src/devices/apu/units/sweep.ts`
- [x] 3.2 Implement sweep state variables using appropriate types: `number` for internal tracking, `boolean` for flags
- [x] 3.3 Add `onesComplement` flag to distinguish Pulse 1 vs Pulse 2 behavior
- [x] 3.4 Implement `write(data: u8)` method to configure sweep
- [x] 3.5 Implement `clock(currentPeriod: number)` method returning new period (uses `number` for internal tracking)
- [x] 3.6 Implement `isMuting(currentPeriod: u16)` method for muting logic
- [x] 3.7 Implement sweep target period calculation (ones' complement vs two's complement)
- [x] 3.8 Write unit tests for sweep unit (up/down, negate difference between channels)

## 4. Pulse Channels
- [x] 4.1 Create `src/devices/apu/channels/pulse.ts`
- [x] 4.2 Implement `PulseChannel` class with state variables using type conventions: `u8`/`u16` for actual hardware register emulation that needs bit masking, `number` for emulator-only tracking variables
- [x] 4.3 Add duty cycle sequences (12.5%, 25%, 50%, 75%) as constant arrays
- [x] 4.4 Integrate `Envelope` unit instance
- [x] 4.5 Integrate `SweepUnit` instance (with onesComplement flag for Pulse 1)
- [x] 4.6 Implement length counter logic
- [x] 4.7 Implement register write handlers for $4000-$4003 (Pulse 1) and $4004-$4007 (Pulse 2) using `u8` types for register data
- [x] 4.8 Implement `clock()` method for timer and duty cycle stepping (follow PPU pattern for efficient hot loop execution - see [`src/devices/ppu.ts`](../../../src/devices/ppu.ts))
- [x] 4.9 Implement `clockQuarter()` for envelope clocking (called by frame counter)
- [x] 4.10 Implement `clockHalf()` for sweep and length counter clocking (called by frame counter)
- [x] 4.11 Implement `output()` method returning 0-15 based on duty cycle, envelope, and muting
- [x] 4.12 Implement phase reset on $4003/$4007 write (hardware quirk)
- [x] 4.13 Implement muting conditions (timer < 8, sweep target > $7FF)
- [x] 4.14 Write unit tests for pulse channels (duty cycles, envelope, sweep, length counter, muting)

## 5. Triangle Channel
- [x] 5.1 Create `src/devices/apu/channels/triangle.ts`
- [x] 5.2 Implement `TriangleChannel` class with state variables using type conventions (hardware registers: `u8`/`u16`, tracking: `number`)
- [x] 5.3 Add 32-step triangle wave sequence as constant array
- [x] 5.4 Implement linear counter logic (reload value, reload flag, control flag)
- [x] 5.5 Implement length counter logic
- [x] 5.6 Implement register write handlers for $4008, $400A, $400B
- [x] 5.7 Implement `clock()` method for timer and sequence stepping
- [x] 5.8 Implement `clockQuarter()` for linear counter clocking
- [x] 5.9 Implement `clockHalf()` for length counter clocking
- [x] 5.10 Implement `output()` method returning triangle waveform value (0-15)
- [x] 5.11 Implement linear counter reload flag behavior (hardware quirk)
- [x] 5.12 Implement muting condition (timer < 2)
- [x] 5.13 Write unit tests for triangle channel (waveform, linear counter, length counter, muting)

## 6. Noise Channel
- [x] 6.1 Create `src/devices/apu/channels/noise.ts`
- [x] 6.2 Implement `NoiseChannel` class with state variables using type conventions
- [x] 6.3 Initialize 15-bit LFSR shift register to 1 (not 0 - hardware quirk)
- [x] 6.4 Add noise period lookup table constant
- [x] 6.5 Integrate `Envelope` unit instance
- [x] 6.6 Implement length counter logic
- [x] 6.7 Implement register write handlers for $400C, $400E, $400F
- [x] 6.8 Implement `clock()` method with LFSR feedback logic (long mode: bits 0^1, short mode: bits 0^6)
- [x] 6.9 Implement `clockQuarter()` for envelope clocking
- [x] 6.10 Implement `clockHalf()` for length counter clocking
- [x] 6.11 Implement `output()` method based on LFSR bit 0 and envelope
- [x] 6.12 Write unit tests for noise channel (LFSR sequence, mode switching, envelope, length counter)

## 7. DMC Channel
- [ ] 7.1 Create `src/devices/apu/channels/dmc. ts`
- [ ] 7.2 Implement `DmcChannel` class with state variables using type conventions (rate, loop, IRQ, address, length, output level)
- [ ] 7.3 Add DMC rate lookup table constant
- [ ] 7.4 Implement register write handlers for $4010-$4013
- [ ] 7.5 Implement $4011 direct load (immediate output level change)
- [ ] 7.6 Implement sample address calculation ($C000 + A * 64)
- [ ] 7.7 Implement sample length calculation (L * 16 + 1)
- [ ] 7.8 Implement sample buffer and bit shifting logic
- [ ] 7.9 Implement `clock()` method with rate timer and sample playback
- [ ] 7.10 Implement DMA trigger logic (return address when sample needed)
- [ ] 7.11 Implement `loadSampleByte(byte: u8)` method for DMA integration
- [ ] 7.12 Implement 7-bit output level/DAC with increment/decrement
- [ ] 7.13 Implement loop flag behavior (restart or silence when done)
- [ ] 7.14 Implement IRQ flag generation
- [ ] 7.15 Implement `output()` method returning current output level (0-127)
- [ ] 7.16 Write unit tests for DMC channel (rate timer, sample playback, looping, IRQ, direct load)

## 8. Frame Counter
- [x] 8.1 Create `src/devices/apu/units/frame-counter.ts`
- [x] 8.2 Implement `FrameCounter` class with state variables (mode, IRQ inhibit, interrupt flag, cycle counter)
- [x] 8.3 Implement 4-step mode timing (cycles 7459, 14913, 22371, 29829)
- [x] 8.4 Implement 5-step mode timing (cycles 7459, 14913, 22371, 29829, 37281)
- [x] 8.5 Implement delayed write logic (3-4 cycle delay for $4017 writes)
- [x] 8.6 Implement immediate clock on 5-step mode write
- [x] 8.7 Implement IRQ generation in 4-step mode
- [x] 8.8 Implement IRQ inhibit flag handling
- [x] 8.9 Implement `write(data: u8)` method for $4017 register
- [x] 8.10 Implement `clock()` method returning events (quarter frame, half frame, IRQ)
- [x] 8.11 Integrate frame counter events in `Apu2A03` to clock all channels
- [x] 8.12 Write unit tests for frame counter (4-step timing, 5-step timing, IRQ, delayed write)

## 9. APU Main Class Integration
- [ ] 9.1 Instantiate pulse1, pulse2, triangle, noise, dmc channel objects in `Apu2A03`
- [ ] 9.2 Instantiate frame counter in `Apu2A03`
- [ ] 9.3 Implement complete $4015 status register read (all channel length counters, DMC bytes, IRQ flags) using `u8` types
- [ ] 9.4 Implement complete $4015 write (enable/disable channels, clear DMC interrupt)
- [ ] 9.5 Implement $4015 read side effect (clear frame interrupt flag - hardware quirk)
- [ ] 9.6 Implement $4015 write side effects (zero length counters, restart DMC - hardware quirks)
- [ ] 9.7 Route register writes to appropriate channels based on address
- [ ] 9.8 Implement frame-accurate sample generation (APU can batch cycles, generate correct samples per frame)
- [ ] 9.9 Connect frame counter events to channel clock methods (consolidate clocking to minimize hot loop overhead following PPU pattern)
- [ ] 9.10 Write integration tests for full APU register behavior

## 10. Audio Mixing
- [ ] 10.1 Create `src/devices/apu/audio/mixer.ts`
- [ ] 10.2 Implement non-linear pulse mixing formula: 95.88 / ((8128 / (pulse1 + pulse2)) + 100)
- [ ] 10.3 Implement non-linear TND mixing formula: 159.79 / ((1 / (tri/8227 + noise/12241 + dmc/22638)) + 100)
- [ ] 10.4 Handle division by zero case (all channels silent → output = 0)
- [ ] 10.5 Implement `mix(p1, p2, tri, noise, dmc)` method returning -1.0 to +1.0 sample
- [ ] 10.6 Integrate mixer in `Apu2A03.clock()` to generate mixed samples
- [ ] 10.7 Write unit tests for mixing formulas with known input/output values

## 11. Sample Resampler
- [ ] 11.1 Create `src/devices/apu/audio/resampler.ts`
- [ ] 11.2 Implement cubic interpolation resampler
- [ ] 11.3 Add configurable input frequency (APU rate ~894 kHz)
- [ ] 11.4 Add configurable output frequency (typically 44.1 kHz or 48 kHz)
- [ ] 11.5 Implement `write(sample: number)` to add APU sample to input buffer
- [ ] 11.6 Implement `read()` to produce resampled output sample
- [ ] 11.7 Implement `pending()` to report input buffer fill level
- [ ] 11.8 Implement `setInputFrequency(hz: number)` for dynamic rate control
- [ ] 11.9 Write unit tests for resampler (verify output sample rate, interpolation quality)

## 12. AudioWorklet Processor (AudioWorklet Only - No Fallback)
- [ ] 12.1 Create `src/devices/apu/audio/worklet-processor.ts`
- [ ] 12.2 Implement `ApuAudioProcessor` class extending `AudioWorkletProcessor`
- [ ] 12.3 Integrate resampler instance in processor
- [ ] 12.4 Implement `process()` method to fill output buffer with resampled samples
- [ ] 12.5 Implement message handler for receiving samples from main thread
- [ ] 12.6 Implement buffer level monitoring and request-more-samples signaling
- [ ] 12.7 Register processor with `registerProcessor('apu-audio-processor', ApuAudioProcessor)`
- [ ] 12.8 Build/bundle worklet processor as separate JavaScript file
- [ ] 12.9 Write tests for worklet processor (if testable in environment)
- [ ] 12.10 Log warning and disable audio if AudioWorklet not supported (no fallback implementation)

## 14. Dynamic Rate Control
- [ ] 14.1 Create `DynamicRateController` class in resampler or separate file
- [ ] 14.2 Implement buffer fill level monitoring
- [ ] 14.3 Implement rate adjustment algorithm (±0.5% maximum)
- [ ] 14.4 Target 50% buffer fill level
- [ ] 14.5 Integrate rate adjustment into resampler frequency control
- [ ] 14.6 Add feedback mechanism from AudioWorklet to main thread for buffer status
- [ ] 14.7 Tune adjustment parameters for stability
- [ ] 14.8 Write tests for rate control algorithm

## 15. APU Audio Pipeline Integration (AudioWorklet Only)
- [ ] 15.1 Refactor `Apu2A03.build()` to detect AudioWorklet support (warn and disable audio if unavailable)
- [ ] 15.2 Implement `Apu2A03WithWorklet` using AudioWorklet
- [ ] 15.3 Load AudioWorklet module in browser
- [ ] 15.4 Create AudioWorkletNode and connect to AudioContext destination
- [ ] 15.5 Implement sample buffer queue in main thread
- [ ] 15.6 Implement message passing (main thread → worklet for samples)
- [ ] 15.7 Implement message passing (worklet → main thread for buffer requests)
- [ ] 15.8 Batch sample transfers for efficiency
- [ ] 15.9 Add audio enable/disable controls
- [ ] 15.10 Handle AudioContext suspended state (user gesture required)
- [ ] 15.11 Use Web Audio API standard values: 48kHz sample rate default (per MDN documentation)
- [ ] 15.12 Tune buffer size empirically for optimal latency/stability balance

## 16. NES Layer DMC DMA Integration (Not CPU Layer)
- [ ] 16.1 Add `dmcStallCycles` counter to `NesEmulator` class (NOT `Cpu6502` - keep CPU platform-agnostic)
- [ ] 16.2 Implement DMC DMA stall handling in `NesEmulator.tick()` similar to PPU DMA pattern (see [`src/devices/ppu.ts`](../../../src/devices/ppu.ts))
- [ ] 16.3 When stalled, continue clocking PPU and APU but not CPU
- [ ] 16.4 Add `getDmcDmaRequest()` method to `Apu2A03` to query DMC DMA needs
- [ ] 16.5 Read sample byte from CPU bus when DMC requests DMA
- [ ] 16.6 Add `loadDmcSample(byte: u8)` method to `Apu2A03` to deliver DMA data
- [ ] 16.7 Set appropriate stall cycles (~4 based on CPU alignment)
- [ ] 16.8 Write unit tests for NES layer DMA mechanism
- [ ] 16.9 Write integration tests for DMC DMA timing

## 17. Hardware Quirks Implementation
- [ ] 17.1 Verify Pulse 1 sweep uses ones' complement negation
- [ ] 17.2 Verify Pulse 2 sweep uses two's complement negation
- [ ] 17.3 Verify phase reset on $4003/$4007 write
- [ ] 17.4 Verify $4015 read clears frame interrupt flag
- [ ] 17.5 Verify $4015 write zeros length counters when disabling
- [ ] 17.6 Verify Noise LFSR initializes to 1
- [ ] 17.7 Verify frame counter write delay (3-4 cycles)
- [ ] 17.8 Verify triangle linear counter reload flag behavior
- [ ] 17.9 Verify pulse muting conditions (timer < 8, sweep target > $7FF)
- [ ] 17.10 Verify triangle muting condition (timer < 2)
- [ ] 17.11 Write dedicated tests for each hardware quirk

## 18. Early APU Unit Test Suite (Before ROM Integration)
- [ ] 18.1 Write comprehensive unit tests for each APU channel class
- [ ] 18.2 Write unit tests for envelope, sweep, and frame counter units
- [ ] 18.3 Write unit tests for register read/write behavior
- [ ] 18.4 Write unit tests for mixing formulas with known values
- [ ] 18.5 Write unit tests for each hardware quirk independently
- [ ] 18.6 Write unit tests for timing synchronization
- [ ] 18.7 Verify all unit tests pass before ROM testing

## 19. Test ROM Integration
- [ ] 19.1 Download blargg's APU test suite: Public domain, from http://slack.net/~ant/nes-tests/ or https://github.com/christopherpow/nes-test-roms
- [ ] 19.2 Document test ROM licensing: Can be committed to repository (public domain)
- [ ] 19.3 Add test ROMs to `test/data/apu/` directory (apu_test, apu_reset, blargg_apu_2005.07.30, dmc_dma_during_read4)
- [ ] 19.4 Wire up test ROMs like NESTEST - run ROM, check pass/fail output at specific memory locations
- [ ] 19.5 Document available test ROMs and their purposes
- [ ] 19.6 Run and validate against known-good results
- [ ] 19.7 Fix any failing tests
- [ ] 19.8 Add tests to CI pipeline

## 20. Browser Compatibility Testing (AudioWorklet Only)
- [ ] 20.1 Test in Chrome 140+ with AudioWorklet
- [ ] 20.2 Test in Firefox 140+ with AudioWorklet
- [ ] 20.3 Test in Safari 26+ with AudioWorklet
- [ ] 20.4 Test in Edge (latest) with AudioWorklet
- [ ] 20.5 Test on mobile browsers (Chrome Android, Safari iOS)
- [ ] 20.6 Verify graceful degradation (no audio) in browsers without AudioWorklet
- [ ] 20.7 Document minimum browser version requirements (Chrome 140+, Firefox 140+, Safari 26+)
- [ ] 20.8 Add browser compatibility warnings/detection in UI

## 21. Game Compatibility Testing
- [ ] 20.1 Test with Super Mario Bros (basic pulse and triangle)
- [ ] 20.2 Test with Mega Man 2 (complex music, pulse channels)
- [ ] 20.3 Test with Castlevania (advanced music techniques)
- [ ] 20.4 Test with Battletoads (heavy DMC usage)
- [ ] 20.5 Test with The Legend of Zelda (triangle bass lines)
- [ ] 20.6 Test with Gimmick! (all channels, complex audio)
- [ ] 20.7 Compare audio output with reference emulators (FCEUX, Mesen)
- [ ] 20.8 Document any compatibility issues found
- [ ] 20.9 Fix critical compatibility issues

## 22. Performance Optimization
- [ ] 22.1 Profile APU `clock()` method performance
- [ ] 22.2 Profile mixing and resampling performance
- [ ] 22.3 Optimize hot paths (use typed arrays, avoid allocations)
- [ ] 22.4 Consider lookup tables for mixing formulas if needed
- [ ] 22.5 Verify 60 FPS minimum maintained with audio enabled (qualitative goal - no specific CPU overhead limit)
- [ ] 22.6 Test on low-end devices/browsers
- [ ] 22.7 Ensure no regression in existing emulator performance
- [ ] 22.8 Add performance metrics logging if needed

## 23. Documentation
- [ ] 22.1 Add JSDoc comments to all public APIs
- [ ] 22.2 Document APU architecture in code comments
- [ ] 22.3 Update README.md with audio feature description
- [ ] 22.4 Document browser compatibility requirements
- [ ] 22.5 Add troubleshooting guide for audio issues
- [ ] 22.6 Document known limitations (NTSC-only, no expansion audio)
- [ ] 22.7 Add code examples for using APU
- [ ] 22.8 Document hardware quirks implemented

## 24. Final Validation
- [ ] 23.1 Run all unit tests and verify 100% pass
- [ ] 24.2 Run all integration tests and verify pass
- [ ] 24.3 Run blargg's APU test suite and verify pass
- [ ] 24.4 Verify no regressions in existing emulator functionality
- [ ] 24.5 Verify audio quality is acceptable via manual listening (subjective verification)
- [ ] 24.6 Verify no audio glitches (pops, clicks, dropouts) via listening tests
- [ ] 24.7 Verify dynamic rate control prevents drift over extended play
- [ ] 24.8 Final code review and cleanup
- [ ] 24.9 Update OpenSpec documentation
- [ ] 24.10 Mark proposal as complete

# Design: NES APU Implementation

## Context

The NES APU (Audio Processing Unit) is a complex hardware component that generates 5 audio channels and must integrate tightly with the emulator's bus, CPU, and timing systems. The current [`Apu2A03`](../../../src/devices/apu.ts) implementation is a non-functional stub using high-level WebAudio oscillators.

This design covers the architectural decisions for implementing a sample-accurate APU that:
- Integrates with the existing [`Bus`](../../../src/devices/bus.ts) and [`IBusDevice`](../../../src/utils/types.ts) architecture
- Generates audio samples at the native APU rate (~894 kHz)
- Outputs audio using Web Audio API with minimal latency
- Maintains cycle-accurate timing for game compatibility

**Constraints:**
- Browser-only (Web Audio API required)
- Must maintain 60 FPS emulation speed
- Audio latency target: <50ms
- TypeScript strict mode compliance
- ES module format with `.js` extensions

**Stakeholders:**
- End users (game audio quality and compatibility)
- Developers (maintainability, test coverage)
- Browser compatibility (Chrome, Firefox, Safari)

## Goals / Non-Goals

### Goals

1. **Sample-Accurate Emulation**: Implement all 5 APU channels with hardware-accurate behavior at audio sample boundaries (CPU/PPU cycle-accuracy is the priority; APU can batch internal clock cycles)
2. **Bus Integration**: Connect APU to CPU bus at $4000-$4017 via [`IBusDevice`](../../../src/utils/types.ts) interface
3. **Authentic Audio**: Use non-linear mixing formulas matching NES hardware DAC
4. **Low Latency**: Achieve <50ms audio latency using AudioWorklet
5. **Hardware Quirks**: Implement documented hardware quirks from NESDev Wiki for compatibility (see [APU hardware quirks](https://www.nesdev.org/wiki/APU))
6. **Test Coverage**: Validate using [blargg's APU test ROMs](http://slack.net/~ant/nes-tests/). License: Public domain. Acquisition: Download from [nes-test-roms repository](https://github.com/christopherpow/nes-test-roms). Integration: Wire up like NESTEST - run ROM, check pass/fail output register at specific memory locations. Available test ROMs include apu_test (general), apu_reset, blargg_apu_2005.07.30 (timing tests), and dmc_dma_during_read4.
7. **Performance**: Maintain 60 FPS minimum emulation speed with audio enabled. No specific CPU overhead limit - just avoid regressing existing performance. No benchmarks needed yet.
8. **Browser Compatibility**: Support Chrome 140+, Firefox 140+, Safari 26+ (AudioWorklet required)

### Non-Goals

1. **PAL Support**: Focus on NTSC timing only (PAL deferred to future work). Design does NOT block PAL or audio-generating mapper compatibility - future expansion is possible.
2. **Expansion Audio**: VRC6, FDS, MMC5 audio chips not covered (possible future enhancement)
3. **Node.js Support**: Web Audio API required, no headless mode
4. **$4011 Sample Playback**: Advanced DMC abuse technique deferred
5. **Perfect Accuracy**: Target 95% compatibility now with a clear path to 100% hardware precision through iterative improvement
6. **Browser-based Audio Testing**: Defer browser-based audio testing for now. Pure unit tests for APU logic only. Audio output verified manually.

## Decisions

### Decision 1: Sample-Based Generation vs Real-Time Oscillators

**Choice**: Use sample-based generation at APU native rate (~894 kHz)

**Rationale**:
- NES APU works by generating samples, not by controlling oscillators
- Cycle-accurate behavior requires tracking precise timer states
- Hardware quirks (phase reset, sweep calculations) need sample-level control
- Non-linear mixing requires combining raw channel outputs

**Alternatives Considered**:
- ❌ **WebAudio Oscillators**: Current approach, too high-level, can't implement hardware quirks
- ❌ **Direct AudioContext sample playback**: No resampling, buffer management issues
- ✅ **Sample generation + AudioWorklet**: Best of both worlds - accurate emulation + browser audio API

**Implementation**:
```typescript
// In Apu2A03.clock() - called every CPU cycle
public clock() {
    // Generate one APU sample at native rate
    this.sampleCounter++;
    if (this.sampleCounter >= 2) { // APU runs at CPU/2
        this.sampleCounter = 0;
        
        // Clock all channels
        this.pulse1.clock();
        this.pulse2.clock();
        this.triangle.clock();
        this.noise.clock();
        this.dmc.clock();
        
        // Mix and buffer sample
        const sample = this.mixChannels();
        this.sampleBuffer.push(sample);
    }
}
```

### Decision 2: AudioWorklet for Audio Output

**Choice**: Use AudioWorklet exclusively for audio output

**Rationale**:
- AudioWorklet runs audio processing on separate thread (no main thread blocking)
- Lower latency than deprecated alternatives
- Modern browser support is now universal (Chrome 140+, Firefox 140+, Safari 26+)
- Simpler implementation without fallback complexity
- No audio output if browser lacks AudioWorklet support (acceptable tradeoff)

**Alternatives Considered**:
- ❌ **ScriptProcessorNode fallback**: Deprecated, adds complexity, no longer needed for target browsers
- ❌ **Other fallback implementations**: Not needed given modern browser requirements
- ✅ **AudioWorklet only**: Clean, performant, aligns with modern web standards

**Implementation**:
```typescript
public static async build() {
    if (!('audioWorklet' in AudioContext.prototype)) {
        console.warn('AudioWorklet not supported. Audio will not be available.');
        // Return APU with no audio output but continue emulation
    }
    return new Apu2A03WithWorklet();
}
```

### Decision 3: File Structure - Monolithic vs Modular

**Choice**: Modular structure with separate channel and unit classes

**Rationale**:
- Each channel has distinct behavior (200+ lines each)
- Shared units (Envelope, Sweep) used by multiple channels
- Easier testing and maintenance
- Follows existing project pattern (separate device classes)

**Structure**:
```
src/devices/
├── apu.ts                    # Main Apu2A03 class (IBusDevice implementation)
└── apu/
    ├── channels/
    │   ├── pulse.ts          # PulseChannel class
    │   ├── triangle.ts       # TriangleChannel class
    │   ├── noise.ts          # NoiseChannel class
    │   └── dmc.ts            # DmcChannel class
    ├── units/
    │   ├── envelope.ts       # Envelope unit (shared by pulse/noise)
    │   ├── sweep.ts          # SweepUnit (used by pulse channels)
    │   └── frame-counter.ts  # FrameCounter timing sequencer
    ├── audio/
    │   ├── worklet-processor.ts    # AudioWorkletProcessor
    │   ├── script-processor.ts     # ScriptProcessorNode fallback
    │   ├── resampler.ts            # Sample rate conversion
    │   └── mixer.ts                # Non-linear mixing
    ├── constants.ts          # Register addresses, timing constants
    └── tables.ts             # Lookup tables (length counter, noise periods, etc.)
```

**Alternatives Considered**:
- ❌ **Single large file**: Unmaintainable, 2000+ lines
- ❌ **Flat structure**: No organization, hard to navigate
- ✅ **Hierarchical by responsibility**: Clear, maintainable

### Decision 4: Dynamic Rate Control Implementation

**Choice**: Implement dynamic resampling with ±0.5% maximum pitch adjustment

**Rationale**:
- Browser timing not precisely 60.0988 Hz (varies by implementation)
- Fixed-rate playback causes buffer underrun/overrun over time
- Small pitch adjustments (<0.5%) are imperceptible to human ear
- Proven technique (used by Near in bsnes/higan emulators)

**Algorithm** (based on Near's Dynamic Rate Control):
```typescript
class DynamicRateController {
    private maxDelta = 0.005;  // 0.5% maximum adjustment
    private targetFill = 0.5;   // Keep buffer 50% full
    
    adjustRate(bufferFillLevel: number, baseRate: number): number {
        // fillLevel: 0.0 (empty) to 1.0 (full)
        // Adjust input rate to compensate
        const adjustment = (1.0 - this.maxDelta) + 
                          (2.0 * bufferFillLevel * this.maxDelta);
        return baseRate * adjustment;
    }
}
```

**Alternatives Considered**:
- ❌ **Fixed rate**: Buffer drift causes audio glitches
- ❌ **Buffer size adjustment**: Increases latency, doesn't solve problem
- ❌ **Dropping/duplicating samples**: Causes audible pops/clicks
- ✅ **Dynamic rate control**: Smooth, imperceptible, proven

### Decision 5: DMC DMA Integration - NES Layer Responsibility

**Choice**: DMC DMA stalls should be handled by the NES emulator layer, not the CPU directly

**Rationale**:
- Similar to PPU DMA handling pattern
- Keeps CPU platform-agnostic for portability to other 6502 systems
- DMC DMA reads stall CPU for 3-4 cycles (hardware behavior)
- Some games rely on this timing for synchronization
- Clean separation of concerns: CPU remains generic, NES layer handles NES-specific behavior

**Implementation**:
```typescript
// In NesEmulator (similar to PPU DMA pattern - see ppu.ts and bus.ts)
private dmcStallCycles = 0;

public tick(): void {
    if (this.dmcStallCycles > 0) {
        this.dmcStallCycles--;
        // Continue clocking PPU and APU but not CPU during stall
        this.ppu.clock();
        this.apu.clock();
        return;
    }
    
    // Normal execution: CPU, PPU, APU all clock
    const cpuCycles = this.cpu.tick();
    for (let i = 0; i < cpuCycles * 3; i++) {
        this.ppu.clock();
    }
    this.apu.clock();
    
    // Check if APU DMC needs DMA
    const dmaRequest = this.apu.getDmcDmaRequest();
    if (dmaRequest) {
        const byte = this.cpuBus.read(dmaRequest.address);
        this.apu.loadDmcSample(byte);
        this.dmcStallCycles = dmaRequest.stallCycles; // ~4 cycles
    }
}
```

This follows the same pattern as PPU DMA (see [`src/devices/ppu.ts`](../../../src/devices/ppu.ts) and [`src/devices/bus.ts`](../../../src/devices/bus.ts) for reference).

**Alternatives Considered**:
- ❌ **Ignore DMA stalls**: Breaks timing-sensitive games
- ❌ **Always stall**: Over-complicates CPU, hard to test
- ✅ **Optional stall mechanism**: Clean, testable, accurate

### Decision 6: Hardware Quirks Implementation Strategy

**Choice**: Implement all documented quirks from the start, with dedicated tests

**Rationale**:
- Games depend on specific quirks (sweep negate difference, phase reset, etc.)
- Retrofitting quirks later is harder than building them in
- Test ROMs specifically check for these behaviors
- Better to fail loudly (test failure) than subtly (wrong audio)

**Critical Quirks to Implement** (documented at [NESDev Wiki - APU](https://www.nesdev.org/wiki/APU)):
1. [Pulse sweep negate difference](https://www.nesdev.org/wiki/APU_Sweep): Pulse 1 uses ones' complement for sweep negate, Pulse 2 uses two's complement
2. [Duty cycle phase reset](https://www.nesdev.org/wiki/APU_Pulse): Writing $4003/$4007 resets duty cycle phase
3. [Status register read side effect](https://www.nesdev.org/wiki/APU#Status_($4015)): Reading $4015 clears frame interrupt flag
4. [Channel disable behavior](https://www.nesdev.org/wiki/APU#Status_($4015)): Writing 0 to $4015 channel bit immediately zeros length counter
5. [Noise LFSR initialization](https://www.nesdev.org/wiki/APU_Noise): Noise LFSR initializes to 1, not 0
6. [Frame counter write delay](https://www.nesdev.org/wiki/APU_Frame_Counter): Frame counter write has 3-4 cycle delay
7. [Linear counter reload flag](https://www.nesdev.org/wiki/APU_Triangle): Triangle linear counter reload flag behavior
8. [Pulse channel muting](https://www.nesdev.org/wiki/APU_Pulse): Pulse muting when timer < 8 or sweep target > $7FF
9. [Triangle channel muting](https://www.nesdev.org/wiki/APU_Triangle): Triangle muting when timer < 2
10. [DMC DMA timing](https://www.nesdev.org/wiki/APU_DMC): DMC DMA CPU stall timing

**Testing Strategy**:
- Unit test for each quirk
- Integration test with Blargg's APU test suite
- Known-good game audio comparison

## Risks / Trade-offs

### Risk: Browser Audio Latency Variability

**Mitigation**: 
- Use AudioWorklet (lowest latency path)
- Configurable buffer size (default 20ms)
- Dynamic rate control to prevent underrun
- Accept 20-50ms latency range as acceptable

### Risk: Performance Impact on Low-End Devices

**Mitigation**:
- Profile critical paths (mixing, resampling)
- Use lookup tables for constants
- Consider WebAssembly for hot paths if needed
- Provide audio disable option for performance mode

### Risk: AudioWorklet Browser Compatibility

**Mitigation**:
- Feature detection and graceful fallback
- ScriptProcessorNode fallback implementation
- Document minimum browser versions
- Test on physical devices, not just emulators

### Trade-off: Accuracy vs Simplicity

**Decision**: Prioritize accuracy, accept complexity
**Rationale**: Games depend on precise APU behavior. Simplified implementation leads to compatibility issues.
**Consequence**: More code, more tests, longer implementation time

### Trade-off: NTSC-Only vs PAL Support

**Decision**: NTSC only for initial implementation, but design does not block future PAL support
**Rationale**: 90% of NES market was NTSC, PAL timing differs significantly. Implementation focuses on NTSC scope without blocking PAL future support.
**Consequence**: PAL games will run at wrong speed/pitch initially (deferred to future enhancement, but architecture allows for it)

## Migration Plan

### Phase 1: Core Bus Integration (Foundation)
- Implement [`IBusDevice`](../../../src/utils/types.ts) on [`Apu2A03`](../../../src/devices/apu.ts)
- Add register read/write scaffolding
- Map APU to bus in [`NesEmulator`](../../../src/devices/nes.ts)
- Add clock() integration
- **Validation**: Bus reads/writes work, no crashes

### Phase 2: Pulse Channels (First Audio)
- Implement `PulseChannel`, `Envelope`, `SweepUnit` classes
- Add register handlers for $4000-$4007
- Basic audio output (no mixing yet)
- **Validation**: Hear pulse waves, test with simple ROM

### Phase 3: Remaining Channels
- Implement `TriangleChannel`, `NoiseChannel`, `DmcChannel`
- Add respective register handlers
- **Validation**: All channels produce sound independently

### Phase 4: Frame Counter & Timing
- Implement `FrameCounter` class
- Connect to all channels
- Add IRQ support
- **Validation**: Envelopes/sweeps/length counters work correctly

### Phase 5: Audio Pipeline
- Implement non-linear mixing
- Create AudioWorklet processor
- Add resampler
- **Validation**: Multi-channel audio sounds correct

### Phase 6: Dynamic Rate Control
- Implement rate adjustment
- Add buffer monitoring
- **Validation**: Extended play with no audio drift

### Phase 7: Early APU Unit Tests
- Implement comprehensive APU unit test suite independent of ROMs
- Test each channel, unit, and component in isolation
- Test register read/write behavior
- Test timing and synchronization
- **Validation**: Unit tests pass, building confidence before ROM testing

### Phase 8: Hardware Quirks & Edge Cases
- Implement all 10 documented quirks
- Add DMC DMA integration at NES layer
- **Validation**: Pass blargg's APU test ROMs

### Phase 9: Testing & Polish
- Browser compatibility testing
- Performance profiling
- Game compatibility testing
- Documentation
- **Validation**: All tests pass, known games work

**Rollback Plan**: 
- If critical issues found, feature flag to use `DummyApu`
- Fallback option in [`Apu2A03.build()`](../../../src/devices/apu.ts:37) factory method
- Existing emulator functionality unaffected (audio-only change)

## Open Questions

1. **Should we implement expansion audio in the future?**
   - Deferred to separate proposal
   - Would require cartridge-level audio mixing
   - VRC6, FDS, MMC5 are most common

2. **Save state support for APU?**
   - Not in scope for initial implementation
   - Would require serializing all channel state
   - Deferred to future save state feature

5. **Audio recording/export feature?**
   - Useful for testing and debugging
   - Not in scope for initial implementation
   - Deferred to separate enhancement

## References

- **NESDev APU**: https://www.nesdev.org/wiki/APU
- **Blargg's APU Reference**: http://blargg.8bitalley.com/nes-emu/nes_apu_ref.txt
- **Dynamic Rate Control**: https://saveweb.github.io/near.sh/articles/audio/dynamic-rate-control.html
- **Test ROMs**: https://github.com/christopherpow/nes-test-roms
- **AudioWorklet**: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

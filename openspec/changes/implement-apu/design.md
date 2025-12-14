# Design: NES APU Implementation

## Context

The NES APU (Audio Processing Unit) is a complex hardware component that generates 5 audio channels and must integrate tightly with the emulator's bus, CPU, and timing systems. The current [`Apu2A03`](../../../src/devices/apu.ts) implementation is a non-functional stub using high-level WebAudio oscillators.

This design covers the architectural decisions for implementing a cycle-accurate APU that:
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

1. **Cycle-Accurate Emulation**: Implement all 5 APU channels with hardware-accurate behavior
2. **Bus Integration**: Connect APU to CPU bus at $4000-$4017 via [`IBusDevice`](../../../src/utils/types.ts) interface
3. **Authentic Audio**: Use non-linear mixing formulas matching NES hardware DAC
4. **Low Latency**: Achieve <50ms audio latency using AudioWorklet
5. **Hardware Quirks**: Implement documented hardware quirks for compatibility
6. **Test Coverage**: Validate using Blargg's APU test suite
7. **Performance**: Maintain 60 FPS with audio enabled
8. **Browser Compatibility**: Support Chrome 66+, Firefox 76+, Safari 14.1+

### Non-Goals

1. **PAL Support**: Focus on NTSC timing only (PAL deferred to future work)
2. **Expansion Audio**: VRC6, FDS, MMC5 audio chips not covered
3. **Node.js Support**: Web Audio API required, no headless mode
4. **$4011 Sample Playback**: Advanced DMC abuse technique deferred
5. **Perfect Accuracy**: Target >95% compatibility, not 100% hardware precision

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

### Decision 2: AudioWorklet vs ScriptProcessorNode

**Choice**: Use AudioWorklet as primary, ScriptProcessorNode as fallback

**Rationale**:
- AudioWorklet runs audio processing on separate thread (no main thread blocking)
- Lower latency than ScriptProcessorNode
- Modern browser support (Chrome 66+, Firefox 76+, Safari 14.1+)
- ScriptProcessorNode deprecated but still widely supported

**Alternatives Considered**:
- ❌ **ScriptProcessorNode only**: Deprecated, runs on main thread, higher latency
- ❌ **AudioWorklet only**: Older browsers unsupported, breaks emulator
- ✅ **AudioWorklet with fallback**: Best compatibility + performance

**Implementation**:
```typescript
public static async build() {
    if ('audioWorklet' in AudioContext.prototype) {
        return new Apu2A03WithWorklet();
    } else {
        console.warn('AudioWorklet not supported, using ScriptProcessorNode fallback');
        return new Apu2A03WithScriptProcessor();
    }
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

### Decision 5: DMC DMA Integration with CPU

**Choice**: Add optional DMA stall mechanism to CPU, triggered by DMC channel

**Rationale**:
- DMC DMA reads stall CPU for 3-4 cycles (hardware behavior)
- Some games rely on this timing for synchronization
- Must be optional to not break existing CPU tests

**Implementation**:
```typescript
// In Cpu6502
private dmcStallCycles = 0;

public addDmcStall(cycles: number) {
    this.dmcStallCycles += cycles;
}

public tick(): boolean {
    if (this.dmcStallCycles > 0) {
        this.dmcStallCycles--;
        return false; // CPU is stalled
    }
    // Normal CPU execution...
}

// In DmcChannel
public clock(): DmcDmaRequest | null {
    if (this.needsSampleByte && this.bytesRemaining > 0) {
        return {
            address: this.currentAddress,
            stallCycles: 4 // ~4 CPU cycles for DMA
        };
    }
    return null;
}

// In Apu2A03
public clock() {
    const dmaRequest = this.dmc.clock();
    if (dmaRequest) {
        // Read sample from CPU bus
        const byte = this.cpuBus.read(dmaRequest.address);
        this.dmc.loadSampleByte(byte);
        
        // Stall CPU
        this.cpu.addDmcStall(dmaRequest.stallCycles);
    }
}
```

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

**Critical Quirks to Implement**:
1. Pulse 1 uses ones' complement for sweep negate, Pulse 2 uses two's complement
2. Writing $4003/$4007 resets duty cycle phase
3. Reading $4015 clears frame interrupt flag
4. Writing 0 to $4015 channel bit immediately zeros length counter
5. Noise LFSR initializes to 1, not 0
6. Frame counter write has 3-4 cycle delay
7. Triangle linear counter reload flag behavior
8. Pulse muting when timer < 8 or sweep target > $7FF
9. Triangle muting when timer < 2
10. DMC DMA CPU stall timing

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

**Decision**: NTSC only for initial implementation
**Rationale**: 90% of NES market was NTSC, PAL timing differs significantly
**Consequence**: PAL games will run at wrong speed/pitch (deferred to future enhancement)

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

### Phase 7: Hardware Quirks & Edge Cases
- Implement all 10 documented quirks
- Add DMC DMA integration
- **Validation**: Pass Blargg's APU tests

### Phase 8: Testing & Polish
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

2. **WebAssembly for mixing/resampling performance?**
   - Profile first, optimize if needed
   - TypeScript may be sufficient
   - WASM adds build complexity

3. **Visual audio debugger/visualizer?**
   - Useful for development
   - Could show waveforms, channel states
   - Deferred to separate enhancement

4. **Save state support for APU?**
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

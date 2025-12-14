# APU Audio Output Specification

**Note**: Sample rates, frequencies, and other magic numbers in this specification are sourced from:
- [NESDev APU documentation](https://www.nesdev.org/wiki/APU) - timing and frequency specifications
- [NESDev APU Mixer](https://www.nesdev.org/wiki/APU_Mixer) - mixing formulas and DAC characteristics
- All values are for **NTSC** systems unless otherwise specified (PAL has different timing)

## ADDED Requirements

### Requirement: Non-Linear Channel Mixing

The APU SHALL mix channel outputs using non-linear formulas matching NES hardware DAC characteristics.

#### Scenario: Pulse channel mixing

- **WHEN** pulse channels produce output values pulse1 and pulse2 (each 0-15)
- **THEN** the mixed pulse output SHALL be calculated as: 95.88 / ((8128 / (pulse1 + pulse2)) + 100)
- **AND** if both pulse channels are 0, output SHALL be 0 (avoid division by zero)
- **AND** output range SHALL be approximately 0 to 0.95

#### Scenario: TND channel mixing

- **WHEN** triangle (0-15), noise (0-15), and DMC (0-127) channels produce output
- **THEN** the mixed TND output SHALL be calculated as: 159.79 / ((1 / (triangle/8227 + noise/12241 + dmc/22638)) + 100)
- **AND** if all three channels are 0, output SHALL be 0 (avoid division by zero)
- **AND** output range SHALL be approximately 0 to 1.59

#### Scenario: Final audio sample

- **WHEN** all channels are mixed
- **THEN** final sample SHALL be: pulse_out + tnd_out
- **AND** final output SHALL range from 0 to approximately 2.54
- **AND** output SHALL be normalized to -1.0 to +1.0 range for audio API

### Requirement: Sample Generation Rate

The APU SHALL generate audio samples at the native APU rate of approximately 894 kHz (CPU clock / 2) for **NTSC** systems (source: [NESDev APU timing](https://www.nesdev.org/wiki/APU#Glossary)).

#### Scenario: Sample generation timing

- **WHEN** the APU is clocked by the emulator
- **THEN** it SHALL generate one sample every 2 CPU cycles
- **AND** for NTSC at 1.789773 MHz CPU clock (source: [NESDev CPU](https://www.nesdev.org/wiki/CPU)), sample rate SHALL be 894886.5 Hz

#### Scenario: Sample buffering

- **WHEN** samples are generated
- **THEN** they SHALL be stored in a buffer for transfer to audio output pipeline
- **AND** buffer SHALL be sized to prevent overflow (typically 20-50ms worth)

### Requirement: AudioWorklet Output Pipeline

The APU SHALL use AudioWorklet exclusively for low-latency audio output. Browsers without AudioWorklet support will not have audio output.

#### Scenario: AudioWorklet processor creation

- **WHEN** AudioWorklet is supported by the browser
- **THEN** an AudioWorkletNode SHALL be created and connected to AudioContext destination
- **AND** worklet processor SHALL run on audio thread (separate from main thread)

#### Scenario: Sample transfer to worklet

- **WHEN** the worklet requests samples
- **THEN** batches of samples SHALL be transferred from main thread to worklet via postMessage
- **AND** batch size SHALL be optimized to balance latency vs overhead (e.g., 512-2048 samples)

#### Scenario: AudioWorklet processing

- **WHEN** the worklet process() method is called
- **THEN** it SHALL fill the output buffer with resampled audio samples
- **AND** it SHALL request more samples if buffer level is low

### Requirement: Sample Rate Conversion

The APU SHALL resample from native APU rate (~894 kHz) to audio output rate (typically 44.1 kHz or 48 kHz).

#### Scenario: Cubic interpolation resampling

- **WHEN** samples are resampled
- **THEN** cubic interpolation SHALL be used for quality
- **AND** phase accumulator SHALL track fractional position between input samples
- **AND** 4 samples SHALL be used for interpolation (Catmull-Rom or similar)

#### Scenario: Resampler input/output rates

- **WHEN** resampler is initialized
- **THEN** input rate SHALL be configurable (default ~894 kHz for NTSC)
- **AND** output rate SHALL use Web Audio API standard default of 48 kHz (rationale: [MDN AudioContext.sampleRate](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/sampleRate) - 48 kHz is the most common default and provides good quality/performance balance)
- **AND** ratio SHALL be calculated as output_rate / input_rate

### Requirement: Dynamic Rate Control

The APU SHALL implement dynamic rate control to prevent audio buffer underrun/overrun.

#### Scenario: Buffer level monitoring

- **WHEN** audio is playing
- **THEN** the worklet SHALL monitor buffer fill level continuously
- **AND** fill level SHALL be reported to main thread for rate adjustment

#### Scenario: Rate adjustment

- **WHEN** buffer fill level deviates from target (typically 50%)
- **THEN** input sample rate SHALL be adjusted by up to ±0.5%
- **AND** adjustment SHALL be smooth to prevent audible artifacts
- **AND** effective sample rate SHALL trend toward target fill level

#### Scenario: Maximum pitch distortion

- **WHEN** rate control adjusts frequency
- **THEN** adjustment SHALL NOT exceed ±0.5% of nominal rate
- **AND** pitch change SHALL be imperceptible to human hearing
- **AND** this prevents long-term buffer drift without audible artifacts

### Requirement: Audio Output Control

The APU SHALL provide basic audio enabling control. Volume and mute control SHALL be handled by system controls.

#### Scenario: Audio enable/disable

- **WHEN** user or application requests audio disable
- **THEN** sample generation SHALL continue (for timing accuracy)
- **AND** output SHALL be muted via GainNode or disconnection
- **AND** AudioContext MAY be suspended for performance

**Note**: Custom volume/mute controls are removed from scope. Users should rely on browser/system volume controls.

### Requirement: AudioContext Lifecycle

The APU SHALL manage AudioContext lifecycle including user gesture requirements.

#### Scenario: AudioContext suspended state

- **WHEN** browser requires user gesture to start audio
- **THEN** AudioContext SHALL be created in suspended state
- **AND** application SHALL resume context after user interaction (e.g., button click)

#### Scenario: AudioContext resume

- **WHEN** audioContext.resume() is called after user gesture
- **THEN** audio output SHALL begin
- **AND** any queued samples SHALL start playing

**Note**: Tab mute detection/handling is removed from scope. Let browser handle muting naturally based on tab visibility.

### Requirement: Audio Latency

The APU SHALL target low audio latency for responsive gameplay.

#### Scenario: Latency target

- **WHEN** audio pipeline is configured
- **THEN** total latency (generation → output) SHOULD target < 50ms as a qualitative goal
- **AND** acceptable latency SHOULD be < 100ms
- **AND** latency SHALL be tunable via buffer size configuration

#### Scenario: Buffer size configuration

- **WHEN** audio buffer size is set
- **THEN** smaller buffers SHALL reduce latency but increase CPU usage
- **AND** larger buffers SHALL increase latency but improve stability
- **AND** default buffer size SHALL be tuned empirically for optimal latency/stability balance (typically 20-30ms, adjusted based on testing)

**Note**: Latency goals are qualitative - subjective verification via listening is acceptable. No quantifiable metrics required initially.

### Requirement: Browser Compatibility

The APU SHALL require AudioWorklet support. No audio will be available in browsers lacking this feature.

#### Scenario: Chrome AudioWorklet support

- **WHEN** running in Chrome 140 or later
- **THEN** AudioWorklet SHALL be used for audio output
- **AND** latency SHALL be optimal

#### Scenario: Firefox AudioWorklet support

- **WHEN** running in Firefox 140 or later
- **THEN** AudioWorklet SHALL be used for audio output

#### Scenario: Safari AudioWorklet support

- **WHEN** running in Safari 26 or later
- **THEN** AudioWorklet SHALL be used for audio output

#### Scenario: Unsupported browser

- **WHEN** running in browsers without AudioWorklet support
- **THEN** no audio output SHALL be available
- **AND** a warning SHALL be logged to console
- **AND** emulation SHALL continue without audio

### Requirement: Audio Output Performance

The APU SHALL maintain 60 FPS minimum emulation speed while generating and outputting audio.

#### Scenario: Frame rate target

- **WHEN** audio is enabled during emulation
- **THEN** APU processing SHOULD NOT cause frame rate to drop below 60 FPS as a qualitative goal
- **AND** sample generation and mixing SHALL be optimized for performance
- **AND** no specific CPU overhead limit is defined - just avoid regressing existing performance

#### Scenario: Performance optimization

- **WHEN** audio performance is measured
- **THEN** mixing and resampling SHALL complete within available time budget
- **AND** if performance is insufficient, consider typed arrays and lookup tables for optimization

**Note**: Audio quality verification is subjective - listening tests are acceptable. No quantifiable metrics required initially.

# APU Pulse Channels Specification

## ADDED Requirements

### Requirement: Pulse Channel Square Wave Generation

The APU SHALL implement two pulse (square wave) channels that generate audio with configurable duty cycles.

#### Scenario: Pulse channel generates square wave

- **WHEN** a pulse channel is enabled and clocked
- **THEN** it SHALL produce a square wave output based on its current duty cycle setting
- **AND** the output SHALL alternate between high (1) and low (0) states

#### Scenario: Duty cycle configuration

- **WHEN** the CPU writes to register $4000 or $4004 (pulse control)
- **THEN** bits 6-7 SHALL configure the duty cycle as: 00=12.5%, 01=25%, 10=50%, 11=75%
- **AND** the channel SHALL use the appropriate 8-step duty sequence

### Requirement: Pulse Channel Timer and Frequency

The APU SHALL implement an 11-bit timer for each pulse channel to control output frequency.

#### Scenario: Timer period configuration

- **WHEN** the CPU writes to registers $4002/$4006 (timer low) and $4003/$4007 (timer high)
- **THEN** the 11-bit timer period SHALL be composed from: (high_byte[0:2] << 8) | low_byte
- **AND** the output frequency SHALL be: CPU_CLOCK / (16 * (timer_period + 1))

#### Scenario: Timer countdown

- **WHEN** the pulse channel is clocked
- **THEN** the timer SHALL decrement by 1 each APU cycle
- **AND** when timer reaches 0, it SHALL reload to period value and advance duty step

### Requirement: Pulse Channel Envelope Unit

Each pulse channel SHALL include an envelope unit that controls volume over time with attack and decay.

#### Scenario: Constant volume mode

- **WHEN** register $4000/$4004 bit 4 is set to 1
- **THEN** the envelope SHALL output the constant volume value (bits 0-3)
- **AND** the envelope decay SHALL be disabled

#### Scenario: Envelope decay mode

- **WHEN** register $4000/$4004 bit 4 is set to 0
- **THEN** the envelope SHALL start at volume 15 and decay by 1 each envelope clock
- **AND** the decay rate SHALL be controlled by the period value (bits 0-3)
- **AND** when volume reaches 0, it SHALL either loop or stay at 0 based on loop flag (bit 5)

#### Scenario: Envelope restart

- **WHEN** the CPU writes to register $4003 or $4007 (length counter load)
- **THEN** the envelope start flag SHALL be set
- **AND** on the next envelope clock, volume SHALL reset to 15 and decay SHALL restart

### Requirement: Pulse Channel Sweep Unit

Each pulse channel SHALL include a sweep unit that automatically adjusts pitch over time.

#### Scenario: Sweep unit enabled

- **WHEN** register $4001/$4005 bit 7 is set to 1 AND shift count (bits 0-2) is non-zero
- **THEN** sweep SHALL be enabled
- **AND** the timer period SHALL be automatically adjusted each sweep clock

#### Scenario: Sweep period adjustment up

- **WHEN** sweep is enabled and negate flag (bit 3) is 0
- **THEN** timer period SHALL increase by (period >> shift)
- **AND** if result exceeds $7FF, channel SHALL be muted

#### Scenario: Sweep period adjustment down for Pulse 1

- **WHEN** Pulse 1 sweep is enabled and negate flag is 1
- **THEN** timer period SHALL decrease by ones complement: period + ~(period >> shift)
- **AND** this differs from Pulse 2 to implement hardware behavior

#### Scenario: Sweep period adjustment down for Pulse 2

- **WHEN** Pulse 2 sweep is enabled and negate flag is 1
- **THEN** timer period SHALL decrease by twos complement: period + (-(period >> shift))
- **AND** this differs from Pulse 1 to implement hardware behavior

### Requirement: Pulse Channel Length Counter

Each pulse channel SHALL include a length counter that automatically silences the channel after a duration.

#### Scenario: Length counter loaded

- **WHEN** the CPU writes to register $4003 or $4007
- **THEN** the length counter SHALL be loaded from lookup table using bits 3-7 as index
- **AND** the channel SHALL be enabled (if status bit is 1)

#### Scenario: Length counter countdown

- **WHEN** the frame counter generates a half-frame clock
- **THEN** the length counter SHALL decrement by 1 if greater than 0
- **AND** the length counter SHALL NOT decrement if halt flag (bit 5 of $4000/$4004) is set

#### Scenario: Length counter reaches zero

- **WHEN** the length counter reaches 0
- **THEN** the channel output SHALL be 0 (silenced)
- **AND** the channel SHALL remain silenced until length counter is reloaded

### Requirement: Pulse Channel Muting Conditions

Pulse channels SHALL be muted under specific conditions to match hardware behavior.

#### Scenario: Mute when timer period too low

- **WHEN** the timer period is less than 8
- **THEN** the channel output SHALL be 0 (muted)
- **AND** this prevents ultrasonic frequencies

#### Scenario: Mute when sweep target too high

- **WHEN** the sweep unit calculates a target period greater than $7FF (2047)
- **THEN** the channel output SHALL be 0 (muted)
- **AND** this prevents timer overflow

### Requirement: Pulse Channel Phase Reset

The pulse channels SHALL reset their waveform phase when the timer high byte is written.

#### Scenario: Phase reset on high byte write

- **WHEN** the CPU writes to register $4003 or $4007
- **THEN** the duty cycle sequencer position SHALL be reset to 0
- **AND** this creates an audible click if done during playback

### Requirement: Pulse Channel Register Mapping

The pulse channels SHALL respond to register writes at specific CPU memory addresses.

#### Scenario: Pulse 1 register writes

- **WHEN** the CPU writes to addresses $4000-$4003
- **THEN** Pulse 1 channel SHALL update its configuration accordingly
- **AND** $4000=volume/envelope, $4001=sweep, $4002=timer low, $4003=length/timer high

#### Scenario: Pulse 2 register writes

- **WHEN** the CPU writes to addresses $4004-$4007
- **THEN** Pulse 2 channel SHALL update its configuration accordingly
- **AND** $4004=volume/envelope, $4005=sweep, $4006=timer low, $4007=length/timer high

### Requirement: Pulse Channel Output Value

Each pulse channel SHALL output a 4-bit value (0-15) representing the current sample.

#### Scenario: Channel output when enabled

- **WHEN** the pulse channel is enabled, not muted, and length counter > 0
- **THEN** output SHALL be envelope volume (0-15) if duty cycle is high
- **AND** output SHALL be 0 if duty cycle is low

#### Scenario: Channel output when disabled

- **WHEN** the channel is disabled via $4015 status register
- **THEN** output SHALL be 0
- **AND** length counter SHALL be 0

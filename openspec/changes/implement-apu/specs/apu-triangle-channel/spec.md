# APU Triangle Channel Specification

## ADDED Requirements

### Requirement: Triangle Channel Waveform Generation

The APU SHALL implement a triangle channel that generates a 32-step triangle wave.

#### Scenario: Triangle wave sequence

- **WHEN** the triangle channel is clocked
- **THEN** it SHALL step through a 32-step sequence producing values 0,1,2,...,15,15,14,13,...,1,0
- **AND** the sequence SHALL create a linear ramp up then linear ramp down

#### Scenario: Triangle channel output

- **WHEN** the triangle channel is enabled and not muted
- **THEN** output SHALL be the current step value (0-15) from the 32-step sequence
- **AND** output SHALL be 0 if channel is disabled or muted

### Requirement: Triangle Channel Timer

The triangle channel SHALL use an 11-bit timer to control output frequency.

#### Scenario: Timer period configuration

- **WHEN** the CPU writes to registers $400A (timer low) and $400B (timer high)
- **THEN** the 11-bit timer period SHALL be: (high_byte[0:2] << 8) | low_byte
- **AND** the output frequency SHALL be: CPU_CLOCK / (32 * (timer_period + 1))

#### Scenario: Timer countdown and sequence step

- **WHEN** the triangle channel is clocked
- **THEN** the timer SHALL decrement by 1 each APU cycle
- **AND** when timer reaches 0, it SHALL reload to period value
- **AND** the 32-step sequence SHALL advance by 1 position

### Requirement: Triangle Channel Linear Counter

The triangle channel SHALL use a linear counter to control note duration independently of the length counter.

#### Scenario: Linear counter reload value

- **WHEN** the CPU writes to register $4008
- **THEN** bits 0-6 SHALL set the linear counter reload value (0-127)
- **AND** bit 7 SHALL set the control flag (also acts as length counter halt)

#### Scenario: Linear counter reload flag set

- **WHEN** the CPU writes to register $400B (length counter load)
- **THEN** the linear counter reload flag SHALL be set to true

#### Scenario: Linear counter clock with reload

- **WHEN** the frame counter generates a quarter-frame clock AND reload flag is true
- **THEN** the linear counter SHALL be reloaded with the reload value
- **AND** if control flag is false, reload flag SHALL be cleared

#### Scenario: Linear counter clock without reload

- **WHEN** the frame counter generates a quarter-frame clock AND reload flag is false
- **THEN** the linear counter SHALL decrement by 1 if greater than 0
- **AND** reload flag SHALL remain false

### Requirement: Triangle Channel Length Counter

The triangle channel SHALL use a length counter to control note duration.

#### Scenario: Length counter loaded

- **WHEN** the CPU writes to register $400B
- **THEN** the length counter SHALL be loaded from lookup table using bits 3-7 as index
- **AND** the channel SHALL be enabled (if status bit is 1)

#### Scenario: Length counter halt

- **WHEN** register $4008 bit 7 (control flag) is set to 1
- **THEN** the length counter SHALL NOT decrement
- **AND** the linear counter reload flag SHALL NOT be cleared

#### Scenario: Length counter countdown

- **WHEN** the frame counter generates a half-frame clock AND control flag is 0
- **THEN** the length counter SHALL decrement by 1 if greater than 0

### Requirement: Triangle Channel Silencing Conditions

The triangle channel SHALL be silenced when both counters are active and when frequency is ultrasonic.

#### Scenario: Mute when linear counter is zero

- **WHEN** the linear counter reaches 0
- **THEN** the triangle channel SHALL NOT clock its sequencer
- **AND** output SHALL remain at current sequence position (frozen, not silent)

#### Scenario: Mute when length counter is zero

- **WHEN** the length counter reaches 0
- **THEN** the triangle channel SHALL NOT clock its sequencer
- **AND** output SHALL remain at current sequence position (frozen, not silent)

#### Scenario: Mute when timer period too low

- **WHEN** the timer period is less than 2
- **THEN** the triangle channel SHALL output 15 (loudest value)
- **AND** this prevents ultrasonic ticking artifacts

### Requirement: Triangle Channel Register Mapping

The triangle channel SHALL respond to register writes at specific CPU memory addresses.

#### Scenario: Triangle register writes

- **WHEN** the CPU writes to addresses $4008, $400A, or $400B
- **THEN** the triangle channel SHALL update its configuration accordingly
- **AND** $4008=linear counter, $4009=unused, $400A=timer low, $400B=length/timer high

### Requirement: Triangle Channel Linear Counter Reload Flag Behavior

The triangle channel SHALL implement the specific linear counter reload flag timing behavior.

#### Scenario: Reload flag persists with control bit set

- **WHEN** the control flag (bit 7 of $4008) is set to 1
- **THEN** the reload flag SHALL NOT be cleared after reloading linear counter
- **AND** linear counter SHALL continuously reload on each quarter-frame clock

#### Scenario: Reload flag cleared after reload

- **WHEN** the control flag is 0 AND reload flag is true
- **THEN** after the next quarter-frame clock, linear counter SHALL reload
- **AND** reload flag SHALL be cleared to false
- **AND** subsequent clocks SHALL decrement linear counter normally

### Requirement: Triangle Channel Output Without Envelope

The triangle channel SHALL output raw waveform values without envelope or volume control.

#### Scenario: Triangle output is not affected by envelope

- **WHEN** the triangle channel produces output
- **THEN** the output SHALL be the raw sequence value (0-15)
- **AND** there SHALL be NO envelope unit or volume control
- **AND** this differs from pulse and noise channels

#### Scenario: Triangle channel always at full volume

- **WHEN** the triangle channel is enabled and producing sound
- **THEN** the output amplitude SHALL be constant (no attack/decay/sustain)
- **AND** only the linear and length counters control note duration

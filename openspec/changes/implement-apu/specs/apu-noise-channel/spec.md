# APU Noise Channel Specification

## ADDED Requirements

### Requirement: Noise Channel Pseudo-Random Generation

The APU SHALL implement a noise channel that generates pseudo-random noise using a Linear Feedback Shift Register (LFSR).

#### Scenario: 15-bit LFSR initialization

- **WHEN** the noise channel is created or reset
- **THEN** the LFSR shift register SHALL be initialized to 1 (not 0)
- **AND** initialization to 0 would produce only silence

#### Scenario: LFSR feedback in long mode

- **WHEN** the noise timer reaches 0 in long mode (mode flag = 0)
- **THEN** feedback SHALL be calculated as: bit_0 XOR bit_1
- **AND** the shift register SHALL shift right by 1
- **AND** feedback SHALL be placed in bit 14

#### Scenario: LFSR feedback in short mode

- **WHEN** the noise timer reaches 0 in short mode (mode flag = 1)
- **THEN** feedback SHALL be calculated as: bit_0 XOR bit_6
- **AND** the shift register SHALL shift right by 1
- **AND** feedback SHALL be placed in bit 14
- **AND** short mode produces a different, more metallic sound

### Requirement: Noise Channel Timer and Period

The noise channel SHALL use a timer with period values from a lookup table.

#### Scenario: Noise period lookup

- **WHEN** the CPU writes to register $400E
- **THEN** bits 0-3 SHALL be used as index into noise period table
- **AND** NTSC period values SHALL be: [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]

#### Scenario: Timer countdown

- **WHEN** the noise channel is clocked
- **THEN** the timer SHALL decrement by 1 each APU cycle
- **AND** when timer reaches 0, it SHALL reload to period value from table
- **AND** the LFSR SHALL be clocked (shift and feedback)

### Requirement: Noise Channel Mode Selection

The noise channel SHALL support two modes affecting the LFSR feedback.

#### Scenario: Long mode selection

- **WHEN** register $400E bit 7 is set to 0
- **THEN** long mode SHALL be active
- **AND** LFSR uses feedback from bits 0 XOR 1
- **AND** produces typical white noise sound

#### Scenario: Short mode selection

- **WHEN** register $400E bit 7 is set to 1
- **THEN** short mode SHALL be active
- **AND** LFSR uses feedback from bits 0 XOR 6
- **AND** produces shorter period, more metallic noise

### Requirement: Noise Channel Envelope

The noise channel SHALL use an envelope unit identical to the pulse channels.

#### Scenario: Envelope controls noise volume

- **WHEN** the envelope is configured via register $400C
- **THEN** bits 0-3 SHALL set volume (constant) or envelope period
- **AND** bit 4 SHALL enable constant volume (1) or envelope mode (0)
- **AND** bit 5 SHALL enable length counter halt and envelope loop

#### Scenario: Noise output with envelope

- **WHEN** the noise channel produces output
- **THEN** output SHALL be envelope volume (0-15) if LFSR bit 0 is 0
- **AND** output SHALL be 0 if LFSR bit 0 is 1
- **AND** this creates the noise by randomly alternating between volume and 0

### Requirement: Noise Channel Length Counter

The noise channel SHALL use a length counter identical to other channels.

#### Scenario: Length counter loaded

- **WHEN** the CPU writes to register $400F
- **THEN** the length counter SHALL be loaded from lookup table using bits 3-7 as index
- **AND** the channel SHALL be enabled (if status bit is 1)

#### Scenario: Length counter countdown

- **WHEN** the frame counter generates a half-frame clock
- **THEN** the length counter SHALL decrement by 1 if greater than 0
- **AND** the length counter SHALL NOT decrement if halt flag (bit 5 of $400C) is set

#### Scenario: Channel silenced when length counter zero

- **WHEN** the length counter reaches 0
- **THEN** the channel output SHALL be 0 (silenced)

### Requirement: Noise Channel Register Mapping

The noise channel SHALL respond to register writes at specific CPU memory addresses.

#### Scenario: Noise register writes

- **WHEN** the CPU writes to addresses $400C, $400E, or $400F
- **THEN** the noise channel SHALL update its configuration accordingly
- **AND** $400C=envelope/volume, $400D=unused, $400E=period/mode, $400F=length counter

### Requirement: Noise Channel Output Value

The noise channel SHALL output a 4-bit value (0-15) based on LFSR state and envelope.

#### Scenario: Noise output when enabled

- **WHEN** the noise channel is enabled and length counter > 0
- **THEN** output SHALL be envelope volume if LFSR bit 0 is 0
- **AND** output SHALL be 0 if LFSR bit 0 is 1
- **AND** this creates pseudo-random noise

#### Scenario: Noise output when disabled

- **WHEN** the channel is disabled via $4015 status register
- **THEN** output SHALL be 0
- **AND** length counter SHALL be 0

# APU DMC Channel Specification

## ADDED Requirements

### Requirement: DMC Sample Playback

The APU SHALL implement a Delta Modulation Channel (DMC) that plays back 1-bit delta-encoded samples from CPU memory.

#### Scenario: DMC sample playback active

- **WHEN** the DMC channel is enabled and has bytes remaining
- **THEN** it SHALL fetch sample bytes from CPU memory via DMA
- **AND** it SHALL decode 1-bit delta values to adjust output level
- **AND** output level SHALL range from 0-127 (7-bit DAC)

#### Scenario: DMC sample playback complete

- **WHEN** the DMC finishes playing all sample bytes
- **THEN** if loop flag is set, it SHALL restart from the sample start address
- **AND** if loop flag is clear, it SHALL stop and set bytes remaining to 0

### Requirement: DMC Rate Timer

The DMC channel SHALL use a rate timer to control sample playback speed.

#### Scenario: DMC rate configuration

- **WHEN** the CPU writes to register $4010
- **THEN** bits 0-3 SHALL be used as index into DMC rate table
- **AND** NTSC rate values SHALL be: [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54] CPU cycles

#### Scenario: DMC timer countdown

- **WHEN** the DMC channel is clocked
- **THEN** the rate timer SHALL decrement by 1 each CPU cycle
- **AND** when timer reaches 0, it SHALL reload and output one bit from sample buffer

### Requirement: DMC Sample Address and Length

The DMC channel SHALL calculate sample memory address and byte count from register values.

#### Scenario: Sample start address calculation

- **WHEN** the CPU writes to register $4012
- **THEN** the sample start address SHALL be: $C000 + (register_value * 64)
- **AND** valid addresses range from $C000 to $FFC0

#### Scenario: Sample length calculation

- **WHEN** the CPU writes to register $4013
- **THEN** the sample length in bytes SHALL be: (register_value * 16) + 1
- **AND** valid lengths range from 1 to 4081 bytes

#### Scenario: DMC restart

- **WHEN** the DMC is enabled via $4015 and bytes remaining is 0
- **THEN** current address SHALL be set to sample start address
- **AND** bytes remaining SHALL be set to sample length
- **AND** sample playback SHALL begin

### Requirement: DMC Output Level and Delta Decoding

The DMC channel SHALL maintain a 7-bit output level that is adjusted by delta-encoded bits.

#### Scenario: Direct load output level

- **WHEN** the CPU writes to register $4011
- **THEN** the output level SHALL be immediately set to bits 0-6 (0-127)
- **AND** this bypasses the delta decode and sets level directly

#### Scenario: Delta bit increments output

- **WHEN** a decoded sample bit is 1
- **THEN** IF output level < 126, it SHALL increment by 2
- **AND** IF output level is 126 or 127, it SHALL remain unchanged (saturate)

#### Scenario: Delta bit decrements output

- **WHEN** a decoded sample bit is 0
- **THEN** IF output level > 1, it SHALL decrement by 2
- **AND** IF output level is 0 or 1, it SHALL remain unchanged (saturate)

### Requirement: DMC DMA Integration

The DMC channel SHALL read sample bytes from CPU memory via DMA, stalling the CPU.

#### Scenario: DMC DMA trigger

- **WHEN** the DMC needs a new sample byte and sample buffer is empty
- **THEN** it SHALL trigger a DMA read from current address on the CPU bus
- **AND** current address SHALL increment (with wraparound at $FFFF to $8000)
- **AND** bytes remaining SHALL decrement by 1

#### Scenario: CPU stall during DMC DMA

- **WHEN** DMC DMA is triggered
- **THEN** the CPU SHALL be stalled for 4 CPU cycles
- **AND** the exact cycle count MAY vary (3-4) based on CPU alignment
- **AND** stall timing affects cycle-accurate emulation

#### Scenario: DMC sample buffer management

- **WHEN** a sample byte is fetched via DMA
- **THEN** it SHALL be loaded into the 8-bit sample buffer
- **AND** bits SHALL be shifted out one at a time to the output unit
- **AND** when buffer is empty and bytes remaining > 0, trigger next DMA

### Requirement: DMC Loop and IRQ Flags

The DMC channel SHALL support looping sample playback and interrupt generation.

#### Scenario: DMC loop enabled

- **WHEN** register $4010 bit 6 (loop flag) is set to 1
- **THEN** when sample completes, it SHALL restart from sample start address
- **AND** bytes remaining SHALL be reset to sample length

#### Scenario: DMC IRQ enabled

- **WHEN** register $4010 bit 7 (IRQ enable) is set to 1
- **THEN** when sample completes and loop is disabled, DMC interrupt flag SHALL be set
- **AND** this SHALL generate an IRQ to the CPU

#### Scenario: DMC IRQ disabled

- **WHEN** register $4010 bit 7 is set to 0
- **THEN** no interrupt SHALL be generated when sample completes

#### Scenario: Clear DMC interrupt via status write

- **WHEN** the CPU writes any value to $4015
- **THEN** the DMC interrupt flag SHALL be cleared
- **AND** the IRQ to CPU SHALL be deasserted

### Requirement: DMC Channel Register Mapping

The DMC channel SHALL respond to register writes at specific CPU memory addresses.

#### Scenario: DMC register writes

- **WHEN** the CPU writes to addresses $4010-$4013
- **THEN** the DMC channel SHALL update its configuration accordingly
- **AND** $4010=flags/rate, $4011=direct load, $4012=sample address, $4013=sample length

### Requirement: DMC Channel Output Value

The DMC channel SHALL output a 7-bit value (0-127) representing the current output level.

#### Scenario: DMC output when active

- **WHEN** the DMC channel is enabled
- **THEN** output SHALL be the current 7-bit output level (0-127)
- **AND** level persists even when sample playback stops

#### Scenario: DMC output when disabled

- **WHEN** the DMC is disabled via $4015
- **THEN** output SHALL remain at current level (NOT reset to 0)
- **AND** sample playback SHALL stop but level persists

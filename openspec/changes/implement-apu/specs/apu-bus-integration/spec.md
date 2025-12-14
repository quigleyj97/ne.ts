# APU Bus Integration Specification

## ADDED Requirements

### Requirement: APU Bus Device Interface

The APU SHALL implement the [`IBusDevice`](../../../../../src/utils/types.ts) interface to integrate with the CPU memory bus at address range $4000-$4017.

#### Scenario: APU mapped to CPU bus

- **WHEN** the [`NesEmulator`](../../../../../src/devices/nes.ts) is constructed
- **THEN** the APU SHALL be mapped to the CPU bus at address range $4000-$4017 with mask 0xFFFF (no mirroring)

#### Scenario: Write to APU register

- **WHEN** the CPU writes a value to an address in range $4000-$4017
- **THEN** the APU SHALL receive the write via its `write(addr: u16, data: u8)` method
- **AND** the address SHALL be 0-indexed (subtract mapping start address)

#### Scenario: Read from APU status register

- **WHEN** the CPU reads from address $4015
- **THEN** the APU SHALL return the status register value via its `read(addr: u16)` method
- **AND** the returned value SHALL reflect current channel and interrupt states

#### Scenario: Read from write-only APU register

- **WHEN** the CPU reads from an address in range $4000-$4017 except $4015
- **THEN** the APU SHALL return 0 or the last bus value per open bus behavior

### Requirement: APU Register Address Constants

The APU SHALL define constants for all register addresses to improve code clarity and maintainability.

#### Scenario: Register address constants defined

- **WHEN** the APU implementation is compiled
- **THEN** constants SHALL be defined for all APU register addresses ($4000-$4017)
- **AND** constants SHALL use descriptive names matching hardware documentation

### Requirement: APU Clock Integration

The APU SHALL be clocked by the emulator once per CPU cycle to maintain accurate timing.

#### Scenario: APU clocked every CPU cycle

- **WHEN** the [`NesEmulator.tick()`](../../../../../src/devices/nes.ts) method executes a CPU cycle
- **THEN** the APU `clock()` method SHALL be called once
- **AND** the APU SHALL advance its internal state by one CPU cycle

#### Scenario: APU timing synchronization

- **WHEN** the emulator runs for 29780 CPU cycles (one NTSC frame)
- **THEN** the APU SHALL generate exactly 14890 APU samples (CPU rate / 2)
- **AND** timing SHALL remain synchronized with CPU and PPU

### Requirement: Status Register $4015 Read

The APU SHALL implement the $4015 status register read to report channel and interrupt states.

#### Scenario: Read status register with active channels

- **WHEN** the CPU reads from $4015
- **THEN** bit 0 SHALL be set if Pulse 1 length counter > 0
- **AND** bit 1 SHALL be set if Pulse 2 length counter > 0
- **AND** bit 2 SHALL be set if Triangle length counter > 0
- **AND** bit 3 SHALL be set if Noise length counter > 0
- **AND** bit 4 SHALL be set if DMC bytes remaining > 0

#### Scenario: Read status register with interrupts

- **WHEN** the CPU reads from $4015
- **THEN** bit 6 SHALL be set if frame interrupt flag is set
- **AND** bit 7 SHALL be set if DMC interrupt flag is set

#### Scenario: Reading status register clears frame interrupt

- **WHEN** the CPU reads from $4015 with frame interrupt flag set
- **THEN** the frame interrupt flag SHALL be cleared as a side effect
- **AND** the DMC interrupt flag SHALL NOT be affected

### Requirement: Status Register $4015 Write

The APU SHALL implement the $4015 status register write to enable/disable channels.

#### Scenario: Enable channel via status register

- **WHEN** the CPU writes to $4015 with a channel enable bit set to 1
- **THEN** that channel SHALL be enabled
- **AND** if the channel is DMC with zero bytes remaining, it SHALL restart sample playback

#### Scenario: Disable channel via status register

- **WHEN** the CPU writes to $4015 with a channel enable bit set to 0
- **THEN** that channel's length counter SHALL be immediately set to 0
- **AND** the channel SHALL produce no further output until re-enabled

#### Scenario: Writing status register clears DMC interrupt

- **WHEN** the CPU writes any value to $4015
- **THEN** the DMC interrupt flag SHALL be cleared
- **AND** the frame interrupt flag SHALL NOT be affected

### Requirement: Frame Counter Register $4017 Write

The APU SHALL implement the $4017 frame counter register to control timing sequencer mode.

#### Scenario: Write to frame counter register

- **WHEN** the CPU writes to $4017
- **THEN** the mode bit (bit 7) SHALL configure 4-step (0) or 5-step (1) sequencing
- **AND** the IRQ inhibit bit (bit 6) SHALL enable or disable frame counter interrupts
- **AND** the new mode SHALL take effect after 3-4 CPU cycles delay

#### Scenario: Write 5-step mode to frame counter

- **WHEN** the CPU writes to $4017 with bit 7 set to 1
- **THEN** all envelope, sweep, and length counter units SHALL be immediately clocked once
- **AND** the sequencer SHALL reset to 5-step mode after the write delay

#### Scenario: Set IRQ inhibit flag

- **WHEN** the CPU writes to $4017 with bit 6 set to 1
- **THEN** the frame interrupt flag SHALL be immediately cleared
- **AND** no further frame interrupts SHALL be generated until IRQ inhibit is cleared

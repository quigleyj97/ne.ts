# APU Frame Counter Specification

## ADDED Requirements

### Requirement: Frame Counter Timing Sequencer

The APU SHALL implement a frame counter that sequences envelope, sweep, and length counter clocks at specific intervals.

#### Scenario: Frame counter mode selection

- **WHEN** the CPU writes to register $4017
- **THEN** bit 7 SHALL select between 4-step mode (0) or 5-step mode (1)
- **AND** the selected mode SHALL control the timing sequence

#### Scenario: Frame counter clock integration

- **WHEN** the frame counter is clocked by the APU
- **THEN** it SHALL track CPU cycles and generate clock events
- **AND** events SHALL trigger envelope, sweep, and length counter updates

### Requirement: 4-Step Sequencer Mode

The frame counter SHALL support 4-step mode operating at 240 Hz effective rate.

#### Scenario: 4-step mode timing

- **WHEN** 4-step mode is active
- **THEN** step 1 SHALL occur at CPU cycle 7459 (envelope clock)
- **AND** step 2 SHALL occur at CPU cycle 14913 (envelope + length/sweep clock)
- **AND** step 3 SHALL occur at CPU cycle 22371 (envelope clock)
- **AND** step 4 SHALL occur at CPU cycle 29829 (envelope + length/sweep clock + IRQ)
- **AND** after step 4, cycle counter SHALL reset to 0

#### Scenario: 4-step quarter-frame clocks

- **WHEN** 4-step mode reaches steps 1, 2, 3, or 4
- **THEN** a quarter-frame clock event SHALL be generated
- **AND** all channels SHALL clock their envelope units

#### Scenario: 4-step half-frame clocks

- **WHEN** 4-step mode reaches steps 2 or 4
- **THEN** a half-frame clock event SHALL be generated
- **AND** all channels SHALL clock their sweep and length counter units

#### Scenario: 4-step IRQ generation

- **WHEN** 4-step mode reaches step 4 (cycle 29829) AND IRQ inhibit is 0
- **THEN** the frame interrupt flag SHALL be set
- **AND** an IRQ SHALL be sent to the CPU

### Requirement: 5-Step Sequencer Mode

The frame counter SHALL support 5-step mode operating at 192 Hz effective rate.

#### Scenario: 5-step mode timing

- **WHEN** 5-step mode is active
- **THEN** step 1 SHALL occur at CPU cycle 7459 (envelope clock)
- **AND** step 2 SHALL occur at CPU cycle 14913 (envelope + length/sweep clock)
- **AND** step 3 SHALL occur at CPU cycle 22371 (envelope clock)
- **AND** step 4 SHALL occur at CPU cycle 29829 (nothing)
- **AND** step 5 SHALL occur at CPU cycle 37281 (envelope + length/sweep clock)
- **AND** after step 5, cycle counter SHALL reset to 0

#### Scenario: 5-step mode no IRQ

- **WHEN** 5-step mode is active
- **THEN** NO frame interrupts SHALL be generated
- **AND** this mode is used to disable frame IRQs via timing

### Requirement: Frame Counter Write Delay

The frame counter SHALL implement a delay between register write and mode change.

#### Scenario: Delayed mode change

- **WHEN** the CPU writes to register $4017
- **THEN** the mode and IRQ inhibit changes SHALL take effect after 3-4 CPU cycles
- **AND** during the delay, the old mode remains active

#### Scenario: Immediate clock on 5-step mode write

- **WHEN** the CPU writes to $4017 with bit 7 set to 1 (5-step mode)
- **THEN** immediately (before delay), all envelope, sweep, and length counter units SHALL be clocked once
- **AND** this happens synchronously with the write

#### Scenario: IRQ inhibit immediate effect

- **WHEN** the CPU writes to $4017 with bit 6 set to 1
- **THEN** the frame interrupt flag SHALL be immediately cleared
- **AND** this happens even before the delayed mode change

### Requirement: Frame Counter IRQ Control

The frame counter SHALL implement IRQ generation and inhibit control.

#### Scenario: IRQ inhibit flag set

- **WHEN** register $4017 bit 6 is set to 1
- **THEN** frame interrupts SHALL be disabled
- **AND** the frame interrupt flag SHALL be immediately cleared
- **AND** no further frame IRQs SHALL be generated

#### Scenario: IRQ inhibit flag clear

- **WHEN** register $4017 bit 6 is set to 0 in 4-step mode
- **THEN** frame interrupts SHALL be enabled
- **AND** IRQ SHALL be generated at step 4 (cycle 29829)

#### Scenario: Frame interrupt flag read

- **WHEN** the frame interrupt flag is set
- **THEN** reading $4015 SHALL return bit 6 set to 1
- **AND** reading $4015 SHALL clear the flag as a side effect

### Requirement: Frame Counter Reset and Synchronization

The frame counter SHALL reset its cycle counter when mode is changed.

#### Scenario: Mode change resets counter

- **WHEN** the delayed mode change takes effect
- **THEN** the cycle counter SHALL be reset to 0
- **AND** sequencer SHALL start from step 1 of the new mode

#### Scenario: Frame counter continuous operation

- **WHEN** the frame counter runs without mode changes
- **THEN** it SHALL continuously loop through its steps
- **AND** cycle counter SHALL increment each CPU cycle
- **AND** timing SHALL remain synchronized with the emulator

### Requirement: Channel Integration with Frame Counter

The frame counter SHALL provide clock signals to all APU channels.

#### Scenario: Quarter-frame clock to channels

- **WHEN** a quarter-frame event occurs
- **THEN** clock envelope units on pulse 1, pulse 2, and noise channels
- **AND** clock linear counter on triangle channel

#### Scenario: Half-frame clock to channels

- **WHEN** a half-frame event occurs
- **THEN** clock sweep units on pulse 1 and pulse 2 channels
- **AND** clock length counters on all channels (pulse 1, pulse 2, triangle, noise)
- **AND** DMC does NOT have length counter or envelope

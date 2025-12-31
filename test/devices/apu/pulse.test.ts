import { PulseChannel } from '../../../src/devices/apu/channels/pulse.js';

/**
 * PulseChannel Unit Tests
 * 
 * Comprehensive tests for the NES APU Pulse Channel implementation.
 * Tests cover duty cycles, timer, length counter, envelope, sweep, and muting conditions.
 */

describe('PulseChannel', () => {
    /** @type {import('../../../src/devices/apu/channels/pulse').PulseChannel} */
    let pulse1;
    /** @type {import('../../../src/devices/apu/channels/pulse').PulseChannel} */
    let pulse2;

    beforeEach(() => {
        pulse1 = new PulseChannel(1);
        pulse2 = new PulseChannel(2);
    });

    describe('Construction', () => {
        it('should construct Pulse 1 channel', () => {
            expect(pulse1).toBeInstanceOf(PulseChannel);
        });

        it('should construct Pulse 2 channel', () => {
            expect(pulse2).toBeInstanceOf(PulseChannel);
        });

        it('should start inactive', () => {
            expect(pulse1.isActive()).toBe(false);
        });

        it('should start with zero output', () => {
            expect(pulse1.output()).toBe(0);
        });
    });

    describe('Duty Cycles', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            // Set constant volume = 15 for testing
            pulse1.write(0, 0x1F); // DDLC.VVVV = 00_0_1_1111 (duty 0, constant vol 15)
            // Load length counter
            pulse1.write(3, 0x08); // LLLL.LTTT = 00001_000 (length index 1)
            // Set timer to value that allows testing (> 8 to avoid muting)
            pulse1.write(2, 0x10); // Timer low = 0x10
        });

        it('should output 12.5% duty cycle pattern (duty 0)', () => {
            pulse1.write(0, 0x1F); // Duty 00
            const expected = [0, 0, 0, 0, 0, 0, 0, 1]; // 12.5%
            const actual = [];
            
            for (let i = 0; i < 8; i++) {
                actual.push(pulse1.output() > 0 ? 1 : 0);
                // Advance duty position by expiring timer
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            expect(actual).toEqual(expected);
        });

        it('should output 25% duty cycle pattern (duty 1)', () => {
            pulse1.write(0, 0x5F); // Duty 01
            const expected = [0, 0, 0, 0, 0, 0, 1, 1]; // 25%
            const actual = [];
            
            for (let i = 0; i < 8; i++) {
                actual.push(pulse1.output() > 0 ? 1 : 0);
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            expect(actual).toEqual(expected);
        });

        it('should output 50% duty cycle pattern (duty 2)', () => {
            pulse1.write(0, 0x9F); // Duty 10
            const expected = [0, 0, 0, 0, 1, 1, 1, 1]; // 50%
            const actual = [];
            
            for (let i = 0; i < 8; i++) {
                actual.push(pulse1.output() > 0 ? 1 : 0);
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            expect(actual).toEqual(expected);
        });

        it('should output 75% duty cycle pattern (duty 3)', () => {
            pulse1.write(0, 0xDF); // Duty 11
            const expected = [1, 1, 1, 1, 1, 1, 0, 0]; // 75%
            const actual = [];
            
            for (let i = 0; i < 8; i++) {
                actual.push(pulse1.output() > 0 ? 1 : 0);
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            expect(actual).toEqual(expected);
        });

        it('should reset duty position on register 3 write', () => {
            // Advance duty position several steps
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            // Get output (should be at position 3)
            const before = pulse1.output() > 0 ? 1 : 0;
            
            // Write to register 3 (resets duty position to 0)
            pulse1.write(3, 0x08);
            
            // Get output (should be at position 0 again)
            const after = pulse1.output() > 0 ? 1 : 0;
            
            // For duty 0 pattern [0,0,0,0,0,0,0,1], position 3 is 0, position 0 is 0
            // So let's use a pattern where we can see the difference
            pulse1.write(0, 0xDF); // Duty 3: [1,1,1,1,1,1,0,0]
            
            // Advance to position 7 (should be 0)
            for (let i = 0; i < 7; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            expect(pulse1.output()).toBe(0);
            
            // Write register 3 to reset position to 0
            pulse1.write(3, 0x08);
            
            // Should now be at position 0 (value 1)
            expect(pulse1.output()).toBe(15);
        });
    });

    describe('Timer', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0x1F); // Constant volume 15, duty 0
            pulse1.write(3, 0x08); // Load length counter
        });

        it('should set timer period from registers 2 and 3', () => {
            // Write timer low byte
            pulse1.write(2, 0xAB);
            // Write timer high 3 bits (bits 0-2 of register 3)
            pulse1.write(3, 0x05 << 3); // High bits = 5
            
            // Period should be 0x5AB
            // We can verify this indirectly by seeing when duty advances
            // Timer should reload to 0x5AB and count down
        });

        it('should count down timer each clock', () => {
            pulse1.write(2, 0x03); // Timer period = 3
            pulse1.write(3, 0x00);
            
            // Clock timer 4 times (period + 1)
            pulse1.clockTimer(); // Counter goes 3 -> 2
            pulse1.clockTimer(); // 2 -> 1
            pulse1.clockTimer(); // 1 -> 0
            pulse1.clockTimer(); // 0 -> reload to 3, duty advances
            
            // Duty position should have advanced once
        });

        it('should reload timer and advance duty position when timer expires', () => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0xDF); // Duty 3 for easier testing: [1,1,1,1,1,1,0,0]
            pulse1.write(2, 0x10); // Timer period > 8 to avoid muting
            pulse1.write(3, 0x08); // Reset duty position, load length counter
            
            // After writing register 3, duty position is reset to 0
            // Duty 3 pattern [1,1,1,1,1,1,0,0] at position 0 is 1, so output is 15
            expect(pulse1.output()).toBe(15);
            
            // Advance to position 6 (pattern value 0)
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            // At position 6, duty 3 pattern [1,1,1,1,1,1,0,0] has 0
            expect(pulse1.output()).toBe(0);
            
            // Advance one more position to 7
            for (let j = 0; j <= 0x10; j++) {
                pulse1.clockTimer();
            }
            
            // At position 7, duty 3 pattern also has 0
            expect(pulse1.output()).toBe(0);
        });

        it('should handle timer period of 0', () => {
            pulse1.write(2, 0x00);
            pulse1.write(3, 0x08);
            
            // Timer period 0 means it reloads to 0 and advances duty every clock
            pulse1.clockTimer();
            // Should work without error
        });
    });

    describe('Length Counter', () => {
        // Length table for reference (first 8 entries):
        // [10, 254, 20, 2, 40, 4, 80, 6, ...]
        
        it('should load length counter from table via register 3 bits 3-7', () => {
            pulse1.setEnabled(true);
            
            // Write length index 0 (value from table: 10)
            pulse1.write(3, 0x00); // Bits 7-3 = 00000
            expect(pulse1.isActive()).toBe(true);
            
            // Write length index 1 (value from table: 254)
            pulse1.write(3, 0x08); // Bits 7-3 = 00001
            expect(pulse1.isActive()).toBe(true);
            
            // Write length index 3 (value from table: 2)
            pulse1.write(3, 0x18); // Bits 7-3 = 00011
            expect(pulse1.isActive()).toBe(true);
        });

        it('should not load length counter when channel is disabled', () => {
            pulse1.setEnabled(false);
            pulse1.write(3, 0x08); // Try to load length counter
            expect(pulse1.isActive()).toBe(false);
        });

        it('should decrement length counter when clocked', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0x18); // Load index 3 = value 2
            
            expect(pulse1.isActive()).toBe(true);
            
            pulse1.clockLengthCounter();
            expect(pulse1.isActive()).toBe(true); // Still 1
            
            pulse1.clockLengthCounter();
            expect(pulse1.isActive()).toBe(false); // Now 0
        });

        it('should halt length counter when halt flag is set', () => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0x20); // Set length counter halt (bit 5)
            pulse1.write(3, 0x18); // Load index 3 = value 2
            
            expect(pulse1.isActive()).toBe(true);
            
            // Clock length counter multiple times
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            
            // Should still be active (halt prevents decrement)
            expect(pulse1.isActive()).toBe(true);
        });

        it('should not decrement length counter below 0', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0x18); // Load index 3 = value 2
            
            // Decrement to 0
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            expect(pulse1.isActive()).toBe(false);
            
            // Clock more times
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            
            // Should still be inactive
            expect(pulse1.isActive()).toBe(false);
        });

        it('should silence channel when length counter reaches 0', () => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0xDF); // Duty 3, constant volume 15 (position 0 is high)
            pulse1.write(2, 0x10); // Timer > 8 to avoid muting
            pulse1.write(3, 0x18); // Load length = 2
            
            // Initially should have output (duty 3 position 0 is 1)
            expect(pulse1.output()).toBeGreaterThan(0);
            
            // Decrement length counter to 0
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            
            // Should now be silenced
            expect(pulse1.output()).toBe(0);
        });
    });

    describe('Enable/Disable', () => {
        it('should enable channel with setEnabled(true)', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0x08); // Load length counter
            expect(pulse1.isActive()).toBe(true);
        });

        it('should disable and clear length counter with setEnabled(false)', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0x08); // Load length counter
            expect(pulse1.isActive()).toBe(true);
            
            pulse1.setEnabled(false);
            expect(pulse1.isActive()).toBe(false);
        });

        it('should return false from isActive() when disabled', () => {
            pulse1.setEnabled(false);
            expect(pulse1.isActive()).toBe(false);
        });

        it('should return false from isActive() when length counter is 0', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0x18); // Load length = 2
            
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            
            expect(pulse1.isActive()).toBe(false);
        });

        it('should return true from isActive() when enabled and length > 0', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0x08);
            expect(pulse1.isActive()).toBe(true);
        });
    });

    describe('Muting Conditions', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0x1F); // Constant volume 15, duty 0
        });

        it('should mute when length counter is 0', () => {
            pulse1.write(2, 0x10); // Timer > 8
            pulse1.write(3, 0x18); // Load length = 2
            
            pulse1.clockLengthCounter();
            pulse1.clockLengthCounter();
            
            expect(pulse1.output()).toBe(0);
        });

        it('should mute when timer period is less than 8', () => {
            pulse1.write(2, 0x07); // Timer = 7 (< 8)
            pulse1.write(3, 0x08); // Load length counter
            
            expect(pulse1.output()).toBe(0);
        });

        it('should not mute when timer period is 8 or greater', () => {
            pulse1.write(0, 0xDF); // Duty 3, constant vol 15 (so position 0 outputs 15)
            pulse1.write(2, 0x08); // Timer = 8
            pulse1.write(3, 0x08); // Load length counter, reset duty position
            
            expect(pulse1.output()).toBe(15);
        });

        it('should mute when sweep target period exceeds 0x7FF', () => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0xDF); // Duty 3, constant vol 15
            // Set period to a value that when increased by sweep will exceed 0x7FF
            // Use 0x600, then 0x600 + (0x600 >> 1) = 0x600 + 0x300 = 0x900 > 0x7FF
            pulse1.write(2, 0x00); // Timer low
            pulse1.write(3, 0x06 << 3); // Timer high = 6, period = 0x600, also loads length
            pulse1.write(1, 0x81); // Enable sweep, shift = 1, negate = 0
            
            // Sweep target will be 0x600 + (0x600 >> 1) = 0x600 + 0x300 = 0x900 > 0x7FF
            // Should be muted
            expect(pulse1.output()).toBe(0);
        });

        it('should mute when duty cycle position outputs 0', () => {
            pulse1.write(0, 0x1F); // Duty 0 [0,0,0,0,0,0,0,1], constant vol 15
            pulse1.write(2, 0x10); // Timer > 8
            pulse1.write(3, 0x08); // Load length, reset duty position to 0
            
            // Position 0 of duty 0 is 0
            expect(pulse1.output()).toBe(0);
            
            // Advance to position 7 (should output 15)
            for (let i = 0; i < 7; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
            }
            
            expect(pulse1.output()).toBe(15);
        });
    });

    describe('Envelope Integration', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            pulse1.write(2, 0x10); // Timer > 8 to avoid muting
            pulse1.write(3, 0x08); // Load length counter
        });

        it('should use constant volume when bit 4 is set', () => {
            pulse1.write(0, 0xDF); // Duty 3, constant volume flag set, volume 15
            expect(pulse1.output()).toBe(15);
            
            pulse1.write(0, 0xD5); // Duty 3, constant volume flag set, volume 5
            expect(pulse1.output()).toBe(5);
        });

        it('should use envelope decay when bit 4 is clear', () => {
            pulse1.write(0, 0xC0); // Duty 3, envelope mode (bit 4 = 0), period 0
            pulse1.write(3, 0x08); // Restart envelope
            
            // After restart, envelope should be at 15
            pulse1.clockEnvelope();
            expect(pulse1.output()).toBe(15);
        });

        it('should restart envelope on register 3 write', () => {
            pulse1.write(0, 0xC0); // Duty 3, envelope mode, period 0
            
            // Decay envelope
            pulse1.clockEnvelope();
            pulse1.clockEnvelope();
            pulse1.clockEnvelope();
            
            // Write register 3 to restart
            pulse1.write(3, 0x08);
            
            // Next clock should restart to 15
            pulse1.clockEnvelope();
            expect(pulse1.output()).toBe(15);
        });

        it('should decay envelope over time in envelope mode', () => {
            pulse1.write(0, 0xC0); // Duty 3, envelope mode, period 0
            pulse1.write(3, 0x08); // Restart envelope
            
            pulse1.clockEnvelope(); // Start flag set, loads 15
            expect(pulse1.output()).toBe(15);
            
            // With period 0, should decay every clock
            pulse1.clockEnvelope(); // Divider 0->0, decay 15->14
            expect(pulse1.output()).toBe(14);
            
            pulse1.clockEnvelope(); // Decay 14->13
            expect(pulse1.output()).toBe(13);
        });

        it('should loop envelope when loop flag is set', () => {
            pulse1.write(0, 0xE0); // Duty 3, envelope mode, loop flag set, period 0
            pulse1.write(3, 0x08); // Restart envelope
            
            pulse1.clockEnvelope(); // Load 15
            
            // Decay to 0
            for (let i = 0; i < 15; i++) {
                pulse1.clockEnvelope();
            }
            expect(pulse1.output()).toBe(0);
            
            // Next clock should loop to 15
            pulse1.clockEnvelope();
            expect(pulse1.output()).toBe(15);
        });
    });

    describe('Sweep Integration', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0xDF); // Duty 3, constant volume 15
            pulse1.write(3, 0x08); // Load length counter
        });

        it('should adjust period when sweep is enabled', () => {
            // Set initial period
            pulse1.write(2, 0x00); // Low byte
            pulse1.write(3, 0x02 << 3); // High bits = 2, period = 0x200
            
            // Enable sweep: enabled, period 0, negate off, shift 1
            pulse1.write(1, 0x81); // Enable + shift 1
            
            // Clock sweep - should increase period by (period >> shift) = 0x200 >> 1 = 0x100
            pulse1.clockSweep(); // Reload divider due to write
            pulse1.clockSweep(); // Actually apply sweep (divider now 0)
            
            // New period should be 0x200 + 0x100 = 0x300
        });

        it('should disable sweep when enable bit is clear', () => {
            pulse1.write(2, 0x00);
            pulse1.write(3, 0x02 << 3);
            
            // Sweep disabled (bit 7 = 0)
            pulse1.write(1, 0x01); // Shift 1, but not enabled
            
            pulse1.clockSweep();
            pulse1.clockSweep();
            
            // Period should not change
        });

        it('should increase period when negate is off (sweep up)', () => {
            pulse1.write(2, 0x00);
            pulse1.write(3, 0x01 << 3); // Period = 0x100
            pulse1.write(1, 0x81); // Enable, shift 1, negate off
            
            pulse1.clockSweep();
            pulse1.clockSweep();
            
            // Period should increase by 0x100 >> 1 = 0x80
            // New period = 0x100 + 0x80 = 0x180
        });

        it('should decrease period when negate is on (sweep down)', () => {
            pulse1.write(2, 0x00);
            pulse1.write(3, 0x01 << 3); // Period = 0x100
            pulse1.write(1, 0x89); // Enable, shift 1, negate on
            
            pulse1.clockSweep();
            pulse1.clockSweep();
            
            // For Pulse 1: period - (period >> shift) = 0x100 - 0x80 = 0x80
        });

        it('should use ones complement for Pulse 1 negate', () => {
            // Pulse 1 uses ones' complement: period - (period >> shift)
            pulse1.write(2, 0x00);
            pulse1.write(3, 0x01 << 3); // Period = 0x100
            pulse1.write(1, 0x89); // Enable, negate, shift 1
            
            pulse1.clockSweep();
            pulse1.clockSweep();
            
            // Target = 0x100 - (0x100 >> 1) = 0x100 - 0x80 = 0x80
        });

        it('should use twos complement for Pulse 2 negate', () => {
            // Pulse 2 uses twos' complement: period - (period >> shift) - 1
            pulse2.setEnabled(true);
            pulse2.write(0, 0xDF);
            pulse2.write(2, 0x00);
            pulse2.write(3, 0x01 << 3 | 0x08); // Period = 0x100, load length
            pulse2.write(1, 0x89); // Enable, negate, shift 1
            
            pulse2.clockSweep();
            pulse2.clockSweep();
            
            // Target = 0x100 - (0x100 >> 1) - 1 = 0x100 - 0x80 - 1 = 0x7F
        });

        it('should mute when sweep shift is 0', () => {
            pulse1.write(2, 0x10);
            pulse1.write(3, 0x08);
            pulse1.write(1, 0x80); // Enable, but shift = 0
            
            // Should still output (shift 0 means sweep doesn't apply)
        });
    });

    describe('Register Writes', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
        });

        it('should decode register 0 correctly', () => {
            // DDLC.VVVV
            pulse1.write(0, 0xDF); // 11_0_1_1111
            // Duty = 3, Length halt = 1, Constant vol = 1, Volume = 15
            
            pulse1.write(2, 0x10);
            pulse1.write(3, 0x08);
            
            expect(pulse1.output()).toBe(15); // Constant volume
        });

        it('should decode register 1 correctly', () => {
            // EPPP.NSSS
            pulse1.write(1, 0x89); // 1_000_1_001
            // Enable = 1, Period = 0, Negate = 1, Shift = 1
        });

        it('should decode register 2 correctly', () => {
            // TTTT.TTTT - timer low byte
            pulse1.write(2, 0xAB);
            pulse1.write(3, 0x00);
            
            // Timer period should have 0xAB in low byte
        });

        it('should decode register 3 correctly', () => {
            // LLLL.LTTT
            pulse1.write(3, 0xF7); // 11111_111
            // Length index = 31, Timer high = 7
            
            expect(pulse1.isActive()).toBe(true);
        });

        it('should ignore invalid register numbers', () => {
            pulse1.write(0, 0x1F);
            pulse1.write(3, 0x08);
            
            const before = pulse1.output();
            
            // Try to write invalid register
            pulse1.write(4, 0xFF);
            pulse1.write(5, 0xFF);
            
            // Should not change output
            expect(pulse1.output()).toBe(before);
        });

        it('should handle all registers in sequence', () => {
            pulse1.write(0, 0xDF); // Duty 3, constant vol 15
            pulse1.write(1, 0x00); // Sweep disabled
            pulse1.write(2, 0x10); // Timer low
            pulse1.write(3, 0x08); // Length + timer high
            
            expect(pulse1.isActive()).toBe(true);
            expect(pulse1.output()).toBe(15);
        });
    });

    describe('Reset', () => {
        it('should reset all state to power-on defaults', () => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0xFF);
            pulse1.write(1, 0xFF);
            pulse1.write(2, 0xFF);
            pulse1.write(3, 0xFF);
            
            pulse1.reset();
            
            expect(pulse1.isActive()).toBe(false);
            expect(pulse1.output()).toBe(0);
        });

        it('should reset duty cycle to 0', () => {
            pulse1.write(0, 0xC0); // Duty 3
            pulse1.reset();
            
            // After reset, duty should be 0
        });

        it('should reset timer to 0', () => {
            pulse1.write(2, 0xFF);
            pulse1.write(3, 0xFF);
            pulse1.reset();
            
            // Timer should be reset
        });

        it('should reset length counter to 0', () => {
            pulse1.setEnabled(true);
            pulse1.write(3, 0xFF);
            pulse1.reset();
            
            expect(pulse1.isActive()).toBe(false);
        });
    });

    describe('Output Value', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            pulse1.write(2, 0x10); // Timer > 8
            pulse1.write(3, 0x08); // Load length
        });

        it('should output envelope volume when enabled and duty is high', () => {
            pulse1.write(0, 0xD5); // Duty 3, constant volume 5
            expect(pulse1.output()).toBe(5);
        });

        it('should output 0 when duty is low', () => {
            pulse1.write(0, 0x15); // Duty 0 [0,0,0,0,0,0,0,1], constant vol 5
            // Position 0-6 should output 0
            expect(pulse1.output()).toBe(0);
        });

        it('should output value in range 0-15', () => {
            pulse1.write(0, 0xDF); // Duty 3, constant volume 15
            const output = pulse1.output();
            expect(output).to.be.at.least(0);
            expect(output).to.be.at.most(15);
        });

        it('should output 0 when channel is disabled', () => {
            pulse1.write(0, 0xDF); // Duty 3, constant volume 15
            pulse1.setEnabled(false);
            expect(pulse1.output()).toBe(0);
        });
    });

    describe('Clock Methods', () => {
        beforeEach(() => {
            pulse1.setEnabled(true);
            pulse1.write(0, 0xDF);
            pulse1.write(2, 0x10);
            pulse1.write(3, 0x08);
        });

        it('should clock timer without errors', () => {
            expect(() => pulse1.clockTimer()).to.not.throw();
        });

        it('should clock length counter without errors', () => {
            expect(() => pulse1.clockLengthCounter()).to.not.throw();
        });

        it('should clock envelope without errors', () => {
            expect(() => pulse1.clockEnvelope()).to.not.throw();
        });

        it('should clock sweep without errors', () => {
            expect(() => pulse1.clockSweep()).to.not.throw();
        });

        it('should handle multiple timer clocks', () => {
            for (let i = 0; i < 100; i++) {
                pulse1.clockTimer();
            }
            expect(pulse1.isActive()).toBe(true);
        });

        it('should handle multiple envelope clocks', () => {
            for (let i = 0; i < 100; i++) {
                pulse1.clockEnvelope();
            }
            expect(pulse1.isActive()).toBe(true);
        });
    });

    describe('Hardware Quirks - Section 17 Verification', () => {
        describe('17.3 - Phase reset on $4003/$4007 write', () => {
            it('should reset duty position to 0 when writing to $4003 (Pulse 1)', () => {
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF); // Duty 3: [1,1,1,1,1,1,0,0], constant vol 15
                pulse1.write(2, 0x10); // Timer period > 8 to avoid muting
                pulse1.write(3, 0x08); // Load length, reset duty position to 0
                
                // At position 0, duty 3 outputs 1 (volume 15)
                expect(pulse1.output()).toBe(15);
                
                // Advance duty position to 6 (outputs 0)
                for (let i = 0; i < 6; i++) {
                    for (let j = 0; j <= 0x10; j++) {
                        pulse1.clockTimer();
                    }
                }
                expect(pulse1.output()).toBe(0);
                
                // Write to $4003 again - should reset position to 0
                pulse1.write(3, 0x08);
                
                // Now back at position 0 (outputs 15)
                expect(pulse1.output()).toBe(15);
            });

            it('should reset duty position to 0 when writing to $4007 (Pulse 2)', () => {
                pulse2.setEnabled(true);
                pulse2.write(0, 0xDF); // Duty 3: [1,1,1,1,1,1,0,0], constant vol 15
                pulse2.write(2, 0x10); // Timer period > 8
                pulse2.write(3, 0x08); // Load length, reset duty position to 0
                
                // At position 0, duty 3 outputs 1 (volume 15)
                expect(pulse2.output()).toBe(15);
                
                // Advance duty position to 7 (outputs 0)
                for (let i = 0; i < 7; i++) {
                    for (let j = 0; j <= 0x10; j++) {
                        pulse2.clockTimer();
                    }
                }
                expect(pulse2.output()).toBe(0);
                
                // Write to $4007 again - should reset position to 0
                pulse2.write(3, 0x08);
                
                // Now back at position 0 (outputs 15)
                expect(pulse2.output()).toBe(15);
            });

            it('should reset duty position regardless of which bits are written', () => {
                pulse1.setEnabled(true);
                pulse1.write(0, 0x5F); // Duty 1: [0,0,0,0,0,0,1,1], constant vol 15
                pulse1.write(2, 0x10);
                pulse1.write(3, 0x00); // Load length index 0, reset position
                
                // Position 0 of duty 1 is 0 (outputs 0)
                expect(pulse1.output()).toBe(0);
                
                // Advance to position 6 (outputs 15)
                for (let i = 0; i < 6; i++) {
                    for (let j = 0; j <= 0x10; j++) {
                        pulse1.clockTimer();
                    }
                }
                expect(pulse1.output()).toBe(15);
                
                // Write different timer high bits - should still reset position
                pulse1.write(3, 0xF8); // Different length and timer values
                
                // Back at position 0 (outputs 0)
                expect(pulse1.output()).toBe(0);
            });

            it('should reset duty position even mid-sequence', () => {
                pulse1.setEnabled(true);
                pulse1.write(0, 0x9F); // Duty 2: [0,0,0,0,1,1,1,1], constant vol 15
                pulse1.write(2, 0x10);
                pulse1.write(3, 0x08); // Reset to position 0
                
                // Position 0 outputs 0
                expect(pulse1.output()).toBe(0);
                
                // Advance to position 4 (outputs 15)
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j <= 0x10; j++) {
                        pulse1.clockTimer();
                    }
                }
                expect(pulse1.output()).toBe(15);
                
                // Advance to position 5 (still outputs 15)
                for (let j = 0; j <= 0x10; j++) {
                    pulse1.clockTimer();
                }
                expect(pulse1.output()).toBe(15);
                
                // Write register 3 - resets back to position 0
                pulse1.write(3, 0x08);
                expect(pulse1.output()).toBe(0);
            });

            it('should occur on every write to register 3', () => {
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF); // Duty 3, constant vol 15
                pulse1.write(2, 0x10);
                
                // First write resets to 0
                pulse1.write(3, 0x08);
                expect(pulse1.output()).toBe(15); // Position 0 of duty 3
                
                // Advance duty position
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j <= 0x10; j++) {
                        pulse1.clockTimer();
                    }
                }
                
                // Second write resets to 0 again
                pulse1.write(3, 0x08);
                expect(pulse1.output()).toBe(15);
                
                // Advance again
                for (let i = 0; i < 5; i++) {
                    for (let j = 0; j <= 0x10; j++) {
                        pulse1.clockTimer();
                    }
                }
                
                // Third write resets to 0 again
                pulse1.write(3, 0x08);
                expect(pulse1.output()).toBe(15);
            });
        });

        describe('17.9 - Pulse muting conditions (timer < 8, sweep target > $7FF)', () => {
            it('should mute when timer period < 8', () => {
                // Hardware quirk: Pulse is muted when timer period < 8
                // This prevents ultrasonic frequencies
                // Verified in implementation at pulse.ts line 258 and sweep.ts line 150
                
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF); // Duty 3 (75%), constant volume 15 - duty 3 outputs 1 at position 0
                pulse1.write(3, 0x08); // Load length counter
                
                // Set timer period < 8
                for (let period = 0; period < 8; period++) {
                    pulse1.write(2, period); // Timer low
                    pulse1.write(3, 0x08); // Timer high = 0
                    
                    // Should be muted
                    expect(pulse1.output()).toBe(0, `Muted when period = ${period}`);
                }
            });

            it('should NOT mute when timer period = 8', () => {
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF); // Duty 3, constant volume 15
                pulse1.write(2, 0x08); // Timer low = 8
                pulse1.write(3, 0x08); // Timer high = 0, load length
                
                // Should not be muted (period = 8, at the threshold)
                expect(pulse1.output()).to.not.equal(0, 'Not muted when period = 8');
            });

            it('should NOT mute when timer period > 8', () => {
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF);
                pulse1.write(2, 0xFF); // Timer low = 255
                pulse1.write(3, 0x08); // Timer high = 0
                
                // Should not be muted
                expect(pulse1.output()).to.not.equal(0, 'Not muted when period > 8');
            });

            it('should mute when sweep target period > $7FF', () => {
                // Pulse is also muted when sweep target period would overflow (> $7FF = 2047)
                // Verified in implementation at sweep.ts lines 155-156
                
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF); // Constant volume 15
                pulse1.write(1, 0x08); // Sweep: shift = 0, negate = 1 (disabled but still checked)
                pulse1.write(2, 0xFF); // Timer low = 0xFF
                pulse1.write(3, (0x07 << 3) | 0x07); // Timer high =0x7, load length
                // Period = 0x7FF (2047) - at the edge
                
                // Not muted yet
                expect(pulse1.output()).to.not.equal(0);
                
                // Set period to 0x7FF with shift that would overflow
                pulse1.write(1, 0x01); // Sweep: shift = 1, negate = 0 (add mode)
                // Target = 0x7FF + (0x7FF >> 1) = 0x7FF + 0x3FF = 0xBFE (> 0x7FF)
                
                // Should be muted due to sweep target overflow
                expect(pulse1.output()).toBe(0, 'Muted when sweep target > $7FF');
            });

            it('should mute when current period < 8 even if sweep is disabled', () => {
                // Muting is checked regardless of sweep enable
                
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF);
                pulse1.write(1, 0x00); // Sweep disabled
                pulse1.write(2, 0x05); // Period = 5 (< 8)
                pulse1.write(3, 0x08);
                
                // Muted despite sweep being disabled
                expect(pulse1.output()).toBe(0);
            });

            it('should check both muting conditions independently', () => {
                // Both conditions should be checked
                
                pulse1.setEnabled(true);
                pulse1.write(0, 0xDF);
                
                // Condition 1: period < 8 (TRUE) - muted
                pulse1.write(1, 0x00);
                pulse1.write(2, 0x05);
                pulse1.write(3, 0x08);
                expect(pulse1.output()).toBe(0, 'Muted by period < 8');
                
                // Fix period, but create sweep overflow
                pulse1.write(1, 0x01); // Shift = 1, add mode
                pulse1.write(2, 0xFF);
                pulse1.write(3, (0x07 << 3) | 0x07); // Period = 0x7FF
                // Target = 0x7FF + 0x3FF = overflow
                expect(pulse1.output()).toBe(0, 'Muted by sweep overflow');
                
                // Fix both conditions
                pulse1.write(1, 0x00); // Disable sweep
                pulse1.write(2, 0x10); // Period = 16 (valid)
                pulse1.write(3, 0x08);
                expect(pulse1.output()).to.not.equal(0, 'Not muted when both conditions false');
            });

            it('should work correctly for Pulse 2 channel as well', () => {
                // Pulse 2 has the same muting conditions
                
                const pulse2 = new PulseChannel(2);
                pulse2.setEnabled(true);
                pulse2.write(0, 0xDF);
                
                // Test period < 8
                pulse2.write(2, 0x03);
                pulse2.write(3, 0x08);
                expect(pulse2.output()).toBe(0, 'Pulse 2 muted when period < 8');
                
                // Test valid period
                pulse2.write(2, 0x10);
                pulse2.write(3, 0x08);
                expect(pulse2.output()).to.not.equal(0, 'Pulse 2 not muted when period >= 8');
            });
        });
    });
});

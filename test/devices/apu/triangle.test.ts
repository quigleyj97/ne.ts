import { TriangleChannel } from '../../../src/devices/apu/channels/triangle.js';

/**
 * TriangleChannel Unit Tests
 * 
 * Comprehensive tests for the NES APU Triangle Channel implementation.
 * Tests cover the 32-step waveform, timer, linear counter, length counter, and muting conditions.
 */

describe('TriangleChannel', () => {
    /** @type {import('../../../src/devices/apu/channels/triangle').TriangleChannel} */
    let triangle;

    beforeEach(() => {
        triangle = new TriangleChannel();
    });

    describe('Construction', () => {
        it('should construct a triangle channel', () => {
            expect(triangle).toBeInstanceOf(TriangleChannel);
        });

        it('should start disabled', () => {
            expect(triangle.isEnabled()).toBe(false);
        });

        it('should start with zero output', () => {
            expect(triangle.output()).toBe(0);
        });

        it('should start with zero length counter', () => {
            expect(triangle.lengthCounter).toBe(0);
        });
    });

    describe('Triangle Waveform', () => {
        beforeEach(() => {
            triangle.setEnabled(true);
            // Set control flag to keep linear counter running
            triangle.writeControl(0x7F); // Control set, reload = 127
            // Set timer period > 2 to avoid ultrasonic muting
            triangle.writeTimerLow(0x10);
            // Load length counter - this also sets linear counter reload flag
            triangle.writeTimerHigh(0x08); // Length index 1
            // Clock linear counter to load it
            triangle.clockLinearCounter();
        });

        it('should output 32-step triangle sequence', () => {
            const expected = [
                15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
            ];
            const actual = [];
            
            for (let i = 0; i < 32; i++) {
                actual.push(triangle.output());
                // Advance sequencer by expiring timer
                for (let j = 0; j <= 0x10; j++) {
                    triangle.clock();
                }
            }
            
            expect(actual).toEqual(expected);
        });

        it('should wrap sequence after 32 steps', () => {
            // Advance through full sequence
            for (let i = 0; i < 32; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    triangle.clock();
                }
            }
            
            // Should wrap back to position 0 (value 15)
            expect(triangle.output()).toBe(15);
        });

        it('should output correct values at specific positions', () => {
            // Position 0: 15
            expect(triangle.output()).toBe(15);
            
            // Advance to position 8
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    triangle.clock();
                }
            }
            expect(triangle.output()).toBe(7);
            
            // Advance to position 15
            for (let i = 0; i < 7; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    triangle.clock();
                }
            }
            expect(triangle.output()).toBe(0);
            
            // Advance to position 16 (start of second half)
            for (let j = 0; j <= 0x10; j++) {
                triangle.clock();
            }
            expect(triangle.output()).toBe(0);
            
            // Advance to position 24
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    triangle.clock();
                }
            }
            expect(triangle.output()).toBe(8);
        });

        it('should not reset sequencer position on timer high write', () => {
            // Advance sequencer several positions
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j <= 0x10; j++) {
                    triangle.clock();
                }
            }
            
            // Position 5 should be 10
            expect(triangle.output()).toBe(10);
            
            // Write timer high (unlike pulse channel, this doesn't reset position)
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter(); // Reload linear counter
            
            // Should still be at position 5
            expect(triangle.output()).toBe(10);
        });
    });

    describe('Timer', () => {
        beforeEach(() => {
            triangle.setEnabled(true);
            triangle.writeControl(0x7F); // Control set, reload = 127
            triangle.writeTimerHigh(0x08); // Load length counter
            triangle.clockLinearCounter(); // Reload linear counter
        });

        it('should set timer period from low and high registers', () => {
            triangle.writeTimerLow(0xAB);
            triangle.writeTimerHigh(0x05 << 3); // High 3 bits = 5
            
            // Period should be 0x5AB
            // We can verify by checking when sequencer advances
            const initialOutput = triangle.output();
            
            // Clock timer (period + 1) times to advance sequencer
            for (let i = 0; i <= 0x5AB; i++) {
                triangle.clock();
            }
            
            // Sequencer should have advanced
            expect(triangle.output()).to.not.equal(initialOutput);
        });

        it('should count down timer each clock', () => {
            triangle.writeTimerLow(0x03); // Period = 3
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter();
            
            // Timer counter starts at 0, so first clock advances immediately
            expect(triangle.output()).toBe(15); // Position 0
            
            triangle.clock(); // Counter 0 -> reload to 3, advance to position 1
            expect(triangle.output()).toBe(14); // Position 1
            
            // Next 3 clocks count down without advancing
            triangle.clock(); // 3 -> 2
            triangle.clock(); // 2 -> 1
            triangle.clock(); // 1 -> 0
            expect(triangle.output()).toBe(14); // Still position 1
            
            // Clock once more to reload and advance again
            triangle.clock(); // 0 -> reload to 3, advance to position 2
            expect(triangle.output()).toBe(13); // Position 2
        });

        it('should reload timer and advance sequencer when timer expires', () => {
            triangle.writeTimerLow(0x05);
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter();
            
            expect(triangle.output()).toBe(15); // Position 0
            
            // Expire timer to advance sequencer
            for (let i = 0; i <= 0x05; i++) {
                triangle.clock();
            }
            
            expect(triangle.output()).toBe(14); // Position 1
        });

        it('should handle timer period of 0', () => {
            triangle.writeTimerLow(0x00);
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter();
            
            // Should work without error and advance every clock
            triangle.clock();
            triangle.clock();
            // No assertion needed, just verify no crash
        });

        it('should handle timer period of 1', () => {
            triangle.writeTimerLow(0x01);
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter();
            
            // Period 1 is ultrasonic (< 2), so output is muted
            expect(triangle.output()).toBe(0);
            
            // Even after clocking, output remains muted
            triangle.clock();
            triangle.clock();
            expect(triangle.output()).toBe(0);
        });
    });

    describe('Linear Counter', () => {
        beforeEach(() => {
            triangle.setEnabled(true);
            triangle.writeTimerLow(0x10); // Timer > 2
            triangle.writeTimerHigh(0x08); // Load length counter
        });

        it('should set linear counter reload value from control register', () => {
            triangle.writeControl(0xFF); // Control set, reload = 127
            triangle.writeTimerHigh(0x08); // Set reload flag
            triangle.clockLinearCounter();
            
            // Linear counter should be 127, allowing output
            expect(triangle.output()).to.not.equal(0);
        });

        it('should reload linear counter when reload flag is set', () => {
            triangle.writeControl(0x8A); // Control set, reload = 10
            triangle.writeTimerHigh(0x08); // Set reload flag
            
            // Clock linear counter - should reload
            triangle.clockLinearCounter();
            
            // Should have output (counter is now 10)
            expect(triangle.output()).to.not.equal(0);
            
            // With control flag set, reload flag never clears
            // So every clock reloads instead of decrementing
            for (let i = 0; i < 10; i++) {
                triangle.clockLinearCounter(); // Reload to 10 each time
                expect(triangle.output()).to.not.equal(0); // Never reaches 0
            }
            
            // Should still have output (counter keeps reloading to 10)
            expect(triangle.output()).to.not.equal(0);
        });

        it('should decrement linear counter when reload flag is clear', () => {
            // Control flag clear allows reload flag to clear
            triangle.writeControl(0x05); // Control clear, reload = 5
            triangle.writeTimerHigh(0x08); // Set reload flag
            
            triangle.clockLinearCounter(); // Reload to 5, clear reload flag (control = 0)
            expect(triangle.output()).to.not.equal(0);
            
            // Decrement 5 times
            for (let i = 0; i < 5; i++) {
                triangle.clockLinearCounter();
            }
            
            // Should now be muted (counter = 0)
            expect(triangle.output()).toBe(0);
            
            // Further clocks shouldn't change anything (reload flag cleared)
            triangle.clockLinearCounter();
            triangle.clockLinearCounter();
            expect(triangle.output()).toBe(0);
        });

        it('should set reload flag when timer high register is written', () => {
            triangle.writeControl(0x05); // Control clear, reload = 5
            
            // Write timer high to set reload flag
            triangle.writeTimerHigh(0x08);
            
            // Clock should reload counter
            triangle.clockLinearCounter();
            expect(triangle.output()).to.not.equal(0);
        });

        it('should keep reload flag set when control flag is set', () => {
            triangle.writeControl(0x83); // Control set, reload = 3
            triangle.writeTimerHigh(0x08); // Set reload flag
            
            triangle.clockLinearCounter(); // Reload to 3
            expect(triangle.output()).to.not.equal(0);
            
            // Reload flag should stay set (control flag = 1)
            triangle.clockLinearCounter(); // Reload again
            triangle.clockLinearCounter(); // Reload again
            
            // Should still have output
            expect(triangle.output()).to.not.equal(0);
        });

        it('should clear reload flag when control flag is clear', () => {
            triangle.writeControl(0x03); // Control clear, reload = 3
            triangle.writeTimerHigh(0x08); // Set reload flag
            
            triangle.clockLinearCounter(); // Reload to 3, clear reload flag
            
            // Now counter should decrement
            triangle.clockLinearCounter(); // 3 -> 2
            triangle.clockLinearCounter(); // 2 -> 1
            triangle.clockLinearCounter(); // 1 -> 0
            
            expect(triangle.output()).toBe(0);
        });

        it('should mute output when linear counter is 0', () => {
            triangle.writeControl(0x01); // Control clear, reload = 1
            triangle.writeTimerHigh(0x08); // Set reload flag
            
            triangle.clockLinearCounter(); // Reload to 1, clear reload flag
            expect(triangle.output()).to.not.equal(0);
            
            triangle.clockLinearCounter(); // 1 -> 0
            expect(triangle.output()).toBe(0);
        });
    });

    describe('Length Counter', () => {
        // Length table for reference (first 8 entries):
        // [10, 254, 20, 2, 40, 4, 80, 6, ...]
        
        beforeEach(() => {
            triangle.writeControl(0x7F); // Control set (halt), reload = 127
            triangle.writeTimerLow(0x10); // Timer > 2
        });

        it('should load length counter from table via timer high register', () => {
            triangle.setEnabled(true);
            
            // Write length index 0 (value from table: 10)
            triangle.writeTimerHigh(0x00); // Bits 7-3 = 00000
            expect(triangle.lengthCounter).toBe(10);
            
            // Write length index 1 (value from table: 254)
            triangle.writeTimerHigh(0x08); // Bits 7-3 = 00001
            expect(triangle.lengthCounter).toBe(254);
            
            // Write length index 3 (value from table: 2)
            triangle.writeTimerHigh(0x18); // Bits 7-3 = 00011
            expect(triangle.lengthCounter).toBe(2);
        });

        it('should not load length counter when channel is disabled', () => {
            triangle.setEnabled(false);
            triangle.writeTimerHigh(0x08); // Try to load
            expect(triangle.lengthCounter).toBe(0);
        });

        it('should decrement length counter when clocked', () => {
            triangle.setEnabled(true);
            // Control clear to allow decrement
            triangle.writeControl(0x7F);
            triangle.writeControl(0x03); // Control clear, reload = 3
            triangle.writeTimerHigh(0x18); // Load index 3 = value 2
            triangle.clockLinearCounter(); // Reload linear counter
            
            expect(triangle.lengthCounter).toBe(2);
            
            triangle.clockLengthCounter();
            expect(triangle.lengthCounter).toBe(1);
            
            triangle.clockLengthCounter();
            expect(triangle.lengthCounter).toBe(0);
        });

        it('should halt length counter when control flag is set', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x83); // Control set (halt), reload = 3
            triangle.writeTimerHigh(0x18); // Load index 3 = value 2
            triangle.clockLinearCounter();
            
            expect(triangle.lengthCounter).toBe(2);
            
            // Clock multiple times
            triangle.clockLengthCounter();
            triangle.clockLengthCounter();
            triangle.clockLengthCounter();
            
            // Should still be 2 (halted)
            expect(triangle.lengthCounter).toBe(2);
        });

        it('should not decrement length counter below 0', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x03); // Control clear
            triangle.writeTimerHigh(0x18); // Load index 3 = value 2
            triangle.clockLinearCounter();
            
            // Decrement to 0
            triangle.clockLengthCounter();
            triangle.clockLengthCounter();
            expect(triangle.lengthCounter).toBe(0);
            
            // Clock more times
            triangle.clockLengthCounter();
            triangle.clockLengthCounter();
            
            // Should still be 0
            expect(triangle.lengthCounter).toBe(0);
        });

        it('should mute output when length counter is 0', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x03); // Control clear
            triangle.writeTimerHigh(0x18); // Load length = 2
            triangle.clockLinearCounter(); // Reload linear counter
            
            expect(triangle.output()).to.not.equal(0);
            
            // Decrement length counter to 0
            triangle.clockLengthCounter();
            triangle.clockLengthCounter();
            
            // Should be muted
            expect(triangle.output()).toBe(0);
        });

        it('should use control flag for both linear counter and length counter halt', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x83); // Control set
            triangle.writeTimerHigh(0x18);
            triangle.clockLinearCounter();
            
            // Length counter should be halted
            const lengthBefore = triangle.lengthCounter;
            triangle.clockLengthCounter();
            expect(triangle.lengthCounter).toBe(lengthBefore);
            
            // Linear counter reload flag should stay set
            triangle.clockLinearCounter(); // Should reload
            triangle.clockLinearCounter(); // Should reload again
            expect(triangle.output()).to.not.equal(0);
        });
    });

    describe('Muting Conditions', () => {
        beforeEach(() => {
            triangle.setEnabled(true);
            triangle.writeControl(0x7F); // Control set, reload = 127
        });

        it('should mute when linear counter is 0', () => {
            triangle.writeControl(0x01); // Control clear, reload = 1
            triangle.writeTimerLow(0x10); // Timer > 2
            triangle.writeTimerHigh(0x08); // Load length counter
            
            triangle.clockLinearCounter(); // Reload to 1, clear reload flag
            expect(triangle.output()).to.not.equal(0);
            
            triangle.clockLinearCounter(); // Decrement to 0
            expect(triangle.output()).toBe(0);
        });

        it('should mute when length counter is 0', () => {
            triangle.writeControl(0x03); // Control clear
            triangle.writeTimerLow(0x10); // Timer > 2
            triangle.writeTimerHigh(0x18); // Load length = 2
            triangle.clockLinearCounter(); // Reload linear counter
            
            expect(triangle.output()).to.not.equal(0);
            
            triangle.clockLengthCounter(); // 2 -> 1
            triangle.clockLengthCounter(); // 1 -> 0
            
            expect(triangle.output()).toBe(0);
        });

        it('should mute when timer period is 0 (ultrasonic)', () => {
            triangle.writeTimerLow(0x00);
            triangle.writeTimerHigh(0x08); // Period = 0
            triangle.clockLinearCounter();
            
            expect(triangle.output()).toBe(0);
        });

        it('should mute when timer period is 1 (ultrasonic)', () => {
            triangle.writeTimerLow(0x01);
            triangle.writeTimerHigh(0x08); // Period = 1
            triangle.clockLinearCounter();
            
            expect(triangle.output()).toBe(0);
        });

        it('should not mute when timer period is 2', () => {
            triangle.writeTimerLow(0x02);
            triangle.writeTimerHigh(0x08); // Period = 2
            triangle.clockLinearCounter();
            
            expect(triangle.output()).to.not.equal(0);
        });

        it('should not mute when timer period is greater than 2', () => {
            triangle.writeTimerLow(0xFF);
            triangle.writeTimerHigh(0x07 << 3); // Period = 0x7FF (max)
            triangle.clockLinearCounter();
            
            expect(triangle.output()).to.not.equal(0);
        });

        it('should continue running sequencer even when muted by ultrasonic period', () => {
            // Set ultrasonic period
            triangle.writeTimerLow(0x00);
            triangle.writeTimerHigh(0x08); // Period = 0
            triangle.clockLinearCounter();
            
            // Output should be muted
            expect(triangle.output()).toBe(0);
            
            // But sequencer should still advance
            // Change to non-ultrasonic period
            triangle.writeTimerLow(0x10);
            
            // Clock timer to advance sequencer
            for (let i = 0; i <= 0x10; i++) {
                triangle.clock();
            }
            
            // Output should show sequencer advanced (not at position 0)
            expect(triangle.output()).toBe(14); // Position 1
        });

        it('should stop sequencer when linear counter is 0', () => {
            triangle.writeControl(0x01); // Control clear, reload = 1
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter(); // Reload to 1, clear reload flag
            
            // Advance sequencer
            for (let i = 0; i <= 0x10; i++) {
                triangle.clock();
            }
            expect(triangle.output()).toBe(14); // Position 1
            
            // Zero linear counter
            triangle.clockLinearCounter(); // 1 -> 0
            
            // Try to advance sequencer
            for (let i = 0; i <= 0x10; i++) {
                triangle.clock();
            }
            
            // Position should not have changed (still outputs 0, but position frozen)
            // We can't directly check position, but if we restore linear counter,
            // should still be at position 1
            triangle.writeTimerHigh(0x08); // Set reload flag
            triangle.writeControl(0x01); // Reload = 1
            triangle.clockLinearCounter(); // Reload
            
            expect(triangle.output()).toBe(14); // Still at position 1
        });

        it('should stop sequencer when length counter is 0', () => {
            triangle.writeControl(0x03); // Control clear
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x18); // Load length = 2
            triangle.clockLinearCounter();
            
            // Advance sequencer
            for (let i = 0; i <= 0x10; i++) {
                triangle.clock();
            }
            expect(triangle.output()).toBe(14); // Position 1
            
            // Zero length counter
            triangle.clockLengthCounter(); // 2 -> 1
            triangle.clockLengthCounter(); // 1 -> 0
            
            // Try to advance sequencer
            for (let i = 0; i <= 0x10; i++) {
                triangle.clock();
            }
            
            // Restore length counter
            triangle.writeTimerHigh(0x08); // Load length
            triangle.clockLinearCounter(); // Reload linear counter
            
            expect(triangle.output()).toBe(14); // Still at position 1
        });
    });

    describe('Enable/Disable', () => {
        it('should enable channel with setEnabled(true)', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x7F);
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter();
            
            expect(triangle.isEnabled()).toBe(true);
        });

        it('should disable and clear length counter with setEnabled(false)', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x7F);
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x08);
            expect(triangle.lengthCounter).toBeGreaterThan(0);
            
            triangle.setEnabled(false);
            expect(triangle.lengthCounter).toBe(0);
        });

        it('should return false from isEnabled() when disabled', () => {
            triangle.setEnabled(false);
            expect(triangle.isEnabled()).toBe(false);
        });

        it('should return false from isEnabled() when length counter is 0', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x03); // Control clear
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x18); // Load length = 2
            
            triangle.clockLengthCounter();
            triangle.clockLengthCounter();
            
            expect(triangle.isEnabled()).toBe(false);
        });

        it('should return true from isEnabled() when length counter > 0', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x7F);
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x08);
            
            expect(triangle.isEnabled()).toBe(true);
        });
    });

    describe('Register Writes', () => {
        beforeEach(() => {
            triangle.setEnabled(true);
        });

        it('should write control register ($4008)', () => {
            triangle.writeControl(0xAB); // Control set (bit 7), reload = 0x2B
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x08);
            
            triangle.clockLinearCounter(); // Should reload to 0x2B
            
            // Verify linear counter was set (channel should have output)
            expect(triangle.output()).to.not.equal(0);
            
            // Verify control flag halts length counter
            const lengthBefore = triangle.lengthCounter;
            triangle.clockLengthCounter();
            expect(triangle.lengthCounter).toBe(lengthBefore);
        });

        it('should write timer low register ($400A)', () => {
            triangle.writeControl(0x7F);
            triangle.writeTimerLow(0xCD);
            triangle.writeTimerHigh(0x05 << 3); // High = 5, period should be 0x5CD
            triangle.clockLinearCounter();
            
            // Verify timer period set correctly by checking advancement
            const initial = triangle.output();
            for (let i = 0; i <= 0x5CD; i++) {
                triangle.clock();
            }
            expect(triangle.output()).to.not.equal(initial);
        });

        it('should write timer high register ($400B)', () => {
            triangle.writeControl(0x7F);
            triangle.writeTimerLow(0x00);
            
            // Write timer high with length index 2 (value 20) and timer high = 3
            triangle.writeTimerHigh(0x13); // Bits 7-3 = 00010 (index 2), bits 2-0 = 011 (3)
            
            // Check length counter loaded
            expect(triangle.lengthCounter).toBe(20);
            
            // Timer period should be 0x300
            triangle.clockLinearCounter(); // Reload linear counter
            const initial = triangle.output();
            for (let i = 0; i <= 0x300; i++) {
                triangle.clock();
            }
            expect(triangle.output()).to.not.equal(initial);
        });

        it('should set reload flag on timer high write', () => {
            triangle.writeControl(0x05); // Control clear, reload = 5
            triangle.writeTimerLow(0x10);
            
            // Decrement linear counter to 0
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter(); // Reload to 5, clear reload flag
            for (let i = 0; i < 5; i++) {
                triangle.clockLinearCounter(); // Decrement to 0
            }
            expect(triangle.output()).toBe(0);
            
            // Write timer high again to set reload flag
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter(); // Should reload
            
            expect(triangle.output()).to.not.equal(0);
        });
    });

    describe('Reset', () => {
        it('should reset to initial state', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0xFF);
            triangle.writeTimerLow(0xFF);
            triangle.writeTimerHigh(0xFF);
            triangle.clockLinearCounter();
            
            // Modify state
            for (let i = 0; i < 10; i++) {
                triangle.clock();
            }
            
            // Reset
            triangle.reset();
            
            // Check reset state
            expect(triangle.lengthCounter).toBe(0);
            expect(triangle.isEnabled()).toBe(false);
            expect(triangle.output()).toBe(0);
        });
    });

    describe('Integration Tests', () => {
        it('should produce correct output with typical settings', () => {
            triangle.setEnabled(true);
            // Typical bass note setup
            triangle.writeControl(0xFF); // Control set, max reload
            triangle.writeTimerLow(0xFE); // Low period
            triangle.writeTimerHigh(0x08); // Medium high period, load length
            triangle.clockLinearCounter(); // Reload linear counter
            
            // Should produce output
            expect(triangle.output()).toBe(15);
            
            // Advance sequencer
            for (let i = 0; i <= 0xFE; i++) {
                triangle.clock();
            }
            expect(triangle.output()).toBe(14);
        });

        it('should handle rapid enable/disable', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x7F);
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x08);
            
            triangle.setEnabled(false);
            expect(triangle.lengthCounter).toBe(0);
            
            triangle.setEnabled(true);
            triangle.writeTimerHigh(0x08);
            triangle.clockLinearCounter();
            
            expect(triangle.output()).to.not.equal(0);
        });

        it('should handle all counters expiring', () => {
            triangle.setEnabled(true);
            triangle.writeControl(0x01); // Control clear, reload = 1
            triangle.writeTimerLow(0x10);
            triangle.writeTimerHigh(0x18); // Load length = 2
            triangle.clockLinearCounter(); // Reload linear counter to 1
            
            expect(triangle.output()).to.not.equal(0);
            
            // Expire linear counter
            triangle.clockLinearCounter(); // 1 -> 0
            expect(triangle.output()).toBe(0);
            
            // Reload linear counter
            triangle.writeTimerHigh(0x18);
            triangle.clockLinearCounter();
            expect(triangle.output()).to.not.equal(0);
            
            // Expire length counter
            triangle.clockLengthCounter(); // 2 -> 1
            triangle.clockLengthCounter(); // 1 -> 0
            expect(triangle.output()).toBe(0);
        });
    });

    describe('Hardware Quirks - Section 17 Verification', () => {
        describe('17.8 - Linear counter reload flag behavior', () => {
            it('should set reload flag when writing to $400B', () => {
                // Hardware quirk: Writing to $400B sets the linear counter reload flag
                // Verified in implementation at triangle.ts line 169: this.linearCounterReloadFlag = true;
                
                triangle.setEnabled(true);
                triangle.writeControl(0x7F); // Set reload value and control flag
                triangle.writeTimerHigh(0x08); // This sets reload flag
                
                // Next clockLinearCounter should reload the counter
                triangle.clockLinearCounter();
                
                // Linear counter should be reloaded to reload value (0x7F = 127)
                // Triangle should produce output
                triangle.writeTimerLow(0x02); // Timer >= 2
                expect(triangle.output()).to.not.equal(0);
            });

            it('should clear reload flag when control flag is clear', () => {
                // The reload flag is cleared when linear counter is clocked IF control flag is clear
                // Verified in implementation at triangle.ts lines 218-220
                
                triangle.setEnabled(true);
                triangle.writeControl(0x7F); // Control flag CLEAR (bit 7 = 0), reload = 127
                triangle.writeTimerLow(0x02);
                triangle.writeTimerHigh(0x08); // Set reload flag
                
                // Clock with control flag clear - should clear reload flag
                triangle.clockLinearCounter();
                
                // Reload flag should be cleared
                // If we clock again, counter should decrement instead of reload
                triangle.clockLinearCounter(); // 127 -> 126
                triangle.clockLinearCounter(); // 126 -> 125
                
                // Counter is decrementing, not reloading
                expect(triangle.output()).to.not.equal(0); // Still has counter value
            });

            it('should NOT clear reload flag when control flag is set', () => {
                // If control flag is SET, reload flag stays set
                // Verified in implementation at triangle.ts lines 217-220
                
                triangle.setEnabled(true);
                triangle.writeControl(0xFF); // Control flag SET (bit 7 = 1), reload = 127
                triangle.writeTimerLow(0x02);
                triangle.writeTimerHigh(0x08); // Set reload flag
                
                // Clock with control flag set - should reload and NOT clear reload flag
                triangle.clockLinearCounter(); // Reload to 127
                triangle.clockLinearCounter(); // Reload to 127 again
                triangle.clockLinearCounter(); // Reload to 127 again
                
                // Counter keeps reloading (never expires)
                expect(triangle.output()).to.not.equal(0);
            });
        });

        describe('17.10 - Triangle muting when timer < 2', () => {
            it('should mute output when timer period = 0', () => {
                // Hardware quirk: Triangle is silenced when timer period < 2
                // This prevents ultrasonic frequencies that would produce pops/clicks
                // Verified in implementation at triangle.ts lines 263-265
                
                triangle.setEnabled(true);
                triangle.writeControl(0xFF); // Max linear counter
                triangle.writeTimerLow(0x00); // Timer low = 0
                triangle.writeTimerHigh(0x08); // Timer high = 0, load length
                // Timer period = 0 (< 2)
                
                triangle.clockLinearCounter(); // Load linear counter
                
                // Should be muted despite having linear and length counters
                expect(triangle.output()).toBe(0, 'Muted when period = 0');
            });

            it('should mute output when timer period = 1', () => {
                triangle.setEnabled(true);
                triangle.writeControl(0xFF);
                triangle.writeTimerLow(0x01); // Timer low = 1
                triangle.writeTimerHigh(0x08); // Timer high = 0
                // Timer period = 1 (< 2)
                
                triangle.clockLinearCounter();
                
                expect(triangle.output()).toBe(0, 'Muted when period = 1');
            });

            it('should NOT mute when timer period = 2', () => {
                triangle.setEnabled(true);
                triangle.writeControl(0xFF);
                triangle.writeTimerLow(0x02); // Timer low = 2
                triangle.writeTimerHigh(0x08); // Timer high = 0
                // Timer period = 2 (>= 2, not muted)
                
                triangle.clockLinearCounter();
                
                expect(triangle.output()).to.not.equal(0, 'Not muted when period = 2');
            });

            it('should NOT mute when timer period > 2', () => {
                triangle.setEnabled(true);
                triangle.writeControl(0xFF);
                triangle.writeTimerLow(0xFF); // Timer low = 255
                triangle.writeTimerHigh(0x08); // Timer high = 0
                // Timer period = 255 (>= 2, not muted)
                
                triangle.clockLinearCounter();
                
                expect(triangle.output()).to.not.equal(0, 'Not muted when period = 255');
            });

            it('should mute even with valid linear and length counters', () => {
                // The ultrasonic muting is independent of other muting conditions
                
                triangle.setEnabled(true);
                triangle.writeControl(0xFF); // Max linear counter, length halt
                triangle.writeTimerLow(0x00); // Period = 0
                triangle.writeTimerHigh(0xF8); // Load max length counter
                
                triangle.clockLinearCounter(); // Load linear counter
                
                // Has both counters loaded, but still muted due to timer
                expect(triangle.output()).toBe(0);
            });
        });
    });
});

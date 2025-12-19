import chai from "chai";
import { EnvelopeUnit } from '../../../lib/devices/apu/units/envelope.js';

const expect = chai.expect;

/**
 * EnvelopeUnit Unit Tests
 * 
 * Comprehensive tests for the NES APU Envelope Unit.
 * The envelope unit is shared by Pulse and Noise channels to control volume over time.
 * Tests cover initialization, register configuration, constant volume mode, envelope decay,
 * start flag behavior, loop flag behavior, and edge cases.
 */

describe('EnvelopeUnit', () => {
    /** @type {import('../../../src/devices/apu/units/envelope').EnvelopeUnit} */
    let envelope;

    beforeEach(() => {
        envelope = new EnvelopeUnit();
    });

    describe('initialization', () => {
        it('should construct an envelope unit', () => {
            expect(envelope).to.be.instanceOf(EnvelopeUnit);
        });

        it('should initialize with zero output', () => {
            expect(envelope.output()).to.equal(0);
        });

        it('should start in envelope mode (not constant volume)', () => {
            // Start flag not set, decay level is 0
            // In envelope mode, should output decay level (0)
            expect(envelope.output()).to.equal(0);
        });

        it('should initialize with default state after reset', () => {
            envelope.reset();
            expect(envelope.output()).to.equal(0);
        });
    });

    describe('setRegister', () => {
        it('should set volume/period value from bits 0-3', () => {
            envelope.setRegister(0x1F); // Constant volume ON, Volume = 15
            expect(envelope.output()).to.equal(15);
            
            envelope.setRegister(0x15); // Constant volume ON, Volume = 5
            expect(envelope.output()).to.equal(5);
            
            envelope.setRegister(0x10); // Constant volume ON, Volume = 0
            expect(envelope.output()).to.equal(0);
        });

        it('should set constant volume flag from bit 4', () => {
            // Bit 4 = 0: envelope mode
            envelope.setRegister(0x0F); // Constant volume OFF, volume = 15
            envelope.setStartFlag();
            envelope.clock(); // Start, set decay to 15
            expect(envelope.output()).to.equal(15); // Outputs decay level
            
            // Bit 4 = 1: constant volume mode
            envelope.setRegister(0x1F); // Constant volume ON, volume = 15
            expect(envelope.output()).to.equal(15); // Outputs volume directly
        });

        it('should set loop flag from bit 5', () => {
            // Bit 5 = 0: no loop
            envelope.setRegister(0x00); // Loop OFF, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay to 0 (15 clocks to go from 15 to 0)
            for (let i = 0; i < 15; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Should stay at 0 (no loop)
            envelope.clock();
            expect(envelope.output()).to.equal(0);
            
            // Bit 5 = 1: loop enabled
            envelope.setRegister(0x20); // Loop ON, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay to 0, then wrap (15 clocks to reach 0, then wraps to 15)
            for (let i = 0; i < 15; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Next clock should wrap to 15 (loop enabled)
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });

        it('should handle all combinations of flags', () => {
            // Test: Loop=1, Constant=1, Volume=7
            envelope.setRegister(0x37); // 00110111
            expect(envelope.output()).to.equal(7);
            
            // Test: Loop=1, Constant=0, Volume=12
            envelope.setRegister(0x2C); // 00101100
            envelope.setStartFlag();
            envelope.clock();
            expect(envelope.output()).to.equal(15); // Decay level
            
            // Test: Loop=0, Constant=1, Volume=3
            envelope.setRegister(0x13); // 00010011
            expect(envelope.output()).to.equal(3);
        });
    });

    describe('constant volume mode', () => {
        it('should output volume directly when constant flag is set', () => {
            envelope.setRegister(0x1F); // Constant volume ON, volume = 15
            expect(envelope.output()).to.equal(15);
            
            envelope.setRegister(0x1A); // Constant volume ON, volume = 10
            expect(envelope.output()).to.equal(10);
            
            envelope.setRegister(0x10); // Constant volume ON, volume = 0
            expect(envelope.output()).to.equal(0);
        });

        it('should not be affected by envelope clocking in constant mode', () => {
            envelope.setRegister(0x18); // Constant volume ON, volume = 8
            expect(envelope.output()).to.equal(8);
            
            // Clock multiple times
            for (let i = 0; i < 20; i++) {
                envelope.clock();
            }
            
            // Should still output constant volume
            expect(envelope.output()).to.equal(8);
        });

        it('should not be affected by start flag in constant mode', () => {
            envelope.setRegister(0x1C); // Constant volume ON, volume = 12
            expect(envelope.output()).to.equal(12);
            
            envelope.setStartFlag();
            envelope.clock();
            
            // Should still output constant volume
            expect(envelope.output()).to.equal(12);
        });

        it('should immediately change output when volume is updated', () => {
            envelope.setRegister(0x15); // Constant volume ON, volume = 5
            expect(envelope.output()).to.equal(5);
            
            envelope.setRegister(0x1E); // Constant volume ON, volume = 14
            expect(envelope.output()).to.equal(14);
            
            envelope.setRegister(0x11); // Constant volume ON, volume = 1
            expect(envelope.output()).to.equal(1);
        });
    });

    describe('envelope mode (decay)', () => {
        beforeEach(() => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
        });

        it('should output decay level in envelope mode', () => {
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            expect(envelope.output()).to.equal(15);
            
            // Clock to decay
            envelope.clock(); // Decay 15 -> 14
            expect(envelope.output()).to.equal(14);
        });

        it('should use divider period from volume value', () => {
            // Period = 2 means divider counts 2, 1, 0 before decaying
            envelope.setRegister(0x02); // Envelope mode, period = 2
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 2
            expect(envelope.output()).to.equal(15);
            
            envelope.clock(); // Divider 2 -> 1
            expect(envelope.output()).to.equal(15); // No decay yet
            
            envelope.clock(); // Divider 1 -> 0
            expect(envelope.output()).to.equal(15); // No decay yet
            
            envelope.clock(); // Divider 0 -> reload to 2, decay 15 -> 14
            expect(envelope.output()).to.equal(14);
        });

        it('should decay from 15 to 0 over time', () => {
            envelope.setRegister(0x00); // Period = 0 (fastest decay)
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay all the way to 0
            for (let i = 15; i > 0; i--) {
                expect(envelope.output()).to.equal(i);
                envelope.clock();
            }
            
            expect(envelope.output()).to.equal(0);
        });

        it('should reload divider when it reaches 0', () => {
            envelope.setRegister(0x03); // Period = 3
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 3
            
            // Clock through divider cycle
            envelope.clock(); // Divider 3 -> 2
            envelope.clock(); // Divider 2 -> 1
            envelope.clock(); // Divider 1 -> 0
            envelope.clock(); // Divider 0 -> reload to 3, decay 15 -> 14
            expect(envelope.output()).to.equal(14);
            
            // Next cycle
            envelope.clock(); // Divider 3 -> 2
            envelope.clock(); // Divider 2 -> 1
            envelope.clock(); // Divider 1 -> 0
            envelope.clock(); // Divider 0 -> reload to 3, decay 14 -> 13
            expect(envelope.output()).to.equal(13);
        });

        it('should decrement decay level when divider reaches 0', () => {
            envelope.setRegister(0x01); // Period = 1
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 1
            expect(envelope.output()).to.equal(15);
            
            envelope.clock(); // Divider 1 -> 0
            expect(envelope.output()).to.equal(15);
            
            envelope.clock(); // Divider 0 -> reload to 1, decay 15 -> 14
            expect(envelope.output()).to.equal(14);
            
            envelope.clock(); // Divider 1 -> 0
            expect(envelope.output()).to.equal(14);
            
            envelope.clock(); // Divider 0 -> reload to 1, decay 14 -> 13
            expect(envelope.output()).to.equal(13);
        });
    });

    describe('start flag', () => {
        it('should set start flag with setStartFlag()', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            envelope.setStartFlag();
            
            // Next clock should restart envelope
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });

        it('should reset decay level to 15 on start', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            expect(envelope.output()).to.equal(15);
            
            // Decay to lower level
            envelope.clock(); // Decay 15 -> 14
            envelope.clock(); // Decay 14 -> 13
            expect(envelope.output()).to.equal(13);
            
            // Restart
            envelope.setStartFlag();
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });

        it('should reset divider to period on start', () => {
            envelope.setRegister(0x03); // Envelope mode, period = 3
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 3
            
            // After start, divider should be set to period (3)
            // Next clocks count down divider
            envelope.clock(); // Divider 3 -> 2
            envelope.clock(); // Divider 2 -> 1
            envelope.clock(); // Divider 1 -> 0
            envelope.clock(); // Divider 0 -> reload, decay
            expect(envelope.output()).to.equal(14);
        });

        it('should clear start flag after first clock', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            envelope.setStartFlag();
            
            envelope.clock(); // Processes start flag, decay = 15, clears flag
            expect(envelope.output()).to.equal(15);
            
            envelope.clock(); // Normal operation, decay 15 -> 14
            expect(envelope.output()).to.equal(14);
            
            envelope.clock(); // Normal operation, decay 14 -> 13
            expect(envelope.output()).to.equal(13);
        });

        it('should restart immediately on next clock after setStartFlag', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay several steps
            envelope.clock();
            envelope.clock();
            envelope.clock();
            expect(envelope.output()).to.equal(12);
            
            // Set start flag and clock once
            envelope.setStartFlag();
            envelope.clock();
            
            // Should have restarted to 15
            expect(envelope.output()).to.equal(15);
        });

        it('should handle rapid restarts', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            
            // Restart multiple times
            envelope.setStartFlag();
            envelope.clock();
            expect(envelope.output()).to.equal(15);
            
            envelope.setStartFlag();
            envelope.clock();
            expect(envelope.output()).to.equal(15);
            
            envelope.setStartFlag();
            envelope.clock();
            expect(envelope.output()).to.equal(15);
            
            // After last restart, should decay normally
            envelope.clock();
            expect(envelope.output()).to.equal(14);
        });
    });

    describe('loop flag', () => {
        it('should wrap decay level from 0 to 15 when loop is set', () => {
            envelope.setRegister(0x20); // Loop ON, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay to 0 (15 clocks: 15->14->...->1->0)
            for (let i = 0; i < 15; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Next clock should wrap to 15
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });

        it('should stay at 0 when loop is not set', () => {
            envelope.setRegister(0x00); // Loop OFF, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay to 0 (15 clocks)
            for (let i = 0; i < 15; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Should stay at 0
            envelope.clock();
            expect(envelope.output()).to.equal(0);
            
            envelope.clock();
            expect(envelope.output()).to.equal(0);
        });

        it('should continue looping indefinitely when loop is set', () => {
            envelope.setRegister(0x20); // Loop ON, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // First cycle: 15 -> 0 (15 clocks)
            for (let i = 0; i < 15; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Second cycle: wrap to 15, then 15 -> 0
            envelope.clock();
            expect(envelope.output()).to.equal(15);
            for (let i = 0; i < 15; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Third cycle: wrap to 15 again
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });

        it('should not decrement below 0 when loop is off', () => {
            envelope.setRegister(0x00); // Loop OFF, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay to 0 and beyond
            for (let i = 0; i < 20; i++) {
                envelope.clock();
            }
            
            // Should still be at 0
            expect(envelope.output()).to.equal(0);
        });

        it('should reload divider even when at 0 without loop', () => {
            envelope.setRegister(0x02); // Loop OFF, envelope mode, period = 2
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 2
            
            // Decay to 0
            for (let i = 0; i < 50; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Divider should still be counting, just not decaying
            // We can't directly observe divider, but behavior should be stable
            expect(envelope.output()).to.equal(0);
        });
    });

    describe('edge cases', () => {
        it('should handle period = 0', () => {
            envelope.setRegister(0x00); // Period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 0
            
            // With period 0, divider is always 0, so decay happens every clock
            expect(envelope.output()).to.equal(15);
            envelope.clock();
            expect(envelope.output()).to.equal(14);
            envelope.clock();
            expect(envelope.output()).to.equal(13);
        });

        it('should handle period = 15 (maximum)', () => {
            envelope.setRegister(0x0F); // Envelope mode, period = 15
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 15
            expect(envelope.output()).to.equal(15);
            
            // Should take 16 clocks before first decay (divider 15->0)
            for (let i = 0; i < 16; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(14);
        });

        it('should handle switching from constant to envelope mode', () => {
            envelope.setRegister(0x1A); // Constant volume, volume = 10
            expect(envelope.output()).to.equal(10);
            
            // Switch to envelope mode
            envelope.setRegister(0x0A); // Envelope mode, period = 10
            envelope.setStartFlag();
            envelope.clock();
            
            // Should now use decay level
            expect(envelope.output()).to.equal(15);
        });

        it('should handle switching from envelope to constant mode', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            envelope.clock(); // Decay to 14
            envelope.clock(); // Decay to 13
            expect(envelope.output()).to.equal(13);
            
            // Switch to constant mode
            envelope.setRegister(0x17); // Constant volume, volume = 7
            expect(envelope.output()).to.equal(7);
        });

        it('should handle changing period mid-decay', () => {
            envelope.setRegister(0x01); // Period = 1
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15, divider = 1
            
            envelope.clock(); // Divider 1 -> 0
            envelope.clock(); // Divider 0 -> reload to 1, decay to 14
            expect(envelope.output()).to.equal(14);
            
            // Change period to 5
            envelope.setRegister(0x05); // Period = 5
            
            // Divider will reload to 5 next time it hits 0
            envelope.clock(); // Divider 1 -> 0
            envelope.clock(); // Divider 0 -> reload to 5, decay to 13
            expect(envelope.output()).to.equal(13);
        });

        it('should handle rapid register writes', () => {
            envelope.setRegister(0x1F); // Constant volume, volume = 15
            expect(envelope.output()).to.equal(15);
            
            envelope.setRegister(0x0A); // Envelope mode, period = 10
            envelope.setRegister(0x15); // Constant volume, volume = 5
            envelope.setRegister(0x17); // Constant volume, volume = 7
            
            expect(envelope.output()).to.equal(7);
        });

        it('should handle start flag set multiple times before clock', () => {
            envelope.setRegister(0x00); // Envelope mode, period = 0
            
            envelope.setStartFlag();
            envelope.setStartFlag();
            envelope.setStartFlag();
            
            envelope.clock(); // Should restart once
            expect(envelope.output()).to.equal(15);
            
            envelope.clock(); // Normal decay
            expect(envelope.output()).to.equal(14);
        });

        it('should reset all state with reset()', () => {
            // Set up some state
            envelope.setRegister(0x3F); // Loop, constant, volume = 15
            envelope.setStartFlag();
            envelope.clock();
            
            // Reset
            envelope.reset();
            
            // Should be back to initial state
            expect(envelope.output()).to.equal(0);
            
            // Should be in envelope mode with period 0
            envelope.setStartFlag();
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });

        it('should handle loop flag change mid-decay', () => {
            envelope.setRegister(0x00); // No loop, envelope mode, period = 0
            envelope.setStartFlag();
            envelope.clock(); // Start, decay = 15
            
            // Decay partway (10 clocks: 15->14->...->6->5)
            for (let i = 0; i < 10; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(5);
            
            // Enable loop
            envelope.setRegister(0x20); // Loop ON, period = 0
            
            // Decay to 0 (5 clocks: 5->4->3->2->1->0)
            for (let i = 0; i < 5; i++) {
                envelope.clock();
            }
            expect(envelope.output()).to.equal(0);
            
            // Should wrap since loop is now on
            envelope.clock();
            expect(envelope.output()).to.equal(15);
        });
    });
});

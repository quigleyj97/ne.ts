import chai from "chai";
import { SweepUnit } from '../../../lib/devices/apu/units/sweep.js';

const expect = chai.expect;

/**
 * SweepUnit Unit Tests
 * 
 * Comprehensive tests for the NES APU Sweep Unit.
 * The sweep unit is used by Pulse channels to automatically adjust frequency/period over time.
 * 
 * CRITICAL HARDWARE QUIRK:
 * - Pulse 1 (channel=1): Uses ones' complement for negate: period - (period >> shift)
 * - Pulse 2 (channel=2): Uses twos' complement for negate: period - (period >> shift) - 1
 * 
 * This quirk is tested extensively to ensure correct emulation of NES hardware behavior.
 */

describe('SweepUnit', () => {
    describe('Pulse 1 (channel=1) - Ones\' Complement', () => {
        /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
        let sweep;

        beforeEach(() => {
            sweep = new SweepUnit(1);
        });

        describe('initialization', () => {
            it('should construct a sweep unit for channel 1', () => {
                expect(sweep).to.be.instanceOf(SweepUnit);
            });

            it('should not mute with default state', () => {
                // Default state with a valid period should not mute
                expect(sweep.isMuting(100)).to.equal(false);
            });

            it('should mute when period < 8', () => {
                expect(sweep.isMuting(7)).to.equal(true);
                expect(sweep.isMuting(0)).to.equal(true);
            });
        });

        describe('setRegister', () => {
            it('should set enable flag from bit 7', () => {
                sweep.setRegister(0x80); // Enable ON
                // Clock should update period when enabled (if shift > 0 and not muting)
                sweep.setRegister(0x81); // Enable ON, shift = 1
                const result = sweep.clock(100);
                expect(result).to.not.equal(null);

                sweep.setRegister(0x01); // Enable OFF, shift = 1
                const result2 = sweep.clock(100);
                expect(result2).to.equal(null); // No update when disabled
            });

            it('should set period from bits 4-6', () => {
                sweep.setRegister(0x00); // Period = 0
                sweep.setRegister(0x10); // Period = 1
                sweep.setRegister(0x70); // Period = 7
                // Period affects divider reload - tested in clock tests
            });

            it('should set negate flag from bit 3', () => {
                // Negate OFF = increase period
                sweep.setRegister(0x81); // Enable, period 0, negate OFF, shift 1
                const increased = sweep.clock(100);
                expect(increased).to.equal(150); // 100 + (100 >> 1) = 100 + 50 = 150

                // Negate ON = decrease period (ones' complement for channel 1)
                sweep.setRegister(0x89); // Enable, period 0, negate ON, shift 1
                const decreased = sweep.clock(100);
                expect(decreased).to.equal(50); // 100 - (100 >> 1) = 100 - 50 = 50
            });

            it('should set shift amount from bits 0-2', () => {
                sweep.setRegister(0x80); // Shift = 0
                sweep.setRegister(0x81); // Shift = 1
                sweep.setRegister(0x87); // Shift = 7
                // Shift affects target calculation - tested in target period tests
            });

            it('should set reload flag when written', () => {
                sweep.setRegister(0x10); // Period = 1
                // Reload flag causes divider to reload on next clock
                // This is tested in divider behavior tests
            });
        });

        describe('target period calculation - addition (negate=false)', () => {
            it('should calculate target with shift=0 (no change)', () => {
                sweep.setRegister(0x80); // Enable, negate OFF, shift 0
                const result = sweep.clock(100);
                // Shift=0 means no update (shift must be > 0 for period adjustment)
                expect(result).to.equal(null);
            });

            it('should calculate target with shift=1', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                const result = sweep.clock(100);
                expect(result).to.equal(150); // 100 + (100 >> 1) = 100 + 50 = 150
            });

            it('should calculate target with shift=2', () => {
                sweep.setRegister(0x82); // Enable, negate OFF, shift 2
                const result = sweep.clock(100);
                expect(result).to.equal(125); // 100 + (100 >> 2) = 100 + 25 = 125
            });

            it('should calculate target with shift=3', () => {
                sweep.setRegister(0x83); // Enable, negate OFF, shift 3
                const result = sweep.clock(100);
                expect(result).to.equal(112); // 100 + (100 >> 3) = 100 + 12 = 112
            });

            it('should calculate target with shift=7', () => {
                sweep.setRegister(0x87); // Enable, negate OFF, shift 7
                const result = sweep.clock(256);
                expect(result).to.equal(258); // 256 + (256 >> 7) = 256 + 2 = 258
            });

            it('should handle various period values', () => {
                sweep.setRegister(0x81); // Shift 1
                expect(sweep.clock(200)).to.equal(300); // 200 + 100
                expect(sweep.clock(500)).to.equal(750); // 500 + 250
                expect(sweep.clock(1000)).to.equal(1500); // 1000 + 500
            });
        });

        describe('target period calculation - subtraction (negate=true, ones\' complement)', () => {
            it('should use ones\' complement for Pulse 1', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                const result = sweep.clock(100);
                // Ones' complement: 100 - (100 >> 1) = 100 - 50 = 50
                expect(result).to.equal(50);
            });

            it('should calculate target with shift=1', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                expect(sweep.clock(200)).to.equal(100); // 200 - 100 = 100
            });

            it('should calculate target with shift=2', () => {
                sweep.setRegister(0x8A); // Enable, negate ON, shift 2
                expect(sweep.clock(100)).to.equal(75); // 100 - 25 = 75
            });

            it('should calculate target with shift=3', () => {
                sweep.setRegister(0x8B); // Enable, negate ON, shift 3
                expect(sweep.clock(100)).to.equal(88); // 100 - 12 = 88
            });

            it('should calculate target with shift=7', () => {
                sweep.setRegister(0x8F); // Enable, negate ON, shift 7
                expect(sweep.clock(256)).to.equal(254); // 256 - 2 = 254
            });

            it('should handle edge case: period=8, shift=1', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                const result = sweep.clock(8);
                expect(result).to.equal(4); // 8 - 4 = 4 (ones' complement)
            });

            it('should handle large period values', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                expect(sweep.clock(1000)).to.equal(500); // 1000 - 500 = 500
                expect(sweep.clock(2000)).to.equal(1000); // 2000 - 1000 = 1000
            });
        });

        describe('muting detection', () => {
            it('should mute when current period < 8', () => {
                expect(sweep.isMuting(7)).to.equal(true);
                expect(sweep.isMuting(6)).to.equal(true);
                expect(sweep.isMuting(1)).to.equal(true);
                expect(sweep.isMuting(0)).to.equal(true);
            });

            it('should not mute when current period >= 8 and target valid', () => {
                sweep.setRegister(0x81); // Enable, shift 1 to set known state
                expect(sweep.isMuting(8)).to.equal(false);
                expect(sweep.isMuting(100)).to.equal(false);
                expect(sweep.isMuting(1000)).to.equal(false);
            });

            it('should mute when target period > $7FF (2047)', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                // Period 1400 + (1400 >> 1) = 1400 + 700 = 2100 > 2047
                expect(sweep.isMuting(1400)).to.equal(true);
            });

            it('should not mute when target period <= $7FF', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                // Period 1000 + (1000 >> 1) = 1000 + 500 = 1500 <= 2047
                expect(sweep.isMuting(1000)).to.equal(false);
            });

            it('should mute at exactly target=$7FF+1 (2048)', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                // Find period where target = 2048
                // period + (period >> 1) = 2048
                // period * 1.5 = 2048
                // period ≈ 1365.33
                const period = 1366;
                const target = period + (period >> 1); // 1366 + 683 = 2049
                expect(target).to.be.greaterThan(2047);
                expect(sweep.isMuting(period)).to.equal(true);
            });

            it('should be active regardless of enable flag', () => {
                // Muting is ALWAYS calculated, even when sweep is disabled
                sweep.setRegister(0x01); // Enable OFF, shift 1
                expect(sweep.isMuting(7)).to.equal(true); // Still mutes for period < 8
                
                sweep.setRegister(0x01); // Enable OFF, negate OFF, shift 1
                expect(sweep.isMuting(1400)).to.equal(true); // Still mutes for target > $7FF
            });

            it('should check target period for addition', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                // Target would be 1500, which is valid
                expect(sweep.isMuting(1000)).to.equal(false);
                // Target would be 2100, which exceeds $7FF
                expect(sweep.isMuting(1400)).to.equal(true);
            });

            it('should check target period for subtraction', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                // Subtraction won't overflow, so should not mute (unless period < 8)
                expect(sweep.isMuting(100)).to.equal(false);
                expect(sweep.isMuting(1000)).to.equal(false);
            });
        });

        describe('sweep clock and divider', () => {
            it('should return null when shift=0', () => {
                sweep.setRegister(0x80); // Enable, shift 0
                const result = sweep.clock(100);
                expect(result).to.equal(null); // No adjustment when shift=0
            });

            it('should return null when disabled', () => {
                sweep.setRegister(0x01); // Disabled, shift 1
                const result = sweep.clock(100);
                expect(result).to.equal(null);
            });

            it('should return null when muting', () => {
                sweep.setRegister(0x81); // Enable, shift 1
                const result = sweep.clock(7); // Period < 8, muting
                expect(result).to.equal(null);
            });

            it('should update period when enabled, shift>0, and not muting', () => {
                sweep.setRegister(0x81); // Enable, period 0, shift 1
                const result = sweep.clock(100);
                expect(result).to.equal(150); // 100 + 50
            });

            it('should count down divider', () => {
                sweep.setRegister(0x91); // Enable ON, period 1, shift 1
                // First clock: divider was 0, conditions met, updates AND reload sets divider=1
                const result1 = sweep.clock(100);
                expect(result1).to.equal(150);
                
                // Second clock: divider 1 -> 0
                const result2 = sweep.clock(100);
                expect(result2).to.equal(null);
                
                // Third clock: divider 0, conditions met, period updated
                const result3 = sweep.clock(100);
                expect(result3).to.equal(150);
            });

            it('should reload divider from period', () => {
                sweep.setRegister(0xB1); // Enable, period 3, shift 1
                // First clock updates immediately (divider was 0), then reload sets divider=3
                const result1 = sweep.clock(100);
                expect(result1).to.equal(150);
                
                // Count down: 3 -> 2 -> 1 -> 0
                sweep.clock(100); // 3 -> 2
                sweep.clock(100); // 2 -> 1
                sweep.clock(100); // 1 -> 0
                const result2 = sweep.clock(100); // Divider 0, update
                expect(result2).to.equal(150);
            });

            it('should reload divider when reload flag is set', () => {
                sweep.setRegister(0xB1); // Enable, period 3, shift 1
                sweep.clock(100); // Updates and sets divider=3
                sweep.clock(100); // 3 -> 2
                
                // Write register again, setting reload flag
                sweep.setRegister(0xB1);
                sweep.clock(100); // Reload sets divider=3 at end (was 1 after decrement)
                
                // Now divider is 3 again
                sweep.clock(100); // 3 -> 2
                sweep.clock(100); // 2 -> 1
                sweep.clock(100); // 1 -> 0
                const result = sweep.clock(100); // 0, update
                expect(result).to.equal(150);
            });

            it('should clear reload flag after processing', () => {
                sweep.setRegister(0x91); // Enable, period 1, shift 1
                sweep.clock(100); // Updates + reload sets divider=1, clears reload
                
                // Next clock should count down divider normally
                const result = sweep.clock(100); // Divider 1 -> 0
                expect(result).to.equal(null);
                
                const result2 = sweep.clock(100); // Divider 0, update
                expect(result2).to.equal(150);
            });

            it('should handle period=0 (fastest sweep)', () => {
                sweep.setRegister(0x81); // Enable, period 0, shift 1
                // First clock: updates immediately, reload sets divider=0
                const result1 = sweep.clock(100);
                expect(result1).to.equal(150);
                
                // With period 0, divider always 0, so update every clock
                const result2 = sweep.clock(150);
                expect(result2).to.equal(225);
                
                const result3 = sweep.clock(225);
                expect(result3).to.equal(337); // 225 + 112
            });

            it('should handle period=7 (slowest sweep)', () => {
                sweep.setRegister(0xF1); // Enable, period 7, shift 1
                // First clock: updates + reload sets divider=7
                const result1 = sweep.clock(100);
                expect(result1).to.equal(150);
                
                // Count down 8 times (7->6->5->4->3->2->1->0) before next update
                for (let i = 0; i < 7; i++) {
                    const result = sweep.clock(100);
                    expect(result).to.equal(null);
                }
                
                const result2 = sweep.clock(100);
                expect(result2).to.equal(150);
            });
        });

        describe('reset', () => {
            it('should reset all state to defaults', () => {
                sweep.setRegister(0xFF); // Set everything
                sweep.clock(100); // Activate divider
                
                sweep.reset();
                
                // After reset, should not update period (disabled)
                const result = sweep.clock(100);
                expect(result).to.equal(null);
            });

            it('should not mute with default state after reset', () => {
                sweep.setRegister(0xFF);
                sweep.reset();
                expect(sweep.isMuting(100)).to.equal(false);
            });
        });
    });

    describe('Pulse 2 (channel=2) - Twos\' Complement', () => {
        /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
        let sweep;

        beforeEach(() => {
            sweep = new SweepUnit(2);
        });

        describe('initialization', () => {
            it('should construct a sweep unit for channel 2', () => {
                expect(sweep).to.be.instanceOf(SweepUnit);
            });

            it('should not mute with default state', () => {
                expect(sweep.isMuting(100)).to.equal(false);
            });

            it('should mute when period < 8', () => {
                expect(sweep.isMuting(7)).to.equal(true);
            });
        });

        describe('target period calculation - subtraction (negate=true, twos\' complement)', () => {
            it('should use twos\' complement for Pulse 2', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                const result = sweep.clock(100);
                // Twos' complement: 100 - (100 >> 1) - 1 = 100 - 50 - 1 = 49
                expect(result).to.equal(49);
            });

            it('should calculate target with shift=1', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                expect(sweep.clock(200)).to.equal(99); // 200 - 100 - 1 = 99
            });

            it('should calculate target with shift=2', () => {
                sweep.setRegister(0x8A); // Enable, negate ON, shift 2
                expect(sweep.clock(100)).to.equal(74); // 100 - 25 - 1 = 74
            });

            it('should calculate target with shift=3', () => {
                sweep.setRegister(0x8B); // Enable, negate ON, shift 3
                expect(sweep.clock(100)).to.equal(87); // 100 - 12 - 1 = 87
            });

            it('should calculate target with shift=7', () => {
                sweep.setRegister(0x8F); // Enable, negate ON, shift 7
                expect(sweep.clock(256)).to.equal(253); // 256 - 2 - 1 = 253
            });

            it('should handle edge case: period=8, shift=1', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                const result = sweep.clock(8);
                expect(result).to.equal(3); // 8 - 4 - 1 = 3 (twos' complement)
            });

            it('should handle large period values', () => {
                sweep.setRegister(0x89); // Enable, negate ON, shift 1
                expect(sweep.clock(1000)).to.equal(499); // 1000 - 500 - 1 = 499
                expect(sweep.clock(2000)).to.equal(999); // 2000 - 1000 - 1 = 999
            });
        });

        describe('addition (same as Pulse 1)', () => {
            it('should calculate target with shift=1', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                const result = sweep.clock(100);
                expect(result).to.equal(150); // 100 + 50 (same as Pulse 1)
            });

            it('should handle various period values', () => {
                sweep.setRegister(0x81); // Shift 1
                expect(sweep.clock(200)).to.equal(300);
                expect(sweep.clock(500)).to.equal(750);
            });
        });

        describe('muting (same behavior as Pulse 1)', () => {
            it('should mute when current period < 8', () => {
                expect(sweep.isMuting(7)).to.equal(true);
                expect(sweep.isMuting(0)).to.equal(true);
            });

            it('should not mute when current period >= 8', () => {
                expect(sweep.isMuting(8)).to.equal(false);
                expect(sweep.isMuting(100)).to.equal(false);
            });

            it('should mute when target period > $7FF', () => {
                sweep.setRegister(0x81); // Enable, negate OFF, shift 1
                expect(sweep.isMuting(1400)).to.equal(true);
            });

            it('should be active regardless of enable flag', () => {
                sweep.setRegister(0x01); // Disabled
                expect(sweep.isMuting(7)).to.equal(true);
            });
        });

        describe('divider behavior (same as Pulse 1)', () => {
            it('should count down divider with period=1', () => {
                sweep.setRegister(0x91); // Enable, period 1, shift 1, negate OFF
                const result1 = sweep.clock(100); // Updates immediately
                expect(result1).to.equal(150); // 100 + 50 = 150
                
                const result2 = sweep.clock(100); // Divider 1 -> 0
                expect(result2).to.equal(null);
                
                const result3 = sweep.clock(100); // Divider 0, update
                expect(result3).to.equal(150);
            });

            it('should reload divider when reload flag set', () => {
                sweep.setRegister(0xB1); // Enable, period 3, shift 1
                sweep.clock(100); // Updates + reload
                sweep.clock(100); // 3 -> 2
                sweep.setRegister(0xB1); // Set reload flag again
                sweep.clock(100); // 2->1 then reload sets to 3
                sweep.clock(100); // 3 -> 2
                sweep.clock(100); // 2 -> 1
                sweep.clock(100); // 1 -> 0
                const result = sweep.clock(100); // Update
                expect(result).to.equal(150);
            });
        });
    });

    describe('Channel Comparison - Critical Hardware Quirk', () => {
        /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
        let pulse1;
        /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
        let pulse2;

        beforeEach(() => {
            pulse1 = new SweepUnit(1);
            pulse2 = new SweepUnit(2);
        });

        it('should produce DIFFERENT results for negate with same inputs', () => {
            // Configure both with same settings: enable, negate ON, shift 1
            pulse1.setRegister(0x89);
            pulse2.setRegister(0x89);

            const result1 = pulse1.clock(100);
            const result2 = pulse2.clock(100);

            // Pulse 1 (ones' complement): 100 - 50 = 50
            expect(result1).to.equal(50);
            // Pulse 2 (twos' complement): 100 - 50 - 1 = 49
            expect(result2).to.equal(49);
            
            // They must be different!
            expect(result1).to.not.equal(result2);
        });

        it('should differ by exactly 1 for negate operation', () => {
            pulse1.setRegister(0x89); // Negate ON, shift 1
            pulse2.setRegister(0x89);

            const result1 = pulse1.clock(200);
            const result2 = pulse2.clock(200);

            // Difference should be exactly 1
            expect(result1 - result2).to.equal(1);
        });

        it('should produce IDENTICAL results for addition (negate OFF)', () => {
            pulse1.setRegister(0x81); // Negate OFF, shift 1
            pulse2.setRegister(0x81);

            const result1 = pulse1.clock(100);
            const result2 = pulse2.clock(100);

            // Both should add: 100 + 50 = 150
            expect(result1).to.equal(150);
            expect(result2).to.equal(150);
            expect(result1).to.equal(result2);
        });

        it('should differ across various shift values', () => {
            for (let shift = 1; shift <= 7; shift++) {
                const registerValue = 0x88 | shift; // Enable, negate ON, varying shift
                pulse1.setRegister(registerValue);
                pulse2.setRegister(registerValue);

                const result1 = pulse1.clock(256);
                const result2 = pulse2.clock(256);

                // Pulse 2 should always be 1 less than Pulse 1 for negate
                expect(result1 - result2).to.equal(1, `shift=${shift}`);
            }
        });

        it('should differ with large period values', () => {
            pulse1.setRegister(0x89); // Negate ON, shift 1
            pulse2.setRegister(0x89);

            const testPeriods = [100, 500, 1000, 1500, 2000];
            for (const period of testPeriods) {
                const result1 = pulse1.clock(period);
                const result2 = pulse2.clock(period);
                
                expect(result1 - result2).to.equal(1, `period=${period}`);
            }
        });

        it('should both handle muting identically', () => {
            pulse1.setRegister(0x81);
            pulse2.setRegister(0x81);

            // Both should mute for same reasons
            expect(pulse1.isMuting(7)).to.equal(pulse2.isMuting(7));
            expect(pulse1.isMuting(100)).to.equal(pulse2.isMuting(100));
            expect(pulse1.isMuting(1400)).to.equal(pulse2.isMuting(1400));
        });

        it('should demonstrate the actual hardware quirk with specific known values', () => {
            // This test uses a well-documented case from NES dev community
            pulse1.setRegister(0x8B); // Enable, negate ON, shift 3
            pulse2.setRegister(0x8B);

            const period = 95;
            const result1 = pulse1.clock(period);
            const result2 = pulse2.clock(period);

            // Pulse 1 (ones'): 95 - (95 >> 3) = 95 - 11 = 84
            expect(result1).to.equal(84);
            // Pulse 2 (twos'): 95 - (95 >> 3) - 1 = 95 - 11 - 1 = 83
            expect(result2).to.equal(83);
        });
    });

    describe('Edge Cases and Special Scenarios', () => {
        /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
        let sweep;

        beforeEach(() => {
            sweep = new SweepUnit(1);
        });

        it('should handle period=0', () => {
            sweep.setRegister(0x81); // Shift 1
            const result = sweep.clock(0);
            // 0 + (0 >> 1) = 0, but period < 8 so muting
            expect(result).to.equal(null); // Muting prevents update
        });

        it('should handle very large periods near max', () => {
            sweep.setRegister(0x81); // Shift 1
            const period = 2047; // Max valid (0x7FF)
            const target = period + (period >> 1); // 2047 + 1023 = 3070
            expect(target).to.be.greaterThan(2047);
            expect(sweep.isMuting(period)).to.equal(true);
        });

        it('should handle shift=0 (no change in target)', () => {
            sweep.setRegister(0x80); // Enable, shift 0
            const result = sweep.clock(100);
            // Shift 0 means no update (shift must be > 0)
            expect(result).to.equal(null);
        });

        it('should handle all shift values (0-7)', () => {
            const period = 128;
            for (let shift = 0; shift <= 7; shift++) {
                sweep.setRegister(0x80 | shift); // Enable, shift varies
                const result = sweep.clock(period);
                
                if (shift === 0) {
                    expect(result).to.equal(null);
                } else {
                    const expected = period + (period >> shift);
                    expect(result).to.equal(expected);
                }
            }
        });

        it('should handle enabling mid-operation', () => {
            sweep.setRegister(0x01); // Disabled, shift 1
            expect(sweep.clock(100)).to.equal(null);
            
            sweep.setRegister(0x81); // Enable
            sweep.clock(100); // Reload flag processed
            const result = sweep.clock(100); // Should update
            expect(result).to.equal(150);
        });

        it('should handle disabling mid-operation', () => {
            sweep.setRegister(0x81); // Enabled
            sweep.clock(100); // Reload
            
            sweep.setRegister(0x01); // Disable
            const result = sweep.clock(100);
            expect(result).to.equal(null);
        });

        it('should handle rapid register changes', () => {
            sweep.setRegister(0x81);
            sweep.setRegister(0x82);
            sweep.setRegister(0x83);
            
            // Last write wins, updates immediately on first clock
            const result = sweep.clock(100);
            expect(result).to.equal(112); // 100 + (100 >> 3) = 112
        });

        it('should handle changing shift mid-sweep', () => {
            sweep.setRegister(0x81); // Shift 1
            sweep.clock(100); // Updates immediately
            
            sweep.setRegister(0x82); // Shift 2
            const result = sweep.clock(100); // Updates with new shift
            expect(result).to.equal(125); // Uses new shift: 100 + 25
        });

        it('should handle period at exactly 8 (boundary)', () => {
            sweep.setRegister(0x81);
            expect(sweep.isMuting(8)).to.equal(false);
            const result = sweep.clock(8);
            expect(result).to.equal(12); // 8 + 4 = 12 (updates immediately)
        });

        it('should handle target at exactly $7FF (boundary)', () => {
            sweep.setRegister(0x81); // Shift 1
            // Find period where target = 2047
            // period + (period >> 1) = 2047
            // period * 1.5 = 2047
            // period = 1364.666...
            const period = 1364;
            const target = period + (period >> 1); // 1364 + 682 = 2046
            expect(target).to.equal(2046);
            expect(sweep.isMuting(period)).to.equal(false); // Not muting at 2046
            
            const period2 = 1365;
            const target2 = period2 + (period2 >> 1); // 1365 + 682 = 2047
            expect(target2).to.equal(2047);
            expect(sweep.isMuting(period2)).to.equal(false); // Not muting at exactly 2047
            
            const period3 = 1366;
            const target3 = period3 + (period3 >> 1); // 1366 + 683 = 2049
            expect(target3).to.be.greaterThan(2047);
            expect(sweep.isMuting(period3)).to.equal(true); // Muting at 2049
        });

        it('should mute taking precedence over sweep updates', () => {
            sweep.setRegister(0x81); // Enable, shift 1
            sweep.clock(1400); // Period would sweep but is muting
            const result = sweep.clock(1400);
            expect(result).to.equal(null); // Muting prevents update
        });

        it('should handle subtraction that could underflow', () => {
            sweep.setRegister(0x89); // Negate ON, shift 1
            const result = sweep.clock(10);
            // 10 - 5 = 5 (ones' complement for Pulse 1)
            // But 10 is > 8, so not muting for that reason
            // Result of 5 is < 8, but that's the target, not current
            // Muting checks current period (10) and target period (5)
            // Current 10 >= 8: OK
            // Target 5 <= $7FF: OK
            // So it should update
            expect(result).to.not.equal(null);
            expect(result).to.equal(5);
        });
    });

    describe('Hardware Quirks - Section 17 Verification', () => {
        describe('17.1 - Pulse 1 uses ones\' complement negation', () => {
            /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
            let pulse1;

            beforeEach(() => {
                pulse1 = new SweepUnit(1);
            });

            it('should use ones\' complement: target = period - change', () => {
                pulse1.setRegister(0x89); // Enable, negate ON, shift 1
                const result = pulse1.clock(100);
                
                // Ones' complement: 100 - (100 >> 1) = 100 - 50 = 50
                expect(result).to.equal(50);
            });

            it('should verify with multiple period values', () => {
                pulse1.setRegister(0x89); // Enable, negate ON, shift 1
                
                expect(pulse1.clock(200)).to.equal(100); // 200 - 100 = 100
                expect(pulse1.clock(1000)).to.equal(500); // 1000 - 500 = 500
                expect(pulse1.clock(256)).to.equal(128); // 256 - 128 = 128
            });

            it('should verify with different shift values', () => {
                // Shift 2: change = period >> 2
                pulse1.setRegister(0x8A); // Enable, negate ON, shift 2
                expect(pulse1.clock(100)).to.equal(75); // 100 - 25 = 75

                // Shift 3: change = period >> 3
                pulse1.setRegister(0x8B); // Enable, negate ON, shift 3
                expect(pulse1.clock(100)).to.equal(88); // 100 - 12 = 88
            });
        });

        describe('17.2 - Pulse 2 uses twos\' complement negation', () => {
            /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
            let pulse2;

            beforeEach(() => {
                pulse2 = new SweepUnit(2);
            });

            it('should use twos\' complement: target = period - change - 1', () => {
                pulse2.setRegister(0x89); // Enable, negate ON, shift 1
                const result = pulse2.clock(100);
                
                // Twos' complement: 100 - (100 >> 1) - 1 = 100 - 50 - 1 = 49
                expect(result).to.equal(49);
            });

            it('should verify with multiple period values', () => {
                pulse2.setRegister(0x89); // Enable, negate ON, shift 1
                
                expect(pulse2.clock(200)).to.equal(99); // 200 - 100 - 1 = 99
                expect(pulse2.clock(1000)).to.equal(499); // 1000 - 500 - 1 = 499
                expect(pulse2.clock(256)).to.equal(127); // 256 - 128 - 1 = 127
            });

            it('should verify with different shift values', () => {
                // Shift 2: change = period >> 2
                pulse2.setRegister(0x8A); // Enable, negate ON, shift 2
                expect(pulse2.clock(100)).to.equal(74); // 100 - 25 - 1 = 74

                // Shift 3: change = period >> 3
                pulse2.setRegister(0x8B); // Enable, negate ON, shift 3
                expect(pulse2.clock(100)).to.equal(87); // 100 - 12 - 1 = 87
            });
        });

        describe('Comparison - Pulse 1 vs Pulse 2 negation difference', () => {
            /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
            let pulse1;
            /** @type {import('../../../src/devices/apu/units/sweep').SweepUnit} */
            let pulse2;

            beforeEach(() => {
                pulse1 = new SweepUnit(1);
                pulse2 = new SweepUnit(2);
            });

            it('should produce different results with same configuration', () => {
                pulse1.setRegister(0x89); // Enable, negate ON, shift 1
                pulse2.setRegister(0x89);

                const result1 = pulse1.clock(100);
                const result2 = pulse2.clock(100);

                // Pulse 1: 100 - 50 = 50
                // Pulse 2: 100 - 50 - 1 = 49
                expect(result1).to.equal(50);
                expect(result2).to.equal(49);
                expect(result1).to.not.equal(result2);
            });

            it('should differ by exactly 1 when negating', () => {
                pulse1.setRegister(0x89);
                pulse2.setRegister(0x89);

                const testCases = [100, 200, 500, 1000, 1500];
                for (const period of testCases) {
                    const result1 = pulse1.clock(period);
                    const result2 = pulse2.clock(period);
                    
                    expect(result1 - result2).to.equal(1, `Period ${period}: Pulse 1 should be 1 higher than Pulse 2`);
                }
            });

            it('should produce identical results when NOT negating', () => {
                pulse1.setRegister(0x81); // Enable, negate OFF, shift 1
                pulse2.setRegister(0x81);

                const result1 = pulse1.clock(100);
                const result2 = pulse2.clock(100);

                // Both: 100 + 50 = 150
                expect(result1).to.equal(150);
                expect(result2).to.equal(150);
                expect(result1).to.equal(result2);
            });
        });
    });
});

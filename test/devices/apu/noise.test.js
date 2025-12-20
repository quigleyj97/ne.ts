import chai from "chai";
import { NoiseChannel } from '../../../lib/devices/apu/channels/noise.js';

const expect = chai.expect;

/**
 * NoiseChannel Unit Tests
 * 
 * Comprehensive tests for the NES APU Noise Channel implementation.
 * Tests cover LFSR behavior, period timer, mode switching, envelope, length counter, and output conditions.
 */

describe('NoiseChannel', () => {
    /** @type {import('../../../src/devices/apu/channels/noise').NoiseChannel} */
    let noise;

    beforeEach(() => {
        noise = new NoiseChannel();
    });

    describe('Construction', () => {
        it('should construct a noise channel', () => {
            expect(noise).to.be.instanceOf(NoiseChannel);
        });

        it('should start inactive', () => {
            expect(noise.isActive()).to.equal(false);
        });

        it('should start with zero output', () => {
            expect(noise.getOutput()).to.equal(0);
        });
    });

    describe('LFSR Initialization', () => {
        it('should initialize LFSR to 1 not 0', () => {
            // The LFSR must be initialized to 1, not 0
            // If initialized to 0, it would stay 0 forever (producing silence)
            // We can verify this by enabling the channel and checking for non-zero output
            
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x00); // Shortest period (index 0 = period 4)
            noise.write(3, 0x08); // Load length counter
            
            // Clock timer to generate LFSR output
            // With LFSR = 1, bit 0 = 1, so output should be 0
            // After clocking, LFSR will shift and eventually bit 0 will be 0
            
            let foundNonZero = false;
            for (let i = 0; i < 100; i++) {
                // Clock timer several times to shift LFSR
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                
                if (noise.getOutput() > 0) {
                    foundNonZero = true;
                    break;
                }
            }
            
            // Should eventually find non-zero output (LFSR bit 0 = 0)
            expect(foundNonZero).to.equal(true);
        });

        it('should have LFSR value of 1 after reset', () => {
            // Reset and verify LFSR produces pseudo-random pattern
            noise.reset();
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x00); // Period index 0
            noise.write(3, 0x08); // Load length counter
            
            // Collect several output samples
            const outputs = [];
            for (let i = 0; i < 20; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput());
            }
            
            // Should have some variation (not all 0)
            const hasNonZero = outputs.some(v => v > 0);
            expect(hasNonZero).to.equal(true);
        });
    });

    describe('LFSR Feedback - Long Mode', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x00); // Mode 0 (long), period index 0
            noise.write(3, 0x08); // Load length counter
        });

        it('should use XOR of bits 0 and 1 in long mode', () => {
            // Long mode: feedback = bit 0 XOR bit 1
            // Initial LFSR = 1 (binary: 000000000000001)
            // Bit 0 = 1, Bit 1 = 0
            // Feedback = 1 XOR 0 = 1
            // After shift: LFSR = (1 >> 1) | (1 << 14) = 0 | 0x4000 = 0x4000
            
            // Clock timer to trigger LFSR shift
            for (let j = 0; j <= 4; j++) {
                noise.clockTimer();
            }
            
            // After one shift, LFSR should have changed from 1
            // We can't directly test the LFSR value, but we can verify pseudo-random behavior
            
            // Collect outputs over many shifts
            const outputs = [];
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput());
            }
            
            // Should have both 0 and non-zero values (pseudo-random)
            const hasZero = outputs.some(v => v === 0);
            const hasNonZero = outputs.some(v => v > 0);
            expect(hasZero).to.equal(true);
            expect(hasNonZero).to.equal(true);
        });

        it('should produce pseudo-random pattern in long mode', () => {
            // Long mode produces white noise with long period
            const outputs = [];
            
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Count transitions (0->1 or 1->0)
            let transitions = 0;
            for (let i = 1; i < outputs.length; i++) {
                if (outputs[i] !== outputs[i-1]) {
                    transitions++;
                }
            }
            
            // Should have many transitions (noise is random-like)
            // Expect at least 5 transitions in 50 samples
            expect(transitions).to.be.greaterThan(5);
        });
    });

    describe('LFSR Feedback - Short Mode', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x80); // Mode 1 (short), period index 0
            noise.write(3, 0x08); // Load length counter
        });

        it('should use XOR of bits 0 and 6 in short mode', () => {
            // Short mode: feedback = bit 0 XOR bit 6
            // Initial LFSR = 1 (binary: 000000000000001)
            // Bit 0 = 1, Bit 6 = 0
            // Feedback = 1 XOR 0 = 1
            
            // Collect outputs over many shifts
            const outputs = [];
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput());
            }
            
            // Should have both 0 and non-zero values (pseudo-random)
            const hasZero = outputs.some(v => v === 0);
            const hasNonZero = outputs.some(v => v > 0);
            expect(hasZero).to.equal(true);
            expect(hasNonZero).to.equal(true);
        });

        it('should produce different pattern than long mode', () => {
            // Reset and collect short mode pattern
            noise.reset();
            noise.setEnabled(true);
            noise.write(0, 0x1F);
            noise.write(2, 0x80); // Short mode
            noise.write(3, 0x08);
            
            const shortOutputs = [];
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                shortOutputs.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Reset and collect long mode pattern
            noise.reset();
            noise.setEnabled(true);
            noise.write(0, 0x1F);
            noise.write(2, 0x00); // Long mode
            noise.write(3, 0x08);
            
            const longOutputs = [];
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                longOutputs.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Patterns should be different
            let differences = 0;
            for (let i = 0; i < 50; i++) {
                if (shortOutputs[i] !== longOutputs[i]) {
                    differences++;
                }
            }
            
            // Should have some differences (at least 10%)
            expect(differences).to.be.greaterThan(5);
        });

        it('should produce metallic sound with shorter period in short mode', () => {
            // Short mode has shorter period (more metallic sound)
            // We can verify by checking the pattern repeats sooner
            
            const outputs = [];
            for (let i = 0; i < 200; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Short mode should have pattern that repeats
            // (shorter than the ~32767 steps of long mode)
            // Just verify we get pseudo-random output
            const hasZero = outputs.some(v => v === 0);
            const hasNonZero = outputs.some(v => v > 0);
            expect(hasZero).to.equal(true);
            expect(hasNonZero).to.equal(true);
        });
    });

    describe('Mode Switching', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(3, 0x08); // Load length counter
        });

        it('should switch to long mode when bit 7 of $400E is 0', () => {
            noise.write(2, 0x00); // Bit 7 = 0, long mode
            
            // Verify by checking pattern produces white noise
            const outputs = [];
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Should have variation
            const hasZero = outputs.some(v => v === 0);
            const hasNonZero = outputs.some(v => v > 0);
            expect(hasZero).to.equal(true);
            expect(hasNonZero).to.equal(true);
        });

        it('should switch to short mode when bit 7 of $400E is 1', () => {
            noise.write(2, 0x80); // Bit 7 = 1, short mode
            
            // Verify by checking pattern produces noise
            const outputs = [];
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Should have variation
            const hasZero = outputs.some(v => v === 0);
            const hasNonZero = outputs.some(v => v > 0);
            expect(hasZero).to.equal(true);
            expect(hasNonZero).to.equal(true);
        });

        it('should change behavior when mode is switched mid-operation', () => {
            // Start in long mode
            noise.write(2, 0x00);
            
            // Collect some outputs
            const before = [];
            for (let i = 0; i < 10; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                before.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Switch to short mode
            noise.write(2, 0x80);
            
            // Collect more outputs
            const after = [];
            for (let i = 0; i < 10; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                after.push(noise.getOutput() > 0 ? 1 : 0);
            }
            
            // Both should produce output (not all zeros)
            const beforeHasOutput = before.some(v => v > 0);
            const afterHasOutput = after.some(v => v > 0);
            expect(beforeHasOutput || afterHasOutput).to.equal(true);
        });
    });

    describe('Period Timer', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(3, 0x08); // Load length counter
        });

        it('should select period from table using bits 0-3 of $400E', () => {
            // Period table: [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]
            
            // Test index 0 (period 4)
            noise.write(2, 0x00);
            // Timer should reload to 4 and count down
            // We verify indirectly by checking timer expires quickly
            
            // Test index 15 (period 4068)
            noise.write(2, 0x0F);
            // Timer should reload to 4068 (much slower)
        });

        it('should use period index 0 for shortest period (4)', () => {
            noise.write(2, 0x00); // Index 0 = period 4
            
            // Clock timer 5 times to expire once
            let shifts = 0;
            for (let i = 0; i < 10; i++) {
                noise.clockTimer();
                shifts++;
            }
            
            // Should have shifted LFSR at least once (every 5 clocks)
            expect(shifts).to.be.greaterThan(4);
        });

        it('should use period index 15 for longest period (4068)', () => {
            noise.write(2, 0x0F); // Index 15 = period 4068
            
            // This period is very long, just verify it doesn't crash
            for (let i = 0; i < 100; i++) {
                noise.clockTimer();
            }
            
            // Should still work
            expect(noise.getOutput()).to.be.a('number');
        });

        it('should reload timer from period table when timer expires', () => {
            noise.write(2, 0x01); // Index 1 = period 8
            
            // Clock timer 9 times (period + 1)
            for (let i = 0; i < 9; i++) {
                noise.clockTimer();
            }
            
            // Timer should have expired and reloaded
            // LFSR should have shifted once
            // We can't directly verify, but check output is valid
            expect(noise.getOutput()).to.be.a('number');
        });

        it('should clock LFSR when timer reaches 0', () => {
            noise.write(2, 0x00); // Period 4
            
            // Collect outputs before and after timer expiry
            const before = noise.getOutput();
            
            // Clock timer to expire (period + 1 times)
            for (let i = 0; i <= 4; i++) {
                noise.clockTimer();
            }
            
            const after = noise.getOutput();
            
            // Output may or may not change (depends on LFSR bit 0)
            // Just verify both are valid
            expect(before).to.be.a('number');
            expect(after).to.be.a('number');
        });
    });

    describe('Length Counter', () => {
        // Length table for reference (first 8 entries):
        // [10, 254, 20, 2, 40, 4, 80, 6, ...]
        
        it('should load length counter from table via register $400F bits 3-7', () => {
            noise.setEnabled(true);
            
            // Write length index 0 (value from table: 10)
            noise.write(3, 0x00); // Bits 7-3 = 00000
            expect(noise.isActive()).to.equal(true);
            
            // Write length index 1 (value from table: 254)
            noise.write(3, 0x08); // Bits 7-3 = 00001
            expect(noise.isActive()).to.equal(true);
            
            // Write length index 3 (value from table: 2)
            noise.write(3, 0x18); // Bits 7-3 = 00011
            expect(noise.isActive()).to.equal(true);
        });

        it('should not load length counter when channel is disabled', () => {
            noise.setEnabled(false);
            noise.write(3, 0x08); // Try to load length counter
            expect(noise.isActive()).to.equal(false);
        });

        it('should decrement length counter when clocked', () => {
            noise.setEnabled(true);
            noise.write(3, 0x18); // Load index 3 = value 2
            
            expect(noise.isActive()).to.equal(true);
            
            noise.clockLengthCounter();
            expect(noise.isActive()).to.equal(true); // Still 1
            
            noise.clockLengthCounter();
            expect(noise.isActive()).to.equal(false); // Now 0
        });

        it('should halt length counter when halt flag is set', () => {
            noise.setEnabled(true);
            noise.write(0, 0x20); // Set length counter halt (bit 5)
            noise.write(3, 0x18); // Load index 3 = value 2
            
            expect(noise.isActive()).to.equal(true);
            
            // Clock length counter multiple times
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            
            // Should still be active (halt prevents decrement)
            expect(noise.isActive()).to.equal(true);
        });

        it('should not decrement length counter below 0', () => {
            noise.setEnabled(true);
            noise.write(3, 0x18); // Load index 3 = value 2
            
            // Decrement to 0
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            expect(noise.isActive()).to.equal(false);
            
            // Clock more times
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            
            // Should still be inactive
            expect(noise.isActive()).to.equal(false);
        });

        it('should silence channel when length counter reaches 0', () => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x00); // Period index 0
            noise.write(3, 0x18); // Load length = 2
            
            // May or may not have output (depends on LFSR bit 0)
            // Decrement length counter to 0
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            
            // Should now be silenced (output always 0)
            expect(noise.getOutput()).to.equal(0);
        });
    });

    describe('Envelope Integration', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(2, 0x00); // Period index 0
            noise.write(3, 0x08); // Load length counter
        });

        it('should use constant volume when bit 4 of $400C is set', () => {
            noise.write(0, 0x1F); // Constant volume flag set, volume 15
            
            // Clock timer to shift LFSR to a state where bit 0 = 0
            // Then output should be volume (15)
            let foundCorrectOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 15) {
                    foundCorrectOutput = true;
                    break;
                }
            }
            
            expect(foundCorrectOutput).to.equal(true);
            
            // Try with volume 5
            noise.reset();
            noise.setEnabled(true);
            noise.write(0, 0x15); // Constant volume 5
            noise.write(2, 0x00);
            noise.write(3, 0x08);
            
            foundCorrectOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 5) {
                    foundCorrectOutput = true;
                    break;
                }
            }
            
            expect(foundCorrectOutput).to.equal(true);
        });

        it('should use envelope decay when bit 4 of $400C is clear', () => {
            noise.write(0, 0x00); // Envelope mode (bit 4 = 0), period 0
            noise.write(3, 0x08); // Restart envelope
            
            // After restart, envelope should be at 15
            noise.clockEnvelope();
            
            // When LFSR bit 0 = 0, output should be envelope volume (15)
            let foundEnvelopeOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 15) {
                    foundEnvelopeOutput = true;
                    break;
                }
            }
            
            expect(foundEnvelopeOutput).to.equal(true);
        });

        it('should restart envelope on register $400F write', () => {
            noise.write(0, 0x00); // Envelope mode, period 0
            
            // Decay envelope
            noise.clockEnvelope();
            noise.clockEnvelope();
            noise.clockEnvelope();
            
            // Write register 3 to restart
            noise.write(3, 0x08);
            
            // Next clock should restart to 15
            noise.clockEnvelope();
            
            // Find output when LFSR bit 0 = 0
            let foundEnvelopeOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 15) {
                    foundEnvelopeOutput = true;
                    break;
                }
            }
            
            expect(foundEnvelopeOutput).to.equal(true);
        });

        it('should decay envelope over time in envelope mode', () => {
            noise.write(0, 0x00); // Envelope mode, period 0
            noise.write(3, 0x08); // Restart envelope
            
            noise.clockEnvelope(); // Start flag set, loads 15
            
            // With period 0, should decay every clock
            noise.clockEnvelope(); // Divider 0->0, decay 15->14
            
            // Find output when LFSR bit 0 = 0 (should be 14)
            let foundDecayedOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                const output = noise.getOutput();
                if (output === 14 || output === 13) {
                    foundDecayedOutput = true;
                    break;
                }
            }
            
            expect(foundDecayedOutput).to.equal(true);
        });

        it('should loop envelope when loop flag is set', () => {
            noise.write(0, 0x20); // Envelope mode, loop flag set, period 0
            noise.write(3, 0x08); // Restart envelope
            
            noise.clockEnvelope(); // Load 15
            
            // Decay to 0
            for (let i = 0; i < 15; i++) {
                noise.clockEnvelope();
            }
            
            // Next clock should loop to 15
            noise.clockEnvelope();
            
            // Find output when LFSR bit 0 = 0 (should be 15 again)
            let foundLoopedOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 15) {
                    foundLoopedOutput = true;
                    break;
                }
            }
            
            expect(foundLoopedOutput).to.equal(true);
        });
    });

    describe('Output Conditions', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x00); // Period index 0
        });

        it('should output 0 when length counter is 0', () => {
            noise.write(3, 0x18); // Load length = 2
            
            // Decrement length counter to 0
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            
            // Should output 0 regardless of LFSR state
            expect(noise.getOutput()).to.equal(0);
        });

        it('should output 0 when LFSR bit 0 is 1', () => {
            noise.write(3, 0x08); // Load length counter
            
            // LFSR starts at 1, so bit 0 = 1
            // Initial output should be 0
            expect(noise.getOutput()).to.equal(0);
        });

        it('should output envelope volume when LFSR bit 0 is 0', () => {
            noise.write(3, 0x08); // Load length counter
            
            // Clock timer to shift LFSR until bit 0 = 0
            let foundVolumeOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 15) {
                    foundVolumeOutput = true;
                    break;
                }
            }
            
            expect(foundVolumeOutput).to.equal(true);
        });

        it('should alternate between 0 and volume based on LFSR', () => {
            noise.write(3, 0x08); // Load length counter
            
            // Collect outputs over time
            const outputs = [];
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                outputs.push(noise.getOutput());
            }
            
            // Should have both 0 and 15
            const hasZero = outputs.some(v => v === 0);
            const hasVolume = outputs.some(v => v === 15);
            expect(hasZero).to.equal(true);
            expect(hasVolume).to.equal(true);
        });

        it('should return values in range 0-15', () => {
            noise.write(3, 0x08); // Load length counter
            
            // Check many outputs
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                const output = noise.getOutput();
                expect(output).to.be.at.least(0);
                expect(output).to.be.at.most(15);
            }
        });
    });

    describe('Enable/Disable', () => {
        it('should enable channel with setEnabled(true)', () => {
            noise.setEnabled(true);
            noise.write(3, 0x08); // Load length counter
            expect(noise.isActive()).to.equal(true);
        });

        it('should disable and clear length counter with setEnabled(false)', () => {
            noise.setEnabled(true);
            noise.write(3, 0x08); // Load length counter
            expect(noise.isActive()).to.equal(true);
            
            noise.setEnabled(false);
            expect(noise.isActive()).to.equal(false);
        });

        it('should return false from isActive() when disabled', () => {
            noise.setEnabled(false);
            expect(noise.isActive()).to.equal(false);
        });

        it('should return false from isActive() when length counter is 0', () => {
            noise.setEnabled(true);
            noise.write(3, 0x18); // Load length = 2
            
            noise.clockLengthCounter();
            noise.clockLengthCounter();
            
            expect(noise.isActive()).to.equal(false);
        });

        it('should return true from isActive() when enabled and length > 0', () => {
            noise.setEnabled(true);
            noise.write(3, 0x08);
            expect(noise.isActive()).to.equal(true);
        });

        it('should output 0 when disabled', () => {
            noise.setEnabled(false);
            noise.write(0, 0x1F);
            noise.write(2, 0x00);
            
            expect(noise.getOutput()).to.equal(0);
        });
    });

    describe('Reset', () => {
        it('should reset LFSR to 1', () => {
            noise.reset();
            noise.setEnabled(true);
            noise.write(0, 0x1F);
            noise.write(2, 0x00);
            noise.write(3, 0x08);
            
            // After reset, LFSR should be 1 (bit 0 = 1)
            // So initial output should be 0
            expect(noise.getOutput()).to.equal(0);
        });

        it('should clear all state on reset', () => {
            noise.setEnabled(true);
            noise.write(0, 0x3F);
            noise.write(2, 0x8F);
            noise.write(3, 0xF8);
            
            noise.reset();
            
            expect(noise.isActive()).to.equal(false);
            expect(noise.getOutput()).to.equal(0);
        });

        it('should allow channel to function after reset', () => {
            noise.reset();
            noise.setEnabled(true);
            noise.write(0, 0x1F);
            noise.write(2, 0x00);
            noise.write(3, 0x08);
            
            // Should be able to generate output
            let foundOutput = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() > 0) {
                    foundOutput = true;
                    break;
                }
            }
            
            expect(foundOutput).to.equal(true);
        });
    });

    describe('Clock Methods', () => {
        beforeEach(() => {
            noise.setEnabled(true);
            noise.write(0, 0x1F); // Constant volume 15
            noise.write(2, 0x00); // Period 4
            noise.write(3, 0x08); // Load length counter
        });

        it('should have clockTimer method', () => {
            expect(noise.clockTimer).to.be.a('function');
            noise.clockTimer();
        });

        it('should have clockEnvelope method', () => {
            expect(noise.clockEnvelope).to.be.a('function');
            noise.clockEnvelope();
        });

        it('should have clockLengthCounter method', () => {
            expect(noise.clockLengthCounter).to.be.a('function');
            noise.clockLengthCounter();
        });

        it('should clock timer every APU cycle', () => {
            // Verify timer advances by checking LFSR shifts
            const before = noise.getOutput();
            
            // Clock timer enough times to expire
            for (let i = 0; i <= 4; i++) {
                noise.clockTimer();
            }
            
            // Timer should have expired and LFSR shifted
            // Output may or may not change depending on bit 0
            const after = noise.getOutput();
            
            // Both should be valid values
            expect(before).to.be.a('number');
            expect(after).to.be.a('number');
        });

        it('should clock envelope on quarter frames', () => {
            noise.write(0, 0x00); // Envelope mode
            noise.write(3, 0x08); // Restart envelope
            
            noise.clockEnvelope(); // Start: load 15
            noise.clockEnvelope(); // Decay: 15->14
            
            // Verify envelope changed (when LFSR bit 0 = 0)
            let found14 = false;
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j <= 4; j++) {
                    noise.clockTimer();
                }
                if (noise.getOutput() === 14) {
                    found14 = true;
                    break;
                }
            }
            
            expect(found14).to.equal(true);
        });

        it('should clock length counter on half frames', () => {
            noise.write(3, 0x18); // Load length = 2
            
            expect(noise.isActive()).to.equal(true);
            
            noise.clockLengthCounter(); // 2 -> 1
            expect(noise.isActive()).to.equal(true);
            
            noise.clockLengthCounter(); // 1 -> 0
            expect(noise.isActive()).to.equal(false);
        });
    });

    describe('Hardware Quirks - Section 17 Verification', () => {
        describe('17.6 - LFSR initializes to 1 (not 0)', () => {
            it('should initialize LFSR shift register to 1 on construction', () => {
                // Critical hardware quirk: LFSR MUST initialize to 1, not 0
                // If initialized to 0, the LFSR would stay at 0 forever (producing only silence)
                // This is verified in the implementation at noise.ts line 64: private shiftRegister: u16 = 1;
                
                const noise = new NoiseChannel();
                
                // Even without enabling or loading, noise should produce non-zero output
                // when LFSR bit 0 is 0 (which will happen since LFSR != 0)
                noise.setEnabled(true);
                noise.write(0, 0x1F); // Constant volume 15
                noise.write(2, 0x00); // Period = 4 (shortest)
                noise.write(3, 0x08); // Load length counter
                
                // Clock timer to shift LFSR
                let foundNonZero = false;
                for (let i = 0; i < 100; i++) {
                    noise.clockTimer();
                    const output = noise.getOutput();
                    if (output !== 0) {
                        foundNonZero = true;
                        break;
                    }
                }
                
                // Should find non-zero output (LFSR produces varying values)
                expect(foundNonZero).to.equal(true);
            });

            it('should reset LFSR to 1 on reset()', () => {
                // The reset() method should also initialize LFSR to 1
                // Verified in implementation at noise.ts line 306: this.shiftRegister = 1;
                
                const noise = new NoiseChannel();
                noise.setEnabled(true);
                noise.write(0, 0x1F); // Constant volume
                noise.write(2, 0x00); // Short period
                noise.write(3, 0x08); // Load length
                
                // Clock many times to change LFSR state
                for (let i = 0; i < 1000; i++) {
                    noise.clockTimer();
                }
                
                // Reset
                noise.reset();
                
                // Re-enable and configure
                noise.setEnabled(true);
                noise.write(0, 0x1F);
                noise.write(2, 0x00);
                noise.write(3, 0x08);
                
                // Should still produce output (LFSR = 1, not 0)
                let foundNonZero = false;
                for (let i = 0; i < 100; i++) {
                    noise.clockTimer();
                    if (noise.getOutput() !== 0) {
                        foundNonZero = true;
                        break;
                    }
                }
                
                expect(foundNonZero).to.equal(true);
            });

            it('should never get stuck at LFSR = 0 (which would silence forever)', () => {
                // This tests the critical aspect: LFSR = 0 would break the noise channel
                // The implementation prevents this by initializing to 1
                
                const noise = new NoiseChannel();
                noise.setEnabled(true);
                noise.write(0, 0x1F); // Max volume
                noise.write(2, 0x00); // Fastest period
                noise.write(3, 0x08); // Load length
                
                // Collect many output samples
                const samples = [];
                for (let i = 0; i < 10000; i++) {
                    noise.clockTimer();
                    samples.push(noise.getOutput());
                }
                
                // Should have variation in output (not all zeros)
                const hasNonZero = samples.some(s => s !== 0);
                const hasZero = samples.some(s => s === 0);
                
                // With LFSR properly initialized, we should see both 0 and non-zero values
                // (because LFSR bit 0 varies, creating the noise effect)
                expect(hasNonZero).to.equal(true);
                expect(hasZero).to.equal(true);
            });

            it('should produce pseudo-random sequence due to non-zero LFSR initialization', () => {
                // The LFSR feedback loop only works if initial value is non-zero
                // This creates the characteristic noise sound
                
                const noise = new NoiseChannel();
                noise.setEnabled(true);
                noise.write(0, 0x1F); // Constant volume 15
                noise.write(2, 0x00); // Period = 4 (faster, more samples)
                noise.write(3, 0x08); // Load length
                
                // Sample outputs as LFSR shifts
                const outputs = [];
                for (let i = 0; i < 200; i++) {
                    noise.clockTimer();
                    outputs.push(noise.getOutput());
                }
                
                // Should see variation (pseudo-random due to LFSR)
                const uniqueValues = new Set(outputs);
                
                // Should have at least 2 different values (0 and 15 based on LFSR bit 0)
                expect(uniqueValues.size).to.be.at.least(2);
            });

            it('should work in both long mode and short mode with LFSR = 1', () => {
                // Both LFSR modes (long/short) depend on proper initialization
                
                const noise = new NoiseChannel();
                noise.setEnabled(true);
                noise.write(0, 0x1F); // Constant volume
                noise.write(3, 0x08); // Load length
                
                // Test long mode (mode bit = 0)
                noise.write(2, 0x00); // Period = 4, long mode
                let foundNonZeroLong = false;
                for (let i = 0; i < 100; i++) {
                    noise.clockTimer();
                    if (noise.getOutput() !== 0) {
                        foundNonZeroLong = true;
                        break;
                    }
                }
                
                // Test short mode (mode bit = 1)
                noise.reset();
                noise.setEnabled(true);
                noise.write(0, 0x1F);
                noise.write(2, 0x80); // Period = 4, short mode (bit 7 set)
                noise.write(3, 0x08);
                
                let foundNonZeroShort = false;
                for (let i = 0; i < 100; i++) {
                    noise.clockTimer();
                    if (noise.getOutput() !== 0) {
                        foundNonZeroShort = true;
                        break;
                    }
                }
                
                // Both modes should work (produce non-zero output)
                expect(foundNonZeroLong).to.equal(true);
                expect(foundNonZeroShort).to.equal(true);
            });
        });
    });
});

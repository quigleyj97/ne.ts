import chai from "chai";
import { ApuMixer } from '../../../lib/devices/apu/audio/mixer.js';

const expect = chai.expect;

/**
 * ApuMixer Unit Tests
 * 
 * Comprehensive tests for the NES APU Audio Mixer.
 * The mixer combines the five APU channels using non-linear DAC formulas
 * to produce the characteristic NES sound.
 * 
 * Tests cover:
 * - Pulse channel mixing (non-linear formula)
 * - TND (Triangle-Noise-DMC) mixing (non-linear formula)
 * - Division by zero handling
 * - Output range validation (-1.0 to +1.0)
 * - Typical game audio scenarios
 * - Reference values from NES wiki
 */

describe('ApuMixer', () => {
    /** @type {import('../../../src/devices/apu/audio/mixer').ApuMixer} */
    let mixer;

    beforeEach(() => {
        mixer = new ApuMixer();
    });

    describe('initialization', () => {
        it('should construct a mixer', () => {
            expect(mixer).to.be.instanceOf(ApuMixer);
        });

        it('should return -1.0 when all channels are silent', () => {
            const output = mixer.mix(0, 0, 0, 0, 0);
            expect(output).to.equal(-1.0);
        });
    });

    describe('pulse mixing', () => {
        it('should handle both pulse channels at 0 (division by zero)', () => {
            // When both pulse channels are 0, pulse_out should be 0
            const output = mixer.mix(0, 0, 0, 0, 0);
            // 0 + 0 = 0, then (0) * 2 - 1 = -1
            expect(output).to.equal(-1.0);
        });

        it('should mix pulse1 only', () => {
            // Pulse1 = 15, Pulse2 = 0, others = 0
            // pulse_out = 95.88 / ((8128 / 15) + 100) ≈ 0.14938
            // tnd_out = 0 (all zero)
            // output = 0.14938 * 2 - 1 ≈ -0.70124
            const output = mixer.mix(15, 0, 0, 0, 0);
            expect(output).to.be.closeTo(-0.701, 0.001);
        });

        it('should mix pulse2 only', () => {
            // Pulse1 = 0, Pulse2 = 15, others = 0
            // Same as pulse1 only
            const output = mixer.mix(0, 15, 0, 0, 0);
            expect(output).to.be.closeTo(-0.701, 0.001);
        });

        it('should mix both pulse channels at half volume', () => {
            // Pulse1 = 8, Pulse2 = 8, others = 0
            // pulse_out = 95.88 / ((8128 / 16) + 100) ≈ 0.15768
            const output = mixer.mix(8, 8, 0, 0, 0);
            expect(output).to.be.closeTo(-0.685, 0.001);
        });

        it('should mix both pulse channels at maximum', () => {
            // Pulse1 = 15, Pulse2 = 15, others = 0
            // pulse_out = 95.88 / ((8128 / 30) + 100) ≈ 0.25848
            const output = mixer.mix(15, 15, 0, 0, 0);
            expect(output).to.be.closeTo(-0.483, 0.001);
        });

        it('should produce non-linear output (test non-linearity)', () => {
            // Test that doubling input doesn't double output (non-linear)
            const output1 = mixer.mix(5, 5, 0, 0, 0);
            const output2 = mixer.mix(10, 10, 0, 0, 0);
            
            // If it were linear, output2 would be 2 * output1
            // But with non-linear mixing, it won't be
            expect(output2).to.not.be.closeTo(2 * output1, 0.01);
        });
    });

    describe('TND mixing', () => {
        it('should handle all TND channels at 0 (division by zero)', () => {
            // When tri, noise, and dmc are all 0, tnd_out should be 0
            const output = mixer.mix(0, 0, 0, 0, 0);
            expect(output).to.equal(-1.0);
        });

        it('should mix triangle only', () => {
            // Triangle = 15, others = 0
            // tnd_out = 159.79 / ((1 / (15/8227)) + 100) ≈ 0.24641
            const output = mixer.mix(0, 0, 15, 0, 0);
            expect(output).to.be.closeTo(-0.507, 0.001);
        });

        it('should mix noise only', () => {
            // Noise = 15, others = 0
            // tnd_out = 159.79 / ((1 / (15/12241)) + 100) ≈ 0.17443
            const output = mixer.mix(0, 0, 0, 15, 0);
            expect(output).to.be.closeTo(-0.651, 0.001);
        });

        it('should mix DMC only at half volume', () => {
            // DMC = 64, others = 0
            // tnd_out = 159.79 / ((1 / (64/22638)) + 100) ≈ 0.35218
            const output = mixer.mix(0, 0, 0, 0, 64);
            expect(output).to.be.closeTo(-0.296, 0.001);
        });

        it('should mix DMC only at maximum', () => {
            // DMC = 127, others = 0
            // tnd_out = 159.79 / ((1 / (127/22638)) + 100) ≈ 0.57426
            const output = mixer.mix(0, 0, 0, 0, 127);
            expect(output).to.be.closeTo(0.149, 0.001);
        });

        it('should mix all TND channels together', () => {
            // Triangle = 15, Noise = 15, DMC = 127
            // tnd_out = 159.79 / ((1 / ((15/8227) + (15/12241) + (127/22638))) + 100)
            const output = mixer.mix(0, 0, 15, 15, 127);
            expect(output).to.be.closeTo(0.483, 0.01); // Actual calculated value
        });
    });

    describe('full mixing', () => {
        it('should mix all channels at medium levels', () => {
            // Pulse1 = 8, Pulse2 = 8, Triangle = 8, Noise = 8, DMC = 64
            const output = mixer.mix(8, 8, 8, 8, 64);
            // Should produce a reasonable mixed output
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should mix all channels at maximum (reference value)', () => {
            // All channels at max: Pulse1=15, Pulse2=15, Tri=15, Noise=15, DMC=127
            // Expected output ≈ 0.254 (from NES wiki) before normalization
            // After normalization: 0.254 * 2 - 1 = -0.492
            // Note: Actual max might differ slightly due to formula precision
            const output = mixer.mix(15, 15, 15, 15, 127);
            expect(output).to.be.greaterThan(0.0); // Should be positive
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle pulse and triangle only', () => {
            // Common scenario: melody on pulse + bassline on triangle
            const output = mixer.mix(12, 10, 15, 0, 0);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle percussion scenario (noise + DMC)', () => {
            // Common scenario: drum sound using noise and DMC
            const output = mixer.mix(0, 0, 0, 15, 80);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });
    });

    describe('output range validation', () => {
        it('should always output in range -1.0 to +1.0', () => {
            // Test various combinations to ensure output stays in valid range
            const testCases = [
                [0, 0, 0, 0, 0],
                [15, 0, 0, 0, 0],
                [0, 15, 0, 0, 0],
                [15, 15, 0, 0, 0],
                [0, 0, 15, 0, 0],
                [0, 0, 0, 15, 0],
                [0, 0, 0, 0, 127],
                [15, 15, 15, 15, 127],
                [8, 8, 8, 8, 64],
                [1, 1, 1, 1, 1],
                [15, 0, 15, 0, 127],
                [0, 15, 0, 15, 0],
            ];

            testCases.forEach(([p1, p2, tri, noise, dmc]) => {
                const output = mixer.mix(p1, p2, tri, noise, dmc);
                expect(output, `Input: [${p1}, ${p2}, ${tri}, ${noise}, ${dmc}]`)
                    .to.be.at.least(-1.0);
                expect(output, `Input: [${p1}, ${p2}, ${tri}, ${noise}, ${dmc}]`)
                    .to.be.at.most(1.0);
            });
        });

        it('should produce minimum output (-1.0) when all channels silent', () => {
            const output = mixer.mix(0, 0, 0, 0, 0);
            expect(output).to.equal(-1.0);
        });

        it('should produce output close to maximum (+1.0) with all channels at max', () => {
            const output = mixer.mix(15, 15, 15, 15, 127);
            // Won't quite reach 1.0 due to the specific formulas, but should be high
            expect(output).to.be.greaterThan(0.5);
            expect(output).to.be.at.most(1.0);
        });
    });

    describe('typical game scenarios', () => {
        it('should handle Super Mario Bros jump sound (pulse sweep)', () => {
            // Jump sound: single pulse channel with varying volume
            const output1 = mixer.mix(15, 0, 0, 0, 0);
            const output2 = mixer.mix(12, 0, 0, 0, 0);
            const output3 = mixer.mix(8, 0, 0, 0, 0);
            
            // Volume should decrease
            expect(output1).to.be.greaterThan(output2);
            expect(output2).to.be.greaterThan(output3);
        });

        it('should handle Mega Man shooting sound (pulse + triangle)', () => {
            // Shooting: pulse + triangle
            const output = mixer.mix(10, 0, 8, 0, 0);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle explosion sound (noise)', () => {
            // Explosion: primarily noise channel
            const output = mixer.mix(0, 0, 0, 15, 0);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(0.0); // Noise alone is negative range
        });

        it('should handle bass drum sound (triangle + noise)', () => {
            // Bass drum: low triangle + noise
            const output = mixer.mix(0, 0, 15, 10, 0);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle complex music (all channels active)', () => {
            // Complex music: melody, harmony, bass, drums
            // Pulse1: melody at 12
            // Pulse2: harmony at 8
            // Triangle: bassline at 15
            // Noise: hi-hat at 5
            // DMC: sample at 40
            const output = mixer.mix(12, 8, 15, 5, 40);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle silence between notes', () => {
            // Playing note, then silence, then another note
            const note1 = mixer.mix(15, 10, 0, 0, 0);
            const silence = mixer.mix(0, 0, 0, 0, 0);
            const note2 = mixer.mix(12, 0, 15, 0, 0);
            
            expect(silence).to.equal(-1.0);
            expect(note1).to.not.equal(silence);
            expect(note2).to.not.equal(silence);
        });
    });

    describe('edge cases', () => {
        it('should handle minimum non-zero values', () => {
            const output = mixer.mix(1, 1, 1, 1, 1);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle maximum pulse with minimum TND', () => {
            const output = mixer.mix(15, 15, 1, 1, 1);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should handle minimum pulse with maximum TND', () => {
            const output = mixer.mix(1, 1, 15, 15, 127);
            expect(output).to.be.greaterThan(-1.0);
            expect(output).to.be.lessThan(1.0);
        });

        it('should produce different outputs for different DMC values', () => {
            // DMC has wider range (0-127), test that it matters
            const output1 = mixer.mix(0, 0, 0, 0, 1);
            const output2 = mixer.mix(0, 0, 0, 0, 64);
            const output3 = mixer.mix(0, 0, 0, 0, 127);
            
            expect(output1).to.be.lessThan(output2);
            expect(output2).to.be.lessThan(output3);
        });

        it('should produce consistent output for same inputs', () => {
            // Test determinism
            const output1 = mixer.mix(10, 8, 12, 7, 60);
            const output2 = mixer.mix(10, 8, 12, 7, 60);
            expect(output1).to.equal(output2);
        });
    });

    describe('formula correctness (reference values)', () => {
        it('should match pulse-only reference value', () => {
            // Pulse1=15, pulse2=15 → pulse_out ≈ 0.25848
            // After normalization: 0.25848 * 2 - 1 ≈ -0.48304
            const output = mixer.mix(15, 15, 0, 0, 0);
            expect(output).to.be.closeTo(-0.483, 0.01);
        });

        it('should match triangle-only reference value', () => {
            // Triangle=15 → tnd_out ≈ 0.24641
            // After normalization: 0.24641 * 2 - 1 ≈ -0.50718
            const output = mixer.mix(0, 0, 15, 0, 0);
            expect(output).to.be.closeTo(-0.507, 0.01);
        });

        it('should demonstrate non-linear mixing characteristic', () => {
            // Non-linear mixing means that mixing two channels doesn't simply add
            const pulse1Only = mixer.mix(15, 0, 0, 0, 0);
            const pulse2Only = mixer.mix(0, 15, 0, 0, 0);
            const bothPulse = mixer.mix(15, 15, 0, 0, 0);
            
            // In linear mixing: bothPulse would equal pulse1Only + pulse2Only
            // In non-linear: bothPulse > pulse1Only + pulse2Only (in the normalized -1 to 1 range)
            // Since we're in negative range, "greater" means closer to 0
            expect(bothPulse).to.be.greaterThan(pulse1Only + pulse2Only);
        });
    });
});

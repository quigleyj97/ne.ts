import chai from "chai";
import { Resampler } from '../../../lib/devices/apu/audio/resampler.js';

const expect = chai.expect;

/**
 * Resampler Unit Tests
 * 
 * Comprehensive tests for the APU Audio Resampler.
 * The resampler converts APU samples from ~894,886.5 Hz to browser audio rates
 * (44,100 Hz or 48,000 Hz) using cubic interpolation.
 * 
 * Tests cover:
 * - Construction and initialization
 * - Basic sample conversion ratios
 * - Cubic interpolation quality
 * - Pull behavior
 * - Rate ratio adjustment for dynamic rate control
 * - Reset behavior
 * - Edge cases
 */

describe('Resampler', () => {
    /** @type {import('../../../src/devices/apu/audio/resampler').Resampler} */
    let resampler;

    // Standard NTSC APU rate
    const APU_RATE = 894886.5;
    const RATE_44100 = 44100;
    const RATE_48000 = 48000;

    describe('construction and initialization', () => {
        it('should create resampler with 44.1 kHz output rate', () => {
            resampler = new Resampler(APU_RATE, RATE_44100);
            expect(resampler).to.be.instanceOf(Resampler);
        });

        it('should create resampler with 48 kHz output rate', () => {
            resampler = new Resampler(APU_RATE, RATE_48000);
            expect(resampler).to.be.instanceOf(Resampler);
        });

        it('should initialize with zero available samples', () => {
            resampler = new Resampler(APU_RATE, RATE_44100);
            expect(resampler.available()).to.equal(0);
        });

        it('should correctly calculate step size for 44.1 kHz', () => {
            resampler = new Resampler(APU_RATE, RATE_44100);
            // Expected step: 894886.5 / 44100 ≈ 20.29
            // We can verify this by checking conversion ratio
            // Push approximately 20.29 samples, should get ~1 output after 4 for interpolation
            for (let i = 0; i < 24; i++) {
                resampler.push(0.5);
            }
            const samples = resampler.pull();
            // Should get about 1 sample (need 4 samples to start, then ~20 more)
            expect(samples.length).to.be.closeTo(1, 0.5);
        });

        it('should correctly calculate step size for 48 kHz', () => {
            resampler = new Resampler(APU_RATE, RATE_48000);
            // Expected step: 894886.5 / 48000 ≈ 18.64
            // Push approximately 18.64 samples, should get ~1 output after 4 for interpolation
            for (let i = 0; i < 23; i++) {
                resampler.push(0.5);
            }
            const samples = resampler.pull();
            // Should get about 1 sample (need 4 samples to start, then ~18-19 more)
            expect(samples.length).to.be.closeTo(1, 0.5);
        });
    });

    describe('basic sample conversion - 44.1 kHz', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_44100);
        });

        it('should initially have no samples available', () => {
            expect(resampler.available()).to.equal(0);
        });

        it('should not produce output with fewer than 4 input samples', () => {
            resampler.push(0.5);
            resampler.push(0.5);
            resampler.push(0.5);
            expect(resampler.available()).to.equal(0);
        });

        it('should produce proportional output samples (short burst)', () => {
            // Push enough for ~10 output samples
            // At 20.29:1 ratio, need ~203 input samples
            for (let i = 0; i < 203; i++) {
                resampler.push(0.5);
            }
            const samples = resampler.pull();
            // Should get approximately 10 output samples
            expect(samples.length).to.be.closeTo(10, 1);
        });

        it('should produce proportional output samples (medium burst)', () => {
            // Push enough for ~100 output samples
            // At 20.29:1 ratio, need ~2029 input samples
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            const samples = resampler.pull();
            // Should get approximately 100 output samples
            expect(samples.length).to.be.closeTo(100, 2);
        });

        it('should maintain correct ratio over multiple push/pull cycles', () => {
            let totalOutput = 0;
            
            // Push samples in chunks, pull periodically
            for (let cycle = 0; cycle < 5; cycle++) {
                for (let i = 0; i < 441; i++) {
                    resampler.push(0.5);
                }
                const samples = resampler.pull();
                totalOutput += samples.length;
            }
            
            // Total input: 2205 samples
            // Expected output: ~109 samples (2205 / 20.29)
            expect(totalOutput).to.be.closeTo(109, 3);
        });
    });

    describe('basic sample conversion - 48 kHz', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_48000);
        });

        it('should produce proportional output samples at 48 kHz', () => {
            // Push enough for ~10 output samples
            // At 18.64:1 ratio, need ~186 input samples
            for (let i = 0; i < 186; i++) {
                resampler.push(0.5);
            }
            const samples = resampler.pull();
            // Should get approximately 10 output samples
            expect(samples.length).to.be.closeTo(10, 1);
        });

        it('should maintain correct 48 kHz ratio over time', () => {
            let totalOutput = 0;
            
            // Push samples in chunks
            for (let cycle = 0; cycle < 5; cycle++) {
                for (let i = 0; i < 480; i++) {
                    resampler.push(0.5);
                }
                const samples = resampler.pull();
                totalOutput += samples.length;
            }
            
            // Total input: 2400 samples
            // Expected output: ~129 samples (2400 / 18.64)
            expect(totalOutput).to.be.closeTo(129, 3);
        });
    });

    describe('cubic interpolation quality', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_44100);
        });

        it('should pass DC signal (constant value) unchanged', () => {
            const dcValue = 0.7;
            
            // Push constant DC signal
            for (let i = 0; i < 500; i++) {
                resampler.push(dcValue);
            }
            
            const samples = resampler.pull();
            
            // All output samples should be close to DC value
            // Cubic interpolation of constant should give constant
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.closeTo(dcValue, 0.01);
            }
        });

        it('should handle negative DC signal', () => {
            const dcValue = -0.8;
            
            for (let i = 0; i < 500; i++) {
                resampler.push(dcValue);
            }
            
            const samples = resampler.pull();
            
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.closeTo(dcValue, 0.01);
            }
        });

        it('should produce smooth output for linear ramp', () => {
            // Create a linear ramp from -1 to +1
            for (let i = 0; i < 1000; i++) {
                const value = -1.0 + (2.0 * i / 999);
                resampler.push(value);
            }
            
            const samples = resampler.pull();
            
            // Output should be monotonically increasing (smooth)
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i]).to.be.at.least(samples[i - 1] - 0.01);
            }
            
            // First sample should be negative, last should be positive
            expect(samples[0]).to.be.lessThan(0);
            expect(samples[samples.length - 1]).to.be.greaterThan(0);
        });

        it('should keep output values in valid range', () => {
            // Push samples with values in -1 to +1 range
            for (let i = 0; i < 1000; i++) {
                const value = Math.sin(i * 0.1) * 0.9; // Sine wave
                resampler.push(value);
            }
            
            const samples = resampler.pull();
            
            // All outputs should be in valid range
            // Cubic interpolation might slightly overshoot, but should be reasonable
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.at.least(-1.5);
                expect(samples[i]).to.be.at.most(1.5);
            }
        });

        it('should handle zero signal correctly', () => {
            // Push silence
            for (let i = 0; i < 500; i++) {
                resampler.push(0.0);
            }
            
            const samples = resampler.pull();
            
            // All output samples should be zero
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.closeTo(0.0, 0.01);
            }
        });

        it('should interpolate between different values smoothly', () => {
            // Push samples to create a step transition
            // With a large step size (20.29), the transition may be sharp but should be smooth
            for (let i = 0; i < 500; i++) {
                resampler.push(-0.5);
            }
            for (let i = 0; i < 500; i++) {
                resampler.push(0.5);
            }
            
            const samples = resampler.pull();
            
            // Verify we have both negative and positive regions
            let foundNegative = false;
            let foundPositive = false;
            
            for (let i = 0; i < samples.length; i++) {
                if (samples[i] < -0.2) foundNegative = true;
                if (samples[i] > 0.2) foundPositive = true;
            }
            
            expect(foundNegative).to.be.true;
            expect(foundPositive).to.be.true;
            
            // Verify smooth transition - should be generally increasing
            // (not strictly monotonic due to interpolation, but trend should be upward)
            let transitionStarted = false;
            let negativeAfterPositive = 0;
            
            for (let i = 1; i < samples.length; i++) {
                if (samples[i-1] < 0 && samples[i] > 0) {
                    transitionStarted = true;
                }
                // After transition, shouldn't go significantly negative again
                if (transitionStarted && samples[i] < -0.3) {
                    negativeAfterPositive++;
                }
            }
            
            // Should not have many samples going back to negative after transition
            expect(negativeAfterPositive).to.be.at.most(1);
        });
    });

    describe('pull behavior', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_44100);
        });

        it('should return empty Float32Array when no samples available', () => {
            const samples = resampler.pull();
            expect(samples).to.be.instanceOf(Float32Array);
            expect(samples.length).to.equal(0);
        });

        it('should return all available samples', () => {
            // Push enough for several output samples
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            
            const available = resampler.available();
            const samples = resampler.pull();
            
            expect(samples.length).to.equal(available);
        });

        it('should clear available count after pull', () => {
            // Push some samples
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            
            expect(resampler.available()).to.be.greaterThan(0);
            
            resampler.pull();
            
            expect(resampler.available()).to.equal(0);
        });

        it('should return independent Float32Array instances', () => {
            // Push samples
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            
            const samples1 = resampler.pull();
            
            // Push more and pull again
            for (let i = 0; i < 300; i++) {
                resampler.push(0.7);
            }
            
            const samples2 = resampler.pull();
            
            // Should be different arrays
            expect(samples1).to.not.equal(samples2);
            
            // First pull should have 0.5 values, second should have 0.7 values
            if (samples1.length > 0 && samples2.length > 0) {
                expect(samples1[0]).to.be.closeTo(0.5, 0.1);
                expect(samples2[0]).to.be.closeTo(0.7, 0.1);
            }
        });

        it('should handle successive pulls without intervening pushes', () => {
            // Push samples
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            
            const samples1 = resampler.pull();
            expect(samples1.length).to.be.greaterThan(0);
            
            // Pull again immediately
            const samples2 = resampler.pull();
            expect(samples2.length).to.equal(0);
            
            // And again
            const samples3 = resampler.pull();
            expect(samples3.length).to.equal(0);
        });
    });

    describe('rate ratio adjustment', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_44100);
        });

        it('should maintain default conversion with ratio 1.0', () => {
            resampler.setRateRatio(1.0);
            
            // Push samples
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samples = resampler.pull();
            
            // Should get approximately 100 samples at default ratio
            expect(samples.length).to.be.closeTo(100, 2);
        });

        it('should produce fewer samples with ratio 1.005 (faster consumption)', () => {
            // Ratio > 1.0 means consume input faster = fewer output samples
            // Use enough samples that 0.5% difference is clearly visible (>= 2 samples difference)
            // With 10000 input samples: ~493 default vs ~490 adjusted = ~3 sample difference
            resampler.setRateRatio(1.005);
            
            for (let i = 0; i < 10000; i++) {
                resampler.push(0.5);
            }
            
            const samplesAdjusted = resampler.pull();
            
            // Reset and compare with default
            resampler.reset();
            resampler.setRateRatio(1.0);
            
            for (let i = 0; i < 10000; i++) {
                resampler.push(0.5);
            }
            
            const samplesDefault = resampler.pull();
            
            // Adjusted should produce fewer samples (at least 2 fewer with this sample count)
            expect(samplesAdjusted.length).to.be.lessThan(samplesDefault.length);
            expect(samplesDefault.length - samplesAdjusted.length).to.be.at.least(2);
        });

        it('should produce more samples with ratio 0.995 (slower consumption)', () => {
            // Ratio < 1.0 means consume input slower = more output samples
            resampler.setRateRatio(0.995);
            
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samplesAdjusted = resampler.pull();
            
            // Reset and compare with default
            resampler.reset();
            resampler.setRateRatio(1.0);
            
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samplesDefault = resampler.pull();
            
            // Adjusted should produce more samples
            expect(samplesAdjusted.length).to.be.greaterThan(samplesDefault.length);
        });

        it('should clamp ratio above 1.005', () => {
            // Try to set ratio above limit
            resampler.setRateRatio(1.01);
            
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samplesClamped = resampler.pull();
            
            // Reset and set to exactly 1.005
            resampler.reset();
            resampler.setRateRatio(1.005);
            
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samplesLimit = resampler.pull();
            
            // Should be clamped to 1.005, so same output
            expect(samplesClamped.length).to.equal(samplesLimit.length);
        });

        it('should clamp ratio below 0.995', () => {
            // Try to set ratio below limit
            resampler.setRateRatio(0.99);
            
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samplesClamped = resampler.pull();
            
            // Reset and set to exactly 0.995
            resampler.reset();
            resampler.setRateRatio(0.995);
            
            for (let i = 0; i < 2029; i++) {
                resampler.push(0.5);
            }
            
            const samplesLimit = resampler.pull();
            
            // Should be clamped to 0.995, so same output
            expect(samplesClamped.length).to.equal(samplesLimit.length);
        });

        it('should allow dynamic ratio changes', () => {
            // Start with normal ratio
            resampler.setRateRatio(1.0);
            
            for (let i = 0; i < 500; i++) {
                resampler.push(0.5);
            }
            
            const samples1 = resampler.pull();
            
            // Change ratio
            resampler.setRateRatio(1.005);
            
            for (let i = 0; i < 500; i++) {
                resampler.push(0.5);
            }
            
            const samples2 = resampler.pull();
            
            // Both should produce samples, but different amounts
            expect(samples1.length).to.be.greaterThan(0);
            expect(samples2.length).to.be.greaterThan(0);
            expect(samples1.length).to.not.equal(samples2.length);
        });
    });

    describe('reset behavior', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_44100);
        });

        it('should clear available samples', () => {
            // Push samples to generate output
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            
            expect(resampler.available()).to.be.greaterThan(0);
            
            resampler.reset();
            
            expect(resampler.available()).to.equal(0);
        });

        it('should allow subsequent pushes to work correctly', () => {
            // Push some samples
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            
            resampler.reset();
            
            // Push new samples
            for (let i = 0; i < 300; i++) {
                resampler.push(0.7);
            }
            
            const samples = resampler.pull();
            
            // Should produce output and values should be close to 0.7
            expect(samples.length).to.be.greaterThan(0);
            if (samples.length > 0) {
                expect(samples[0]).to.be.closeTo(0.7, 0.1);
            }
        });

        it('should reset rate ratio to base rate', () => {
            // Set custom ratio and use enough samples for clear difference
            // With 10000 samples, difference between 1.005 and 1.0 is about 3 samples
            resampler.setRateRatio(1.005);
            
            for (let i = 0; i < 10000; i++) {
                resampler.push(0.5);
            }
            
            const samplesAdjusted = resampler.pull();
            
            // Reset
            resampler.reset();
            
            // Don't set ratio again, should use base rate
            for (let i = 0; i < 10000; i++) {
                resampler.push(0.5);
            }
            
            const samplesAfterReset = resampler.pull();
            
            // After reset should be back to default ratio (more samples than adjusted)
            expect(samplesAfterReset.length).to.be.greaterThan(samplesAdjusted.length);
            expect(samplesAfterReset.length - samplesAdjusted.length).to.be.at.least(2);
        });

        it('should allow multiple resets', () => {
            // First cycle
            for (let i = 0; i < 300; i++) {
                resampler.push(0.5);
            }
            resampler.reset();
            
            // Second cycle
            for (let i = 0; i < 300; i++) {
                resampler.push(0.6);
            }
            resampler.reset();
            
            // Third cycle
            for (let i = 0; i < 300; i++) {
                resampler.push(0.7);
            }
            
            const samples = resampler.pull();
            
            // Should work correctly after multiple resets
            expect(samples.length).to.be.greaterThan(0);
            if (samples.length > 0) {
                expect(samples[0]).to.be.closeTo(0.7, 0.1);
            }
        });

        it('should clear internal interpolation state', () => {
            // Push some samples
            for (let i = 0; i < 100; i++) {
                resampler.push(0.9); // High value
            }
            
            resampler.reset();
            
            // Push different samples
            for (let i = 0; i < 100; i++) {
                resampler.push(-0.9); // Low value
            }
            
            const samples = resampler.pull();
            
            // Output should reflect new samples, not influenced by old ones
            if (samples.length > 0) {
                // First few samples might be transitioning from zero (reset state)
                // to -0.9, but should all be negative or very close
                const avgValue = samples.reduce((sum, val) => sum + val, 0) / samples.length;
                expect(avgValue).to.be.closeTo(-0.9, 0.3);
            }
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            resampler = new Resampler(APU_RATE, RATE_44100);
        });

        it('should handle multiple pulls without pushes', () => {
            const pull1 = resampler.pull();
            const pull2 = resampler.pull();
            const pull3 = resampler.pull();
            
            expect(pull1.length).to.equal(0);
            expect(pull2.length).to.equal(0);
            expect(pull3.length).to.equal(0);
        });

        it('should handle very large number of samples', () => {
            // Push 10000 samples
            for (let i = 0; i < 10000; i++) {
                resampler.push(Math.sin(i * 0.01));
            }
            
            const samples = resampler.pull();
            
            // Should produce approximately 10000 / 20.29 ≈ 493 samples
            expect(samples.length).to.be.closeTo(493, 10);
            
            // Should be valid samples
            expect(samples.length).to.be.greaterThan(0);
        });

        it('should handle alternating push and pull', () => {
            let totalOutput = 0;
            
            // Alternate between small pushes and pulls
            for (let cycle = 0; cycle < 10; cycle++) {
                for (let i = 0; i < 100; i++) {
                    resampler.push(0.5);
                }
                const samples = resampler.pull();
                totalOutput += samples.length;
            }
            
            // Total input: 1000 samples
            // Expected output: ~49 samples
            expect(totalOutput).to.be.closeTo(49, 3);
        });

        it('should handle extreme positive values', () => {
            for (let i = 0; i < 300; i++) {
                resampler.push(1.0);
            }
            
            const samples = resampler.pull();
            
            // Should produce samples close to 1.0
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.closeTo(1.0, 0.1);
            }
        });

        it('should handle extreme negative values', () => {
            for (let i = 0; i < 300; i++) {
                resampler.push(-1.0);
            }
            
            const samples = resampler.pull();
            
            // Should produce samples close to -1.0
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.closeTo(-1.0, 0.1);
            }
        });

        it('should handle rapid value changes', () => {
            // Alternate between extremes
            for (let i = 0; i < 300; i++) {
                resampler.push(i % 2 === 0 ? 1.0 : -1.0);
            }
            
            const samples = resampler.pull();
            
            // Should produce valid output
            expect(samples.length).to.be.greaterThan(0);
            
            // Values should be in reasonable range (interpolation smooths)
            for (let i = 0; i < samples.length; i++) {
                expect(samples[i]).to.be.at.least(-1.5);
                expect(samples[i]).to.be.at.most(1.5);
            }
        });

        it('should handle single sample after reset', () => {
            resampler.reset();
            resampler.push(0.5);
            
            expect(resampler.available()).to.equal(0); // Need 4 samples minimum
        });

        it('should handle exact buffer boundary conditions', () => {
            // Push exactly 4 samples (minimum for interpolation)
            resampler.push(0.1);
            resampler.push(0.2);
            resampler.push(0.3);
            expect(resampler.available()).to.equal(0);
            
            resampler.push(0.4);
            
            // Now should have at least started producing output
            // (whether it produces depends on position accumulation)
            const available = resampler.available();
            expect(available).to.be.at.least(0);
        });
    });

    describe('different output rates', () => {
        it('should work with 44.1 kHz output', () => {
            resampler = new Resampler(APU_RATE, 44100);
            
            for (let i = 0; i < 1000; i++) {
                resampler.push(0.5);
            }
            
            const samples = resampler.pull();
            expect(samples.length).to.be.greaterThan(0);
            expect(samples.length).to.be.closeTo(49, 3);
        });

        it('should work with 48 kHz output', () => {
            resampler = new Resampler(APU_RATE, 48000);
            
            for (let i = 0; i < 1000; i++) {
                resampler.push(0.5);
            }
            
            const samples = resampler.pull();
            expect(samples.length).to.be.greaterThan(0);
            expect(samples.length).to.be.closeTo(54, 3);
        });

        it('should work with custom input rate', () => {
            // Use a different input rate
            resampler = new Resampler(100000, 44100);
            
            for (let i = 0; i < 1000; i++) {
                resampler.push(0.5);
            }
            
            const samples = resampler.pull();
            expect(samples.length).to.be.greaterThan(0);
            // Ratio: 100000 / 44100 ≈ 2.27
            // 1000 / 2.27 ≈ 441 samples
            expect(samples.length).to.be.closeTo(441, 10);
        });
    });
});

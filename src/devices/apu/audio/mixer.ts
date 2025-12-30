import { u8 } from "../../../utils/types.js";

/**
 * APU Audio Mixer
 *
 * Implements the NES APU's non-linear DAC mixing formulas to combine
 * the five audio channels into a single output sample.
 *
 * The NES uses two separate mixing formulas:
 * 1. Pulse mixing: Combines the two pulse channels
 * 2. TND mixing: Combines Triangle, Noise, and DMC channels
 *
 * These formulas create the characteristic non-linear sound of the NES.
 *
 * Performance optimization: Hybrid approach balances speed and audio quality:
 * - Pulse channels use a pre-computed lookup table (31 entries)
 * - TND channels use the original formula for precision
 *
 * This eliminates 2 divisions (pulse) while preserving audio quality.
 *
 * References:
 * - https://www.nesdev.org/wiki/APU_Mixer
 */
export class ApuMixer {
    /**
     * Pre-computed lookup table for pulse channel mixing
     * Index: pulse1 + pulse2 (0-30)
     * Value: Pre-calculated output using the non-linear pulse formula
     */
    private readonly pulseLookup: Float32Array;

    constructor() {
        // Initialize pulse lookup table (31 entries: 0-30)
        this.pulseLookup = new Float32Array(31);
        for (let i = 0; i <= 30; i++) {
            if (i === 0) {
                this.pulseLookup[i] = 0;
            } else {
                // Formula: 95.88 / ((8128 / sum) + 100)
                this.pulseLookup[i] = 95.88 / ((8128 / i) + 100);
            }
        }
    }

    /**
     * Mix all APU channels into a single audio sample
     *
     * @param pulse1 - Pulse channel 1 output (0-15)
     * @param pulse2 - Pulse channel 2 output (0-15)
     * @param triangle - Triangle channel output (0-15)
     * @param noise - Noise channel output (0-15)
     * @param dmc - DMC channel output (0-127)
     * @returns Mixed sample in range -1.0 to +1.0 (normalized for Web Audio)
     */
    public mix(pulse1: u8, pulse2: u8, triangle: u8, noise: u8, dmc: u8): number {
        // Pulse lookup - fast, accurate
        const pulseSum = pulse1 + pulse2;
        const pulseOut = this.pulseLookup[pulseSum];
        
        // TND - original formula for precision
        const tndSum = triangle / 8227 + noise / 12241 + dmc / 22638;
        const tndOut = tndSum === 0 ? 0 : 159.79 / ((1 / tndSum) + 100);
        
        // Combine and scale to [-1, 1]
        return (pulseOut + tndOut) * 2 - 1;
    }
}

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
 * References:
 * - https://www.nesdev.org/wiki/APU_Mixer
 */
export class ApuMixer {
    /**
     * Mix all APU channels into a single audio sample
     * 
     * @param pulse1 - Pulse channel 1 output (0-15)
     * @param pulse2 - Pulse channel 2 output (0-15)
     * @param tri - Triangle channel output (0-15)
     * @param noise - Noise channel output (0-15)
     * @param dmc - DMC channel output (0-127)
     * @returns Mixed sample in range -1.0 to +1.0 (normalized for Web Audio)
     */
    public mix(pulse1: u8, pulse2: u8, tri: u8, noise: u8, dmc: u8): number {
        // Apply non-linear pulse mixing formula
        const pulseOut = this.mixPulse(pulse1, pulse2);
        
        // Apply non-linear TND mixing formula
        const tndOut = this.mixTnd(tri, noise, dmc);
        
        // Combine the outputs
        // The NES DAC outputs range from 0.0 (silence) to ~0.257 (all channels at max)
        // This is a valid range for Web Audio API which accepts -1.0 to +1.0
        return pulseOut + tndOut;
    }

    /**
     * Mix the two pulse channels using the non-linear pulse DAC formula
     * 
     * Formula: pulse_out = 95.88 / ((8128 / (pulse1 + pulse2)) + 100)
     * 
     * Special case: When pulse1 + pulse2 = 0, output is 0 (avoids division by zero)
     * 
     * @param pulse1 - Pulse channel 1 output (0-15)
     * @param pulse2 - Pulse channel 2 output (0-15)
     * @returns Mixed pulse output (~0.0 to ~0.094)
     */
    private mixPulse(pulse1: u8, pulse2: u8): number {
        const sum = pulse1 + pulse2;
        
        // Handle division by zero case
        if (sum === 0) {
            return 0;
        }
        
        // Apply non-linear pulse mixing formula
        return 95.88 / ((8128 / sum) + 100);
    }

    /**
     * Mix Triangle, Noise, and DMC channels using the non-linear TND DAC formula
     * 
     * Formula: tnd_out = 159.79 / ((1 / (tri/8227 + noise/12241 + dmc/22638)) + 100)
     * 
     * Special case: When tri = 0 AND noise = 0 AND dmc = 0, output is 0 (avoids division by zero)
     * 
     * @param tri - Triangle channel output (0-15)
     * @param noise - Noise channel output (0-15)
     * @param dmc - DMC channel output (0-127)
     * @returns Mixed TND output (~0.0 to ~0.163)
     */
    private mixTnd(tri: u8, noise: u8, dmc: u8): number {
        // Calculate the sum of weighted channel outputs
        const sum = (tri / 8227) + (noise / 12241) + (dmc / 22638);
        
        // Handle division by zero case
        // This occurs when all three channels are silent (all outputs = 0)
        if (sum === 0) {
            return 0;
        }
        
        // Apply non-linear TND mixing formula
        return 159.79 / ((1 / sum) + 100);
    }
}

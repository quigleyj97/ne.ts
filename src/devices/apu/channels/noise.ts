import { u8, u16 } from "../../../utils/types.js";
import { EnvelopeUnit } from "../units/envelope.js";

/**
 * Length counter lookup table
 * 
 * Used to convert the 5-bit length counter load value (bits 3-7 of register $400F)
 * into the actual length counter value. These values represent the duration the channel
 * will play in frame counter half-frames (~120 Hz).
 * 
 * This is the same table used by pulse and triangle channels.
 */
const LENGTH_COUNTER_TABLE: readonly u8[] = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
];

/**
 * Noise period lookup table (NTSC values)
 * 
 * The noise channel timer uses a 4-bit index (bits 0-3 of $400E) to select
 * the timer period from this table. These values determine the rate at which
 * the LFSR (Linear Feedback Shift Register) is clocked, affecting the pitch
 * of the noise.
 * 
 * Lower indices produce higher-pitched noise, higher indices produce lower-pitched noise.
 */
const NOISE_PERIOD_TABLE: readonly u16[] = [
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
];

/**
 * APU Noise Channel
 * 
 * The NES APU Noise Channel generates pseudo-random noise using a 15-bit
 * Linear Feedback Shift Register (LFSR). It's used for percussion, explosions,
 * and various sound effects.
 * 
 * The noise channel consists of:
 * - Timer: Controls LFSR clock rate (noise pitch)
 * - 15-bit LFSR: Generates pseudo-random sequence
 * - Envelope unit: Controls volume over time
 * - Length counter: Automatically silences the channel after a duration
 * - Mode flag: Switches between long mode (white noise) and short mode (metallic)
 * 
 * Key characteristics:
 * - LFSR must be initialized to 1 (0 would produce only silence)
 * - Long mode: XOR bits 0 and 1 for feedback (typical white noise)
 * - Short mode: XOR bits 0 and 6 for feedback (shorter period, metallic sound)
 * - Output is based on inverted LFSR bit 0 (bit 0 = 1 → output 0, bit 0 = 0 → output volume)
 * 
 * Based on NES APU specification:
 * https://www.nesdev.org/wiki/APU_Noise
 */
export class NoiseChannel {
    //#region LFSR State
    /**
     * 15-bit Linear Feedback Shift Register
     * Generates pseudo-random sequence for noise generation
     * 
     * CRITICAL: Must be initialized to 1, not 0. Initializing to 0 would
     * result in the LFSR staying at 0 forever, producing only silence.
     */
    private shiftRegister: u16 = 1;

    /**
     * Mode flag (from bit 7 of $400E)
     * - false (0): Long mode - XOR bits 0 and 1 (typical white noise)
     * - true (1): Short mode - XOR bits 0 and 6 (metallic noise)
     */
    private mode: boolean = false;
    //#endregion

    //#region Timer State
    /**
     * Timer period (from NOISE_PERIOD_TABLE)
     * Determines how frequently the LFSR is clocked
     */
    private timerPeriod: u16 = 0;

    /**
     * Timer counter (internal countdown)
     * Counts down each APU cycle, reloads from timerPeriod when it reaches 0
     */
    private timerCounter: u16 = 0;
    //#endregion

    //#region Length Counter
    /**
     * Length counter value
     * Automatically silences the channel when it reaches 0
     */
    private lengthCounter: u8 = 0;

    /**
     * Length counter halt flag (from bit 5 of $400C)
     * When true, prevents length counter from decrementing
     * Also serves as envelope loop flag
     */
    private lengthCounterHalt: boolean = false;
    //#endregion

    //#region Enable State
    /**
     * Channel enabled flag (controlled by $4015 status register)
     * When disabled, length counter is cleared
     */
    private enabled: boolean = false;
    //#endregion

    //#region Component Units
    /**
     * Envelope unit for volume control
     */
    private envelope: EnvelopeUnit;
    //#endregion

    /**
     * Create a new NoiseChannel
     */
    constructor() {
        this.envelope = new EnvelopeUnit();
    }

    /**
     * Write to a noise channel register
     * 
     * Register mapping:
     * - $400C: --LC.VVVV - Length counter halt (bit 5), constant volume (bit 4), volume/envelope (bits 0-3)
     * - $400D: Unused
     * - $400E: M---.PPPP - Mode (bit 7), period index (bits 0-3)
     * - $400F: LLLL.L--- - Length counter load (bits 3-7)
     * 
     * @param register Register offset (0-3, where 0 = $400C, 1 = $400D, 2 = $400E, 3 = $400F)
     * @param value Value to write
     */
    public write(register: u8, value: u8): void {
        switch (register) {
            case 0:
                // $400C: --LC.VVVV
                // Bit 5: Length counter halt / envelope loop
                this.lengthCounterHalt = (value & 0x20) !== 0;
                
                // Bits 4-0: Constant volume flag and volume/envelope period
                this.envelope.setRegister(value);
                break;

            case 1:
                // $400D: Unused
                break;

            case 2:
                // $400E: M---.PPPP
                // Bit 7: Mode flag (0 = long/white noise, 1 = short/metallic)
                this.mode = (value & 0x80) !== 0;
                
                // Bits 3-0: Period index into NOISE_PERIOD_TABLE
                const periodIndex = value & 0x0F;
                this.timerPeriod = NOISE_PERIOD_TABLE[periodIndex];
                break;

            case 3:
                // $400F: LLLL.L---
                // Bits 7-3: Length counter load (5-bit index into LENGTH_COUNTER_TABLE)
                const lengthIndex = (value >> 3) & 0x1F;
                
                // Only load length counter if channel is enabled
                if (this.enabled) {
                    this.lengthCounter = LENGTH_COUNTER_TABLE[lengthIndex];
                }
                
                // Side effect: Restart envelope
                this.envelope.setStartFlag();
                break;
        }
    }

    /**
     * Clock the timer (called every APU cycle)
     * 
     * The timer counts down each APU cycle. When it reaches 0, it reloads
     * to the period value and clocks the LFSR (shift register).
     */
    public clockTimer(): void {
        if (this.timerCounter === 0) {
            // Timer expired: reload and clock LFSR
            this.timerCounter = this.timerPeriod;
            this.clockLFSR();
        } else {
            // Timer not expired: decrement
            this.timerCounter--;
        }
    }

    /**
     * Clock the LFSR (Linear Feedback Shift Register)
     * 
     * This implements the pseudo-random sequence generation:
     * 1. Calculate feedback based on mode:
     *    - Long mode (mode = 0): XOR bits 0 and 1
     *    - Short mode (mode = 1): XOR bits 0 and 6
     * 2. Shift register right by 1
     * 3. Place feedback bit into bit 14
     * 
     * The LFSR output (bit 0 after shifting) determines whether the channel
     * outputs volume or silence, creating the noise effect.
     */
    private clockLFSR(): void {
        // Calculate feedback based on mode
        let feedback: u8;
        if (this.mode) {
            // Short mode: XOR bits 0 and 6
            feedback = (this.shiftRegister & 0x01) ^ ((this.shiftRegister >> 6) & 0x01);
        } else {
            // Long mode: XOR bits 0 and 1
            feedback = (this.shiftRegister & 0x01) ^ ((this.shiftRegister >> 1) & 0x01);
        }
        
        // Shift register right by 1
        this.shiftRegister >>= 1;
        
        // Place feedback in bit 14 (keeping it as a 15-bit value)
        this.shiftRegister = (this.shiftRegister & 0x3FFF) | (feedback << 14);
    }

    /**
     * Clock the envelope unit (called on frame counter quarter-frames)
     * 
     * Delegates to the envelope unit's clock method.
     */
    public clockEnvelope(): void {
        this.envelope.clock();
    }

    /**
     * Clock the length counter (called on frame counter half-frames)
     * 
     * Decrements the length counter if not halted and greater than 0.
     */
    public clockLengthCounter(): void {
        if (!this.lengthCounterHalt && this.lengthCounter > 0) {
            this.lengthCounter--;
        }
    }

    /**
     * Get the current output sample
     * 
     * Returns a value from 0-15 representing the current audio sample.
     * 
     * The channel is muted (returns 0) when any of these conditions are true:
     * - Length counter is 0
     * - LFSR bit 0 is 1 (inverted output)
     * 
     * Otherwise, returns the envelope volume (0-15).
     * 
     * @returns Current sample value (0-15)
     */
    public getOutput(): u8 {
        // Mute if length counter is 0
        if (this.lengthCounter === 0) {
            return 0;
        }

        // Mute if LFSR bit 0 is 1
        // The noise effect comes from bit 0 randomly alternating,
        // causing the output to alternate between volume and 0
        if ((this.shiftRegister & 0x01) !== 0) {
            return 0;
        }

        // Output envelope volume
        return this.envelope.output();
    }

    /**
     * Enable or disable the channel
     * 
     * When disabled, the length counter is cleared to 0.
     * 
     * @param enabled True to enable, false to disable
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.lengthCounter = 0;
        }
    }

    /**
     * Check if the channel is active
     * 
     * A channel is considered active if its length counter is greater than 0
     * and the channel is enabled.
     * 
     * @returns True if active, false otherwise
     */
    public isActive(): boolean {
        return this.lengthCounter > 0 && this.enabled;
    }

    /**
     * Reset the channel to power-on state
     */
    public reset(): void {
        this.shiftRegister = 1; // CRITICAL: Initialize to 1, not 0
        this.mode = false;
        this.timerPeriod = 0;
        this.timerCounter = 0;
        this.lengthCounter = 0;
        this.lengthCounterHalt = false;
        this.enabled = false;
        this.envelope.reset();
    }
}

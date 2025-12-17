import { u8, u16 } from "../../../utils/types.js";

/**
 * Length counter lookup table
 * 
 * Used to convert the 5-bit length counter load value (bits 3-7 of register $400B)
 * into the actual length counter value. These values represent the duration the channel
 * will play in frame counter half-frames (~120 Hz).
 * 
 * This is the same table used by pulse and noise channels.
 */
const LENGTH_COUNTER_TABLE: readonly u8[] = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
];

/**
 * Triangle waveform sequence
 * 
 * 32-step triangle wave that generates values from 0-15 and back.
 * Creates a linear ramp up from 15 to 0, then back from 0 to 15.
 * This produces the characteristic triangle wave sound.
 */
const TRIANGLE_SEQUENCE: readonly u8[] = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
];

/**
 * APU Triangle Channel
 * 
 * The NES APU Triangle Channel generates a triangle waveform used primarily
 * for bass and melody lines. Unlike the pulse channels, it has no volume control -
 * the output is always at full volume (when not muted).
 * 
 * The triangle channel consists of:
 * - Timer: Controls output frequency
 * - 32-step triangle sequencer: Outputs values 0-15 in a triangle pattern
 * - Linear counter: Unique to triangle channel, provides duration control
 * - Length counter: Automatically silences the channel after a duration
 * 
 * Key differences from pulse channel:
 * - No envelope or sweep units
 * - Has linear counter instead of envelope
 * - Output is muted when timer period < 2 (produces ultrasonic frequencies)
 * - Sequencer runs continuously (not reset on register writes)
 * - Control flag serves dual purpose: linear counter control AND length counter halt
 * 
 * Based on NES APU specification:
 * https://www.nesdev.org/wiki/APU_Triangle
 */
export class TriangleChannel {
    //#region Timer State
    /**
     * Timer period (11-bit, 0-2047)
     * Determines output frequency: CPU_CLOCK / (32 * (timerPeriod + 1))
     */
    private timerPeriod: u16 = 0;

    /**
     * Timer counter (internal countdown)
     * Counts down each APU cycle, reloads from timerPeriod when it reaches 0
     */
    private timerCounter: u16 = 0;
    //#endregion

    //#region Sequencer State
    /**
     * Current position in the 32-step triangle sequence (0-31)
     * Advanced each time the timer expires
     */
    private sequencePosition: u8 = 0;
    //#endregion

    //#region Linear Counter
    /**
     * Linear counter reload value (7-bit, 0-127)
     * Loaded from bits 0-6 of register $4008
     */
    private linearCounterReload: u8 = 0;

    /**
     * Linear counter current value
     * When non-zero, allows the triangle sequencer to advance
     */
    private linearCounter: u8 = 0;

    /**
     * Linear counter reload flag
     * Set when register $400B is written, cleared based on control flag
     */
    private linearCounterReloadFlag: boolean = false;

    /**
     * Control flag (bit 7 of register $4008)
     * Dual purpose:
     * - Controls linear counter reload flag clearing
     * - Also serves as length counter halt flag
     */
    private controlFlag: boolean = false;
    //#endregion

    //#region Length Counter
    /**
     * Length counter value
     * Automatically silences the channel when it reaches 0
     * Public to allow status register reads
     */
    public lengthCounter: u8 = 0;
    //#endregion

    //#region Enable State
    /**
     * Channel enabled flag (controlled by $4015 status register)
     * When disabled, length counter is cleared
     */
    private enabled: boolean = false;
    //#endregion

    /**
     * Write to control register ($4008)
     * Format: CRRR RRRR
     * - Bit 7 (C): Control flag (also length counter halt)
     * - Bits 6-0 (R): Linear counter reload value
     * 
     * @param value Value to write
     */
    public writeControl(value: u8): void {
        this.controlFlag = (value & 0x80) !== 0;
        this.linearCounterReload = value & 0x7F;
    }

    /**
     * Write to timer low register ($400A)
     * Sets the low 8 bits of the timer period
     * 
     * @param value Value to write
     */
    public writeTimerLow(value: u8): void {
        this.timerPeriod = (this.timerPeriod & 0x0700) | value;
    }

    /**
     * Write to timer high and length counter register ($400B)
     * Format: LLLL LHHH
     * - Bits 7-3 (L): Length counter load index
     * - Bits 2-0 (H): Timer high 3 bits
     * 
     * Side effects:
     * - Sets linear counter reload flag
     * - Loads length counter from table (if enabled)
     * - Does NOT reset sequencer position (unlike pulse channel)
     * 
     * @param value Value to write
     */
    public writeTimerHigh(value: u8): void {
        // Bits 7-3: Length counter load (5-bit index into LENGTH_COUNTER_TABLE)
        const lengthIndex = (value >> 3) & 0x1F;
        
        // Only load length counter if channel is enabled
        if (this.enabled) {
            this.lengthCounter = LENGTH_COUNTER_TABLE[lengthIndex];
        }
        
        // Bits 2-0: Timer high 3 bits
        this.timerPeriod = (this.timerPeriod & 0x00FF) | ((value & 0x07) << 8);
        
        // Side effect: Set linear counter reload flag
        this.linearCounterReloadFlag = true;
    }

    /**
     * Clock the timer (called every APU cycle)
     * 
     * The timer counts down each APU cycle. When it reaches 0, it reloads
     * to the period value and advances the sequencer position.
     * 
     * The sequencer only advances if both linear counter and length counter
     * are non-zero. However, the timer continues to count even when muted.
     */
    public clock(): void {
        if (this.timerCounter === 0) {
            // Timer expired: reload
            this.timerCounter = this.timerPeriod;
            
            // Advance sequencer if not muted by counters
            // The sequencer advances even if the output is ultrasonic (timer < 2)
            if (this.linearCounter > 0 && this.lengthCounter > 0) {
                this.sequencePosition = (this.sequencePosition + 1) & 0x1F;
            }
        } else {
            // Timer not expired: decrement
            this.timerCounter--;
        }
    }

    /**
     * Clock the linear counter (called on frame counter quarter-frames)
     * 
     * Linear counter behavior:
     * - If reload flag is set: Load counter from reload value
     * - Otherwise if counter > 0: Decrement counter
     * - If control flag is clear: Clear reload flag
     * 
     * This unique behavior allows for precise control over the triangle
     * channel's duration independent of the length counter.
     */
    public clockLinearCounter(): void {
        if (this.linearCounterReloadFlag) {
            // Reload flag set: load counter
            this.linearCounter = this.linearCounterReload;
        } else if (this.linearCounter > 0) {
            // Reload flag clear and counter > 0: decrement
            this.linearCounter--;
        }
        
        // If control flag is clear, clear reload flag
        if (!this.controlFlag) {
            this.linearCounterReloadFlag = false;
        }
    }

    /**
     * Clock the length counter (called on frame counter half-frames)
     * 
     * Decrements the length counter if not halted and greater than 0.
     * The control flag serves as the length counter halt flag.
     */
    public clockLengthCounter(): void {
        // Control flag also serves as length counter halt
        if (!this.controlFlag && this.lengthCounter > 0) {
            this.lengthCounter--;
        }
    }

    /**
     * Get the current output sample
     * 
     * Returns a value from 0-15 representing the current audio sample.
     * 
     * The channel is muted (but sequencer continues running) when:
     * - Linear counter is 0
     * - Length counter is 0
     * - Timer period < 2 (produces ultrasonic frequencies)
     * 
     * Unlike pulse channels, the triangle channel has no volume control.
     * The output is always the raw sequencer value when not muted.
     * 
     * @returns Current sample value (0-15)
     */
    public output(): u8 {
        // Mute if linear counter is 0
        if (this.linearCounter === 0) {
            return 0;
        }

        // Mute if length counter is 0
        if (this.lengthCounter === 0) {
            return 0;
        }

        // Mute if timer period < 2 (ultrasonic, produces pops/clicks)
        if (this.timerPeriod < 2) {
            return 0;
        }

        // Output current sequencer value
        return TRIANGLE_SEQUENCE[this.sequencePosition];
    }

    /**
     * Check if the channel is enabled
     * 
     * @returns True if enabled, false otherwise
     */
    public isEnabled(): boolean {
        return this.lengthCounter > 0;
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
     * Reset the channel to power-on state
     */
    public reset(): void {
        this.timerPeriod = 0;
        this.timerCounter = 0;
        this.sequencePosition = 0;
        this.linearCounterReload = 0;
        this.linearCounter = 0;
        this.linearCounterReloadFlag = false;
        this.controlFlag = false;
        this.lengthCounter = 0;
        this.enabled = false;
    }
}

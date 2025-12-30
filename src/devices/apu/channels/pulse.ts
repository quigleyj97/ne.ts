import { u8, u16 } from "../../../utils/types.js";
import { EnvelopeUnit } from "../units/envelope.js";
import { SweepUnit } from "../units/sweep.js";

/**
 * Length counter lookup table
 * 
 * Used to convert the 5-bit length counter load value (bits 3-7 of register $4003/$4007)
 * into the actual length counter value. These values represent the duration the channel
 * will play in frame counter half-frames (~120 Hz).
 */
const LENGTH_TABLE = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
];

/**
 * Duty cycle sequences for pulse channels (flattened for performance)
 *
 * Each duty cycle is an 8-step sequence where:
 * - 0 = low/silent
 * - 1 = high/audible
 *
 * The four duty cycles are:
 * - 0: 12.5% duty (one high step out of eight)
 * - 1: 25% duty (two high steps)
 * - 2: 50% duty (four high steps)
 * - 3: 75% duty (six high steps, equivalent to negated 25%)
 *
 * Stored as a flat Uint8Array for faster single-index access.
 * Access pattern: index = (dutyCycle << 3) | dutyPosition
 */
const DUTY_TABLE_FLAT = new Uint8Array([
    // dutyCycle 0: 12.5%
    0, 0, 0, 0, 0, 0, 0, 1,
    // dutyCycle 1: 25%
    0, 0, 0, 0, 0, 0, 1, 1,
    // dutyCycle 2: 50%
    0, 0, 0, 0, 1, 1, 1, 1,
    // dutyCycle 3: 75% (negated 25%)
    1, 1, 1, 1, 1, 1, 0, 0
]);

/**
 * APU Pulse Channel
 * 
 * The NES APU has two pulse (square wave) channels that generate audio with
 * configurable duty cycles, frequency, volume envelope, and pitch sweep.
 * 
 * Each pulse channel consists of:
 * - Timer: Controls output frequency
 * - Duty cycle sequencer: 8-step pattern with 4 duty options (12.5%, 25%, 50%, 75%)
 * - Envelope unit: Controls volume over time (attack/decay)
 * - Sweep unit: Automatically adjusts pitch over time
 * - Length counter: Automatically silences the channel after a duration
 * 
 * The two channels differ only in how the sweep unit handles negate:
 * - Pulse 1 uses ones' complement
 * - Pulse 2 uses twos' complement
 * 
 * Based on NES APU specification:
 * https://www.nesdev.org/wiki/APU_Pulse
 */
export class PulseChannel {
    //#region Channel Identity
    /**
     * Channel number (1 or 2)
     * This is passed to the sweep unit to determine negate behavior
     */
    private readonly channelId!: 1 | 2; // Definite assignment assertion
    //#endregion

    //#region Duty Cycle State
    /**
     * Duty cycle selection (0-3)
     * Determines which of the four duty patterns to use
     */
    private dutyCycle: u8 = 0;

    /**
     * Current position in the duty sequence (0-7)
     * Advanced each time the timer expires
     */
    private dutyPosition: u8 = 0;
    //#endregion

    //#region Timer State
    /**
     * Timer period (11-bit, 0-2047)
     * Determines output frequency: CPU_CLOCK / (16 * (timerPeriod + 1))
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
     * Length counter halt flag (from bit 5 of control register)
     * When true, prevents length counter from decrementing
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

    /**
     * Sweep unit for automatic pitch adjustment
     */
    private sweep: SweepUnit;
    //#endregion

    /**
     * Create a new PulseChannel
     *
     * @param channelId Channel number (1 or 2) - determines sweep negate behavior
     */
    constructor(channelId: 1 | 2) {
        this.channelId = channelId;
        this.envelope = new EnvelopeUnit();
        this.sweep = new SweepUnit(channelId);
    }

    /**
     * Write to a pulse channel register
     * 
     * Register mapping (relative to channel base):
     * - 0 ($4000/$4004): DDLC.VVVV - Duty, length halt, constant volume, envelope period
     * - 1 ($4001/$4005): EPPP.NSSS - Sweep enable, period, negate, shift
     * - 2 ($4002/$4006): TTTT.TTTT - Timer low 8 bits
     * - 3 ($4003/$4007): LLLL.LTTT - Length counter load, timer high 3 bits
     * 
     * @param register Register offset (0-3)
     * @param value Value to write
     */
    public write(register: u8, value: u8): void {
        switch (register) {
            case 0:
                // $4000/$4004: DDLC.VVVV
                // Bits 7-6: Duty cycle
                this.dutyCycle = (value >> 6) & 0x03;
                
                // Bit 5: Length counter halt / envelope loop
                this.lengthCounterHalt = (value & 0x20) !== 0;
                
                // Bits 4-0: Constant volume flag and volume/envelope period
                this.envelope.setRegister(value);
                break;

            case 1:
                // $4001/$4005: EPPP.NSSS - Sweep unit configuration
                this.sweep.setRegister(value);
                break;

            case 2:
                // $4002/$4006: TTTT.TTTT - Timer low byte
                this.timerPeriod = (this.timerPeriod & 0x0700) | value;
                break;

            case 3:
                // $4003/$4007: LLLL.LTTT
                // Bits 7-3: Length counter load (5-bit index into LENGTH_TABLE)
                const lengthIndex = (value >> 3) & 0x1F;
                
                // Only load length counter if channel is enabled
                if (this.enabled) {
                    this.lengthCounter = LENGTH_TABLE[lengthIndex];
                }
                
                // Bits 2-0: Timer high 3 bits
                this.timerPeriod = (this.timerPeriod & 0x00FF) | ((value & 0x07) << 8);
                
                // Side effects: Reset duty position and restart envelope
                this.dutyPosition = 0;
                this.envelope.setStartFlag();
                break;
        }
    }

    /**
     * Clock the timer (called every APU cycle)
     * 
     * The timer counts down each APU cycle. When it reaches 0, it reloads
     * to the period value and advances the duty position.
     */
    public clockTimer(): void {
        if (this.timerCounter === 0) {
            // Timer expired: reload and advance duty position
            this.timerCounter = this.timerPeriod;
            this.dutyPosition = (this.dutyPosition + 1) & 0x07;
        } else {
            // Timer not expired: decrement
            this.timerCounter--;
        }
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
     * Clock the envelope unit (called on frame counter quarter-frames)
     * 
     * Delegates to the envelope unit's clock method.
     */
    public clockEnvelope(): void {
        this.envelope.clock();
    }

    /**
     * Clock the sweep unit (called on frame counter half-frames)
     * 
     * Delegates to the sweep unit's clock method and applies period changes.
     */
    public clockSweep(): void {
        const newPeriod = this.sweep.clock(this.timerPeriod);
        if (newPeriod !== null) {
            this.timerPeriod = newPeriod;
        }
    }

    /**
     * Get the current output sample
     * 
     * Returns a value from 0-15 representing the current audio sample.
     * 
     * The channel is muted (returns 0) when any of these conditions are true:
     * - Length counter is 0
     * - Sweep unit mutes (period < 8 or target period > $7FF)
     * - Current duty cycle position outputs 0
     * 
     * Otherwise, returns the envelope volume if duty cycle position is 1.
     * 
     * @returns Current sample value (0-15)
     */
    public output(): u8 {
        // Mute if length counter is 0
        if (this.lengthCounter === 0) {
            return 0;
        }

        // Mute if sweep unit mutes the channel
        if (this.sweep.isMuting(this.timerPeriod)) {
            return 0;
        }

        // Get current duty cycle value (0 or 1)
        // Use bit shift for fast index calculation: dutyCycle * 8 + dutyPosition
        const dutyIndex = (this.dutyCycle << 3) | this.dutyPosition;
        const dutyValue = DUTY_TABLE_FLAT[dutyIndex];
        
        // If duty is low, output 0; if high, output envelope volume
        if (dutyValue === 0) {
            return 0;
        } else {
            return this.envelope.output();
        }
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
     * A channel is considered active if its length counter is greater than 0.
     * This matches NES hardware behavior for the $4015 status register.
     *
     * @returns True if active, false otherwise
     */
    public isActive(): boolean {
        return this.lengthCounter > 0;
    }

    /**
     * Reset the channel to power-on state
     */
    public reset(): void {
        this.dutyCycle = 0;
        this.dutyPosition = 0;
        this.timerPeriod = 0;
        this.timerCounter = 0;
        this.lengthCounter = 0;
        this.lengthCounterHalt = false;
        this.enabled = false;
        this.envelope.reset();
        this.sweep.reset();
    }
}

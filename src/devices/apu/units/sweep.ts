import { u8, u16 } from "../../../utils/types.js";

/**
 * APU Sweep Unit
 * 
 * The sweep unit is used by Pulse channels to automatically adjust their
 * frequency/period over time. It can sweep the pitch up or down to create
 * portamento and vibrato effects.
 * 
 * The sweep unit is clocked by the APU Frame Counter on half-frames (every
 * ~120 Hz at NTSC timing). When clocked and enabled, it adjusts the pulse
 * channel's timer period based on the shift amount and negate flag.
 * 
 * Hardware behavior notes:
 * - The divider counts down from the period (P, bits 4-6 of sweep register)
 * - Target period = current period ± (current period >> S) where S is shift (bits 0-2)
 * - The negate flag (bit 3) determines direction: 0=increase, 1=decrease
 * - **CRITICAL**: Pulse 1 and Pulse 2 use different negate calculations:
 *   - Pulse 1: period - (period >> S) (ones' complement)
 *   - Pulse 2: period - (period >> S) - 1 (twos' complement)
 * - Channels are muted if: period < 8 OR target period > 0x7FF
 * - Enable flag (bit 7) gates actual period updates, but muting is still calculated
 * - Reload flag is set when sweep register is written, triggers reload on next clock
 * 
 * Based on NES APU specification:
 * https://www.nesdev.org/wiki/APU_Sweep
 */
export class SweepUnit {
    //#region Channel Identity
    /**
     * Channel number (1 or 2)
     * This determines the negate behavior (ones' vs twos' complement)
     */
    private readonly channel: 1 | 2;
    //#endregion

    //#region Register State
    /**
     * Enable flag (bit 7 of sweep register)
     * When false, sweep adjustments are disabled (but muting still applies)
     */
    private enabled: boolean = false;

    /**
     * Divider period (bits 4-6 of sweep register)
     * The divider counts down from this value (0-7)
     */
    private period: u8 = 0;

    /**
     * Negate flag (bit 3 of sweep register)
     * When false: increase period (sweep down in pitch)
     * When true: decrease period (sweep up in pitch)
     */
    private negate: boolean = false;

    /**
     * Shift amount (bits 0-2 of sweep register)
     * The change amount is: current_period >> shift (0-7)
     */
    private shift: u8 = 0;
    //#endregion

    //#region Sweep State
    /**
     * Reload flag - triggers divider restart on next clock
     * Set when the sweep register ($4001 or $4005) is written
     */
    private reload: boolean = false;

    /**
     * Divider counter - counts down from period
     * When it reaches 0, it reloads and the period is adjusted
     */
    private divider: u8 = 0;
    //#endregion

    /**
     * Create a new SweepUnit
     * 
     * @param channel Channel number (1 or 2) - determines negate behavior
     */
    constructor(channel: 1 | 2) {
        this.channel = channel;
    }

    /**
     * Set sweep configuration from channel sweep register
     * 
     * This should be called when the CPU writes to:
     * - $4001 (Pulse 1 sweep)
     * - $4005 (Pulse 2 sweep)
     * 
     * @param value Register value containing:
     *   - Bit 7: Enable flag
     *   - Bits 4-6: Divider period (P)
     *   - Bit 3: Negate flag
     *   - Bits 0-2: Shift amount (S)
     */
    public setRegister(value: u8): void {
        this.enabled = (value & 0x80) !== 0;
        this.period = (value >> 4) & 0x07;
        this.negate = (value & 0x08) !== 0;
        this.shift = value & 0x07;
        this.reload = true;
    }

    /**
     * Calculate the target period after applying sweep
     * 
     * This implements the hardware formula with channel-specific negate behavior:
     * - Pulse 1 (ones' complement): period - (period >> shift)
     * - Pulse 2 (twos' complement): period - (period >> shift) - 1
     * 
     * @param currentPeriod Current timer period value
     * @returns Target period (may be > 0x7FF which causes muting)
     */
    private calculateTargetPeriod(currentPeriod: u16): u16 {
        const changeAmount = currentPeriod >> this.shift;

        if (this.negate) {
            // Sweep down (decrease period = increase pitch)
            if (this.channel === 1) {
                // Pulse 1: ones' complement
                return currentPeriod - changeAmount;
            } else {
                // Pulse 2: twos' complement
                return currentPeriod - changeAmount - 1;
            }
        } else {
            // Sweep up (increase period = decrease pitch)
            return currentPeriod + changeAmount;
        }
    }

    /**
     * Check if the sweep unit is muting the channel
     * 
     * A channel is muted if:
     * 1. Current period < 8 (ultrasonic frequency prevention)
     * 2. Target period > 0x7FF (timer overflow prevention)
     * 
     * Note: Muting is calculated regardless of enable flag state
     * 
     * @param currentPeriod Current timer period value
     * @returns true if channel should be muted
     */
    public isMuting(currentPeriod: u16): boolean {
        // Mute if period too low
        if (currentPeriod < 8) {
            return true;
        }

        // Mute if target period would overflow
        const targetPeriod = this.calculateTargetPeriod(currentPeriod);
        return targetPeriod > 0x7FF;
    }

    /**
     * Clock the sweep unit (called on half-frame)
     * 
     * The sweep is clocked by the Frame Counter approximately every 120 Hz.
     * This implements the following hardware behavior:
     * 
     * 1. Clock the divider:
     *    - If divider is 0 AND sweep is enabled AND shift > 0 AND target is valid:
     *      - Update the channel's period to the target period
     *      - Reload divider to period (P)
     *    - Otherwise if divider > 0:
     *      - Decrement divider
     *    - Otherwise (divider is 0 but conditions not met):
     *      - Do nothing (divider stays at 0)
     * 
     * 2. If reload flag is set:
     *    - Reload divider to period (P)
     *    - Clear reload flag
     * 
     * @param currentPeriod Current timer period value
     * @returns New period if updated, or null if no change
     */
    public clock(currentPeriod: u16): u16 | null {
        let newPeriod: u16 | null = null;

        // Clock the divider
        if (this.divider === 0 && this.enabled && this.shift > 0 && !this.isMuting(currentPeriod)) {
            // All conditions met: adjust period and reload divider
            newPeriod = this.calculateTargetPeriod(currentPeriod);
            this.divider = this.period;
        } else if (this.divider > 0) {
            // Divider not zero: decrement it
            this.divider--;
        }
        // If divider is 0 but conditions not met: do nothing (stays at 0)

        // Handle reload flag from register write
        if (this.reload) {
            this.divider = this.period;
            this.reload = false;
        }

        return newPeriod;
    }

    /**
     * Reset sweep unit to power-on state
     * 
     * Initializes all state to default values. This is called during
     * APU reset/power-on.
     */
    public reset(): void {
        this.enabled = false;
        this.period = 0;
        this.negate = false;
        this.shift = 0;
        this.reload = false;
        this.divider = 0;
    }
}

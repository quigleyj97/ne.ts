import { u8 } from "../../../utils/types.js";

/**
 * APU Envelope Unit
 * 
 * The envelope unit is a shared component used by the Pulse and Noise channels
 * to control volume over time. It can operate in two modes:
 * 
 * 1. **Constant Volume Mode**: Outputs a fixed volume value (V)
 * 2. **Envelope Decay Mode**: Starts at volume 15 and decays to 0 over time
 * 
 * The envelope is clocked by the APU Frame Counter on quarter-frames (every
 * 240 Hz at NTSC timing). When clocked, a divider counts down from the period
 * value (V). When the divider reaches 0, it reloads and the decay level counter
 * decrements by 1.
 * 
 * Hardware behavior notes:
 * - The decay level counter ranges from 0-15
 * - The loop flag (L) causes the counter to wrap from 0 to 15
 * - The start flag triggers an immediate reload on the next clock
 * - Writing to the channel's length counter register sets the start flag
 * 
 * Based on NES APU specification:
 * https://www.nesdev.org/wiki/APU_Envelope
 */
export class EnvelopeUnit {
    //#region Register State
    /** 
     * Constant volume flag (bit 4 of control register)
     * When true, outputs volume directly. When false, uses envelope decay.
     */
    private constantVolume: boolean = false;
    
    /** 
     * Volume/envelope period value (bits 0-3 of control register)
     * In constant volume mode: this is the output volume (0-15)
     * In envelope mode: this is the divider period (V)
     */
    private volume: u8 = 0;
    
    /** 
     * Loop flag (bit 5 of control register)
     * When true, decay level wraps from 0 to 15.
     * When false, decay level stays at 0.
     */
    private loop: boolean = false;
    //#endregion
    
    //#region Envelope State
    /** 
     * Start flag - triggers envelope restart on next clock
     * Set when the channel's 4th register ($4003/$4007/$400F) is written
     */
    private start: boolean = false;
    
    /** 
     * Divider counter - counts down from period (V)
     * When it reaches 0, it reloads and the decay level decrements
     */
    private divider: u8 = 0;
    
    /** 
     * Decay level counter (0-15)
     * This is the current envelope volume in envelope mode
     * Starts at 15 and decrements each time divider reaches 0
     */
    private decayLevel: u8 = 0;
    //#endregion
    
    /**
     * Set envelope configuration from channel control register
     * 
     * This should be called when the CPU writes to:
     * - $4000 (Pulse 1 control)
     * - $4004 (Pulse 2 control)  
     * - $400C (Noise control)
     * 
     * @param value Register value containing:
     *   - Bit 5: Loop flag (L)
     *   - Bit 4: Constant volume flag
     *   - Bits 0-3: Volume/envelope period (V)
     */
    public setRegister(value: u8): void {
        this.loop = (value & 0x20) !== 0;
        this.constantVolume = (value & 0x10) !== 0;
        this.volume = value & 0x0F;
    }
    
    /**
     * Set the start flag to trigger envelope restart
     * 
     * This should be called when the CPU writes to the channel's 4th register:
     * - $4003 (Pulse 1 length counter/timer high)
     * - $4007 (Pulse 2 length counter/timer high)
     * - $400F (Noise length counter)
     * 
     * On the next clock(), the envelope will restart with decay level = 15
     * and divider = period.
     */
    public setStartFlag(): void {
        this.start = true;
    }
    
    /**
     * Clock the envelope unit (called on quarter-frame)
     * 
     * The envelope is clocked by the Frame Counter approximately every 240 Hz.
     * This implements the following hardware behavior:
     * 
     * 1. If start flag is set:
     *    - Reset decay level to 15
     *    - Reset divider to period (V)
     *    - Clear start flag
     * 2. Otherwise:
     *    - Decrement divider
     *    - If divider reaches 0:
     *      - Reload divider to period (V)
     *      - If decay level > 0: decrement it
     *      - If decay level = 0 and loop flag set: reload to 15
     */
    public clock(): void {
        if (this.start) {
            // Start flag set: restart the envelope
            this.start = false;
            this.decayLevel = 15;
            this.divider = this.volume;
        } else {
            // Normal operation: clock the divider
            if (this.divider > 0) {
                this.divider--;
            } else {
                // Divider reached 0: reload and clock decay level
                this.divider = this.volume;
                
                if (this.decayLevel > 0) {
                    this.decayLevel--;
                } else if (this.loop) {
                    // Loop flag set: wrap decay level back to 15
                    this.decayLevel = 15;
                }
            }
        }
    }
    
    /**
     * Get the current envelope output (0-15)
     * 
     * Returns the current volume level based on the mode:
     * - Constant volume mode: returns the volume value (V) directly
     * - Envelope mode: returns the current decay level (0-15)
     * 
     * @returns Volume level from 0 (silent) to 15 (maximum)
     */
    public output(): u8 {
        if (this.constantVolume) {
            // Constant volume mode: return V directly
            return this.volume;
        } else {
            // Envelope mode: return current decay level
            return this.decayLevel;
        }
    }
    
    /**
     * Reset envelope unit to power-on state
     * 
     * Initializes all state to default values. This is called during
     * APU reset/power-on.
     */
    public reset(): void {
        this.constantVolume = false;
        this.volume = 0;
        this.loop = false;
        this.start = false;
        this.divider = 0;
        this.decayLevel = 0;
    }
}

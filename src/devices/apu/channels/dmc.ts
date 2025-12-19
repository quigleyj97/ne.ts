import { u8, u16 } from "../../../utils/types.js";

/**
 * DMC rate lookup table (NTSC values)
 * 
 * The DMC timer uses a 4-bit index (bits 0-3 of $4010) to select the timer period
 * from this table. These are the number of CPU cycles between timer ticks.
 * 
 * Lower indices produce higher-pitched samples, higher indices produce lower-pitched samples.
 * These rates correspond to sample rates from ~4.2 kHz to ~33.1 kHz.
 */
const DMC_RATE_TABLE: readonly number[] = [
    428, 380, 340, 320, 286, 254, 226, 214,
    190, 160, 142, 128, 106, 84, 72, 54
];

/**
 * APU DMC (Delta Modulation Channel)
 * 
 * The NES APU DMC Channel plays back 1-bit delta-encoded samples from CPU memory.
 * It's used for playing drum samples and digitized speech/sound effects.
 * 
 * The DMC channel consists of:
 * - Timer: Controls sample playback rate
 * - Sample buffer: 8-bit buffer holding the current byte from memory
 * - Output unit: 7-bit DAC (0-127) that increments/decrements based on sample bits
 * - Memory reader: Reads bytes from CPU memory via DMA
 * - IRQ: Optional interrupt when sample completes
 * 
 * Key characteristics:
 * - Samples are stored in CPU memory ($8000-$FFFF range)
 * - Each byte contains 8 delta bits processed LSB-first
 * - Delta bits: 0 = decrement output by 2, 1 = increment output by 2
 * - Output saturates at 0 and 127 (doesn't wrap around)
 * - DMA steals CPU cycles during sample reading (handled externally)
 * - Can loop samples indefinitely
 * - Can trigger IRQ when sample completes (if IRQ enabled and not looping)
 * 
 * Based on NES APU specification:
 * https://www.nesdev.org/wiki/APU_DMC
 */
export class DmcChannel {
    //#region Register State
    /**
     * IRQ enabled flag (bit 7 of $4010)
     * When true and sample ends without looping, sets IRQ flag
     */
    private irqEnabled: boolean = false;

    /**
     * Loop enabled flag (bit 6 of $4010)
     * When true, sample restarts automatically when it completes
     */
    private loopEnabled: boolean = false;

    /**
     * Rate index (bits 0-3 of $4010)
     * Selects timer period from DMC_RATE_TABLE
     */
    private rateIndex: u8 = 0;
    //#endregion

    //#region Sample Parameters
    /**
     * Sample starting address (calculated from $4012)
     * Formula: $C000 + (register value * 64)
     * Valid range: $C000-$FFC0
     */
    private sampleAddress: u16 = 0xC000;

    /**
     * Sample length in bytes (calculated from $4013)
     * Formula: (register value * 16) + 1
     * Valid range: 1-4081 bytes
     */
    private sampleLength: u16 = 1;
    //#endregion

    //#region Playback State
    /**
     * Current read address during sample playback
     * Increments after each byte read, wraps from $FFFF to $8000
     */
    private currentAddress: u16 = 0xC000;

    /**
     * Bytes remaining in current sample
     * Decrements after each byte read, triggers sample end when reaching 0
     */
    private bytesRemaining: u16 = 0;

    /**
     * Sample buffer holding the current byte from memory
     * Bits are shifted out LSB-first
     */
    private sampleBuffer: u8 = 0;

    /**
     * Bits remaining in the sample buffer (0-8)
     * When 0, a new byte needs to be fetched (if available)
     */
    private bitsRemaining: number = 0;

    /**
     * Silence flag
     * True when sample buffer is empty and no new byte is available
     * When true, output level doesn't change
     */
    private silenceFlag: boolean = true;
    //#endregion

    //#region Output State
    /**
     * Output level (7-bit DAC, 0-127)
     * Modified by delta bits in the sample data
     * Saturates at min (0) and max (127) without wrapping
     */
    private outputLevel: u8 = 0;
    //#endregion

    //#region Timer State
    /**
     * Timer counter (internal countdown)
     * Counts down each APU cycle, reloads from timerPeriod when it reaches 0
     */
    private timer: number = 0;

    /**
     * Timer period (from DMC_RATE_TABLE)
     * Determines playback rate in CPU cycles per sample bit
     */
    private timerPeriod: number = DMC_RATE_TABLE[0];
    //#endregion

    //#region IRQ State
    /**
     * IRQ pending flag
     * Set when sample completes with IRQ enabled and loop disabled
     * Cleared when IRQ is disabled or read via status register
     */
    private irqFlag: boolean = false;
    //#endregion

    /**
     * Write to control register ($4010)
     * Format: IL-- RRRR
     * - Bit 7 (I): IRQ enabled
     * - Bit 6 (L): Loop enabled
     * - Bits 3-0 (R): Rate index
     * 
     * Side effect: If IRQ is disabled, clears the IRQ flag
     * 
     * @param value Value to write
     */
    public writeControl(value: u8): void {
        this.irqEnabled = (value & 0x80) !== 0;
        this.loopEnabled = (value & 0x40) !== 0;
        this.rateIndex = (value & 0x0F) as u8;
        this.timerPeriod = DMC_RATE_TABLE[this.rateIndex];
        
        // Clear IRQ flag if IRQ disabled
        if (!this.irqEnabled) {
            this.irqFlag = false;
        }
    }

    /**
     * Write to direct load register ($4011)
     * Format: -DDD DDDD
     * - Bits 6-0 (D): Direct load value (7-bit)
     * 
     * Directly sets the output level without affecting the sample playback.
     * This can be used to set an initial DC offset or create simple PCM playback
     * by rapidly writing to this register.
     * 
     * @param value Value to write
     */
    public writeDirectLoad(value: u8): void {
        this.outputLevel = (value & 0x7F) as u8;
    }

    /**
     * Write to sample address register ($4012)
     * Format: AAAA AAAA
     * 
     * Sets the starting address for sample playback.
     * Formula: $C000 + (value * 64)
     * 
     * This only affects the next sample start, not current playback.
     * 
     * @param value Value to write
     */
    public writeSampleAddress(value: u8): void {
        // Formula: $C000 + (value * 64)
        this.sampleAddress = (0xC000 + (value * 64)) as u16;
    }

    /**
     * Write to sample length register ($4013)
     * Format: LLLL LLLL
     * 
     * Sets the length of the sample in bytes.
     * Formula: (value * 16) + 1
     * 
     * This only affects the next sample start, not current playback.
     * 
     * @param value Value to write
     */
    public writeSampleLength(value: u8): void {
        // Formula: (value * 16) + 1
        this.sampleLength = ((value * 16) + 1) as u16;
    }

    /**
     * Clock the DMC channel (called every APU cycle)
     * 
     * The timer counts down each APU cycle. When it reaches 0:
     * 1. Reload timer from period
     * 2. If not silenced, process the current delta bit:
     *    - Bit 0: Decrement output by 2 (saturating at 0)
     *    - Bit 1: Increment output by 2 (saturating at 127)
     * 3. Shift sample buffer right to prepare next bit
     * 4. Decrement bits remaining
     * 5. When bits reach 0, mark buffer empty (silence flag)
     */
    public clock(): void {
        // Decrement timer
        if (this.timer > 0) {
            this.timer--;
        }

        if (this.timer === 0) {
            this.timer = this.timerPeriod;

            if (!this.silenceFlag) {
                // Process delta bit (LSB of sample buffer)
                const deltaBit = this.sampleBuffer & 1;
                if (deltaBit === 1) {
                    // Increment (saturate at 126/127)
                    if (this.outputLevel <= 125) {
                        this.outputLevel = (this.outputLevel + 2) as u8;
                    }
                } else {
                    // Decrement (saturate at 0/1)
                    if (this.outputLevel >= 2) {
                        this.outputLevel = (this.outputLevel - 2) as u8;
                    }
                }

                // Shift to next bit
                this.sampleBuffer = (this.sampleBuffer >> 1) as u8;
            }

            // Decrement bit counter
            this.bitsRemaining--;
            if (this.bitsRemaining <= 0) {
                this.bitsRemaining = 8;
                this.silenceFlag = true; // Will be cleared when new byte loaded
            }
        }
    }

    /**
     * Check if a DMA read is needed
     * 
     * The DMC needs to read a byte from CPU memory when:
     * - The sample buffer is empty (silence flag is set)
     * - There are bytes remaining in the sample
     * 
     * This method is called by the APU to determine if a DMA cycle should occur.
     * The actual memory read is handled externally, with the result passed to
     * loadSampleByte().
     * 
     * @returns The address to read from, or null if no read is needed
     */
    public getDmaRequest(): u16 | null {
        if (this.silenceFlag && this.bytesRemaining > 0) {
            return this.currentAddress;
        }
        return null;
    }

    /**
     * Load a sample byte from DMA
     * 
     * Called when a byte has been read from CPU memory via DMA.
     * This method:
     * 1. Loads the byte into the sample buffer
     * 2. Clears the silence flag
     * 3. Resets bits remaining to 8
     * 4. Advances the read address (with wraparound from $FFFF to $8000)
     * 5. Decrements bytes remaining
     * 6. Handles sample completion (loop or IRQ)
     * 
     * @param byte The byte read from CPU memory
     */
    public loadSampleByte(byte: u8): void {
        this.sampleBuffer = byte;
        this.silenceFlag = false;
        this.bitsRemaining = 8;

        // Advance address with wraparound
        // DMC wraps from $FFFF to $8000, not to $0000
        if (this.currentAddress === 0xFFFF) {
            this.currentAddress = 0x8000 as u16;
        } else {
            this.currentAddress = (this.currentAddress + 1) as u16;
        }

        // Decrement bytes remaining
        this.bytesRemaining--;

        // Handle sample completion
        if (this.bytesRemaining === 0) {
            if (this.loopEnabled) {
                // Restart sample
                this.currentAddress = this.sampleAddress;
                this.bytesRemaining = this.sampleLength;
            } else if (this.irqEnabled) {
                // Set IRQ flag
                this.irqFlag = true;
            }
        }
    }

    /**
     * Get the current output sample
     * 
     * Returns the current 7-bit DAC output level (0-127).
     * 
     * Unlike other APU channels, the DMC output is not affected by
     * any enable flags or counters - it always outputs the current level.
     * 
     * @returns Current output level (0-127)
     */
    public output(): u8 {
        return this.outputLevel;
    }

    /**
     * Start sample playback
     *
     * Called when the DMC channel is enabled via $4015.
     * If no sample is currently playing (bytes remaining = 0),
     * this starts playback of the configured sample.
     *
     * If a sample is already playing, this has no effect.
     */
    public start(): void {
        if (this.bytesRemaining === 0) {
            this.currentAddress = this.sampleAddress;
            this.bytesRemaining = this.sampleLength;
        }
    }

    /**
     * Stop sample playback
     *
     * Called when the DMC channel is disabled via $4015 bit 4.
     * Clears the bytes remaining counter, stopping playback.
     */
    public stop(): void {
        this.bytesRemaining = 0;
    }

    /**
     * Check if the channel is active
     * 
     * The DMC channel is considered active if it has bytes remaining to play.
     * This is used by the status register ($4015) to report channel state.
     * 
     * @returns True if sample is playing, false otherwise
     */
    public isActive(): boolean {
        return this.bytesRemaining > 0;
    }

    /**
     * Clear the IRQ flag
     * 
     * Called when the status register ($4015) is read.
     * Reading the status register acknowledges and clears any pending DMC IRQ.
     */
    public clearIrq(): void {
        this.irqFlag = false;
    }

    /**
     * Get the IRQ flag state
     * 
     * Used by the APU to determine if a DMC IRQ should be signaled to the CPU.
     * The DMC IRQ is edge-triggered and must be cleared by reading $4015.
     * 
     * @returns True if IRQ is pending, false otherwise
     */
    public getIrqFlag(): boolean {
        return this.irqFlag;
    }

    /**
     * Reset the channel to power-on state
     * 
     * Clears all state but preserves the configuration registers
     * (sample address, sample length, rate, loop, IRQ enable).
     * This matches the behavior of the real NES hardware.
     */
    public reset(): void {
        // Clear timer state
        this.timer = 0;
        this.timerPeriod = DMC_RATE_TABLE[0];
        
        // Clear playback state
        this.currentAddress = 0xC000 as u16;
        this.bytesRemaining = 0;
        this.sampleBuffer = 0;
        this.bitsRemaining = 0;
        this.silenceFlag = true;
        
        // Clear output
        this.outputLevel = 0;
        
        // Clear IRQ
        this.irqFlag = false;
        
        // Reset register state to defaults
        this.irqEnabled = false;
        this.loopEnabled = false;
        this.rateIndex = 0;
        this.sampleAddress = 0xC000 as u16;
        this.sampleLength = 1;
    }
}

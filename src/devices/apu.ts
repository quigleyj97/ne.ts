import { IBusDevice, DummyBusDevice, u8, u16 } from "../utils/index.js";
import { PulseChannel } from "./apu/channels/pulse.js";
import { TriangleChannel } from "./apu/channels/triangle.js";
import { NoiseChannel } from "./apu/channels/noise.js";
import { DmcChannel } from "./apu/channels/dmc.js";
import { FrameCounter } from "./apu/units/frame-counter.js";
import { ApuMixer } from "./apu/audio/mixer.js";
import { Resampler } from "./apu/audio/resampler.js";

//#region APU Register Address Constants

// Pulse 1 channel registers
/**
 * Pulse 1 duty cycle, envelope, and volume control register
 * @address $4000
 * - Bits 7-6: Duty cycle (0-3)
 * - Bit 5: Length counter halt / envelope loop flag
 * - Bit 4: Constant volume flag (0=envelope, 1=constant)
 * - Bits 3-0: Volume / envelope period
 */
export const APU_PULSE1_CTRL = 0x4000;

/**
 * Pulse 1 sweep unit control register
 * @address $4001
 * - Bit 7: Sweep enabled flag
 * - Bits 6-4: Sweep period (divider period)
 * - Bit 3: Sweep negate flag (0=add, 1=subtract)
 * - Bits 2-0: Sweep shift count
 */
export const APU_PULSE1_SWEEP = 0x4001;

/**
 * Pulse 1 timer low byte register
 * @address $4002
 * - Bits 7-0: Timer low 8 bits
 */
export const APU_PULSE1_TIMER_LO = 0x4002;

/**
 * Pulse 1 length counter and timer high byte register
 * @address $4003
 * - Bits 7-3: Length counter load value (index into length table)
 * - Bits 2-0: Timer high 3 bits
 */
export const APU_PULSE1_LENGTH = 0x4003;

// Pulse 2 channel registers
/**
 * Pulse 2 duty cycle, envelope, and volume control register
 * @address $4004
 * - Bits 7-6: Duty cycle (0-3)
 * - Bit 5: Length counter halt / envelope loop flag
 * - Bit 4: Constant volume flag (0=envelope, 1=constant)
 * - Bits 3-0: Volume / envelope period
 */
export const APU_PULSE2_CTRL = 0x4004;

/**
 * Pulse 2 sweep unit control register
 * @address $4005
 * - Bit 7: Sweep enabled flag
 * - Bits 6-4: Sweep period (divider period)
 * - Bit 3: Sweep negate flag (0=add, 1=subtract)
 * - Bits 2-0: Sweep shift count
 */
export const APU_PULSE2_SWEEP = 0x4005;

/**
 * Pulse 2 timer low byte register
 * @address $4006
 * - Bits 7-0: Timer low 8 bits
 */
export const APU_PULSE2_TIMER_LO = 0x4006;

/**
 * Pulse 2 length counter and timer high byte register
 * @address $4007
 * - Bits 7-3: Length counter load value (index into length table)
 * - Bits 2-0: Timer high 3 bits
 */
export const APU_PULSE2_LENGTH = 0x4007;

// Triangle channel registers
/**
 * Triangle channel linear counter control register
 * @address $4008
 * - Bit 7: Length counter halt / linear counter control flag
 * - Bits 6-0: Linear counter load value
 */
export const APU_TRIANGLE_CTRL = 0x4008;

/**
 * Triangle channel unused register
 * @address $4009
 * - Not used by the APU hardware
 */
export const APU_TRIANGLE_UNUSED = 0x4009;

/**
 * Triangle channel timer low byte register
 * @address $400A
 * - Bits 7-0: Timer low 8 bits
 */
export const APU_TRIANGLE_TIMER_LO = 0x400A;

/**
 * Triangle channel length counter and timer high byte register
 * @address $400B
 * - Bits 7-3: Length counter load value (index into length table)
 * - Bits 2-0: Timer high 3 bits
 */
export const APU_TRIANGLE_LENGTH = 0x400B;

// Noise channel registers
/**
 * Noise channel envelope and volume control register
 * @address $400C
 * - Bits 7-6: Unused
 * - Bit 5: Length counter halt / envelope loop flag
 * - Bit 4: Constant volume flag (0=envelope, 1=constant)
 * - Bits 3-0: Volume / envelope period
 */
export const APU_NOISE_CTRL = 0x400C;

/**
 * Noise channel unused register
 * @address $400D
 * - Not used by the APU hardware
 */
export const APU_NOISE_UNUSED = 0x400D;

/**
 * Noise channel period and mode register
 * @address $400E
 * - Bit 7: Mode flag (0=periodic noise, 1=random noise)
 * - Bits 6-4: Unused
 * - Bits 3-0: Noise period (index into period table)
 */
export const APU_NOISE_PERIOD = 0x400E;

/**
 * Noise channel length counter register
 * @address $400F
 * - Bits 7-3: Length counter load value (index into length table)
 * - Bits 2-0: Unused
 */
export const APU_NOISE_LENGTH = 0x400F;

// DMC channel registers
/**
 * DMC channel control register
 * @address $4010
 * - Bit 7: IRQ enabled flag
 * - Bit 6: Loop flag
 * - Bits 5-4: Unused
 * - Bits 3-0: Frequency index (into rate table)
 */
export const APU_DMC_CTRL = 0x4010;

/**
 * DMC channel direct load register
 * @address $4011
 * - Bit 7: Unused
 * - Bits 6-0: Direct load value for DAC
 */
export const APU_DMC_DIRECT = 0x4011;

/**
 * DMC channel sample address register
 * @address $4012
 * - Bits 7-0: Sample address = %11AAAAAA.AA000000
 */
export const APU_DMC_ADDR = 0x4012;

/**
 * DMC channel sample length register
 * @address $4013
 * - Bits 7-0: Sample length = %LLLL.LLLL0001
 */
export const APU_DMC_LENGTH = 0x4013;

// Control registers
/**
 * APU status register (read/write)
 * @address $4015
 *
 * Write:
 * - Bit 4: Enable DMC channel
 * - Bit 3: Enable Noise channel
 * - Bit 2: Enable Triangle channel
 * - Bit 1: Enable Pulse 2 channel
 * - Bit 0: Enable Pulse 1 channel
 *
 * Read:
 * - Bit 7: DMC interrupt flag
 * - Bit 6: Frame interrupt flag
 * - Bit 4: DMC active (bytes remaining > 0)
 * - Bit 3: Noise length counter > 0
 * - Bit 2: Triangle length counter > 0
 * - Bit 1: Pulse 2 length counter > 0
 * - Bit 0: Pulse 1 length counter > 0
 */
export const APU_STATUS = 0x4015;

/**
 * APU frame counter control register
 * @address $4017
 * - Bit 7: Sequencer mode (0=4-step, 1=5-step)
 * - Bit 6: IRQ inhibit flag (1=disable frame IRQ)
 * - Bits 5-0: Unused
 */
export const APU_FRAME_COUNTER = 0x4017;

// Address range for bus mapping
export const APU_START_ADDR = 0x4000;
export const APU_END_ADDR = 0x4017;
export const APU_MASK = 0xFFFF;
//#endregion

//#region Magic constants
const SAMPLE_RATE = 44_100; // 44.1 khz
//#endregion

/** The Audio Processing Unit for the NES.
 * 
 * This is a cycle-accurate implementation of the 2A03 APU that integrates with
 * the CPU memory bus. The APU handles audio generation through five channels:
 * two pulse waves, one triangle wave, one noise channel, and one DMC channel.
 * 
 * This implementation follows a phased approach:
 * - Phase 1A: Foundation & Bus Integration (this phase)
 * - Later phases: Channel implementations, frame counter, audio output
 */
export class Apu2A03 implements IBusDevice {
    /** Attempt to create an APU, but return a mock if the environment does not
     * support the WebAudio API
     */
    public static build() {
        try {
            return new Apu2A03();
        } catch (err) {
            console.log(err);
            console.warn("This environment does not support WebAudio, using mock APU");
            return new DummyApu();
        }
    }

    //#region Register Storage
    // Internal storage for all APU registers ($4000-$4017)
    // Index 0 = $4000, Index 1 = $4001, ..., Index 23 = $4017
    private registers: Uint8Array;
    //#endregion

    //#region Channel State
    /** Pulse 1 channel */
    private pulse1: PulseChannel;
    
    /** Pulse 2 channel */
    private pulse2: PulseChannel;
    
    /** Triangle channel */
    private triangle: TriangleChannel;
    
    /** Noise channel */
    private noise: NoiseChannel;
    
    /** DMC channel */
    private dmc: DmcChannel;
    //#endregion

    //#region Frame Counter
    /** Frame counter for timing APU events */
    private frameCounter: FrameCounter;
    
    /** CPU cycle counter for frame counter synchronization */
    private cpuCycle: number = 0;
    //#endregion

    //#region Audio Mixing
    /** Audio mixer for combining channel outputs */
    private mixer: ApuMixer;
    
    /** Current mixed audio sample (-1.0 to +1.0) */
    public currentSample: number = 0;
    //#endregion

    //#region Audio Context (Legacy - Will be replaced)
    /** The main WebAudio context */
    private ctx: AudioContext | null = null;
    /** The first square wave voice (legacy WebAudio, will be removed) */
    private legacyPulse1: OscillatorNode | null = null;
    /** The second square wave voice (legacy WebAudio, will be removed) */
    private legacyPulse2: OscillatorNode | null = null;
    /** The triangle wave voice */
    private tri: OscillatorNode | null = null;
    /** A gain node for global volume control */
    private out: GainNode | null = null;
    //#endregion

    protected constructor() {
        // Initialize all channels
        this.pulse1 = new PulseChannel(1);
        this.pulse2 = new PulseChannel(2);
        this.triangle = new TriangleChannel();
        this.noise = new NoiseChannel();
        this.dmc = new DmcChannel();
        
        // Initialize frame counter
        this.frameCounter = new FrameCounter();
        
        // Initialize audio mixer
        this.mixer = new ApuMixer();
        
        // Initialize register storage
        this.registers = new Uint8Array(24);
        
        // Try to initialize WebAudio for future use
        // This is legacy and will be replaced with proper sample generation
        try {
            this.ctx = new AudioContext({
                latencyHint: "interactive",
                sampleRate: SAMPLE_RATE
            });
            this.out = this.ctx.createGain();
            this.out.gain.setValueAtTime(0, 1); // default volume is 0 (muted)
            this.out.connect(this.ctx.destination);

            this.legacyPulse1 = this.ctx.createOscillator();
            this.legacyPulse1.type = "square";
            this.legacyPulse1.connect(this.out);
            this.legacyPulse2 = this.ctx.createOscillator();
            this.legacyPulse2.type = "square";
            this.legacyPulse2.connect(this.out);

            this.tri = this.ctx.createOscillator();
            this.tri.type = "triangle";
            this.tri.connect(this.out);
        } catch (e) {
            // WebAudio not available, continue without it
        }

        // Initialize to power-on state
        this.reset();
    }

    /** Read from APU register
     *
     * Only $4015 (status register) is readable.
     * For write-only registers, returns the last written value to approximate open bus behavior.
     */
    public read(addr: u16): u8 {
        const offset = addr - APU_START_ADDR;
        
        // Only $4015 (offset 0x15) is readable
        if (offset === 0x15) {
            return this.readStatus();
        }
        
        // For write-only registers, return the last written value
        // This approximates open bus behavior without needing the Bus to pass the value
        if (offset >= 0 && offset < this.registers.length) {
            return this.registers[offset];
        }

        console.warn("Unhandled read() in APU, results may be incorrect");
        return 0;
    }

    /** Write to APU register
     * 
     * Routes writes to appropriate channel handlers based on address.
     */
    public write(addr: u16, value: u8): void {
        const offset = addr - APU_START_ADDR;
        
        // Store the value in register array
        if (offset >= 0 && offset < this.registers.length) {
            this.registers[offset] = value;
        }

        // Route to appropriate handler based on address
        if (offset >= 0x00 && offset <= 0x03) {
            // Pulse 1 registers
            this.writePulse1(offset, value);
        } else if (offset >= 0x04 && offset <= 0x07) {
            // Pulse 2 registers
            this.writePulse2(offset - 0x04, value);
        } else if (offset >= 0x08 && offset <= 0x0B) {
            // Triangle registers
            this.writeTriangle(offset - 0x08, value);
        } else if (offset >= 0x0C && offset <= 0x0F) {
            // Noise registers
            this.writeNoise(offset - 0x0C, value);
        } else if (offset >= 0x10 && offset <= 0x13) {
            // DMC registers
            this.writeDmc(offset - 0x10, value);
        } else if (offset === 0x15) {
            // Status register
            this.writeStatus(value);
        } else if (offset === 0x17) {
            // Frame counter
            this.writeFrameCounter(value);
        }
    }

    /** Clock the APU by one CPU cycle
     *
     * The APU is clocked once per CPU cycle. This handles:
     * - Frame counter events (quarter-frame, half-frame, IRQ)
     * - Channel timer clocking
     * - Envelope/sweep/length counter updates
     * - Audio mixing
     */
    public clock(): void {
        // Clock frame counter and get events
        const events = this.frameCounter.clock(this.cpuCycle);
        
        // Process quarter-frame events (envelopes and linear counter)
        if (events.quarterFrame) {
            this.pulse1.clockEnvelope();
            this.pulse2.clockEnvelope();
            this.triangle.clockLinearCounter();
            this.noise.clockEnvelope();
        }
        
        // Process half-frame events (length counters and sweep units)
        if (events.halfFrame) {
            this.pulse1.clockLengthCounter();
            this.pulse1.clockSweep();
            this.pulse2.clockLengthCounter();
            this.pulse2.clockSweep();
            this.triangle.clockLengthCounter();
            this.noise.clockLengthCounter();
        }
        
        // Clock all channel timers (happens every APU cycle)
        this.pulse1.clockTimer();
        this.pulse2.clockTimer();
        this.triangle.clock();
        this.noise.clockTimer();
        this.dmc.clock();
        
        // Mix audio channels into a single sample
        this.currentSample = this.mixer.mix(
            this.pulse1.output(),
            this.pulse2.output(),
            this.triangle.output(),
            this.noise.getOutput(),
            this.dmc.output()
        );
        
        // Increment CPU cycle counter
        this.cpuCycle++;
    }

    /** Reset APU to power-on state
     *
     * Initializes all registers and state to their power-on values.
     */
    public reset(): void {
        // Clear all registers
        this.registers.fill(0);
        
        // Reset all channels
        this.pulse1.reset();
        this.pulse2.reset();
        this.triangle.reset();
        this.noise.reset();
        this.dmc.reset();
        
        // Reset frame counter
        this.frameCounter.reset();
        
        // Reset CPU cycle counter
        this.cpuCycle = 0;
        
        // Write to status register to silence all channels
        this.writeStatus(0);
        
        // Write to frame counter to initialize it
        // Mode 0 (4-step), IRQ enabled
        this.writeFrameCounter(0);
    }

    //#region Status Register ($4015) Implementation
    
    /** Read status register ($4015)
     *
     * Returns channel length counter status in bits 0-4 and interrupt flags in bits 6-7.
     * Reading this register clears the frame interrupt flag.
     */
    private readStatus(): u8 {
        let status = 0;
        
        // Bit 0: Pulse 1 length counter > 0
        if (this.pulse1.isActive()) {
            status |= 0x01;
        }
        
        // Bit 1: Pulse 2 length counter > 0
        if (this.pulse2.isActive()) {
            status |= 0x02;
        }
        
        // Bit 2: Triangle length counter > 0
        if (this.triangle.isEnabled()) {
            status |= 0x04;
        }
        
        // Bit 3: Noise length counter > 0
        if (this.noise.isActive()) {
            status |= 0x08;
        }
        
        // Bit 4: DMC bytes remaining > 0
        if (this.dmc.isActive()) {
            status |= 0x10;
        }
        
        // Bit 6: Frame interrupt flag
        if (this.frameCounter.isIrqPending()) {
            status |= 0x40;
        }
        
        // Bit 7: DMC interrupt flag
        if (this.dmc.getIrqFlag()) {
            status |= 0x80;
        }
        
        // Reading status clears the frame interrupt flag
        this.frameCounter.clearIrqFlag();
        
        return status;
    }

    /** Write status register ($4015)
     *
     * Enables/disables channels via bits 0-4.
     * Writing to this register clears the DMC interrupt flag.
     */
    private writeStatus(value: u8): void {
        // Bit 0: Enable/disable Pulse 1
        this.pulse1.setEnabled((value & 0x01) !== 0);
        
        // Bit 1: Enable/disable Pulse 2
        this.pulse2.setEnabled((value & 0x02) !== 0);
        
        // Bit 2: Enable/disable Triangle
        this.triangle.setEnabled((value & 0x04) !== 0);
        
        // Bit 3: Enable/disable Noise
        this.noise.setEnabled((value & 0x08) !== 0);
        
        // Bit 4: Enable/disable DMC
        if ((value & 0x10) === 0) {
            // Disabling DMC stops playback and clears bytes remaining
            this.dmc.stop();
        } else {
            // If enabling DMC and bytes remaining is 0, restart sample
            this.dmc.start();
        }
        
        // Writing to status clears the DMC interrupt flag
        this.dmc.clearIrq();
    }
    
    //#endregion

    //#region Channel Write Handlers (Stubs)
    
    /** Write to Pulse 1 channel register
     *
     * @param offset - Register offset within channel (0-3)
     * @param value - Value to write
     */
    private writePulse1(offset: u8, value: u8): void {
        this.pulse1.write(offset, value);
    }

    /** Write to Pulse 2 channel register
     *
     * @param offset - Register offset within channel (0-3)
     * @param value - Value to write
     */
    private writePulse2(offset: u8, value: u8): void {
        this.pulse2.write(offset, value);
    }

    /** Write to Triangle channel register
     *
     * @param offset - Register offset within channel (0-3)
     * @param value - Value to write
     */
    private writeTriangle(offset: u8, value: u8): void {
        switch (offset) {
            case 0: // $4008: Control
                this.triangle.writeControl(value);
                break;
            case 1: // $4009: Unused
                break;
            case 2: // $400A: Timer low
                this.triangle.writeTimerLow(value);
                break;
            case 3: // $400B: Length/Timer high
                this.triangle.writeTimerHigh(value);
                break;
        }
    }

    /** Write to Noise channel register
     *
     * @param offset - Register offset within channel (0-3)
     * @param value - Value to write
     */
    private writeNoise(offset: u8, value: u8): void {
        this.noise.write(offset, value);
    }

    /** Write to DMC channel register
     *
     * @param offset - Register offset within channel (0-3)
     * @param value - Value to write
     */
    private writeDmc(offset: u8, value: u8): void {
        switch (offset) {
            case 0: // $4010: Control
                this.dmc.writeControl(value);
                break;
            case 1: // $4011: Direct load
                this.dmc.writeDirectLoad(value);
                break;
            case 2: // $4012: Sample address
                this.dmc.writeSampleAddress(value);
                break;
            case 3: // $4013: Sample length
                this.dmc.writeSampleLength(value);
                break;
        }
    }

    /** Write to frame counter register ($4017)
     *
     * Configures frame sequencer mode and IRQ behavior.
     */
    private writeFrameCounter(value: u8): void {
        this.frameCounter.writeControl(value, this.cpuCycle);
    }
    
    //#endregion
}

/** A no-op APU used when the environment does not support WebAudio. */
export class DummyApu implements IBusDevice {
    public read(): u8 {
        return 0;
    }
    
    public write(): void {
        // No-op
    }
    
    public clock(): void {
        // No-op
    }
    
    public reset(): void {
        // No-op
    }
}

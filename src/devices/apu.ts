import { IBusDevice, DummyBusDevice } from "../utils/index.js";

export const APU_CHANNEL_START_ADDR = 0x4000;
export const APU_CHANNEL_END_ADDR = 0x4013;
export const APU_CHANNEL_MASK = 0xFFFF;

export const APU_STATUS_REGISTER = 0x4015;
export const APU_FRAME_COUNTER = 0x4017;

//#region Magic constants
const SAMPLE_RATE = 44_100; // 44.1 khz
//#endregion

interface IAudioProcessingUnit {
    readonly channels: IBusDevice;
    readonly register: IBusDevice;
    readonly counter: IBusDevice;
}

/** The Audio Processing Unit for the NES.
 * 
 * This uses the Web Audio API to emulate the APU at a high level- it does not
 * generate samples and pass them to an audio device, and is not supported on
 * headless environments lacking a DOM (such as Node).
 * 
 * Consequently, the NES will not attempt to initialize this class if the web
 * audio API isn't supported.
 * 
 * Right now, this APU does not support noise channels or DMC, nor does it
 * support cartridge-mapped audio mixing (such as the additional channels
 * provided by the Konami VRC6 or the Famicom Disk Drive).
 */
export class Apu2A03 {
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

    /** The main WebAudio context */
    private ctx: AudioContext;
    /** The first square wave voice */
    private pulse1: OscillatorNode;
    /** The second square wave voice */
    private pulse2: OscillatorNode;
    /** The triangle wave voice */
    private tri: OscillatorNode;
    /** A gain node for global volume control */
    private out: GainNode;

    protected constructor() {
        this.ctx = new AudioContext({
            latencyHint: "interactive",
            sampleRate: SAMPLE_RATE
        });
        this.out = this.ctx.createGain();
        this.out.gain.setValueAtTime(0, 1); // default volume is 1
        this.out.connect(this.ctx.destination);

        this.pulse1 = this.ctx.createOscillator();
        this.pulse1.type = "square";
        this.pulse1.connect(this.out);
        this.pulse2 = this.ctx.createOscillator();
        this.pulse2.type = "square";
        this.pulse2.connect(this.out);

        this.tri = this.ctx.createOscillator();
        this.tri.type = "triangle";
        this.tri.connect(this.out);
    }

    
}

/** A no-op APU used when the environment does not support WebAudio. */
export class DummyApu {
    public readonly channels = new DummyBusDevice();
    public readonly register = new DummyBusDevice();
    public readonly counter = new DummyBusDevice();
}
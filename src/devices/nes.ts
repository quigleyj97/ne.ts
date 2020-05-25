import { Cpu6502 } from "./cpu.js";
import { Ram } from "../utils/addr.js";
import { ICartridge } from "./cartridge.js";
import { Bus } from "./bus.js";
import { Ppu2C02, PpuControlPortMapper } from "./ppu.js";

/** A class representing the NES as a whole */
export class NesEmulator {
    private cpu: Cpu6502;
    private ppu: Ppu2C02;
    private ppuMapper: PpuControlPortMapper;
    private ram: Ram;
    private cart: ICartridge;
    private cycles = 0;
    private is_cpu_idle = false;
    private is_frame_ready = false;

    constructor(cart: ICartridge) {
        const cpuBus = new Bus();
        this.ram = new Ram(2048);
        this.cpu = new Cpu6502(cpuBus);
        this.cart = cart;
        cpuBus.map_device({
            dev: cart.prg,
            start: 0x4020,
            end: 0xFFFF,
            mask: 0xFFFF
        })
        cpuBus.map_device({
            dev: this.ram,
            start: 0x0000,
            end: 0x2000,
            mask: 0x07FF
        });
        let ppuBus = new Bus();
        ppuBus.map_device({
            dev: this.cart.chr,
            start: 0,
            end: 0x4000,
            mask: 0xFFFF
        });
        this.ppu = new Ppu2C02(ppuBus);
        this.ppuMapper = new PpuControlPortMapper(this.ppu);
        cpuBus.map_device({
            dev: this.ppuMapper,
            start: 0x2000,
            end: 0x4000,
            mask: 0x0007
        });
        this.cpu.reset();
    }

    public run_frame() {
        while (!this.is_frame_ready) {
            this.tick();
        }
        this.is_frame_ready = false;
        return this.ppu.get_buffer();
    }

    public debug_frame() {
        while (!this.is_frame_ready) {
            this.tick(true);
        }
        this.is_frame_ready = false;
        return this.ppu.get_buffer();
    }

    /**
     * Advance the emulator 1 PPU cycle at a time, executing CPU instructions
     * when appropriate (3 cycles in NTSC mode)
     * @param debug Whether to run the CPU with debug logging enabled
     */
    public tick(debug = false) {
        this.cycles += 1;
        if (this.cycles === Number.MAX_SAFE_INTEGER) {
            this.cycles = 0; // TODO: correct for skipped cycles
        }
        this.ppu.clock();
        this.is_frame_ready = this.ppu.is_frame_ready();
        if (this.ppu.is_vblank()) {
            this.cpu.trigger_nmi();
            this.ppu.ack_vblank();
        }
        if (this.cycles % 3 === 0) {
            if (this.is_cpu_idle) {
                // flip this since tick is hot- assume-branch-taken
                if (!debug) {
                    this.cpu.exec();
                } else {
                    console.log(this.cpu.debug());
                }
            }
            this.is_cpu_idle = this.cpu.tick();
        }
    }

    public step_debug() {
        let status = this.cpu.debug();
        // spin until the CPU is done ticking
        while (!this.cpu.tick()) {}
        return status;
    }
}
import { Cpu6502 } from "./cpu.js";
import { Ram } from "../utils/addr.js";
import { ICartridge } from "./cartridge.js";
import { Bus } from "./bus.js";

/** A class representing the NES as a whole */
export class NesEmulator {
    private cpu: Cpu6502;
    private ram: Ram;
    private cart: ICartridge;
    private cycles = 0;
    private is_cpu_idle = false;
    private is_frame_ready = false;

    constructor(cart: ICartridge) {
        const bus = new Bus();
        this.ram = new Ram(2048);
        this.cpu = new Cpu6502(bus);
        this.cart = cart;
        bus.map_device({
            dev: cart.prg,
            start: 0x4020,
            end: 0xFFFF,
            mask: 0xFFFF
        })
        bus.map_device({
            dev: this.ram,
            start: 0x0000,
            end: 0x2000,
            mask: 0x07FF
        });
    }

    public tick() {
        this.cycles += 1;
        if (this.cycles === Number.MAX_SAFE_INTEGER) {
            this.cycles = 0; // TODO: correct for skipped cycles
        }
        // TODO: PPU
        if (this.cycles % 3 === 0) {
            if (this.is_cpu_idle) {
                this.cpu.exec();
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
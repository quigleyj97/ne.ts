import { Cpu6502 } from "./cpu.js";
import { Ram } from "../utils/addr.js";
import { ICartridge } from "./cartridge.js";
import { Bus } from "./bus.js";
import { Ppu2C02, PpuControlPortMapper } from "./ppu.js";
import { ControllerDMAAdaptor, ControllerButton } from "./controller.js";
import { OamDmaController } from "./dma.js";
import { Apu2A03, APU_START_ADDR, APU_END_ADDR, APU_MASK } from "./apu.js";

/** A class representing the NES as a whole */
export class NesEmulator {
    private cpu: Cpu6502;
    private ppu: Ppu2C02;
    private ppuMapper: PpuControlPortMapper;
    private apu: Apu2A03 | ReturnType<typeof Apu2A03.build>;
    private controller_dma: ControllerDMAAdaptor;
    private oam_dma: OamDmaController;
    private ram: Ram;
    private cart: ICartridge;
    private cycles = 0;
    private is_cpu_idle = false;
    private is_frame_ready = false;
    private cpu_cycle_counter = 0;
    private dmcStallCycles: number = 0;

    constructor(cart: ICartridge) {
        const cpuBus = new Bus();
        this.controller_dma = new ControllerDMAAdaptor();
        this.ram = new Ram(2048);
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
            end: 0x1FFF,
            mask: 0x07FF
        });
        cpuBus.map_device({
            dev: this.controller_dma,
            start: ControllerDMAAdaptor.START_ADDR,
            end: ControllerDMAAdaptor.END_ADDR,
            mask: ControllerDMAAdaptor.MASK
        });
        // Map APU to CPU bus
        this.apu = Apu2A03.build();
        cpuBus.map_device({
            dev: this.apu,
            start: APU_START_ADDR,
            end: APU_END_ADDR,
            mask: APU_MASK
        });
        let ppuBus = new Bus();
        ppuBus.map_device({
            dev: this.cart.chr,
            start: 0,
            end: 0x3EFF,
            mask: 0xFFFF
        });
        this.ppu = new Ppu2C02(ppuBus);
        this.ppuMapper = new PpuControlPortMapper(this.ppu);
        cpuBus.map_device({
            dev: this.ppuMapper,
            start: 0x2000,
            end: 0x3FFF,
            mask: 0x0007
        });
        this.cpu = new Cpu6502(cpuBus);
        this.oam_dma = new OamDmaController(this.cpu, this.ppu);
        cpuBus.map_device({
            dev: this.oam_dma,
            start: OamDmaController.ADDRESS,
            end: OamDmaController.ADDRESS,
            mask: 0xFFFF
        });
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
        this.cpu_cycle_counter++;
        if (this.cpu_cycle_counter === 3) {
            this.cpu_cycle_counter = 0;
            this.controller_dma.tick();
            this.oam_dma.tick();
            // Clock APU once per CPU cycle
            this.apu.clock();
            
            // Handle DMC DMA requests
            const dmcRequest = this.apu.getDmcDmaRequest();
            if (dmcRequest !== null) {
                // Read the byte from CPU bus at the requested address
                const sampleByte = this.cpu.read_bus(dmcRequest);
                // Load the sample into the DMC channel
                this.apu.loadDmcSample(sampleByte);
                // Add stall cycles (4 cycles for DMC DMA read)
                this.dmcStallCycles = 4;
            }
            
            // Handle DMC stall cycles
            if (this.dmcStallCycles > 0) {
                this.dmcStallCycles--;
            } else if (this.is_cpu_idle && !this.oam_dma.is_dma_active) {
                // Only execute CPU when not stalled by DMC or OAM DMA
                if (!debug) {
                    this.cpu.exec();
                } else {
                    console.log(this.cpu.debug());
                }
            }
            this.is_cpu_idle = this.cpu.tick();
        }
    }

    /**
     * An event handler for controller updates.
     * 
     * It is up to the instantiator to map controller buttons to keyboard events,
     * but a suggested layout is:
     * 
     *  - ArrowKeys -> Left, Right, Up, Down
     *  - Enter -> Start
     *  - Ctrl -> Select
     *  - Z -> A
     *  - X -> B
     *
     * Z and X are frequently located next to one another on most keyboard
     * layouts, and are away from the arrow keys. This makes them convenient
     * for mapping to A and B.
     *
     * @param controller Which controller to update
     * @param key The key to set the state of
     * @param pressed Whether that key is pressed
     */
    public on_controller_update(controller: 0 | 1, key: ControllerButton, pressed: boolean) {
        this.controller_dma.update_controller(controller, key, pressed);
    }

    public step_debug() {
        let status = this.cpu.debug();
        // spin until the CPU is done ticking
        while (!this.cpu.tick()) {}
        return status;
    }
}
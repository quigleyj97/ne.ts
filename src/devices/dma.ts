import { IBusDevice } from "../utils/addr.js";
import { u8, u16 } from "../utils/types.js";
import { Cpu6502 } from "./cpu.js";
import { Ppu2C02 } from "./ppu.js";

export class OamDmaController implements IBusDevice {
    public static readonly ADDRESS = 0x4014;

    private page: u8 = 0;
    private addr: u8 = 0;
    private readonly cpu: Cpu6502;
    private readonly ppu: Ppu2C02;
    private _is_dma_active = false;
    private is_dummy_cycle = true;
    private dma_data: u8 = 0;

    constructor(cpu: Cpu6502, ppu: Ppu2C02) {
        this.cpu = cpu;
        this.ppu = ppu;
    }

    public get is_dma_active() { return this._is_dma_active; }

    public tick() {
        if (!this._is_dma_active) {
            return;
        }
        const is_odd_cycle = this.cpu.is_odd_cycle();
        if (this.is_dummy_cycle) {
            if (is_odd_cycle) {
                this.is_dummy_cycle = false;
            }
            return;
        }
        if (!is_odd_cycle) {
            this.dma_data = this.cpu.read_bus((this.page << 8) | this.addr);
        } else {
            this.ppu.write_oam(this.addr, this.dma_data);
            this.addr = 0xFF & (this.addr + 1);
            if (this.addr == 0x00) {
                this.is_dummy_cycle = true;
                this._is_dma_active = false;
            }
            this.cpu.tock();
        }
    }

    public read(_addr: u16) {
        return 0; // TODO: IBusDevices should be able to signal open bus
    }

    public write(_addr: u16, data: u8) {
        this._is_dma_active = true;
        this.page = data;
        // TODO: technically the start address is whatever's in $OAMADDR
    }
}
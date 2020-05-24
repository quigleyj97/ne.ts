import { u16, Ram, u8, PpuControlFlags, PpuStatusFlags, PpuControlPorts } from "../utils/index.js";
import { Bus } from "./bus.js";

const PPU_NAMETABLE_START_ADDR: u16 = 0x2000;
const PPU_NAMETABLE_END_ADDR: u16 = 0x4000;
const PPU_NAMETABLE_MASK: u16 = 0x0FFF;
const PPU_PALETTE_START_ADDR: u16 = 0x4000;
const PPU_PALETTE_END_ADDR: u16 = 0xFFFF;
const PPU_PALETTE_MASK: u16 = 0x001F;

export class Ppu2C02 {
    /// The PPU bus
    private bus: Bus;
    /// The internal palette memory
    private palette: Ram;
    /// The write-only control register
    private control: u8;
    /// The mask register used for controlling various aspects of rendering
    private mask: u8;
    /// The read-only status register
    private status: u8;
    //#region Emulation helpers
    /// The last value on the PPU bus.
    ///
    /// The PPU's bus to the CPU has such long traces that electrically, they
    /// act as a latch, retaining the value of last value placed on the bus for
    /// up to a full frame.
    ///
    /// It should be said that this behavior is unreliable, and no reasonable
    /// game would ever depend on this functionality.
    private last_bus_value: u8;
    /// Whether the PPUADDR is filling the hi (false) or the lo byte (true).
    ///
    /// # Note
    ///
    /// Oddly, PPUADDR seems to be _big_ endian even though the rest of the NES
    /// is little endian. I'm not sure why this is.
    private is_ppuaddr_lo: boolean;
    /// The address loaded into PPUADDR
    private ppuaddr: u16;
    /// Buffer containing the value of the address given in PPUADDR.
    ///
    /// # Note
    ///
    /// Reads from regions of PPU memory (excluding the palette memory) are
    /// delayed by one clock cycle, as the PPU first _recieves_ the address,
    /// then puts that address on it's internal bus. On the _next_ cycle, it
    /// then _writes_ that value to a buffer on the CPU bus. The effect of this
    /// is that reads from the PPU take _two_ cycles instead of one.
    ///
    /// For palette memory, however, there happens to be entirely combinatorial
    /// logic to plumb this read; meaning that no clock ticking has to occur.
    private ppudata_buffer: u8;
    /// The pixel currently being output by the PPU.
    private pixel_cycle: number;
    /// The scanline currently being rendered.
    private scanline: number;
    /// Whether the PPU has completed a frame
    private frame_ready: boolean;
    /// Whether a VBlank interrupt has occured
    private vblank_nmi_ready: boolean;
    /// The internal framebuffer containing the rendered image, in u8 RGB
    private frame_data: Uint8Array;
    //#endregion

    constructor(bus: Bus) {
        this.bus = bus;
        this.palette = new Ram(32);
        this.bus.map_device({
            dev: this.palette,
            start: PPU_PALETTE_START_ADDR,
            end: PPU_PALETTE_END_ADDR,
            mask: PPU_PALETTE_MASK
        });
        this.control = 0;
        this.mask = 0;
        // magic constant given from NESDEV for PPU poweron state
        this.status = 0xA0;
        this.last_bus_value = 0;
        this.is_ppuaddr_lo = false;
        this.ppuaddr = 0;
        this.ppudata_buffer = 0;
        this.pixel_cycle = 0;
        this.scanline = 0;
        this.frame_ready = false;
        this.vblank_nmi_ready = false;
        this.frame_data = new Uint8Array(240 * 256 * 3);
    }

    /** Clock the PPU, rendering to the internal framebuffer and modifying state as appropriate */
    public clock() {
        // Render a checkerboard pattern for now
        if (this.scanline > -1 && this.scanline < 240 && this.pixel_cycle < 256) {
            let idx = this.scanline * 256 + this.pixel_cycle;
            // force integer division
            // since this is very hot code, I'm using a bit of a wild bitwise
            // syntax to accomplish this: https://stackoverflow.com/a/17218003
            let x = ~~(this.pixel_cycle / 8);
            let y = ~~(this.scanline / 8);
            let tile = this.bus.read(PPU_NAMETABLE_START_ADDR + x * 32 + y);
            let color = tile == 0x20 ? 0 : 255;
            for (let i = 0; i < 3; i++) {
                this.frame_data[idx * 3 + i] = color;
            }
        }
        let nmi_enabled = (this.control & PpuControlFlags.VBLANK_NMI_ENABLE) > 0;
        if (this.scanline == 241 && this.pixel_cycle == 0) {
            this.vblank_nmi_ready = nmi_enabled;
            this.status |= PpuStatusFlags.VBLANK;
        } else if (this.scanline == 262 && this.pixel_cycle == 1) {
            this.vblank_nmi_ready = false;
            this.status &= ~(PpuStatusFlags.VBLANK | PpuStatusFlags.STATUS_IGNORED);
        }

        this.pixel_cycle += 1;

        if (this.pixel_cycle > 340) {
            this.pixel_cycle = 0;
            this.scanline += 1;
        }

        this.frame_ready = false;

        if (this.scanline > 260) {
            // The "-1" scanline is special, and rendering should handle it differently
            this.scanline = -1;
            this.frame_ready = true;
        }
    }

    /** Whether a VBlank NMI has occured. This should be plumbed to the CPU. */
    public is_vblank() {
        return this.vblank_nmi_ready;
    }

    /** Acknowledge the vblank NMI, so that the PPU stops asserting it */
    public ack_vblank() {
        this.vblank_nmi_ready = false;
    }

    /** Whether the PPU has completely rendered a frame. */
    public is_frame_ready() {
        return this.frame_ready;
    }

    /** Retrieve a copy of the current frame */
    public get_buffer() {
        return this.frame_data.slice();
    }

    /** Read data from a control port on the PPU.
     * 
     * Addresses should be given in CPU Bus addresses (eg, $PPUCTRL)
     */
    public control_port_read(port_addr: u16): u8 {
        switch (port_addr) {
            case PpuControlPorts.PPUSTATUS: {
                let status = this.status | (PpuStatusFlags.STATUS_IGNORED & this.last_bus_value);
                this.status &= ~(PpuStatusFlags.VBLANK | PpuStatusFlags.STATUS_IGNORED);
                this.is_ppuaddr_lo = false;
                this.vblank_nmi_ready = false;
                this.last_bus_value = status;
                return status;
            }
            case PpuControlPorts.OAMDATA: {
                console.warn(" [WARN] $OAMDATA not implemented (yet)");
                return this.last_bus_value;
            }
            case PpuControlPorts.PPUDATA: {
                // For most addresses, we need to buffer the response in internal
                // memory, since the logic for PPUDATA reads isn't actually
                // combinatorial and requires some plumbing (except for palette
                // memory, which is special)
                if (port_addr >= 0x3F00) {
                    // This is palette memory, don't buffer...
                    //
                    // ......ish...
                    //
                    // According to Nesdev, the PPU actually _will_ populate the
                    // buffer with whatever's in the nametable, mirrored though
                    // 0x3F00. So let's do that after setting data, just in case
                    // anything needs that...
                    let data = this.bus.read(this.ppuaddr);
                    this.ppudata_buffer = this.bus.read(this.ppuaddr & ~0x1000);
                    this.last_bus_value = data;
                    return data;
                }
                let data = this.ppudata_buffer;
                this.ppudata_buffer = this.bus.read(this.ppuaddr);
                this.last_bus_value = data;
                return data;
            }
            default: return this.last_bus_value;
        }
    }

    /** Write data to a control port on the PPU.
     * 
     * Addresses should be given in CPU Bus addresses (eg, $PPUCTRL)
     */
    public control_port_write(port_addr: u16, data: u8) {
        this.last_bus_value = data;
        switch(port_addr) {
            // TODO: pre-boot cycle check
            // TODO: simulate immediate NMI hardware bug
            // TODO: Bit 0 race condition
            // TODO: Complain loudly when BG_COLOR_SELECT is set
            case PpuControlPorts.PPUCTRL:
                this.control = data;
                return;
            case PpuControlPorts.PPUMASK:
                this.mask = data;
                return;
            case PpuControlPorts.OAMADDR:
                console.warn(" [WARN] $OAMADDR not implemented");
                return;
            case PpuControlPorts.OAMDATA:
                console.warn(" [WARN] $OAMDATA not implemented");
                return;
            case PpuControlPorts.PPUSCROLL:
                console.warn(" [WARN] $PPUSCROLL not implemented");
                return;
            case PpuControlPorts.PPUADDR: {
                if (this.is_ppuaddr_lo) {
                    this.is_ppuaddr_lo = false;
                    this.ppuaddr |= data;
                } else {
                    this.is_ppuaddr_lo = true;
                    this.ppuaddr = data << 8;
                }
                return;
            }
            case PpuControlPorts.PPUDATA: {
                this.bus.write(this.ppuaddr, data);
                if ((this.control & PpuControlFlags.VRAM_INCREMENT_SELECT) > 0) {
                    this.ppuaddr += 32;
                } else {
                    this.ppuaddr += 1;
                }
                return;
            }
        };
    }
}
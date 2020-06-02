import { u16, u8, PpuControlFlags, PpuStatusFlags, PpuControlPorts, IBusDevice, PALLETE_TABLE, IPpuState, PPU_POWERON_STATE, PpuAddressPart, PpuMaskFlags } from "../utils/index.js";
import { Bus } from "./bus.js";

const PPU_NAMETABLE_START_ADDR: u16 = 0x2000;
const PPU_NAMETABLE_END_ADDR: u16 = 0x3EFF;
const PPU_NAMETABLE_MASK: u16 = 0x0FFF;
const PPU_PALETTE_START_ADDR: u16 = 0x3F00;
const PPU_PALETTE_END_ADDR: u16 = 0x3FFF;
const PPU_PALETTE_MASK: u16 = 0x001F;
//  _____________________________________
// / I am 0x3-CO, you probably didn't    \
// \ recognize me because of the red arm /
//  -------------------------------------
//    \
//     \
//        /~\
//       |oo )
//       _\=/_
//      /     \
//     //|/.\|\\
//    ||  \_/  ||
//    || |\ /| ||
//     # \_ _/  #
//       | | |
//       | | |
//       []|[]
//       | | |
//      /_]_[_\
const ATTR_TABLE_OFFSET = 0x3C0;
export class Ppu2C02 {
    /** The PPU bus */
    private bus: Bus;
    /** The internal palette memory */
    private palette: PpuPaletteRam;
    /** The internal state of the PPU */
    private state: IPpuState;
    /** The internal framebuffer containing the rendered image, in u8 RGB */
    private readonly frame_data: Uint8Array;

    constructor(bus: Bus) {
        this.bus = bus;
        this.palette = new PpuPaletteRam();
        this.bus.map_device({
            dev: this.palette,
            start: PPU_PALETTE_START_ADDR,
            end: PPU_PALETTE_END_ADDR,
            mask: PPU_PALETTE_MASK
        });
        this.state = { ...PPU_POWERON_STATE };
        this.frame_data = new Uint8Array(240 * 356 * 3);
    }

    /** Clock the PPU, rendering to the internal framebuffer and modifying state as appropriate */
    public clock() {
        if (this.state.scanline < 240 || this.state.scanline === 261) {
            if ((this.state.pixel_cycle >= 1 && this.state.pixel_cycle < 258) || (this.state.pixel_cycle > 320 && this.state.pixel_cycle < 337)) {
                this.update_shift_regs();
                const CHR_BANK = (this.state.control & PpuControlFlags.BG_TILE_SELECT) << 8;
                switch ((this.state.pixel_cycle - 1) % 8) {
                    case 0:
                        this.transfer_registers();
                        this.state.temp_nt_byte = this.bus.read(PPU_NAMETABLE_START_ADDR | (this.state.v & 0x0FFF));
                        break;
                    case 2:
                        // this addressing comes from NESDEV:
                        // https://wiki.nesdev.com/w/index.php/PPU_scrolling#Tile_and_attribute_fetching
                        this.state.temp_at_byte = this.bus.read(
                            PPU_NAMETABLE_START_ADDR
                            | ATTR_TABLE_OFFSET
                            | (this.state.v & 0x0C00)
                            | ((this.state.v >> 4) & 0x38)
                            | ((this.state.v >> 2) & 0x07)
                        );
                        if (((this.state.v & PpuAddressPart.COARSE_Y) >> 5 & 0x02) > 0) {
                            this.state.temp_at_byte >>= 4;
                        }
                        if (((this.state.v & PpuAddressPart.COARSE_X) & 0x02) > 0) {
                            this.state.temp_at_byte >>= 2;
                        }
                        this.state.temp_at_byte &= 3;

                        break;
                    case 4:
                        this.state.temp_bg_lo_byte = this.bus.read(
                            CHR_BANK
                            | (this.state.temp_nt_byte << 4)
                            | ((this.state.v & PpuAddressPart.FINE_Y) >> 12)
                        );
                        break;
                    case 6:
                        this.state.temp_bg_hi_byte = this.bus.read(
                            CHR_BANK
                            | (this.state.temp_nt_byte << 4)
                            | ((this.state.v & PpuAddressPart.FINE_Y) >> 12)
                            | 8
                        );
                        break;
                    case 7:
                        this.inc_coarse_x();
                        break;
                }
            }
            if (this.state.pixel_cycle == 256) {
                this.inc_fine_y();
            }
            if (this.state.pixel_cycle == 257) {
                this.transfer_x_addr();
            }
            if (this.state.pixel_cycle === 337 || this.state.pixel_cycle === 339) {
                // make a dummy read of the nametable bit
                // this is important, since some mappers like MMC3 use this to
                // clock a scanline counter
                void this.bus.read(PPU_NAMETABLE_START_ADDR | (this.state.v & 0x0FFF));
            }
            // this is the pre-render scanline, it has some special handling
            if (this.state.scanline === 261) {
                if (this.state.pixel_cycle === 1) {
                    this.state.status &= 0xFF & ~(PpuStatusFlags.SPRITE_0_HIT | PpuStatusFlags.SPRITE_OVERFLOW | PpuStatusFlags.VBLANK);
                }
                if (this.state.pixel_cycle >= 280 || this.state.pixel_cycle < 305) {
                    this.transfer_y_addr();
                }
            }
        }
        // check if we need to set the vblank flag
        let nmi_enabled = (this.state.control & PpuControlFlags.VBLANK_NMI_ENABLE) > 0;
        if (this.state.scanline == 241 && this.state.pixel_cycle == 0) {
            this.state.vblank_nmi_ready = nmi_enabled;
            this.state.status |= PpuStatusFlags.VBLANK;
        }
        // this is a true render scanline
        if (this.state.scanline < 240) {
            let bg_pixel = 0x00;
            let bg_palette = 0x00;
            // render the background
            if ((this.state.mask & PpuMaskFlags.BG_ENABLE) > 0) {
                let bit_mux = 0x8000 >> this.state.x;
                let pattern_hi = (this.state.bg_tile_hi_shift_reg & bit_mux) > 0 ? 1 : 0;
                let pattern_lo = (this.state.bg_tile_lo_shift_reg & bit_mux) > 0 ? 1 : 0;
                bg_pixel = (pattern_hi << 1) | pattern_lo;
                let palette_hi = (this.state.bg_attr_hi_shift_reg & bit_mux) > 0 ? 1 : 0;
                let palette_lo = (this.state.bg_attr_lo_shift_reg & bit_mux) > 0 ? 1 : 0;
                bg_palette = (palette_hi << 1) | palette_lo;
            }
            const bg_color = this.bus.read(PPU_PALETTE_START_ADDR | (bg_palette << 2) | bg_pixel);
            const idx = this.state.scanline * 256 + this.state.pixel_cycle;
            for (let i = 0; i < 3; i++) {
                this.frame_data[idx * 3 + i] = PALLETE_TABLE[bg_color * 3 + i];
            }
        }
        this.state.pixel_cycle++;

        if (this.state.pixel_cycle > 340) {
            this.state.pixel_cycle = 0;
            this.state.scanline += 1;
        }

        this.state.frame_ready = false;

        if (this.state.scanline > 261) {
            // The "0" scanline is special, and rendering should handle it differently
            this.state.scanline = 0;
            this.state.frame_ready = true;
        }
    }

    /** Whether a VBlank NMI has occured. This should be plumbed to the CPU. */
    public is_vblank() {
        return this.state.vblank_nmi_ready;
    }

    /** Acknowledge the vblank NMI, so that the PPU stops asserting it */
    public ack_vblank() {
        this.state.vblank_nmi_ready = false;
    }

    /** Whether the PPU has completely rendered a frame. */
    public is_frame_ready() {
        return this.state.frame_ready;
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
                let status = this.state.status | (PpuStatusFlags.STATUS_IGNORED & this.state.last_control_port_value);
                this.state.status &= 0xFF & ~(PpuStatusFlags.VBLANK | PpuStatusFlags.STATUS_IGNORED);
                this.state.w = false;
                this.state.vblank_nmi_ready = false;
                this.state.last_control_port_value = status;
                return status;
            }
            case PpuControlPorts.OAMDATA: {
                // console.warn(" [WARN] $OAMDATA not implemented (yet)");
                return this.state.last_control_port_value;
            }
            case PpuControlPorts.PPUDATA: {
                // For most addresses, we need to buffer the response in internal
                // memory, since the logic for PPUDATA reads isn't actually
                // combinatorial and requires some plumbing (except for palette
                // memory, which is special)
                const addr = this.state.v;

                if (!this.is_rendering()) {
                    if ((0xFF & (this.state.control & PpuControlFlags.VRAM_INCREMENT_SELECT)) !== 0) {
                        this.state.v = 0x7FFF & (this.state.v + 32);
                    } else {
                        this.state.v = 0x7FFF & (this.state.v + 1);
                    }
                } else {
                    console.warn(" [INFO] Read from PPUDATA during render");
                    // Since we're writing during rendering, the PPU will
                    // increment both the coarse X and fine Y due to how the
                    // PPU is wired
                    this.inc_coarse_x();
                    this.inc_fine_y();
                }
                if (port_addr >= 0x3F00) {
                    // This is palette memory, don't buffer...
                    //
                    // ......ish...
                    //
                    // According to Nesdev, the PPU actually _will_ populate the
                    // buffer with whatever's in the nametable, mirrored though
                    // 0x3F00. So let's do that after setting data, just in case
                    // anything needs that...
                    let data = this.bus.read(addr);
                    this.state.ppudata_buffer = this.bus.read(addr & 0x0FFF);
                    this.state.last_control_port_value = data;
                    return data;
                }
                let data = this.state.ppudata_buffer;
                this.state.ppudata_buffer = this.bus.read(addr);
                this.state.last_control_port_value = data;
                return data;
            }
            default: return this.state.last_control_port_value;
        }
    }

    /** Write data to a control port on the PPU.
     * 
     * Addresses should be given in CPU Bus addresses (eg, $PPUCTRL)
     */
    public control_port_write(port_addr: u16, data: u8) {
        this.state.last_control_port_value = data;
        switch(port_addr) {
            // TODO: pre-boot cycle check
            // TODO: simulate immediate NMI hardware bug
            // TODO: Bit 0 race condition
            // TODO: Complain loudly when BG_COLOR_SELECT is set
            // The exact writes to T and V come from NESDEV documentation on
            // how the internal PPU registers work:
            // https://wiki.nesdev.com/w/index.php/PPU_scrolling
            case PpuControlPorts.PPUCTRL:
                this.state.control = data;
                this.state.t &= (0x7FFF & ~(PpuAddressPart.NAMETABLE_X |  PpuAddressPart.NAMETABLE_Y));
                this.state.t |= (data & PpuControlFlags.NAMETABLE_BASE_SELECT) << 10;
                return;
            case PpuControlPorts.PPUMASK:
                this.state.mask = data;
                return;
            case PpuControlPorts.OAMADDR:
                console.warn(" [WARN] $OAMADDR not implemented");
                return;
            case PpuControlPorts.OAMDATA:
                console.warn(" [WARN] $OAMDATA not implemented");
                return;
            case PpuControlPorts.PPUSCROLL:
                if (!this.state.w) {
                    this.state.x = data & 0x07;
                    this.state.t &= 0xFFFF & ~PpuAddressPart.COARSE_X;
                    this.state.t |= (data >> 3) & PpuAddressPart.COARSE_X;
                    this.state.w = true;
                } else {
                    this.state.t &= 0xFFFF & (~(PpuAddressPart.FINE_Y | PpuAddressPart.COARSE_Y));
                    this.state.t |= ((0x07 & data) << 12) | ((data & 0xF8) << 2);
                    this.state.w = false;
                }
                return;
            case PpuControlPorts.PPUADDR: {
                if (!this.state.w) {
                    this.state.t &= 0x00FF;
                    this.state.t |= (data & 0x3F) << 8;
                    this.state.w = true;
                } else {
                    this.state.t &= 0xFF00;
                    this.state.t |= data;
                    this.state.v = this.state.t;
                    this.state.w = false;
                }
                return;
            }
            case PpuControlPorts.PPUDATA: {
                this.bus.write(this.state.v, data);
                if (!this.is_rendering()) {
                    if ((this.state.control & PpuControlFlags.VRAM_INCREMENT_SELECT) > 0) {
                        this.state.v = 0x7FFF & (this.state.v + 32);
                    } else {
                        this.state.v = 0x7FFF & (this.state.v + 1);
                    }
                } else {
                    console.warn(" [INFO] Write to PPUDATA during render");
                    // Since we're writing during rendering, the PPU will
                    // increment both the coarse X and fine Y due to how the
                    // PPU is wired
                    this.inc_coarse_x();
                    this.inc_fine_y();
                }
                return;
            }
        };
    }

    /** Returns true if rendering is enabled and the PPU is in the visible region */
    private is_rendering() {
        return (this.state.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) > 0
            && this.state.scanline > -1
            && this.state.scanline < 240;
    }

    /** Increment the coarse X register */
    private inc_coarse_x() {
        if ((this.state.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        if ((this.state.v & PpuAddressPart.COARSE_X) == 31) {
            // clear the coarse X and invert the X nametable
            this.state.v &= 0xFFFF & ~PpuAddressPart.COARSE_X;
            this.state.v ^= PpuAddressPart.NAMETABLE_X;
        } else {
            // increment coarse X directly
            this.state.v += 1;
        }
    }

    /** Increment the fine Y register */
    private inc_fine_y() {
        if ((this.state.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        if ((this.state.v & PpuAddressPart.FINE_Y) != 0x7000) {
            // if the fine Y is less than 7, we can increment it directly
            this.state.v += 0x1000;
        } else {
            // clear fine Y and attempt to increment coarse Y
            this.state.v &= 0xFFFF & ~PpuAddressPart.FINE_Y
            let new_y = (this.state.v & PpuAddressPart.COARSE_Y) >> 5;
            if (new_y === 29) {
                // flip nametables
                new_y = 0;
                this.state.v ^= PpuAddressPart.NAMETABLE_Y;
            } else if (new_y == 31) {
                // a weird quirk of the PPU is that it allows setting coarse Y
                // out-of-bounds. When the coarse Y increments to 31 (where it
                // would overflow), the PPU doesn't switch the nametable. This
                // is, in effect, a "negative" scroll value of sorts.
                new_y = 0;
            } else {
                new_y += 1;
            }
            this.state.v &= (0xFFFF & ~PpuAddressPart.COARSE_Y);
            this.state.v |= new_y << 5;
        }
    }

    private transfer_registers() {
        this.state.bg_tile_lo_shift_reg = (this.state.bg_tile_lo_shift_reg & 0xFF00) | this.state.temp_bg_lo_byte;
        this.state.bg_tile_hi_shift_reg = (this.state.bg_tile_hi_shift_reg & 0xFF00) | this.state.temp_bg_hi_byte;
        this.state.bg_attr_latch = (this.state.temp_at_byte) as 0 | 1 | 2 | 3;
    }

    private update_shift_regs() {
        if ((this.state.mask & PpuMaskFlags.BG_ENABLE) === 0) {
            return;
        }
        this.state.bg_tile_hi_shift_reg <<= 1;
        this.state.bg_tile_hi_shift_reg &= 0xFFFF;
        this.state.bg_tile_lo_shift_reg <<= 1;
        this.state.bg_tile_lo_shift_reg &= 0xFFFF;
        this.state.bg_attr_lo_shift_reg <<= 1;
        this.state.bg_attr_lo_shift_reg |= (this.state.bg_attr_latch & 0x01);
        this.state.bg_attr_lo_shift_reg &= 0xFFFF;
        this.state.bg_attr_hi_shift_reg <<= 1;
        this.state.bg_attr_hi_shift_reg |= (this.state.bg_attr_latch & 0x02) >> 1;
        this.state.bg_attr_hi_shift_reg &= 0xFFFF;
    }

    private transfer_x_addr() {
        if ((this.state.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        const X_ADDR_PART = PpuAddressPart.COARSE_X | PpuAddressPart.NAMETABLE_X
        this.state.v &= 0xFFFF & ~X_ADDR_PART;
        this.state.v |= this.state.t & X_ADDR_PART;
    }

    private transfer_y_addr() {
        if ((this.state.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        const Y_ADDR_PART = PpuAddressPart.FINE_Y | PpuAddressPart.NAMETABLE_Y | PpuAddressPart.COARSE_Y;
        this.state.v &= 0xFFFF & ~Y_ADDR_PART;
        this.state.v |= this.state.t & Y_ADDR_PART;
    }
}

/**
 * A helper for mapping CPU-space control port ops to the PPU control ports
 */
export class PpuControlPortMapper implements IBusDevice {
    private readonly ppu: Ppu2C02;

    constructor(ppu: Ppu2C02) {
        this.ppu = ppu;
    }

    public read(addr: u16): u8 {
        return this.ppu.control_port_read(addr + 0x2000);
    }

    public write(addr: u16, data: u8) {
        return this.ppu.control_port_write(addr + 0x2000, data);
    }
}

/**
 * A helper for handling some of the odd PPU palette mirrors
 */
class PpuPaletteRam implements IBusDevice {
    private readonly palette_buffer = new Uint8Array(32);

    public read(addr: u16): u8 {
        let read_addr = addr;
        switch (addr) {
            case 0x10: read_addr = 0x00; break;
            case 0x14: read_addr = 0x04; break;
            case 0x18: read_addr = 0x08; break;
            case 0x1C: read_addr = 0x0C; break;
        }
        return this.palette_buffer[read_addr];
    }

    public write(addr: u16, data: u8) {
        let read_addr = addr;
        // these sprite palette locations are actually mirrors into the bg colors
        switch (addr) {
            case 0x10: read_addr = 0x00; break;
            case 0x14: read_addr = 0x04; break;
            case 0x18: read_addr = 0x08; break;
            case 0x1C: read_addr = 0x0C; break;
        }
        this.palette_buffer[read_addr] = data;
    }
}
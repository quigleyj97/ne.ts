import { u16, u8, PpuControlFlags, PpuStatusFlags, PpuControlPorts, IBusDevice, PALLETE_TABLE, IPpuState, PPU_POWERON_STATE, PpuAddressPart, PpuMaskFlags, deep_copy, PpuOamByteOffsets, PpuOamAttributes } from "../utils/index.js";
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
    //#region State variables
    // Note: I originally had these in an IPpuState struct, but having them all
    // in the same object like that actually introduced a massive order-of-mag
    // performance penalty in the PPU clock, especially on V8- tanking the frame
    // rate so badly that it became virtually unplayable.
    // Having them as class members isn't as clean, but is far more performant.
    //#region Loopy registers
    // These registers represent internal registers that handle numerous
    // operations on the NES, such as PPUADDR addressing. The exact names
    // of these variables from Loopy's "The Skinny on NES Scrolling"
    /** The 15-bit VRAM address register */
    private v: u16 = 0;
    /** The 15-bit temporary VRAM address register */
    private t: u16 = 0;
    /** The PPUADDR write latch */
    private x: u8 = 0;
    /** The 3-bit fine X scroll register */
    private w: boolean = false;
    //#endregion

    //#region Rendering shift registers
    // The PPU has a pair of shift registers for tile data, one for the high bit
    // and one for the low bit. It has another pair for the palette.
    // Sprites get their own shift registers and counters
    private bg_tile_hi_shift_reg: u16 = 0;
    private bg_tile_lo_shift_reg: u16 = 0;
    private bg_attr_hi_shift_reg: u16 = 0;
    private bg_attr_lo_shift_reg: u16 = 0;
    /** The 2-bit attribute for the next tile to render, which feeds the shift registers */
    private bg_attr_latch: number = 0;
    // The 8 tile shift registers for the 8 sprites
    private readonly sprite_tile_lo_shift_regs = new Uint8Array(8);
    private readonly sprite_tile_hi_shift_regs = new Uint8Array(8);
    //#endregion

    //#region Byte buffers
    // The PPU reads various parts of the rendering data at different points in
    // a rendering lifecycle, and those are loaded into the registers at the end
    // of an 8-cycle period. Until then, they're held in temporary registers,
    // which the below variables model
    private temp_nt_byte: u8 = 0;
    private temp_at_byte: u8 = 0;
    private temp_bg_lo_byte: u8 = 0;
    private temp_bg_hi_byte: u8 = 0;
    //#endregion

    //#region PPU Control Registers
    // These are registers that are exposed to the CPU bus, like $PPUSTATUS and
    // $PPUMASK
    /** The $PPUCTRL register */
    private control: u8 = 0x00;
    /** The $PPUMASK register.
     *
     * The inital value is a magic constant given from NESDEV for PPU poweron state
     */
    private status: u8 = 0xA0;
    /** The $PPUSTATUS register */
    private mask: u8 = 0;
    //#endregion

    //#region Emulation helpers
    /** The OAM address byte */
    private oam_addr: u8 = 0;
    /** The internal OAM memory */
    private oam = new Uint8Array(256);
    /** The secondary OAM used for sprite evaluation */
    private secondary_oam = new Uint8Array(64);
    /** The pixel currently being output by the PPU. */
    private pixel_cycle: number = 0;
    /** The scanline currently being rendered. */
    private scanline: number = 0;
    /** Whether the PPU has completed a frame */
    private frame_ready: boolean = false;
    /** The internal framebuffer containing the rendered image, in u8 RGB */
    private frame_data = new Uint8Array(240 * 256 * 3);
    /** Whether a VBlank interrupt has occured */
    private vblank_nmi_ready: boolean = false;
    /**
     * Buffer containing the value of the address given in PPUADDR.
     * 
     * # Note
     *
     * Reads from regions of PPU memory (excluding the palette memory) are
     * delayed by one clock cycle, as the PPU first _recieves_ the address,
     * then puts that address on it's internal bus. On the _next_ cycle, it
     * then _writes_ that value to a buffer on the CPU bus. The effect of this
     * is that reads from the PPU take _two_ cycles instead of one.
     *
     * For palette memory, however, there happens to be entirely combinatorial
     * logic to plumb this read; meaning that no clock ticking has to occur.
     * _however_, reads will still populate the buffer! Except with name
     */
    private ppudata_buffer: u8 = 0;
    /** The last value put on a PPU control port */
    private last_control_port_value: u8 = 0;
    //#endregion
    //#endregion

    constructor(bus: Bus) {
        this.bus = bus;
        this.palette = new PpuPaletteRam();
        this.bus.map_device({
            dev: this.palette,
            start: PPU_PALETTE_START_ADDR,
            end: PPU_PALETTE_END_ADDR,
            mask: PPU_PALETTE_MASK
        });
    }

    /** Clock the PPU, rendering to the internal framebuffer and modifying state as appropriate */
    public clock() {
        if (this.scanline < 240 || this.scanline === 261) {
            //#region Background evaluation
            if ((this.pixel_cycle >= 1 && this.pixel_cycle < 258) || (this.pixel_cycle > 320 && this.pixel_cycle < 337)) {
                this.update_shift_regs();
                const CHR_BANK = (this.control & PpuControlFlags.BG_TILE_SELECT) << 8;
                switch ((this.pixel_cycle - 1) & 7) {
                    case 0:
                        this.transfer_registers();
                        this.temp_nt_byte = this.bus.read(PPU_NAMETABLE_START_ADDR | (this.v & 0x0FFF));
                        break;
                    case 2:
                        // this addressing comes from NESDEV:
                        // https://wiki.nesdev.com/w/index.php/PPU_scrolling#Tile_and_attribute_fetching
                        this.temp_at_byte = this.bus.read(
                            PPU_NAMETABLE_START_ADDR
                            | ATTR_TABLE_OFFSET
                            | (this.v & 0x0C00)
                            | ((this.v >> 4) & 0x38)
                            | ((this.v >> 2) & 0x07)
                        );
                        if ((((this.v & PpuAddressPart.COARSE_Y) >> 5) & 0x02) > 0) {
                            this.temp_at_byte >>= 4;
                        }
                        if (((this.v & PpuAddressPart.COARSE_X) & 0x02) > 0) {
                            this.temp_at_byte >>= 2;
                        }
                        this.temp_at_byte &= 3;

                        break;
                    case 4:
                        this.temp_bg_lo_byte = this.bus.read(
                            CHR_BANK
                            | (this.temp_nt_byte << 4)
                            | ((this.v & PpuAddressPart.FINE_Y) >> 12)
                        );
                        break;
                    case 6:
                        this.temp_bg_hi_byte = this.bus.read(
                            CHR_BANK
                            | (this.temp_nt_byte << 4)
                            | ((this.v & PpuAddressPart.FINE_Y) >> 12)
                            | 8
                        );
                        break;
                    case 7:
                        this.inc_coarse_x();
                        break;
                }
            }
            if (this.pixel_cycle === 337 || this.pixel_cycle === 339) {
                // make a dummy read of the nametable bit
                // this is important, since some mappers like MMC3 use this to
                // clock a scanline counter
                void this.bus.read(PPU_NAMETABLE_START_ADDR | (this.v & 0x0FFF));
            }
            //#endregion

            //#region Sprite evaluation
            // I'm cheating here, technically the sprite evaluation is pipelined
            // just like the background, but I'm gonna implement that later
            if (this.pixel_cycle === 258) {
                // clear the secondary OAM
                this.secondary_oam.fill(0xFF);
                let n_sprites = 0;
                let byte_addr = 0;
                for (let sprite = ~~(this.oam_addr / 4); sprite < 64; sprite++) {
                    const diff = this.scanline - this.oam[sprite * 4];
                    if (diff >= 0 && diff < (!!(this.control & PpuControlFlags.SPRITE_MODE_SELECT) ? 16 : 8)) {
                        // this sprite is visible
                        n_sprites++;
                        if (n_sprites == 8) {
                            // TODO: Sprite Overflow bug
                            // for now this is an incorrectly correct setup
                            this.status |= PpuStatusFlags.SPRITE_OVERFLOW;
                            break;
                        }
                        for (let i = 0; i < 4; i++) {
                            this.secondary_oam[(n_sprites - 1) * 4 + i] = this.oam[sprite * 4 + i];
                        }
                    }
                }
                // prepare the shifters for rendering
                for (let i = 0; i < n_sprites; i++) {
                    const tile_addr = ((this.control & PpuControlFlags.SPRITE_TILE_SELECT) << 9)
                            // +1 = tile id
                        | (this.secondary_oam[i * 4 + 1] << 4) 
                        | (this.scanline - this.secondary_oam[i * 4]);
                    this.sprite_tile_lo_shift_regs[i] = this.bus.read(tile_addr);
                    this.sprite_tile_hi_shift_regs[i] = this.bus.read(tile_addr + 8);
                }
            }
            //#endregion

            //#region Address increments
            if (this.pixel_cycle == 256) {
                this.inc_fine_y();
            }
            if (this.pixel_cycle == 257) {
                this.transfer_x_addr();
            }
            // this is the pre-render scanline, it has some special handling
            if (this.scanline === 261) {
                if (this.pixel_cycle === 1) {
                    this.status &= 0xFF & ~(PpuStatusFlags.SPRITE_0_HIT | PpuStatusFlags.SPRITE_OVERFLOW | PpuStatusFlags.VBLANK);
                }
                if (this.pixel_cycle >= 280 || this.pixel_cycle < 305) {
                    this.transfer_y_addr();
                }
            }
            //#endregion
        }
        // check if we need to set the vblank flag
        let nmi_enabled = (this.control & PpuControlFlags.VBLANK_NMI_ENABLE) > 0;
        if (this.scanline == 241 && this.pixel_cycle == 0) {
            this.vblank_nmi_ready = nmi_enabled;
            this.status |= PpuStatusFlags.VBLANK;
        }
        // this is a true render scanline
        if (this.scanline < 240 && this.pixel_cycle > 3 && this.scanline < 257) {
            // interestingly enough, pixel output doesn't begin until cycle _4_.
            // this comes from NESDEV:
            // https://wiki.nesdev.com/w/index.php/NTSC_video
            //#region Background rendering
            let bg_pixel = 0x00;
            let bg_palette = 0x00;

            if ((this.mask & PpuMaskFlags.BG_ENABLE) > 0) {
                let bit_mux = 0x8000 >> this.x;
                let pattern_hi = (this.bg_tile_hi_shift_reg & bit_mux) > 0 ? 1 : 0;
                let pattern_lo = (this.bg_tile_lo_shift_reg & bit_mux) > 0 ? 1 : 0;
                bg_pixel = (pattern_hi << 1) | pattern_lo;
                let palette_hi = (this.bg_attr_hi_shift_reg & bit_mux) > 0 ? 1 : 0;
                let palette_lo = (this.bg_attr_lo_shift_reg & bit_mux) > 0 ? 1 : 0;
                bg_palette = (palette_hi << 1) | palette_lo;
            }
            //#endregion

            //#region Sprite rendering
            let sprite_pixel = 0x00;
            let sprite_palette = 0x00;
            let sprite_priority = false;
            let is_sprite0_rendered = false;

            if ((this.mask & PpuMaskFlags.SPRITE_ENABLE) > 0) {
                for (let i = 0; i < 8; i++) {
                    // this sprite is active, use the shifters
                    if (this.secondary_oam[i * 4 + PpuOamByteOffsets.X_POS] == 0) {
                        if (i == 0) {
                            is_sprite0_rendered = true;
                        }
                        const pattern_hi = +!!(this.sprite_tile_hi_shift_regs[i] & 0x80);
                        const pattern_lo = +!!(this.sprite_tile_lo_shift_regs[i] & 0x80);
                        sprite_pixel = (pattern_hi << 1) | pattern_lo;
                        const attr = this.secondary_oam[i * 4 + PpuOamByteOffsets.ATTR];
                        // add 0x04 since the sprites use the last 4 palettes
                        sprite_palette = (attr & PpuOamAttributes.PALLETE) + 0x04;
                        sprite_priority = !!(attr & PpuOamAttributes.BACKGROUND_PRIORITY);
                        if (sprite_pixel != 0) {
                            // we're done, a non-transparent sprite pixel has been selected
                            break;
                        }
                    }

                }
            }
            //#endregion

            //#region Compositing
            let pixel = bg_pixel;
            let palette = bg_palette;
            if (sprite_pixel !== 0) {
                if (bg_pixel == 0) {
                    // use the sprite
                    pixel = sprite_pixel;
                    palette = sprite_palette;
                } else {
                    // we need to sort out priority
                    if (!sprite_priority) {
                        pixel = sprite_pixel;
                        palette = sprite_palette;
                    }
                    // then test for sprite0 hits
                    if (is_sprite0_rendered) {
                        if (!!(this.mask & PpuMaskFlags.BG_ENABLE) && !!(this.mask & PpuMaskFlags.SPRITE_ENABLE)) {
                            this.status |= PpuStatusFlags.SPRITE_0_HIT;
                        }
                    }
                }
            }
            const color = this.bus.read(PPU_PALETTE_START_ADDR | (pixel === 0x00 ? 0 : (palette << 2) | pixel));
            const idx = (this.scanline * 256 + this.pixel_cycle) * 3;
            const pal_idx = color * 3;
            this.frame_data[idx] = PALLETE_TABLE[pal_idx];
            this.frame_data[idx + 1] = PALLETE_TABLE[pal_idx + 1];
            this.frame_data[idx + 2] = PALLETE_TABLE[pal_idx + 2];
            //#endregion
        } else if (this.pixel_cycle < 4) {
            const idx = this.scanline * 256 + this.pixel_cycle;
            const color = this.bus.read(PPU_PALETTE_START_ADDR);
            for (let i = 0; i < 3; i++) {
                // fill with black for now
                // technically this should actually be the background color
                this.frame_data[idx * 3 + i] = PALLETE_TABLE[color * 3 + i];
            }
        }
        this.pixel_cycle++;

        if (this.pixel_cycle > 340) {
            this.pixel_cycle = 0;
            this.scanline += 1;
        }

        this.frame_ready = false;

        if (this.scanline > 261) {
            // The "0" scanline is special, and rendering should handle it differently
            this.scanline = 0;
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

    /** Write a byte to the OAM */
    public write_oam(addr: u8, data: u8) {
        this.oam[addr] = data;
    }

    /** Read data from a control port on the PPU.
     * 
     * Addresses should be given in CPU Bus addresses (eg, $PPUCTRL)
     */
    public control_port_read(port_addr: u16): u8 {
        switch (port_addr) {
            case PpuControlPorts.PPUSTATUS: {
                let status = this.status | (PpuStatusFlags.STATUS_IGNORED & this.last_control_port_value);
                this.status &= 0xFF & ~(PpuStatusFlags.VBLANK | PpuStatusFlags.STATUS_IGNORED);
                this.w = false;
                this.vblank_nmi_ready = false;
                this.last_control_port_value = status;
                return status;
            }
            case PpuControlPorts.OAMDATA: {
                // TODO: OAMDATA reads, like OAMADDR writes, also corrupt OAM
                return this.oam[this.oam_addr];
            }
            case PpuControlPorts.PPUDATA: {
                // For most addresses, we need to buffer the response in internal
                // memory, since the logic for PPUDATA reads isn't actually
                // combinatorial and requires some plumbing (except for palette
                // memory, which is special)
                const addr = this.v;

                if (!this.is_rendering()) {
                    if ((0xFF & (this.control & PpuControlFlags.VRAM_INCREMENT_SELECT)) !== 0) {
                        this.v = 0x7FFF & (this.v + 32);
                    } else {
                        this.v = 0x7FFF & (this.v + 1);
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
                    this.ppudata_buffer = this.bus.read(addr & 0x0FFF);
                    this.last_control_port_value = data;
                    return data;
                }
                let data = this.ppudata_buffer;
                this.ppudata_buffer = this.bus.read(addr);
                this.last_control_port_value = data;
                return data;
            }
            default: return this.last_control_port_value;
        }
    }

    /** Write data to a control port on the PPU.
     * 
     * Addresses should be given in CPU Bus addresses (eg, $PPUCTRL)
     */
    public control_port_write(port_addr: u16, data: u8) {
        this.last_control_port_value = data;
        switch(port_addr) {
            // TODO: pre-boot cycle check
            // TODO: simulate immediate NMI hardware bug
            // TODO: Bit 0 race condition
            // TODO: Complain loudly when BG_COLOR_SELECT is set
            // The exact writes to T and V come from NESDEV documentation on
            // how the internal PPU registers work:
            // https://wiki.nesdev.com/w/index.php/PPU_scrolling
            case PpuControlPorts.PPUCTRL:
                this.control = data;
                this.t &= (0x7FFF & ~(PpuAddressPart.NAMETABLE_X |  PpuAddressPart.NAMETABLE_Y));
                this.t |= (data & PpuControlFlags.NAMETABLE_BASE_SELECT) << 10;
                return;
            case PpuControlPorts.PPUMASK:
                this.mask = data;
                return;
            case PpuControlPorts.OAMADDR:
                // TODO: OAMADDR writes corrupt the OAM in particular ways, which
                // I might need to implement
                this.oam_addr = data;
                return;
            case PpuControlPorts.OAMDATA:
                // TODO: OAMDATA writes, like OAMADDR writes, also corrupt OAM
                this.oam[this.oam_addr] = data;
                return;
            case PpuControlPorts.PPUSCROLL:
                if (!this.w) {
                    this.x = data & 0x07;
                    this.t &= 0xFFFF & ~PpuAddressPart.COARSE_X;
                    this.t |= (data >> 3) & PpuAddressPart.COARSE_X;
                    this.w = true;
                } else {
                    this.t &= 0xFFFF & (~(PpuAddressPart.FINE_Y | PpuAddressPart.COARSE_Y));
                    this.t |= ((0x07 & data) << 12) | ((data & 0xF8) << 2);
                    this.w = false;
                }
                return;
            case PpuControlPorts.PPUADDR: {
                if (!this.w) {
                    this.t &= 0x00FF;
                    this.t |= (data & 0x3F) << 8;
                    this.w = true;
                } else {
                    this.t &= 0xFF00;
                    this.t |= data;
                    this.v = this.t;
                    this.w = false;
                }
                return;
            }
            case PpuControlPorts.PPUDATA: {
                this.bus.write(this.v, data);
                if (!this.is_rendering()) {
                    if ((this.control & PpuControlFlags.VRAM_INCREMENT_SELECT) > 0) {
                        this.v = 0x7FFF & (this.v + 32);
                    } else {
                        this.v = 0x7FFF & (this.v + 1);
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
        return (this.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) > 0
            && this.scanline > -1
            && this.scanline < 240;
    }

    /** Increment the coarse X register */
    private inc_coarse_x() {
        if ((this.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        if ((this.v & PpuAddressPart.COARSE_X) == 31) {
            // clear the coarse X and invert the X nametable
            this.v &= 0xFFFF & ~PpuAddressPart.COARSE_X;
            this.v ^= PpuAddressPart.NAMETABLE_X;
        } else {
            // increment coarse X directly
            this.v += 1;
        }
    }

    /** Increment the fine Y register */
    private inc_fine_y() {
        if ((this.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        if ((this.v & PpuAddressPart.FINE_Y) != 0x7000) {
            // if the fine Y is less than 7, we can increment it directly
            this.v += 0x1000;
        } else {
            // clear fine Y and attempt to increment coarse Y
            this.v &= 0xFFFF & ~PpuAddressPart.FINE_Y
            let new_y = (this.v & PpuAddressPart.COARSE_Y) >> 5;
            if (new_y === 29) {
                // flip nametables
                new_y = 0;
                this.v ^= PpuAddressPart.NAMETABLE_Y;
            } else if (new_y == 31) {
                // a weird quirk of the PPU is that it allows setting coarse Y
                // out-of-bounds. When the coarse Y increments to 31 (where it
                // would overflow), the PPU doesn't switch the nametable. This
                // is, in effect, a "negative" scroll value of sorts.
                new_y = 0;
            } else {
                new_y += 1;
            }
            this.v &= (0xFFFF & ~PpuAddressPart.COARSE_Y);
            this.v |= new_y << 5;
        }
    }

    private transfer_registers() {
        this.bg_tile_lo_shift_reg = (this.bg_tile_lo_shift_reg & 0xFF00) | this.temp_bg_lo_byte;
        this.bg_tile_hi_shift_reg = (this.bg_tile_hi_shift_reg & 0xFF00) | this.temp_bg_hi_byte;
        this.bg_attr_latch = (this.temp_at_byte) as 0 | 1 | 2 | 3;
        this.bg_attr_lo_shift_reg &= 0xFF00;
        this.bg_attr_lo_shift_reg |= 0xFF * (this.bg_attr_latch & 0x01);
        this.bg_attr_hi_shift_reg &= 0xFF00;
        this.bg_attr_hi_shift_reg |= 0xFF *  ((this.bg_attr_latch & 0x02) >> 1);
    }

    private update_shift_regs() {
        if (!!(this.mask & PpuMaskFlags.BG_ENABLE)) {
            this.bg_tile_hi_shift_reg = 0xFFFF & this.bg_tile_hi_shift_reg << 1;
            this.bg_tile_lo_shift_reg = 0xFFFF & this.bg_tile_lo_shift_reg << 1;
            this.bg_attr_lo_shift_reg = 0xFFFF & this.bg_attr_lo_shift_reg << 1;
            this.bg_attr_hi_shift_reg = 0xFFFF & this.bg_attr_hi_shift_reg << 1;
        }
        if (!!(this.mask & PpuMaskFlags.SPRITE_ENABLE) && this.pixel_cycle >= 1 && this.pixel_cycle < 258) {
            for (let i = 0; i < 8; i++) {
                if (this.secondary_oam[i * 4 + PpuOamByteOffsets.X_POS] > 0) {
                    this.secondary_oam[i * 4 + PpuOamByteOffsets.X_POS]--;
                } else {
                    this.sprite_tile_hi_shift_regs[i] <<= 1;
                    this.sprite_tile_lo_shift_regs[i] <<= 1;
                }
            }
        }
    }

    private transfer_x_addr() {
        if ((this.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        const X_ADDR_PART = PpuAddressPart.COARSE_X | PpuAddressPart.NAMETABLE_X
        this.v &= 0xFFFF & ~X_ADDR_PART;
        this.v |= this.t & X_ADDR_PART;
    }

    private transfer_y_addr() {
        if ((this.mask & (PpuMaskFlags.BG_ENABLE | PpuMaskFlags.SPRITE_ENABLE)) === 0) {
            return;
        }
        const Y_ADDR_PART = PpuAddressPart.FINE_Y | PpuAddressPart.NAMETABLE_Y | PpuAddressPart.COARSE_Y;
        this.v &= 0xFFFF & ~Y_ADDR_PART;
        this.v |= this.t & Y_ADDR_PART;
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
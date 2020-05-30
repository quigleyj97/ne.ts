/** Helpers for debugging the emulator, such as dumping memory to a texture */

import { ICartridge, Bus } from "../devices/index.js";
import { u8, u16 } from "./types.js";
import { PALLETE_TABLE } from "./structs.js";

/**
 * Dump the nametable memory to a 512*480 grayscale RGB8 texture
 * @param bus A PPU bus with a mounted controller
 * @param chr_bank The CHR bank to read from, as a 16-bit base address. See {{PpuControlFlags}} for more details
 */
export function dump_nametable(bus: Bus, chr_bank: u16) {
    const buf = new Uint8Array(512 * 480 * 3);
    // the nametable is split into 4 separate 256*256bit subtables, each with
    // their own attribute data. The nametable itself lives in the first 256*240
    // of memory, and the attribute data (what palettes to assign to which
    // regions) live in the remainder of each subtable.
    // For clarity this uses 3 for loops, one for the subtable and 2 for the
    // coords.
    for (let table = 0; table < 4; table++) {
        for (let row = 0; row < 240; row++) {
            for (let col = 0; col < 256; col++) {
                let idx = 512 * (row + (table < 2 ? 0 : 240)) + (col + (table % 2 == 0 ? 0 : 256));
                let x = ~~(col / 8);
                let y = ~~(row / 8);
                // This gives us the tile to draw. More precisely, it is the
                // middle 2 nibbles of the CHR address to read from. The first
                // nibble is given by the background CHR page select bit on
                // $PPUCTRL, and the last nibble is given by the x and y-value
                let tile_id = 0x2000 + table * 0x400 + y * 32 + x;
                let tile = bus.read(tile_id);
                let tile_addr = chr_bank | (tile << 4) | (row % 8);

                let lo = bus.read(tile_addr);
                let hi = bus.read(tile_addr + 8);
                
                // Now to pull the column, we shift right by c mod 8.
                let offset = 7 - (col % 8);
                let color_index = ((1 & (hi >> offset)) << 1) | (1 & (lo >> offset));

                // now pull the palette
                let color: u8;
                if (color_index == 0b00) {
                    // read the background
                    color = bus.read(0x3F00);
                } else {
                    const attribute_start_addr = 0x03C0;
                    let attr_idx = 0x2000 + table * 0x400 + attribute_start_addr + ~~(y / 4) * 8 + ~~(x / 4);
                    let attr = bus.read(attr_idx);
                    let attr_shift = ((~~((tile_id % 32) / 2) % 2) + (~~(tile_id / 64) % 2) * 2) * 2;

                    // this gives us our index into pallete RAM
                    let palette_idx = ((attr >> attr_shift) & 0x03) * 4;
    
                    // finally, apply a color mapping from the palette
                    color = bus.read(0x3F00 + palette_idx + color_index);
                }

                for (let i = 0; i < 3; i++) {
                    buf[idx * 3 + i] = PALLETE_TABLE[color * 3 + i];
                }
            }
        }
    }
    return buf;
}

/**
 * Dump the CHR bank memory to a grayscale 128 * 256 RGB8 texture
 * @param bus A PPU bus with a mounted cartridge
 */
export function dump_chr(cart: ICartridge) {
    const buf = new Uint8Array(128 * 256 * 3);
    for (let row = 0; row < 256; row++) {
        for (let col = 0; col < 128; col++) {
            // How the address is calculated:
            // RR = (r / 8) represents the first 2 nibbles of our address,
            // C = (c / 8) represents the third.
            // c = The fourth comes from the actual pixel row, ie, r % 8.
            // eg, 0xRRCr
            let addr = (~~(row / 8) * 0x100) + (row % 8) + ~~(col / 8) * 0x10; //((r / 8) << 8) | ((c / 8) << 4) | (r % 8);
            let lo = cart.chr.read(addr);
            let hi = cart.chr.read(addr + 8);
            // Now to pull the column, we shift right by c mod 8.
            let offset = 7 - (col % 8);
            let color_index = ((1 & (hi >> offset)) << 1) | (1 & (lo >> offset));

            // finally, apply a false-color greyscale mapping
            // TODO: implement pallete reads
            // These come from a different region of memory, which defines the
            // pallete mapping for each tile cluster
            let color: u8 = 0;
            switch (color_index) {
                case 0x00: color = 0x00; break; // black
                case 0x01: color = 0x7C; break; // dark gray
                case 0x02: color = 0xBC; break; // light gray
                case 0x03: color = 0xF8; break; // aaalllllmooosst white
            }
            buf[(row * 128 + col) * 3] = color;
            buf[(row * 128 + col) * 3 + 1] = color;
            buf[(row * 128 + col) * 3 + 2] = color;
        }
    }
    return buf;
}

/**
 * Dump the palette memory to a small RGB8 texture
 * @param bus A PPU bus with mounted palette memory
 */
export function dump_palettes(bus: Bus) {
    const buf = new Uint8Array(64 * 4 * 3);
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 64; col++) {
            const color = bus.read(0x3F00 | ~~(col / 4) | (row > 1 ? 16 : 0));
            const red   = PALLETE_TABLE[color * 3];
            const green = PALLETE_TABLE[color * 3 + 1];
            const blue  = PALLETE_TABLE[color * 3 + 2];
            buf[(row * 64 + col) * 3 + 0] = red;
            buf[(row * 64 + col) * 3 + 1] = green;
            buf[(row * 64 + col) * 3 + 2] = blue;
        }
    }
    return buf;
}
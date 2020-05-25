/** Helpers for debugging the emulator, such as dumping memory to a texture */

import { ICartridge, Bus } from "../devices/index.js";
import { u8 } from "./types.js";
import { PALLETE_TABLE } from "./structs.js";

/**
 * Dump the contents of CHR memory into a Uint8Array buffer
 * @param cart The cart to read from
 */
export function dump_chr(cart: ICartridge) {
    const buf = new Uint8Array(0x2000);
    for (let i = 0; i < buf.length; i++) {
        buf[i] = cart.chr.read(i);
    }
    return buf;
}

/**
 * Dump the nametable memory to a grayscale RGB8 texture
 * @param bus A PPU bus with a mounted controller
 */
export function dump_nametable(bus: Bus) {
    const buf = new Uint8Array(256 * 256 * 3);
    for (let row = 0; row < 256; row++) {
        for (let col = 0; col < 256; col++) {
            // How the address is calculated:
            // RR = (r / 8) represents the first 2 nibbles of our address,
            // C = (c / 8) represents the third.
            // c = The fourth comes from the actual pixel row, ie, r % 8.
            // eg, 0xRRCr
            let addr = (~~(row / 8) * 0x100) + (row % 8) + ~~(col / 8) * 0x10; //((r / 8) << 8) | ((c / 8) << 4) | (r % 8);
            let lo = bus.read(addr + 0x2000);
            let hi = bus.read(addr + 0x2008);
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
    const buf = new Uint8Array(128 * 2 * 3);
    for (let col = 0; col < 32; col++) {
        const color = bus.read(0x3F00 | col);
        const red   = PALLETE_TABLE[color * 3];
        const green = PALLETE_TABLE[color * 3 + 1];
        const blue  = PALLETE_TABLE[color * 3 + 2];
        for (let row = 0; row < 4; row++) {
            let idx = col * 4 + row;
            buf[idx * 3] = red;
            buf[idx * 3 + 1] = green;
            buf[idx * 3 + 2] = blue;
            buf[(idx + 128) * 3] = red;
            buf[(idx + 128) * 3 + 1] = green;
            buf[(idx + 128) * 3 + 2] = blue;
        }
    }
    return buf;
}
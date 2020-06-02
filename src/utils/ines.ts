//! Helpers for parsing iNES ROM files

import { u8 } from "./types.js";

/// Interface for an iNES header
export interface INesHeader {
    /// The size of the PRG chunk, in 16k chunks. Will not be 0.
    prg_size: number;
    /// The size of the CHR chunk, in 8k chunks. Will not be 0.
    chr_size: number;
    // TODO: Flag support
    /// Mapper, mirroring, battery, trainer
    flags_6: u8;
    /// Mapper, VS/PlayChoice, NES 2.0 indicator
    flags_7: u8;
    /// PRG-RAM size, rarely used.
    flags_8: u8;
    /// NTSC/PAL, rarely used
    flags_9: u8;
    /// NTSC/PAL (again?!?), PRG-RAM (again!?!), also rarely used
    flags_10: u8;
}

/** Given the first 16 bytes, parse out an iNES 2.0 header */
export function parse_ines_header(bytes: Uint8Array): INesHeader {
    // the first 4 bytes of the header are the null-terminated string "NES"
    // the last 5 bytes are unused
    return {
        prg_size: bytes[4] === 0 ? 1 : bytes[4],
        chr_size: bytes[5] === 0 ? 1 : bytes[5],
        flags_6: bytes[6],
        flags_7: bytes[7],
        flags_8: bytes[8],
        flags_9: bytes[9],
        flags_10: bytes[10],
    }
}

export const enum INesFlags6 {
    /** The mirroring mode.
     * 
     * If 0, use horizontal (vertical arrangement) mirroring
     * If 1, use vertical (horizontal arrangement) mirroring.
     * 
     * Note that some mappers (like MMC3) ignore this setting, and it only
     * applies to cartridges where the mirroring is set in hardware (such as
     * NROM).
     */
    MIRRORING = 0x01,
    /** Whether this rom contains a battery-backed RAM */
    HAS_PERSISTENT_MEMORY = 0x02,
    /** Whether this ROM contains a 512-bit trainer program.
     * 
     * Note: This emulator does not support trainers
     */
    HAS_TRAINER = 0x04,
    /** Whether to use 4-screen VRAM instead of mirroring */
    USE_FOUR_SCREEN_VRAM = 0x08,
    /** The lower nibble of the iNES mapper number */
    LOWER_MAPPER_NIBBLE = 0xF0
}

export const enum INesFlags7 {
    /** Whether this ROM was developed for the VS arcade */
    VS_UNISYSTEM_ROM = 0x01,
    /** Whether this ROM was developed for the PlayChoice arcade.
     * 
     * Note that this is rarely seen in the wild, but the presense of this bit
     * indicates that 8kb of hint screen data is included at the end of the
     * CHR section
     */
    PLAYCHOICE_10 = 0x02,
    /** If equal to 10, the rest of this ROM's headers are in iNES 2.0 format. */
    IS_INES_2_0 = 0x0C,
    /** The upper nibble of the iNES mapper number */
    UPPER_MAPPER_NIBBLE = 0xF0
}

// todo: implement other flags as needed

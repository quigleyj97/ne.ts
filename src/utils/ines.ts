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

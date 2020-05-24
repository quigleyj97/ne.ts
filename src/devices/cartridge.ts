/// The interface for a NES Cart.
///
/// Cartridges are a complex topic, since they can implement everything from
/// bank switching to coprocessing and audio augmentation. This class offers
/// a simple interface for writing cartridge implementations, which will
/// generally be based on the mapper behind them.

import { IBusDevice } from "../utils/addr.js";
import { parse_ines_header, INesHeader } from "../utils/ines.js";

export interface ICartridge {
    /** The CHR rom, for mounting on the PPU bus */
    chr: IBusDevice;
    /** The PRG rom, for mounting on the CPU bus */
    prg: IBusDevice;
}

// The simplest sort of cartridge, with no mapping
export class NROMCartridge implements ICartridge {
    public static from_buffer(header: INesHeader, buf: Uint8Array) {
        const { prg_size } = header;
        const prg_end = 16 + 0x4000 * prg_size;
        const prg_buffer = buf.slice(16, prg_end);
        const chr_buffer = buf.slice(prg_end, prg_end + 0x2000);
        return new NROMCartridge(chr_buffer, prg_buffer, prg_size === 1);
    }

    private readonly chr_buffer: Uint8Array;
    private readonly prg_buffer: Uint8Array;
    private readonly is_16k: boolean;
    public readonly chr: IBusDevice;
    public readonly prg: IBusDevice;

    constructor(chr_buffer: Uint8Array, prg_buffer: Uint8Array, is_16k: boolean) {
        this.chr_buffer = chr_buffer;
        this.prg_buffer = prg_buffer;
        this.is_16k = is_16k;
        this.chr = {
            read: (addr) => addr > 0x2000 ? 0 : this.chr_buffer[addr],
            write: () => void 0, // no-op: this is a ROM
        };
        this.prg = {
            // 0x3FE0 is 0x8000 - CART_START_ADDR, since NROM starts at $8000
            read: (addr) => this.prg_buffer[this.is_16k ? (addr - 0x3FE0) & 0x3FFF : addr - 0x3FE0],
            write: () => void 0, // no-op: this is a ROM
        };
    }
}

export class CartridgeMapperFactory {
    private static mapperRegistry = new Map<number, (header: INesHeader, buffer: Uint8Array) => ICartridge>([
        [0, NROMCartridge.from_buffer]
    ]);

    public static from_buffer(buf: Uint8Array) {
        const header = parse_ines_header(buf);
        const mapper = ((header.flags_6 & 0xF0) >> 4) + (header.flags_7 & 0xF0);
        const factory = this.mapperRegistry.get(mapper);
        if (factory == null) {
            throw Error("No mapper registered for iNES Mapper " + mapper);
        }
        return factory(header, buf);
    }
}

/// The interface for a NES Cart.
///
/// Cartridges are a complex topic, since they can implement everything from
/// bank switching to coprocessing and audio augmentation. This class offers
/// a simple interface for writing cartridge implementations, which will
/// generally be based on the mapper behind them.

import { IBusDevice } from "../utils/addr.js";
import { parse_ines_header, INesHeader, INesFlags6, INesFlags7 } from "../utils/ines.js";

export interface ICartridge {
    /** The CHR rom, for mounting on the PPU bus */
    chr: IBusDevice;
    /** The PRG rom, for mounting on the CPU bus */
    prg: IBusDevice;
}

// The simplest sort of cartridge, with no mapping
export class NROMCartridge implements ICartridge {
    public static from_buffer(header: INesHeader, buf: Uint8Array) {
        const { prg_size, flags_6 } = header;
        const prg_end = 16 + 0x4000 * prg_size;
        const prg_buffer = buf.slice(16, prg_end);
        const chr_buffer = buf.slice(prg_end, prg_end + 0x2000);
        return new NROMCartridge(chr_buffer, prg_buffer, prg_size === 1, (flags_6 & INesFlags6.MIRRORING) === 0);
    }

    private readonly chr_buffer: Uint8Array;
    private readonly prg_buffer: Uint8Array;
    private readonly nametable: Uint8Array;
    private readonly use_horizontal_mirroring: boolean;
    private readonly is_16k: boolean;
    public readonly chr: IBusDevice;
    public readonly prg: IBusDevice;

    constructor(chr_buffer: Uint8Array, prg_buffer: Uint8Array, is_16k: boolean, use_horizontal_mirroring: boolean) {
        this.chr_buffer = chr_buffer;
        this.prg_buffer = prg_buffer;
        this.nametable = new Uint8Array(0x800);
        this.use_horizontal_mirroring = use_horizontal_mirroring;
        this.is_16k = is_16k;
        this.chr = {
            read: (addr) => {
                if (addr < 0x2000) return this.chr_buffer[addr];
                let nt_addr = addr - 0x2000;
                if (this.use_horizontal_mirroring) {
                    // horizontal mirroring is done by wiring address pin 11 to
                    // CIRAM 10, meaning bit 11 is moved to where bit 10 is and
                    // the old bit 10 is dropped into the shadow realm
                    nt_addr &= 0x3FF
                    nt_addr |= (0x800 & addr) >> 1;
                } else {
                    nt_addr &= 0x7FF;
                }
                return this.nametable[nt_addr];
            },
            write: (addr, data) => {
                if (addr < 0x2000) return; // no-op: this is a ROM
                let nt_addr = addr - 0x2000;
                if (this.use_horizontal_mirroring) {
                    nt_addr &= 0x3FF
                    nt_addr |= (0x800 & addr) >> 1;
                } else {
                    nt_addr &= 0x7FF;
                }
                this.nametable[nt_addr] = data;
            }
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
        const mapper = (header.flags_6 & INesFlags6.LOWER_MAPPER_NIBBLE)
            | ((header.flags_7 & INesFlags7.UPPER_MAPPER_NIBBLE) >> 4);
        const factory = this.mapperRegistry.get(mapper);
        if (factory == null) {
            throw Error("No mapper registered for iNES Mapper " + mapper);
        }
        return factory(header, buf);
    }
}

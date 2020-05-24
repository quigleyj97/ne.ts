import { u16, u8 } from "./types.js";

/** helper function to handle little-endian addresses
 * 
 * TODO: remove or inline
 */
export function bytes_to_addr(lo: u8, hi: u8): u16 {
    return (lo << 8) + hi;
}

/// A generic interface for devices that can be driven by the bus.
export interface IBusDevice {
    read(addr: u16): u8;
    write(addr: u16, data: u8): void;
}

export class Ram implements IBusDevice {
    private buffer: Uint8Array;

    constructor(bufferSize: number) {
        this.buffer = new Uint8Array(bufferSize);
    }

    public read(addr: u16) {
        return this.buffer[addr];
    }

    public write(addr: u16, data: u8) {
        this.buffer[addr] = data;
    }
}

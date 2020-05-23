import { u16, u8 } from "./types.js";

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

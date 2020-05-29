import { IBusDevice } from "../utils/addr.js";
import { u8, u16 } from "../utils/types.js";

/**
 * A class representing the 2 controllers hooked up to the NES
 * 
 * ### Notes
 * 
 * The controllers have some rather odd behavior warranting a separate class to
 * handle their DMA access. For one, the controller isn't read until a _write_
 * to a special memory address, whereupon their state is immediately saved to
 * an internal shift register. Subsequent reads from `$4016` (for controller 1)
 * and `$4017` (for controller 2) will shift out these shift registers,
 * returning the state of the controller one. bit. at. a. time.
 * 
 * To handle 1.) the explicit state saving, and 2.) the one-by-one read nature
 * of controller support, this class will maintain an internal view of what
 * each controller's state is. It is the responsibility of the owning class to
 * update this view, by calling `update_controller()`.
 * 
 * With that view, this class will then handle the "saving" to shift-registers
 * and the bit-by-bit readout of those registers as a bus device. 
 */
export class ControllerDMAAdaptor implements IBusDevice {
    public static readonly START_ADDR = 0x4016;
    public static readonly END_ADDR = 0x4017;
    public static readonly MASK = 0xFFFF;

    private controller_states: [u8, u8] = [0x00, 0x00];
    private parallel_registers: [u8, u8] = [0x00, 0x00];
    // if true, continue pulling from the parallel registers before shifting out
    private strobe: boolean = false;

    /**
     * Update the internal view of a controller in response to an input event
     *
     * @param controller Which controller to target
     * @param key The key whose state changed
     * @param state The new state of the key (true = depressed, false = released)
     */
    public update_controller(controller: 0 | 1, key: ControllerButton, state: boolean) {
        if (state) {
            this.controller_states[controller] |= key;
        } else {
            this.controller_states[controller] &= 0xFF & ~key;
        }
    }

    /** Tick the registers by one CPU cycle. */
    public tick() {
        if (this.strobe) {
            // do direct writes instead of slices since this is hot and we don't
            // want to introduce GC pressure
            this.parallel_registers[0] = this.controller_states[0];
            this.parallel_registers[1] = this.controller_states[1];
        }
    }

    public read(addr: u16): u8 {
        const result = 0x01 & this.parallel_registers[addr];
        this.parallel_registers[addr] = this.parallel_registers[addr] >> 1;
        // TODO: Technically the first 3 bits are open-bus, but Bus doesn't yet support this
        return result;
    }

    public write(addr: u16, data: u8) {
        if (addr > 0) {
            return; // writes to $4017 do nothing
        }
        this.strobe = (data & 0x01) > 0;
    }
}

/** A bitmask for the controller buttons on a standard controller */
export enum ControllerButton {
    A = 0x01,
    B = 0x02,
    SELECT = 0x04,
    START = 0x08,
    UP = 0x10,
    DOWN = 0x20,
    LEFT = 0x40,
    RIGHT = 0x80
}

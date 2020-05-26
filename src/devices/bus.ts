//! A set of helpers for memory-mapped address buses. Multiple devices can
//! connect to a single device, and define what addresses they respond to.
//!
//! Devices recieve 0-indexed addresses; that is, it doesn't matter where on
//! the address space they're mapped, the addresses will be the same and start
//! from 0.

import { IBusDevice, u8, u16 } from "../utils/index.js";

interface IMemoryMappedDevice {
    /// The start of this mapped range
    start: u16;
    /// The end of this mapped range
    end: u16;
    /// A mask to apply to all addresses to implement mirroring.
    ///
    /// ### Note
    ///
    /// This mask is applied after subtracting addr_start from the address,
    /// before passing that address on to the device. Therefore, if your device
    /// is mounted on $2000 - $20FF, and the first 8 addresses are to be
    /// mirrored, then the mask should be 0x0007.
    mask: u16;
    /// The device actually being mapped
    dev: IBusDevice;
}

export class Bus {
    /// The list of devices currently mounted to the bus.
    ///
    /// Note that there is no ordering to this bus- most-frequently-used devices
    /// should be added first, for performance reasons.
    private devices: IMemoryMappedDevice[] = [];
    /// The last value put on the bus.
    ///
    /// This is memorized to emulate electrical effects of open bus conditions.
    private last_bus_val: u8 = 0;

    /** Add a device to the bus */
    public map_device(dev: IMemoryMappedDevice) {
        this.devices.push(dev);
    }

    /** Read from the address bus */
    public read(addr: u16) {
        for (const map of this.devices) {
            if (addr < map.start || addr > map.end) {
                continue;
            }
            const mapped_addr = (addr - map.start) & map.mask;
            const val = 0xFF & map.dev.read(mapped_addr);
            this.last_bus_val = val;
            return val;
        }
        return this.last_bus_val;
    }

    /** Write a value to the address bus */
    public write(addr: u16, data: u8) {
        this.last_bus_val = data;

        for (const map of this.devices) {
            if (addr < map.start || addr > map.end) {
                continue;
            }
            const mapped_addr = (addr - map.start) & map.mask;
            map.dev.write(mapped_addr, 0xFF & data);
            return;
        }
    }
}


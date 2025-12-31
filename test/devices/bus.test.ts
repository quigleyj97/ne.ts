import { Bus } from "../../src/index.js";

describe("Bus", () => {
    const TEST_ADDR = 0x34;
    const TEST_DATA = 0xEA;
    const TEST_MIRROR = 0x00FF;
    const MIRRORED_ADDR = 0x1234;

    class TestDevice {
        read(addr: number): number {
            expect(addr).toBe(TEST_ADDR);
            return TEST_DATA;
        }
        write(addr: number, data: number): void {
            expect(addr).toBe(TEST_ADDR);
            expect(data).toBe(TEST_DATA);
        }
    }

    it("should construct a Bus", () => {
        const bus = new Bus();
        expect(bus).toBeInstanceOf(Bus);
    });

    it("should map devices", () => {
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: 0, end: 0xFFFF, mask: 0xFFFF});
        expect(bus.devices).toHaveLength(1);
        expect(bus.read(TEST_ADDR)).toBe(TEST_DATA);
        bus.write(TEST_ADDR, TEST_DATA);
    });

    it("should handle offsets", () => {
        const ADDR_OFFSET = 0xFF;
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: ADDR_OFFSET, end: 0xFFFF, mask: 0xFFFF});
        expect(bus.read(TEST_ADDR + ADDR_OFFSET)).toBe(TEST_DATA);
    });

    it("should mirror addresses", () => {
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: 0, end: 0xFFFF, mask: TEST_MIRROR});
        expect(bus.read(MIRRORED_ADDR)).toBe(TEST_DATA);
        bus.write(MIRRORED_ADDR, TEST_DATA);
    });

    it("should mirror with offsets", () => {
        const ADDR_OFFSET = 0xABCD;
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: ADDR_OFFSET, end: 0xFFFF, mask: TEST_MIRROR});
        expect(bus.read(MIRRORED_ADDR + ADDR_OFFSET)).toBe(TEST_DATA);
    });
});

import chai from "chai";
import { Bus } from "../../lib/index.js";

const expect = chai.expect;

describe("Bus", () => {
    const TEST_ADDR = 0x34;
    const TEST_DATA = 0xEA;
    const TEST_MIRROR = 0x00FF;
    const MIRRORED_ADDR = 0x1234;

    class TestDevice {
        read(addr) {
            expect(addr).to.equal(TEST_ADDR, "Read address mismatch");
            return TEST_DATA;
        }
        write(addr, data) {
            expect(addr).to.equal(TEST_ADDR, "Write address mismatch");
            expect(data).to.equal(TEST_DATA, "Test data mismatch");
        }
    }

    it("should construct a Bus", () => {
        const bus = new Bus();
        expect(bus).to.be.instanceOf(Bus);
    });

    it("should map devices", () => {
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: 0, end: 0xFFFF, mask: 0xFFFF});
        expect(bus.devices).to.have.length(1);
        expect(bus.read(TEST_ADDR)).to.equal(TEST_DATA);
        bus.write(TEST_ADDR, TEST_DATA);
    });

    it("should handle offsets", () => {
        const ADDR_OFFSET = 0xFF;
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: ADDR_OFFSET, end: 0xFFFF, mask: 0xFFFF});
        expect(bus.read(TEST_ADDR + ADDR_OFFSET)).to.eq(TEST_DATA);
    });

    it("should mirror addresses", () => {
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: 0, end: 0xFFFF, mask: TEST_MIRROR});
        expect(bus.read(MIRRORED_ADDR)).to.eq(TEST_DATA);
        bus.write(MIRRORED_ADDR, TEST_DATA);
    });

    it("should mirror with offsets", () => {
        const ADDR_OFFSET = 0xABCD;
        const bus = new Bus();
        const dev = new TestDevice();
        bus.map_device({dev, start: ADDR_OFFSET, end: 0xFFFF, mask: TEST_MIRROR});
        expect(bus.read(MIRRORED_ADDR + ADDR_OFFSET)).to.eq(TEST_DATA);
    });
});

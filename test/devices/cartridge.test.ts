import { CartridgeMapperFactory, NROMCartridge } from "../../src/index.js";
import { readFileSync } from "fs";

const NESTEST_PATH = "./test/data/nestest.nes";
const NROM_OFFSET = 0x3FE0;

describe("Cartridge Factory", () => {
    it("should construct a cartridge from NESTEST.rom", () => {
        const buf = readFileSync(NESTEST_PATH);
        
        const cart = CartridgeMapperFactory.from_buffer(buf);

        expect(cart).toBeInstanceOf(NROMCartridge);
        expect(cart.is_16k).toBe(true);
    });
});

describe("NROMCartridge", () => {
    let buf: Buffer;
    let cart: NROMCartridge;

    beforeAll(() => {
        buf = readFileSync(NESTEST_PATH);
    });

    beforeEach(() => {
        cart = CartridgeMapperFactory.from_buffer(buf) as NROMCartridge;
    });

    it("should map PRG reads correctly", () => {
        const data = cart.prg.read(0xC000 - 0x4020);
        expect(data).toBe(0x4C);
    });

    it("should mirror PRG reads correctly", () => {
        // $3FFF and $7FFF should be mirrors in 16k PRGs like NESTEST
        // In full address space, these addresses map to the reset vector
        const left = cart.prg.read(0x3FFF + NROM_OFFSET);
        const right = cart.prg.read(0x7FFF + NROM_OFFSET);
        expect(left).toBe(0xC5);
        expect(left).toBe(right);
    });

    it("should read CHR correctly", () => {
        // $0020 should be 0x80, which can be verified by looking in xxd
        const data = cart.chr.read(0x0020);
        expect(data).toBe(0x80);
    });
});

import chai from "chai";
import { CartridgeMapperFactory, NROMCartridge } from "../../lib/index.js";
import { readFileSync } from "fs";

const expect = chai.expect;

const NESTEST_PATH = "./test/data/nestest.nes";

describe("Cartridge Factory", () => {
    it("should construct a cartridge from NESTEST.rom", () => {
        const buf = readFileSync(NESTEST_PATH);
        
        const cart = CartridgeMapperFactory.from_buffer(buf);

        expect(cart).to.be.instanceOf(NROMCartridge);
        expect(cart.is_16k).to.be.true;
    });
});

describe("NROMCartridge", () => {
    /** @type {Buffer} */
    let buf;
    /** @type {import("../../src/index.js").NROMCartridge} */
    let cart;

    before(() => {
        buf = readFileSync(NESTEST_PATH);
    });

    beforeEach(() => {
        cart = CartridgeMapperFactory.from_buffer(buf);
    });

    it("should map PRG reads correctly", () => {
        const data = cart.prg.read(0xC000);
        expect(data).to.equal(0x4C);
    });

    it("should mirror PRG reads correctly", () => {
        // $3FFF and $7FFF should be mirrors in 16k PRGs like NESTEST
        // In full address space, these addresses map to the reset vector
        const left = cart.prg.read(0x3FFF);
        const right = cart.prg.read(0x7FFF);
        expect(left).to.equal(0xC5, "Initial address doesn't match expected result")
        expect(left).to.equal(right, "Mirrors don't align");
    });

    it("should read CHR correctly", () => {
        // $0020 should be 0x80, which can be verified by looking in xxd
        const data = cart.chr.read(0x0020);
        expect(data).to.equal(0x80);
    });
})

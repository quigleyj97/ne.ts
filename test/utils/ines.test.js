import chai from "chai";
import { parse_ines_header } from "../../lib/index.js";

const expect = chai.expect;

describe("iNES header utils", () => {
    it("should parse a header correctly", () => {
        const INES_HEADER_DATA = [
            0x0, 0x0, 0x0, 0x0, 0x0, 0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x0, 0x0, 0x0, 0x0, 0x0,
        ];
        let header = parse_ines_header(INES_HEADER_DATA);

        expect(header.prg_size).to.equal(1, "PRG size mismatch");
        expect(header.chr_size).to.equal(1, "CHR size mismatch");
        expect(header.flags_6).to.equal(2, "Flags6 mismatch");
        expect(header.flags_7).to.equal(3, "Flags7 mismatch");
        expect(header.flags_8).to.equal(4, "Flags8 mismatch");
        expect(header.flags_9).to.equal(5, "Flags9 mismatch");
        expect(header.flags_10).to.equal(6, "Flags10 mismatch");
    });
});

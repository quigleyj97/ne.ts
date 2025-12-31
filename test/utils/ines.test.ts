// chai removed;
import { parse_ines_header } from "../../lib/index.js";



describe("iNES header utils", () => {
    it("should parse a header correctly", () => {
        const INES_HEADER_DATA = [
            0x0, 0x0, 0x0, 0x0, 0x0, 0x1, 0x2, 0x3, 0x4, 0x5, 0x6, 0x0, 0x0, 0x0, 0x0, 0x0,
        ];
        let header = parse_ines_header(INES_HEADER_DATA);

        expect(header.prg_size).toBe(1, "PRG size mismatch");
        expect(header.chr_size).toBe(1, "CHR size mismatch");
        expect(header.flags_6).toBe(2, "Flags6 mismatch");
        expect(header.flags_7).toBe(3, "Flags7 mismatch");
        expect(header.flags_8).toBe(4, "Flags8 mismatch");
        expect(header.flags_9).toBe(5, "Flags9 mismatch");
        expect(header.flags_10).toBe(6, "Flags10 mismatch");
    });
});

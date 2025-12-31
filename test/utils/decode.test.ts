// chai removed;
import { decode_instruction, AddressingMode, Instruction } from "../../lib/index.js";


describe("Instruction decoder", () => {
    it("should decode an instruction correctly", () => {
        let res = decode_instruction(0xEA);
        expect(res[0]).toBe(AddressingMode.Impl);
        expect(res[1]).toBe(Instruction.NOP);
    });

    it("should decode an illegal opcode", () => {
        let res = decode_instruction(0xFB);
        expect(res[0]).toBe(AddressingMode.AbsY);
        expect(res[1]).toBe(Instruction.NOP);
    });

    it("should decode an unmapped opcode", () => {
        let res = decode_instruction(0xF2);
        expect(res[0]).toBe(AddressingMode.Impl);
        expect(res[1]).toBe(Instruction.NOP);
    });
});

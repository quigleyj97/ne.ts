// chai removed;
import { log_state, parse_line, AddressingMode, Instruction, Bus } from "../../lib/index.js";



describe("Nestopia Log Parser", () => {
    it("should parse a log line correctly", () => {
        let line = parse_line("D101  C1 80     CMP ($80,X) @ 80 = 0200 = 00    A:80 X:00 Y:68 P:A4 SP:FB PPU: 66, 30 CYC:3439");
        expect(line.pc).toBe(0xD101, "Program counter mismatch");
        expect(line.instr).toBe("C1 80   ", "Instruction mismatch");
        expect(line.disasm).toBe("CMP ($80,X) @ 80 = 0200 = 00    ","Disassembly mismatch");
        expect(line.acc).toBe(0x80, "Accumulator mismatch");
        expect(line.xreg).toBe(0x00, "X register mismatch");
        expect(line.yreg).toBe(0x68, "Y register mismatch");
        expect(line.status).toBe(0xA4, "Status register mismatch");
        expect(line.stack).toBe(0xFB, "Stack pointer mismatch");
        expect(line.ppu_col).toBe(66, "PPU column counter mismatch");
        expect(line.ppu_scanline).toBe(30, "PPU scanline counter mismatch");
        expect(line.cycle).toBe(3439, "Cycle counter mismatch");
    });
});

describe("Nestopia Log Formatter", () => {
    it("should format a CPU state correctly", () => {
        const bus = new Bus();
        let state = {
            acc: 0x12,
            x: 0x34,
            y: 0x56,
            pc: 0x7890,
            addr: 0x0000,
            addr_mode: AddressingMode.AbsInd,
            instr: Instruction.JMP,
            instruction: 0x00_BB_AA_6C,
            stack: 0xAB,
            status: 0xBC,
            tot_cycles: 42
        };
        const output = log_state(state, bus);
        const TEST_STR = "7890  6C AA BB  JMP ($BBAA) = 0000              A:12 X:34 Y:56 P:BC SP:AB PPU:  0,  0 CYC:42";
        expect(output).toBe(TEST_STR);
    });
});

//! LUT for decoding 6502 instructions
//!
//! Previously, I tried replicating the logic used by the instruction decoder on
//! real hardware, however supporting unofficial opcodes while maintaining the
//! decode algorithm is simply too challenging to maintain.
//!
//! If you're curious, you can read about that algorithm here: http://nparker.llx.com/a2/opcodes.html
//!
//! This may have errors or omissions for the NES 2A03, as that CPU's
//! undocumented opcodes may be different in important ways.
//!
//! Instructions are structured as:
//!   0......7 8..........15 16.........23
//!   aaabbbcc <lo operand?> <hi operand?>
//!
//! The `cc` bits differentiate between a few subtables. The `aaa` bits
//! determine the opcode, and the `bbb` bits determine the addrssing
//! mode. `cc` never takes the form `11`.

import { u8 } from "./types.js";
import { AddressingMode, Instruction } from "./structs.js";

/** Helper to squack about illegal opcodes
 * 
 * TODO: Remove and/or inline this
 */
function illegal_opcode(opcode: u8, mnemonic: string, addr_mode: AddressingMode): [AddressingMode, Instruction] {
    console.warn("Illegal opcode: ", opcode, mnemonic);
    return [addr_mode, Instruction.NOP];
}

export function decode_instruction(instr: u8): [AddressingMode, Instruction] {
    // and now for a great big mess of generated code
    // never before in my life would I have thought generating code with Excel
    // was a good idea
    //
    // but here I am, two months into a global pandemic
    //
    // and even the cleanest opcode table I could find needed manual adjustment
    //
    // I need a shower
    switch (instr) {
        // 0x0_
        case 0x00: return [AddressingMode.Impl, Instruction.BRK];
        case 0x01: return [AddressingMode.IndX, Instruction.ORA];
        case 0x03: return illegal_opcode(instr, "SLO", AddressingMode.IndX);
        case 0x04: return [AddressingMode.ZP, Instruction.NOP];
        case 0x05: return [AddressingMode.ZP, Instruction.ORA];
        case 0x06: return [AddressingMode.ZP, Instruction.ASL];
        case 0x07: return illegal_opcode(instr, "SLO", AddressingMode.ZP);
        case 0x08: return [AddressingMode.Impl, Instruction.PHP];
        case 0x09: return [AddressingMode.Imm, Instruction.ORA];
        case 0x0A: return [AddressingMode.Accum, Instruction.ASL];
        case 0x0B: return illegal_opcode(instr, "ANC", AddressingMode.Imm);
        case 0x0C: return [AddressingMode.Abs, Instruction.NOP];
        case 0x0D: return [AddressingMode.Abs, Instruction.ORA];
        case 0x0E: return [AddressingMode.Abs, Instruction.ASL];
        case 0x0F: return illegal_opcode(instr, "SLO", AddressingMode.Abs);

        // 0x1_
        case 0x10: return [AddressingMode.Rel, Instruction.BPL];
        case 0x11: return [AddressingMode.IndY, Instruction.ORA];
        case 0x13: return illegal_opcode(instr, "SLO", AddressingMode.IndY);
        case 0x14: return [AddressingMode.ZPX, Instruction.NOP];
        case 0x15: return [AddressingMode.ZPX, Instruction.ORA];
        case 0x16: return [AddressingMode.ZPX, Instruction.ASL];
        case 0x17: return illegal_opcode(instr, "SLO", AddressingMode.ZPX);
        case 0x18: return [AddressingMode.Impl, Instruction.CLC];
        case 0x19: return [AddressingMode.AbsY, Instruction.ORA];
        case 0x1A: return [AddressingMode.Impl, Instruction.NOP]; // unofficial dup
        case 0x1B: return illegal_opcode(instr, "SLO", AddressingMode.AbsY);
        case 0x1C: return [AddressingMode.AbsX, Instruction.NOP];
        case 0x1D: return [AddressingMode.AbsX, Instruction.ORA];
        case 0x1E: return [AddressingMode.AbsX, Instruction.ASL];
        case 0x1F: return illegal_opcode(instr, "SLO", AddressingMode.AbsX);

        // 0x2_
        case 0x20: return [AddressingMode.Abs, Instruction.JSR];
        case 0x21: return [AddressingMode.IndX, Instruction.AND];
        case 0x23: return illegal_opcode(instr, "RLA", AddressingMode.IndX);
        case 0x24: return [AddressingMode.ZP, Instruction.BIT];
        case 0x25: return [AddressingMode.ZP, Instruction.AND];
        case 0x26: return [AddressingMode.ZP, Instruction.ROL];
        case 0x27: return illegal_opcode(instr, "RLA", AddressingMode.ZP);
        case 0x28: return [AddressingMode.Impl, Instruction.PLP];
        case 0x29: return [AddressingMode.Imm, Instruction.AND];
        case 0x2A: return [AddressingMode.Accum, Instruction.ROL];
        case 0x2B: return illegal_opcode(instr, "ANC", AddressingMode.Imm);
        case 0x2C: return [AddressingMode.Abs, Instruction.BIT];
        case 0x2D: return [AddressingMode.Abs, Instruction.AND];
        case 0x2E: return [AddressingMode.Abs, Instruction.ROL];
        case 0x2F: return illegal_opcode(instr, "RLA", AddressingMode.Abs);

        // 0x3_
        case 0x30: return [AddressingMode.Rel, Instruction.BMI];
        case 0x31: return [AddressingMode.IndY, Instruction.AND];
        case 0x33: return illegal_opcode(instr, "RLA", AddressingMode.IndY);
        case 0x34: return [AddressingMode.ZPX, Instruction.NOP];
        case 0x35: return [AddressingMode.ZPX, Instruction.AND];
        case 0x36: return [AddressingMode.ZPX, Instruction.ROL];
        case 0x37: return illegal_opcode(instr, "RLA", AddressingMode.ZPX);
        case 0x38: return [AddressingMode.Impl, Instruction.SEC];
        case 0x39: return [AddressingMode.AbsY, Instruction.AND];
        case 0x3A: return [AddressingMode.Impl, Instruction.NOP]; // unofficial du;
        case 0x3B: return illegal_opcode(instr, "RLA", AddressingMode.AbsY);
        case 0x3C: return [AddressingMode.AbsX, Instruction.NOP];
        case 0x3D: return [AddressingMode.AbsX, Instruction.AND];
        case 0x3E: return [AddressingMode.AbsX, Instruction.ROL];
        case 0x3F: return illegal_opcode(instr, "RLA", AddressingMode.AbsX);

        // 0x4_
        case 0x40: return [AddressingMode.Impl, Instruction.RTI];
        case 0x41: return [AddressingMode.IndX, Instruction.EOR];
        case 0x43: return illegal_opcode(instr, "SRE", AddressingMode.IndX);
        case 0x44: return [AddressingMode.ZP, Instruction.NOP];
        case 0x45: return [AddressingMode.ZP, Instruction.EOR];
        case 0x46: return [AddressingMode.ZP, Instruction.LSR];
        case 0x47: return illegal_opcode(instr, "SRE", AddressingMode.ZP);
        case 0x48: return [AddressingMode.Impl, Instruction.PHA];
        case 0x49: return [AddressingMode.Imm, Instruction.EOR];
        case 0x4A: return [AddressingMode.Accum, Instruction.LSR];
        case 0x4B: return illegal_opcode(instr, "ALR", AddressingMode.Imm);
        case 0x4C: return [AddressingMode.Abs, Instruction.JMP];
        case 0x4D: return [AddressingMode.Abs, Instruction.EOR];
        case 0x4E: return [AddressingMode.Abs, Instruction.LSR];
        case 0x4F: return illegal_opcode(instr, "SRE", AddressingMode.Abs);

        // 0x5_
        case 0x50: return [AddressingMode.Rel, Instruction.BVC];
        case 0x51: return [AddressingMode.IndY, Instruction.EOR];
        case 0x53: return illegal_opcode(instr, "SRE", AddressingMode.IndY);
        case 0x54: return [AddressingMode.ZPX, Instruction.NOP];
        case 0x55: return [AddressingMode.ZPX, Instruction.EOR];
        case 0x56: return [AddressingMode.ZPX, Instruction.LSR];
        case 0x57: return illegal_opcode(instr, "SRE", AddressingMode.ZPX);
        case 0x58: return [AddressingMode.Impl, Instruction.CLI];
        case 0x59: return [AddressingMode.AbsY, Instruction.EOR];
        case 0x5A: return [AddressingMode.Impl, Instruction.NOP]; // unofficial dup
        case 0x5B: return illegal_opcode(instr, "SRE", AddressingMode.AbsY);
        case 0x5C: return [AddressingMode.AbsX, Instruction.NOP];
        case 0x5D: return [AddressingMode.AbsX, Instruction.EOR];
        case 0x5E: return [AddressingMode.AbsX, Instruction.LSR];
        case 0x5F: return illegal_opcode(instr, "SRE", AddressingMode.AbsX);

        // 0x6_
        case 0x60: return [AddressingMode.Impl, Instruction.RTS];
        case 0x61: return [AddressingMode.IndX, Instruction.ADC];
        case 0x63: return illegal_opcode(instr, "RRA", AddressingMode.IndX);
        case 0x64: return [AddressingMode.ZP, Instruction.NOP];
        case 0x65: return [AddressingMode.ZP, Instruction.ADC];
        case 0x66: return [AddressingMode.ZP, Instruction.ROR];
        case 0x67: return illegal_opcode(instr, "RRA", AddressingMode.ZP);
        case 0x68: return [AddressingMode.Impl, Instruction.PLA];
        case 0x69: return [AddressingMode.Imm, Instruction.ADC];
        case 0x6A: return [AddressingMode.Accum, Instruction.ROR];
        case 0x6B: return illegal_opcode(instr, "ARR", AddressingMode.Imm);
        case 0x6C: return [AddressingMode.AbsInd, Instruction.JMP];
        case 0x6D: return [AddressingMode.Abs, Instruction.ADC];
        case 0x6E: return [AddressingMode.Abs, Instruction.ROR];
        case 0x6F: return illegal_opcode(instr, "RRA", AddressingMode.Abs);

        // 0x7_
        case 0x70: return [AddressingMode.Rel, Instruction.BVS];
        case 0x71: return [AddressingMode.IndY, Instruction.ADC];
        case 0x73: return illegal_opcode(instr, "RRA", AddressingMode.IndY);
        case 0x74: return [AddressingMode.ZPX, Instruction.NOP];
        case 0x75: return [AddressingMode.ZPX, Instruction.ADC];
        case 0x76: return [AddressingMode.ZPX, Instruction.ROR];
        case 0x77: return illegal_opcode(instr, "RRA", AddressingMode.ZPX);
        case 0x78: return [AddressingMode.Impl, Instruction.SEI];
        case 0x79: return [AddressingMode.AbsY, Instruction.ADC];
        case 0x7A: return [AddressingMode.Impl, Instruction.NOP]; // unofficial dup
        case 0x7B: return illegal_opcode(instr, "RRA", AddressingMode.AbsY);
        case 0x7C: return [AddressingMode.AbsX, Instruction.NOP];
        case 0x7D: return [AddressingMode.AbsX, Instruction.ADC];
        case 0x7E: return [AddressingMode.AbsX, Instruction.ROR];
        case 0x7F: return illegal_opcode(instr, "RRA", AddressingMode.AbsX);

        // 0x8_
        case 0x80: return [AddressingMode.Imm, Instruction.NOP];
        case 0x81: return [AddressingMode.IndX, Instruction.STA];
        case 0x82: return [AddressingMode.Imm, Instruction.NOP];
        case 0x83: return illegal_opcode(instr, "SAX", AddressingMode.IndX);
        case 0x84: return [AddressingMode.ZP, Instruction.STY];
        case 0x85: return [AddressingMode.ZP, Instruction.STA];
        case 0x86: return [AddressingMode.ZP, Instruction.STX];
        case 0x87: return illegal_opcode(instr, "SAX", AddressingMode.ZP);
        case 0x88: return [AddressingMode.Impl, Instruction.DEY];
        case 0x89: return [AddressingMode.Imm, Instruction.NOP];
        case 0x8A: return [AddressingMode.Impl, Instruction.TXA];
        case 0x8B: return illegal_opcode(instr, "XAA", AddressingMode.Imm);
        case 0x8C: return [AddressingMode.Abs, Instruction.STY];
        case 0x8D: return [AddressingMode.Abs, Instruction.STA];
        case 0x8E: return [AddressingMode.Abs, Instruction.STX];
        case 0x8F: return illegal_opcode(instr, "SAX", AddressingMode.Abs);

        // 0x9_
        case 0x90: return [AddressingMode.Rel, Instruction.BCC];
        case 0x91: return [AddressingMode.IndY, Instruction.STA];
        case 0x93: return illegal_opcode(instr, "AHX", AddressingMode.IndY);
        case 0x94: return [AddressingMode.ZPX, Instruction.STY];
        case 0x95: return [AddressingMode.ZPX, Instruction.STA];
        case 0x96: return [AddressingMode.ZPY, Instruction.STX];
        case 0x97: return illegal_opcode(instr, "SAX", AddressingMode.ZPY);
        case 0x98: return [AddressingMode.Impl, Instruction.TYA];
        case 0x99: return [AddressingMode.AbsY, Instruction.STA];
        case 0x9A: return [AddressingMode.Impl, Instruction.TXS];
        case 0x9B: return illegal_opcode(instr, "TAS", AddressingMode.AbsY);
        case 0x9C: return illegal_opcode(instr, "SHY", AddressingMode.AbsX);
        case 0x9D: return [AddressingMode.AbsX, Instruction.STA];
        case 0x9E: return illegal_opcode(instr, "SHX", AddressingMode.AbsY);
        case 0x9F: return illegal_opcode(instr, "AHX", AddressingMode.AbsY);

        // 0xA_
        case 0xA0: return [AddressingMode.Imm, Instruction.LDY];
        case 0xA1: return [AddressingMode.IndX, Instruction.LDA];
        case 0xA2: return [AddressingMode.Imm, Instruction.LDX];
        case 0xA3: return illegal_opcode(instr, "LAX", AddressingMode.IndX);
        case 0xA4: return [AddressingMode.ZP, Instruction.LDY];
        case 0xA5: return [AddressingMode.ZP, Instruction.LDA];
        case 0xA6: return [AddressingMode.ZP, Instruction.LDX];
        case 0xA7: return illegal_opcode(instr, "LAX", AddressingMode.ZP);
        case 0xA8: return [AddressingMode.Impl, Instruction.TAY];
        case 0xA9: return [AddressingMode.Imm, Instruction.LDA];
        case 0xAA: return [AddressingMode.Impl, Instruction.TAX];
        case 0xAB: return illegal_opcode(instr, "LAX", AddressingMode.Imm);
        case 0xAC: return [AddressingMode.Abs, Instruction.LDY];
        case 0xAD: return [AddressingMode.Abs, Instruction.LDA];
        case 0xAE: return [AddressingMode.Abs, Instruction.LDX];
        case 0xAF: return illegal_opcode(instr, "LAX", AddressingMode.Abs);

        // 0xB_
        case 0xB0: return [AddressingMode.Rel, Instruction.BCS];
        case 0xB1: return [AddressingMode.IndY, Instruction.LDA];
        case 0xB3: return illegal_opcode(instr, "LAX", AddressingMode.IndY);
        case 0xB4: return [AddressingMode.ZPX, Instruction.LDY];
        case 0xB5: return [AddressingMode.ZPX, Instruction.LDA];
        case 0xB6: return [AddressingMode.ZPY, Instruction.LDX];
        case 0xB7: return illegal_opcode(instr, "LAX", AddressingMode.ZPY);
        case 0xB8: return [AddressingMode.Impl, Instruction.CLV];
        case 0xB9: return [AddressingMode.AbsY, Instruction.LDA];
        case 0xBA: return [AddressingMode.Impl, Instruction.TSX];
        case 0xBB: return illegal_opcode(instr, "LAS", AddressingMode.AbsY);
        case 0xBC: return [AddressingMode.AbsX, Instruction.LDY];
        case 0xBD: return [AddressingMode.AbsX, Instruction.LDA];
        case 0xBE: return [AddressingMode.AbsY, Instruction.LDX];
        case 0xBF: return illegal_opcode(instr, "LAX", AddressingMode.AbsY);

        // 0xC_
        case 0xC0: return [AddressingMode.Imm, Instruction.CPY];
        case 0xC1: return [AddressingMode.IndX, Instruction.CMP];
        case 0xC2: return [AddressingMode.Imm, Instruction.NOP];
        case 0xC3: return illegal_opcode(instr, "DCP", AddressingMode.IndX);
        case 0xC4: return [AddressingMode.ZP, Instruction.CPY];
        case 0xC5: return [AddressingMode.ZP, Instruction.CMP];
        case 0xC6: return [AddressingMode.ZP, Instruction.DEC];
        case 0xC7: return illegal_opcode(instr, "DCP", AddressingMode.ZP);
        case 0xC8: return [AddressingMode.Impl, Instruction.INY];
        case 0xC9: return [AddressingMode.Imm, Instruction.CMP];
        case 0xCA: return [AddressingMode.Impl, Instruction.DEX];
        case 0xCB: return illegal_opcode(instr, "AXS", AddressingMode.Imm);
        case 0xCC: return [AddressingMode.Abs, Instruction.CPY];
        case 0xCD: return [AddressingMode.Abs, Instruction.CMP];
        case 0xCE: return [AddressingMode.Abs, Instruction.DEC];
        case 0xCF: return illegal_opcode(instr, "DCP", AddressingMode.Abs);

        // 0xD_
        case 0xD0: return [AddressingMode.Rel, Instruction.BNE];
        case 0xD1: return [AddressingMode.IndY, Instruction.CMP];
        case 0xD3: return illegal_opcode(instr, "DCP", AddressingMode.IndY);
        case 0xD4: return [AddressingMode.ZPX, Instruction.NOP];
        case 0xD5: return [AddressingMode.ZPX, Instruction.CMP];
        case 0xD6: return [AddressingMode.ZPX, Instruction.DEC];
        case 0xD7: return illegal_opcode(instr, "DCP", AddressingMode.ZPX);
        case 0xD8: return [AddressingMode.Impl, Instruction.CLD];
        case 0xD9: return [AddressingMode.AbsY, Instruction.CMP];
        case 0xDA: return [AddressingMode.Impl, Instruction.NOP]; // unofficial dup
        case 0xDB: return illegal_opcode(instr, "DCP", AddressingMode.AbsY);
        case 0xDC: return [AddressingMode.AbsX, Instruction.NOP];
        case 0xDD: return [AddressingMode.AbsX, Instruction.CMP];
        case 0xDE: return [AddressingMode.AbsX, Instruction.DEC];
        case 0xDF: return illegal_opcode(instr, "DCP", AddressingMode.AbsX);
        // 0xE_
        case 0xE0: return [AddressingMode.Imm, Instruction.CPX];
        case 0xE1: return [AddressingMode.IndX, Instruction.SBC];
        case 0xE2: return [AddressingMode.Imm, Instruction.NOP];
        case 0xE3: return illegal_opcode(instr, "ISC", AddressingMode.IndX);
        case 0xE4: return [AddressingMode.ZP, Instruction.CPX];
        case 0xE5: return [AddressingMode.ZP, Instruction.SBC];
        case 0xE6: return [AddressingMode.ZP, Instruction.INC];
        case 0xE7: return illegal_opcode(instr, "ISC", AddressingMode.ZP);
        case 0xE8: return [AddressingMode.Impl, Instruction.INX];
        case 0xE9: return [AddressingMode.Imm, Instruction.SBC];
        case 0xEA: return [AddressingMode.Impl, Instruction.NOP];
        case 0xEB: return [AddressingMode.Imm, Instruction.SBC];
        case 0xEC: return [AddressingMode.Abs, Instruction.CPX];
        case 0xED: return [AddressingMode.Abs, Instruction.SBC];
        case 0xEE: return [AddressingMode.Abs, Instruction.INC];
        case 0xEF: return illegal_opcode(instr, "ISC", AddressingMode.Abs);

        // 0xF_
        case 0xF0: return [AddressingMode.Rel, Instruction.BEQ];
        case 0xF1: return [AddressingMode.IndY, Instruction.SBC];
        case 0xF3: return illegal_opcode(instr, "ISC", AddressingMode.IndY);
        case 0xF4: return [AddressingMode.ZPX, Instruction.NOP];
        case 0xF5: return [AddressingMode.ZPX, Instruction.SBC];
        case 0xF6: return [AddressingMode.ZPX, Instruction.INC];
        case 0xF7: return illegal_opcode(instr, "ISC", AddressingMode.ZPX);
        case 0xF8: return [AddressingMode.Impl, Instruction.SED];
        case 0xF9: return [AddressingMode.AbsY, Instruction.SBC];
        case 0xFA: return [AddressingMode.Impl, Instruction.NOP]; // unofficial dup
        case 0xFB: return illegal_opcode(instr, "ISC", AddressingMode.AbsY);
        case 0xFC: return [AddressingMode.AbsX, Instruction.NOP];
        case 0xFD: return [AddressingMode.AbsX, Instruction.SBC];
        case 0xFE: return [AddressingMode.AbsX, Instruction.INC];
        case 0xFF: return illegal_opcode(instr, "ISC", AddressingMode.AbsX);

        default:
            console.warn("Unmapped opcode used: ", instr);
            return [AddressingMode.Impl, Instruction.NOP];

    }
}
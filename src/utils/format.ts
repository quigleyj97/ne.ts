/**
 * Helper utilities for creating and parsing NESTOPIA-style formatted logs
 */

import { ICpuState, AddressingMode, Instruction } from "./structs.js";
import { Bus } from "../devices/bus.js";
import { bytes_to_addr } from "./addr.js";
import { u16, u8 } from "./types.js";

//#region formatting helpers
const hex = (input: number, width: number) => left_pad(input.toString(16).toUpperCase(), "0", width);
const left_pad = (input: string, fill: string, width: number) => (new Array(width).fill(fill).join("") + input).slice(-width);
const right_pad = (input: string, fill: string, width: number) => (input + new Array(width).fill(fill).join("")).slice(0, width);
//#endregion

export function log_state(state: ICpuState, bus: Bus) {
    let {
        instruction,
        addr_mode,
        addr,
        instr,
        x,
        y,
        acc,
        pc,
        status,
        stack,
        tot_cycles
    } = state;
    let bytes = [instruction & 0xFF, (instruction & 0xFF00) >> 8, (instruction & 0xFF0000) >> 16];
    let ops: string;
    switch (addr_mode) {
        case AddressingMode.Abs:
        case AddressingMode.AbsX:
        case AddressingMode.AbsY:
        case AddressingMode.AbsInd:
            ops = `${hex(bytes[0], 2)} ${hex(bytes[1], 2)} ${hex(bytes[2], 2)}`;
            break;
        case AddressingMode.Accum:
        case AddressingMode.Impl:
            ops = right_pad(hex(bytes[0], 2), " ", 8);
            break;
        default:
            ops = right_pad(`${hex(bytes[0], 2)} ${hex(bytes[1], 2)}`, " ", 8);
    }

    let operand_bytes = bytes_to_addr(bytes[2], bytes[1]);
    let data = bus.read(addr);
    let is_jmp = instr == Instruction.JMP || instr == Instruction.JSR;
    let instr_str: string;
    switch (addr_mode) {
        case AddressingMode.Abs: {
            instr_str = `${Instruction[instr]} $${hex(addr, 4)}`;
            if (!is_jmp) {
                instr_str += " = " + hex(data, 2);
            }
            break;
        }
        case AddressingMode.AbsX: {
            instr_str = `${Instruction[instr]} $${hex(operand_bytes, 4)},X @ ${hex(addr, 4)} = ${hex(data, 2)}`;
            break;
        }
        case AddressingMode.AbsY: {
            instr_str = `${Instruction[instr]} $${hex(operand_bytes, 4)},Y @ ${hex(addr, 4)} = ${hex(data, 2)}`;
            break;
        }
        case AddressingMode.AbsInd: {
            instr_str = `${Instruction[instr]} ($${hex(operand_bytes, 4)}) = ${hex(addr, 4)}`;
            break;
        }
        case AddressingMode.Imm:
            instr_str = `${Instruction[instr]} #$${hex(bytes[1], 2)}`;
            break;
        case AddressingMode.ZP:
            instr_str = `${Instruction[instr]} $${hex(addr, 2)} = ${hex(data, 2)}`;
            break;
        case AddressingMode.ZPX:
            instr_str = `${Instruction[instr]} $${hex(bytes[1], 2)},X @ ${hex(addr, 2)} = ${hex(data, 2)}`;
            break;
        case AddressingMode.ZPY:
            instr_str = `${Instruction[instr]} $${hex(bytes[1], 2)},Y @ ${hex(addr, 2)} = ${hex(data, 2)}`;
            break;
        case AddressingMode.Impl:
            instr_str = `${Instruction[instr]}`;
            break;
        case AddressingMode.Rel:
            instr_str = `${Instruction[instr]} $${hex(addr, 4)}`;
            break;
        case AddressingMode.Accum:
            instr_str = `${Instruction[instr]} A`;
            break;
        case AddressingMode.IndX: {
            let sum = 0xFF & (x + bytes[1]);
            instr_str = `${Instruction[instr]} ($${hex(bytes[1], 2)},X) @ ${hex(sum, 2)} = ${hex(addr, 4)} = ${hex(data, 2)}`;
            break;
        }
        case AddressingMode.IndY: {
            let ind = bytes_to_addr(
                bus.read(0xFF & (bytes[1] + 1)),
                bus.read(bytes[1]),
            );
            instr_str = `${Instruction[instr]} ($${hex(bytes[1], 2)}),Y = ${hex(ind, 4)} @ ${hex(addr, 4)} = ${hex(data, 2)}`;
            break;
        }
    }

    return `${hex(pc, 4)}  ${right_pad(ops, " ", 8)}  ${right_pad(instr_str, " ", 32)}A:${hex(acc, 2)} X:${hex(x, 2)} Y:${hex(y, 2)} P:${hex(status, 2)} SP:${hex(stack, 2)} PPU:  0,  0 CYC:${tot_cycles}`;
}

export interface INestopiaLogLine {
    pc: u16;
    instr: string;
    disasm: string;
    acc: u8;
    xreg: u8;
    yreg: u8;
    status: u8;
    stack: u8;
    ppu_col: u16;
    ppu_scanline: u16;
    cycle: number;
}

/**
 * Parse important fields from a NESTOPIA log line
 *
 * This is useful for comparing specific fields, for instance the NESTEST runner
 * uses this to allow minor cycle count variations.
 *
 * @param line A line from a NESTOPIA-style log
 */
export function parse_line(line: string) {
    return {
        pc: 0xFFFF & Number.parseInt(line.slice(0, 4), 16),
        instr: line.slice(6, 14),
        disasm: line.slice(16, 48),
        acc: 0xFF & Number.parseInt(line.slice(50, 52), 16),
        xreg: 0xFF & Number.parseInt(line.slice(55, 57), 16),
        yreg: 0xFF & Number.parseInt(line.slice(60, 62), 16),
        status: 0xFF & Number.parseInt(line.slice(65, 67), 16),
        stack: 0xFF & Number.parseInt(line.slice(71, 73), 16),
        ppu_col: Number.parseInt(line.slice(78, 81), 10),
        ppu_scanline: Number.parseInt(line.slice(82, 85), 10),
        cycle: Number.parseInt(line.slice(90), 10),
    } as INestopiaLogLine;
}

/** Test whether two log lines are equal 'ish'
 * 
 * This allows for some variation in PPU col/scanlines and cycle counts. If an
 * unacceptable discrepancy is found, this function will throw an assertion
 * error. Otherwise, return.
 * 
 * assertFn is provided to allow for integration with your test environment, but
 * defaults to console.assert
 */
export function test_log_lines_eq(left: INestopiaLogLine, right: INestopiaLogLine, assertFn: (cond: boolean, message: string) => void = console.assert) {
    assertFn(left.pc === right.pc, "Program counter mismatch");
    assertFn(left.instr === right.instr, "Instruction mismatch");
    assertFn(left.disasm === right.disasm, "Disassembly mismatch");
    assertFn(left.acc === right.acc, "Accumulator mismatch");
    assertFn(left.xreg === right.xreg, "X register mismatch");
    assertFn(left.yreg === right.yreg, "Y register mismatch");
    assertFn(left.status === right.status, "Status register mismatch");
    assertFn(left.stack === right.stack, "Stack pointer mismatch");
    // disable PPU checks for now
    // assertFn(left.ppu_col === right.ppu_col , "PPU column counter mismatch");
    // assertFn(left.ppu_scanline === right.ppu_scanline , "PPU scanline counter mismatch");

    // Test that the cycle count does not deviate more than 100 cycles
    let deviation = Math.abs(left.cycle - right.cycle);
    assertFn(deviation < 100, "Cycle count deviation");

}
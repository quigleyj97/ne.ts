import { u8, u16, ICpuState, POWERON_CPU_STATE, CpuStatus, decode_instruction, AddressingMode, Instruction, bytes_to_addr, log_state } from "../utils/index.js";
import { Bus } from "./bus.js";

export const RESET_VECTOR = 0xFFFC;
export const NMI_VECTOR = 0xFFFA;
export const IRQ_VECTOR = 0xFFFE;

export class Cpu6502 {
    public state: ICpuState = { ...POWERON_CPU_STATE };
    private bus: Bus;
    private cycles: number = 0;
    /** a flip-flop to help with synchronization */
    private _is_odd_cycle: boolean = false;
    private interrupt_pending: boolean = false;
    private maskable_interrupt: boolean = false;

    constructor(bus: Bus) {
        this.bus = bus;
        const hi = this.bus.read(RESET_VECTOR);
        const lo = this.bus.read(RESET_VECTOR + 1);
        this.state.pc = bytes_to_addr(lo, hi);
    }

    public tick() {
        if ((this.cycles > 0)) {
            this.state.tot_cycles += 1;
            this.cycles -= 1;
            this._is_odd_cycle = !this._is_odd_cycle;
            return false;
        }
        return true;
    }

    /** Add a cycle to the CPU emulator without doing anything */
    public tock() {
        this.cycles++;
    }

    public exec() {
        this.run_interrupt();
        this.load_opcode();
        this.decode_opcode(this.state.instruction);
        this.state.addr = this.get_addr(this.state.instruction);
        this.exec_instr();        
    }

    public reset() {
        this.state.stack -= 3;
        this.state.status |= CpuStatus.IRQ_DISABLE;
        const hi = this.read_bus(RESET_VECTOR);
        const lo = this.read_bus(RESET_VECTOR + 1);
        this.state.pc = bytes_to_addr(lo, hi);
    }

    public debug() {
        let old_pc = this.state.pc;
        this.run_interrupt();
        this.load_opcode();
        this.decode_opcode(this.state.instruction);
        this.state.addr = this.get_addr(this.state.instruction);
        let new_pc = this.state.pc;
        this.state.pc = old_pc;
        let debug_str = this.toString();
        this.state.pc = new_pc;
        this.exec_instr();
        return debug_str;
    }

    public set_flag(flag: CpuStatus) {
        this.state.status |= flag;
    }

    public clear_flag(flag: CpuStatus) {
        this.state.status &= (0xFF & ~flag);
    }

    public toggle_flag(flag: CpuStatus, test: boolean) {
        test ? this.set_flag(flag) : this.clear_flag(flag);
    }

    public jmp(addr: u16) {
        this.state.pc = addr;
    }

    public trigger_nmi() {
        this.interrupt_pending = true;
        this.maskable_interrupt = false;
    }

    public trigger_irq() {
        if ((this.state.status & CpuStatus.IRQ_DISABLE)) {
            return; // interrupt was masked
        }

        this.interrupt_pending = true;
        this.maskable_interrupt = false;
    }

    public is_odd_cycle() {
        return this._is_odd_cycle;
    }

    /// Read a byte from the bus, adding one to the cycle time
    public read_bus(addr: u16): u8 {
        this.cycles += 1;
        return this.bus.read(addr);
    }

    public write_bus(addr: u16, data: u8) {
        this.cycles += 1;
        this.bus.write(addr, data);
    }

    private load_opcode() {
        let opcode = this.read_bus(this.state.pc);
        let op1 = this.read_bus(0xFFFF & (this.state.pc + 1));
        let op2 = this.read_bus(0xFFFF & (this.state.pc + 2)); // note that we may need to subtract these micro ops later
        this.state.instruction = opcode + (op1 << 8) + (op2 << 16);
    }

    private adv_pc(inc: u16) {
        this.state.pc = 0xFFFF & (this.state.pc + inc);
    }

    private decode_opcode(instruction: number) {
        ([this.state.addr_mode, this.state.instr] = decode_instruction(instruction & 0xFF));
    }

    /// Read the data at the resolved address
    private read(): u8 {
        switch (this.state.addr_mode) {
            case AddressingMode.Imm: return (this.state.instruction & 0xFF00) >> 8;
            case AddressingMode.Accum: return this.state.acc;
            default: return this.read_bus(this.state.addr);
        }
    }

    private write(data: u8) {
        switch (this.state.addr_mode) {
            case AddressingMode.Imm: return; // this is a non-sensical operation
            case AddressingMode.Accum: return void (this.state.acc = data);
            default: return void this.write_bus(this.state.addr, data);
        }
    }

    /// Gets the address of the operand to read from.
    ///
    /// # Notes
    ///
    /// This sets the `cycles` to the average whole number of cycles any
    /// instruction with this addressing mode will have. Other instructions may
    /// need to add or subtract to compensate, refer to the 6502 datasheet for
    /// details:
    ///
    /// http://archive.6502.org/datasheets/mos_6501-6505_mpu_preliminary_aug_1975.pdf
    ///
    /// A note on the so-called "oops" cycle: The "oops" cycle occurs when an
    /// index instruction crosses a page boundary, as the CPU reads off the high
    /// byte first without checking for a carry-out. Some instructions (like all
    /// the store instructions) have some special-cased behavior that the 6502
    /// datasheet details. These depend on the instruction being executed, but
    /// this function is the best place to
    private get_addr(instruction: number): u16 {
        let { x, y, addr_mode } = this.state;
        // Advance the PC at _least_ 1 byte
        this.adv_pc(1);

        let op1 = (this.state.instruction & 0xFF00) >> 8;
        let op2 = (this.state.instruction & 0xFF0000) >> 16;

        switch (addr_mode) {
            case AddressingMode.Abs: {
                this.adv_pc(2);
                return bytes_to_addr(op2, op1);
            }
            case AddressingMode.AbsInd: {
                let addr_lo = bytes_to_addr(op2, op1);
                let addr_hi = bytes_to_addr(op2, 0xFF & (op1 + 1));
                this.adv_pc(2);
                const hi = this.read_bus(addr_hi);
                const lo = this.read_bus(addr_lo);
                return bytes_to_addr(hi, lo)
            }
            case AddressingMode.AbsX: {
                let addr = 0xFFFF & (bytes_to_addr(op2, op1) + x);
                this.adv_pc(2);
                if ((((x + op1) & 0x0100) == 0x0100)) {
                    this.cycles += 1; // oops cycle
                }
                this.cycles += 2;
                return addr;
            }
            case AddressingMode.AbsY: {
                let addr = 0xFFFF & (bytes_to_addr(op2, op1) + y);
                this.adv_pc(2);
                if ((((y + op1) & 0x0100) == 0x0100)) {
                    this.cycles += 1; // oops cycle
                }
                this.cycles += 2;
                return addr;
            }
            case AddressingMode.Accum:
                // TODO: Make addressing Optional?
                this.cycles -= 1;
                return 0x0000;
            case AddressingMode.Imm:
                this.adv_pc(1);
                this.cycles -= 1;
                return 0x0000;
            case AddressingMode.Impl:
                this.cycles -= 1;
                return 0x0000;
            case AddressingMode.IndX: {
                this.cycles -= 1; // lop off one of the micro-ops
                // I know we immediately re-add it but I want cycle corrections
                // to be purposeful, since we're trying for clock cycle accuracy
                this.adv_pc(1);
                let val = 0xFF & (op1 + x);
                let lo = this.read_bus(val);
                let hi = this.read_bus(0xFF & (val + 1));
                this.cycles += 1;
                return bytes_to_addr(hi, lo);
            }
            case AddressingMode.IndY: {
                this.adv_pc(1);
                this.cycles -= 1;
                let lo = this.read_bus(op1);
                let hi = this.read_bus(0xFF & (op1 + 1));
                if ((((y + lo) & 0x0100) == 0x0100)) {
                    this.cycles += 1; // oops cycle
                }
                return 0xFFFF & (bytes_to_addr(hi, lo) + y);
            }
            case AddressingMode.Rel: {
                this.adv_pc(1);
                this.cycles -= 1;
                // The 'offset' is _signed_, so we need to add it as a signed
                // integer.
                let lo = this.state.pc & 0xFF;
                let hi = (this.state.pc & 0xFF00) >> 8;
                let addr = bytes_to_addr(hi, lo);
                if ((op1 > 127)) {
                    // Twos compliment
                    return 0xFFFF & (addr - ((0xFF & ~op1) + 1));
                } else {
                    return 0xFFFF & (addr + op1);
                }
            }
            case AddressingMode.ZP:
                this.adv_pc(1);
                this.cycles -= 1;
                return bytes_to_addr(0, op1)
            case AddressingMode.ZPX:
                this.adv_pc(1);
                this.cycles -= 1;
                return bytes_to_addr(0, 0xFF & (op1 + x));
            case AddressingMode.ZPY:
                this.adv_pc(1);
                this.cycles -= 1;
                return bytes_to_addr(0, 0xFF & (op1 + y));
        }
    }

    private push_stack(data: u8) {
        const addr = bytes_to_addr(0x01, this.state.stack);
        this.bus.write(addr, data);
        this.cycles += 1;
        this.state.stack -= 1;
        this.state.stack &= 0xFF;
    }

    private pop_stack(): u8 {
        this.state.stack += 1;
        this.state.stack &= 0xFF;
        const addr = bytes_to_addr(0x01, this.state.stack);
        return this.read_bus(addr);
    }

    private check_carry(val: u16) {
        this.toggle_flag(CpuStatus.CARRY, ((val & 0x100) === 0x100));
    }

    private check_zero(val: u8) {
        this.toggle_flag(CpuStatus.ZERO, val === 0);
    }

    private check_overflow(left: u8, right: u8) {
        const res = left + right;
        this.toggle_flag(CpuStatus.OVERFLOW, (((left ^ res) & (right ^ res)) & 0x80) !== 0);
    }

    private check_negative(op: u8) {
        this.toggle_flag(CpuStatus.NEGATIVE, (op & 0x80) != 0);
    }

    /// Execute the loaded instruction.
    ///
    /// Internally this uses a massive match pattern- TBD on whether this should
    /// be changed, but given that most of the instructions are this-contained
    /// and very short, I think it's not indefensible (plus it's easy).
    private exec_instr() {
        const { instr, addr_mode, addr } = this.state;
        switch (instr) {
            //region Arithmetic ops
            // ADC SBC
            case Instruction.ADC: {
                if (this.state.status & CpuStatus.DECIMAL) {
                    console.warn(" [WARN] This emulator doesn't support BCD, but the BCD flag is set");
                }
                let op = this.read();
                let val = this.state.acc + op + ((this.state.status & CpuStatus.CARRY) ? 1 : 0);
                this.check_carry(val);
                this.check_overflow(this.state.acc, op);
                this.state.acc = (0xFF & val);
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            case Instruction.SBC: {
                if (this.state.status & CpuStatus.DECIMAL) {
                    console.warn(" [WARN] This emulator doesn't support BCD, but the BCD flag is set");
                }
                let op = this.read();
                let val = this.state.acc - op - (((0xFF & (0xFF & ~this.state.status)) & CpuStatus.CARRY) ? 1 : 0);
                this.check_carry(0xFFFF & ~val);
                this.check_overflow(this.state.acc, 0xFF & ~op);
                this.state.acc = (0xFF & val);
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            //endregion

            //region Bitwise ops
            // AND BIT EOR ORA
            case Instruction.AND: {
                this.state.acc &= this.read();
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            case Instruction.BIT: {
                let op = this.read();
                let res = this.state.acc & op;
                this.check_zero(res);
                this.state.status = (this.state.status & 0x3F) | (0xC0 & op);
                break;
            }
            case Instruction.EOR: {
                this.state.acc ^= this.read();
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            case Instruction.ORA: {
                this.state.acc |= this.read();
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            //endregion
            case Instruction.ASL: {
                let op = this.read();
                let res_ = op << 1;
                this.check_carry(res_);
                let res = (0xFF & res_);
                this.check_zero(res);
                this.check_negative(res);
                // Cycle corrections
                if (addr_mode == AddressingMode.ZP || addr_mode == AddressingMode.Abs) {
                    this.cycles += 1;
                };
                this.write(res);
                break;
            }

            //region Branch instructions
            // BPL BMI BVC BVS BCC BCS BEQ BNE
            case Instruction.BPL: {
                if (this.state.status & CpuStatus.NEGATIVE) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BMI: {
                if ((0xFF & ~this.state.status) & CpuStatus.NEGATIVE) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BVC: {
                if (this.state.status & CpuStatus.OVERFLOW) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BVS: {
                if ((0xFF & ~this.state.status) & CpuStatus.OVERFLOW) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BCC: {
                if (this.state.status & CpuStatus.CARRY) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BCS: {
                if ((0xFF & ~this.state.status) & CpuStatus.CARRY) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BEQ: {
                if ((0xFF & ~this.state.status) & CpuStatus.ZERO) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            case Instruction.BNE: {
                if (this.state.status & CpuStatus.ZERO) {
                    return;
                }
                this.cycles += 1;
                this.state.pc = addr;
                break;
            }
            //endregion
            case Instruction.BRK: {
                let addr_bytes = this.state.pc;
                this.push_stack((addr_bytes & 0xFF00) >> 8);
                this.push_stack(addr_bytes & 0xFF);
                this.set_flag(CpuStatus.BREAK);
                this.set_flag(CpuStatus.UNUSED);
                let status = this.state.status;
                this.push_stack(status);
                let addr_hi = this.read_bus(0xFFFE);
                let addr_lo = this.read_bus(0xFFFF);
                this.state.pc = bytes_to_addr(addr_lo, addr_hi);
                break;
            }

            //region Compare functions
            // CMP CPX CPY
            case Instruction.CMP: {
                let data = this.read();
                let res = 0xFF & (this.state.acc - data);
                this.toggle_flag(CpuStatus.CARRY, this.state.acc >= data);
                this.check_zero(res);
                this.check_negative(res);
                break;
            }
            case Instruction.CPX: {
                let data = this.read();
                let res = 0xFF & (this.state.x - data);
                this.toggle_flag(CpuStatus.CARRY, this.state.x >= data);
                this.check_zero(res);
                this.check_negative(res);
                break;
            }
            case Instruction.CPY: {
                let data = this.read();
                let res = 0xFF & (this.state.y - data);
                this.toggle_flag(CpuStatus.CARRY, this.state.y >= data);
                this.check_zero(res);
                this.check_negative(res);
                break;
            }
            // endregion

            //region Memory functions
            // DEC INC LSR ROL ROR
            case Instruction.DEC: {
                let op = 0xFF & (this.read() - 1);
                this.cycles += 1;
                this.write(op);
                this.check_zero(op);
                this.check_negative(op);
                break;
            }
            case Instruction.INC: {
                let op = 0xFF & (this.read() + 1);
                this.cycles += 1;
                this.write(op);
                this.check_zero(op);
                this.check_negative(op);
                break;
            }
            case Instruction.LSR: {
                // I'm doing a bit of a trick here
                // If we look at the *high* byte, then functionally there's no
                // difference between (u16 << 7) and (u8 >> 1). But by casting
                // to u16 and doing it 'backwards', we preserve the lopped off
                // bit so that we can use it to set the carry bit
                let shifted = this.read() << 7;
                // we want the last bit for the carry ------------v
                this.toggle_flag(CpuStatus.CARRY, (shifted & 0x00_80) == 0x00_80);
                // throw out the extra byte now that we're done with it
                let data = shifted >> 8;
                this.check_zero(data);
                this.check_negative(data);
                this.write(data);
                // cycle count correction
                if (addr_mode == AddressingMode.Abs || addr_mode == AddressingMode.ZP) {
                    this.cycles += 1
                };
                break;
            }
            case Instruction.ROR: {
                // See my notes on the LSR instruction, I do a similar trick
                // here (for similar reasons)
                let shifted = (this.read() << 7) | ((this.state.status & CpuStatus.CARRY) ? 0x80_00 : 0x0);
                this.toggle_flag(CpuStatus.CARRY, (shifted & 0x00_80) == 0x00_80);
                let data = shifted >> 8;
                this.check_zero(data);
                this.check_negative(data);
                this.write(data);
                // cycle count correction
                if (addr_mode == AddressingMode.Abs || addr_mode == AddressingMode.ZP) {
                    this.cycles += 1
                };
                break;
            }
            case Instruction.ROL: {
                let shifted = (this.read() << 1) | (this.state.status & CpuStatus.CARRY ? 0x01 : 0x00);
                this.toggle_flag(CpuStatus.CARRY, (shifted & 0x01_00) == 0x01_00);
                let data = (shifted & 0xFF);
                this.check_zero(data);
                this.check_negative(data);
                this.write(data);
                // cycle count correction
                if (addr_mode == AddressingMode.Abs || addr_mode == AddressingMode.ZP) {
                    this.cycles += 1
                };
                break;
            }
            //endregion

            //region Flag operations
            // CLC SEC CLI SEI CLV CLD SED
            case Instruction.CLC:
                this.clear_flag(CpuStatus.CARRY);
                break;
            case Instruction.SEC:
                this.set_flag(CpuStatus.CARRY);
                break;
            case Instruction.CLI:
                this.clear_flag(CpuStatus.IRQ_DISABLE);
                break;
            case Instruction.SEI:
                this.set_flag(CpuStatus.IRQ_DISABLE);
                break;
            case Instruction.CLV:
                this.clear_flag(CpuStatus.OVERFLOW);
                break;
            case Instruction.CLD:
                this.clear_flag(CpuStatus.DECIMAL);
                break;
            case Instruction.SED:
                this.set_flag(CpuStatus.DECIMAL);
                break;
            //endregion

            //region Jumps
            // JMP JSR RTI RTS
            case Instruction.JMP: {
                if (addr_mode != AddressingMode.Abs) {
                    this.cycles += 1;
                }
                this.state.pc = addr;
                break;
            }
            case Instruction.JSR: {
                if (addr_mode != AddressingMode.Abs) {
                    this.cycles += 1;
                }
                let addr_bytes = this.state.pc - 1;
                this.push_stack((addr_bytes & 0xFF00) >> 8);
                this.push_stack(addr_bytes & 0xFF);
                this.state.pc = addr;
                this.cycles += 1;
                break;
            }
            case Instruction.RTI: {
                let flags = this.pop_stack();
                this.state.status = flags | CpuStatus.UNUSED;
                let lo = this.pop_stack();
                let hi = this.pop_stack();
                this.state.pc = bytes_to_addr(hi, lo);
                this.cycles += 1;
                break;
            }
            case Instruction.RTS: {
                let lo = this.pop_stack();
                let hi = this.pop_stack();
                this.state.pc = bytes_to_addr(hi, lo) + 1;
                this.cycles += 2;
                break;
            }
            //endregion

            //region Loads
            case Instruction.LDA: {
                this.state.acc = this.read();
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            case Instruction.LDX: {
                this.state.x = this.read();
                this.check_zero(this.state.x);
                this.check_negative(this.state.x);
                break;
            }
            case Instruction.LDY: {
                this.state.y = this.read();
                this.check_zero(this.state.y);
                this.check_negative(this.state.y);
                break;
            }
            //endregion
            case Instruction.NOP: {
                // no operation
                break;
            }

            //region Register instructions
            case Instruction.TAX: {
                this.state.x = this.state.acc;
                this.check_zero(this.state.x);
                this.check_negative(this.state.x);
                break;
            }
            case Instruction.TXA: {
                this.state.acc = this.state.x;
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            case Instruction.TAY: {
                this.state.y = this.state.acc;
                this.check_zero(this.state.y);
                this.check_negative(this.state.y);
                break;
            }
            case Instruction.TYA: {
                this.state.acc = this.state.y;
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                break;
            }
            case Instruction.INX: {
                this.state.x = 0xFF & (this.state.x + 1);
                this.check_zero(this.state.x);
                this.check_negative(this.state.x);
                break;
            }
            case Instruction.DEX: {
                this.state.x = 0xFF & (this.state.x - 1);
                this.check_zero(this.state.x);
                this.check_negative(this.state.x);
                break;
            }
            case Instruction.INY: {
                this.state.y = 0xFF & (this.state.y + 1);
                this.check_zero(this.state.y);
                this.check_negative(this.state.y);
                break;
            }
            case Instruction.DEY: {
                this.state.y = 0xFF & (this.state.y - 1);
                this.check_zero(this.state.y);
                this.check_negative(this.state.y);
                break;
            }
            //endregion

            //region Storage instruction
            case Instruction.STA: {
                this.write(this.state.acc);
                // Cycle count corrections
                if (addr_mode == AddressingMode.IndY) {
                    this.cycles += 1;
                }
                break;
            }
            case Instruction.STX: {
                this.write(this.state.x);
                break;
            }
            case Instruction.STY: {
                this.write(this.state.y);
                break;
            }
            //endregion

            //region Stack instructions
            case Instruction.TXS: {
                this.state.stack = this.state.x;
                break;
            }
            case Instruction.TSX: {
                this.state.x = this.state.stack;
                this.check_zero(this.state.x);
                this.check_negative(this.state.x);
                break;
            }
            case Instruction.PHA: {
                this.push_stack(this.state.acc);
                break;
            }
            case Instruction.PLA: {
                this.state.acc = this.pop_stack();
                this.check_zero(this.state.acc);
                this.check_negative(this.state.acc);
                this.cycles += 1;
                break;
            }
            case Instruction.PHP:
                this.push_stack(this.state.status | 0x30);
                break;
            case Instruction.PLP: {
                this.state.status = (this.pop_stack() & 0xEF) | 0x20;
                this.cycles += 1;
                break;
            } //endregion
        }
    }

    /** Returns false if no interrupt will be handled on the next execution, true otherwise */
    private run_interrupt(): boolean {
        if (!this.interrupt_pending) return false;
        console.log(" [INFO] CPU Interrupt:", this.maskable_interrupt ? "IRQ" : "NMI");
        this.interrupt_pending = false;
        this.push_stack((this.state.pc & 0xFF00) >> 8);
        this.push_stack((this.state.pc & 0xFF));
        this.clear_flag(CpuStatus.BREAK);
        this.set_flag(CpuStatus.UNUSED);
        this.push_stack(this.state.status);
        let addr = this.maskable_interrupt ? IRQ_VECTOR : NMI_VECTOR;
        let addr_lo = this.read_bus(addr);
        let addr_hi = this.read_bus(addr + 1);
        this.state.pc = bytes_to_addr(addr_hi, addr_lo);
        return true;
    }

    toString() {
        return log_state(this.state, this.bus);
    }
}
import chai from "chai";
import { Bus, Cpu6502, POWERON_CPU_STATE, Instruction, AddressingMode, DummyBusDevice } from "../../lib/index.js";

const expect = chai.expect;

describe("Cpu", () => {
    /** @type {import("../../src/index").Cpu6502} */
    let cpu;
    /** @type {import("../../src/index").Bus} */
    let bus;

    beforeEach(() => {
        bus = new Bus();
        bus.map_device({
            dev: new DummyBusDevice(),
            start: 0x0000,
            end: 0xFFFF,
            mirror: 0xFFFF
        });
        cpu = new Cpu6502(bus);
    });
    
    it("should construct a CPU", () => {
        expect(cpu).to.be.instanceOf(Cpu6502);
    });

    it("should have correct poweron state", () => {
        expect(cpu.state).to.deep.equal(POWERON_CPU_STATE);
    });

    it("should load instructions correctly", () => {
        // in this test the bus will just return 0 on all reads
        // conveniently, that's a BRK. So we can test that the CPU resolves that
        // correctly
        cpu.exec();
        expect(cpu.state.instr).to.equal(Instruction.BRK);
        expect(cpu.state.addr_mode).to.equal(AddressingMode.Impl);
    });

    it("should format state correctly", () => {
        cpu.state = {
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
        }
        const TEST_STR = "7890  6C AA BB  JMP ($BBAA) = 0000              A:12 X:34 Y:56 P:BC SP:AB PPU:  0,  0 CYC:42";
        expect("" + cpu).to.eq(TEST_STR);
    })
})
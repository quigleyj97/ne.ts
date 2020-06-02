//region CPU utilities

import { u8, u16 } from "./types.js";

/// A struct holding state information about a 6502 CPU.
///
/// This struct is held internally, but can be copied to power to things
/// like debug formatters and, if taken at the end of a simulation cycle,
/// serialization.
export interface ICpuState {
    /// The Accumulator register
    acc: u8,

    /// X index register
    x: u8,

    /// Y index register
    y: u8,

    /// The stack pointer
    ///
    /// # Note
    ///
    /// This register is a pointer to a location in memory on the first page
    /// ($01XX) of memory. The 6502 uses a bottom-up stack, so the 'first'
    /// location on the stack is `$01FF` and the 'last' is `$0100`.
    ///
    /// Stack _overflow_ occurs when the stack pointer decreases all the way to
    /// $00 and wraps around to $FF (the beginning). _Underflow_ occurs the
    /// other way around, from $FF to $00.
    stack: u8,

    /// The program counter
    ///
    /// # Note
    ///
    /// This is incremented by the emulator after executing each instruction,
    /// and refers to the address in memory of the next instruction
    pc: u16,

    /// The instruction being executed.
    ///
    /// # Note
    ///
    /// Instructions consist of an opcode, having 1 byte, and an optional
    /// operand having 1 or 2 bytes (depending on the instruction and addressing
    /// mode).
    ///
    /// The last 8 bits of this register are unused.
    instruction: number,

    /// The program status register.
    status: u8,

    /// The total number of cycles that this CPU has ran
    ///
    /// # Note
    ///
    /// This is allowed to overflow, as it's only used for debugging and test
    /// comparison. It is not a part of core emulation.
    tot_cycles: number,

    /// The resolved address of the instruction
    addr: u16,

    /// The addressing mode of the opcode being executed
    addr_mode: AddressingMode,

    /// The opcode being executed
    instr: Instruction,
}

// The addressing mode for the CPU
export enum AddressingMode {
    /// Zero-Page
    ZP,
    /// Zero-Page Indexed, X register
    ZPX,
    /// Zero-Page Indexed, Y register
    ZPY,
    /// Absolute Indexed, plus X register
    AbsX,
    /// Absolute Indexed, plus Y register
    AbsY,
    /// Indexed Indirect (d, x)
    IndX,
    /// Indirect Indexed (d), y
    ///
    /// gee thanks MOS what a helpful name
    /// not like there's a significant difference between how (d, x) and (d),y
    /// work
    ///
    /// ...oh wait
    IndY,
    /// Implicit indexing (do nothing, resolve nothing, deny everything)
    Impl,
    /// Use the Accumulator
    Accum,
    /// Don't fetch anything and use the operand as data
    Imm,
    /// Jump to a relative label
    Rel,
    /// Addressing mode specific to JMP
    AbsInd,
    /// The 16 address is included in the operand
    Abs,
};

/** The CPU opcode mnemonic
 * 
 * *depends on BCD flag, not currently supported
 */
export enum Instruction {
    /// ADd with Carry*
    ADC,
    /// bitwise AND w/ acc
    AND,
    /// Arithmetic Shift Left
    ASL,
    /// test BITs
    BIT,

    //region Branch instructions
    /// Branch on PLus
    BPL,
    /// Branch on MInus
    BMI,
    /// Branch on oVerflow Clear
    BVC,
    /// Branch on oVerflow Set
    BVS,
    /// Branch on Carry Clear
    BCC,
    /// Branch on Carry Set
    BCS,
    /// Branch on Not Equal
    BNE,
    /// Branch on EQual
    BEQ,
    //endregion
    /// BReaK
    BRK,
    /// CoMPare acc
    CMP,
    /// ComPare X
    CPX,
    /// ComPare Y
    CPY,
    /// DECrement
    DEC,
    /// bitwise Exclusive OR
    EOR,

    //region Flag instructions
    /// CLear Carry
    CLC,
    /// SEt Carry
    SEC,
    /// CLear Interrupt mask
    CLI,
    /// SEt Interrupt mask
    SEI,
    /// CLear oVerflow
    CLV,
    /// CLear Decimal
    CLD,
    /// SEt Decimal
    SED,
    //endregion
    /// INCrement memory
    INC,
    /// JuMP
    ///
    /// # Note on a major CPU bug
    ///
    /// The 6502 had a serious bug with indirect absolute indexing and the
    /// JMP instruction. If the operand crosses a page boundary, the 6502 will
    /// 'forget' the carry and instead use the 00 byte on that page.
    ///
    /// TODO: Implement that bug
    JMP,
    /// Jump to SubRoutine
    JSR,
    /// LoaD Acc
    LDA,
    /// LoaD X
    LDX,
    /// LoaD Y
    LDY,
    /// Logical Shift Right
    LSR,
    /// No OPeration
    NOP,
    /// bitwise OR with Acc
    ORA,

    //region Register Instructions
    /// Transfer A to X
    TAX,
    /// Transfer X to A
    TXA,
    /// DEcrement X
    DEX,
    /// INcrement X
    INX,
    /// Transfer A to Y
    TAY,
    /// Transfer Y to A
    TYA,
    /// DEcrement Y
    DEY,
    /// INcrement Y
    INY,
    //endregion

    //region Rotation instructions
    // Note: Rotation actually includes the Carry bit in rotation operations. So
    // if you rotate 0b1100_0000 left, and C is not asserted, you will get
    // 0b1000_0000 instead of 0b1000_0001, and Carry will be asserted.
    // Early versions of the 6502 had a bad bug with these instructions, where
    // they would actually work as arithmetic shifts (ignoring Carry). This
    // was fixed long before the NES, and so this emulation doesn't implement
    // that bug.
    /// ROtate Left
    ROL,
    /// ROtate Right
    ROR,
    //endregion

    //region Returns
    /// ReTurn from Interrupt
    RTI,
    /// ReTurn from Subroutine
    RTS,
    //endregion
    /// SuBtract with Carry*
    SBC,

    //region Store instructions
    /// STore Acc
    STA,
    /// STore X
    STX,
    /// STore Y
    STY,
    //endregion

    //region Stack instructions
    /// Transfer X to Stack
    TXS,
    /// Transfer Stack to X
    TSX,
    /// PusH Acc
    PHA,
    /// PuLl Acc
    PLA,
    /// PusH Processor status
    PHP, // or, the dreaded spawn of Rasmus Lerdorf
    /// PuLl Processor status
    PLP,
    //endregion
};

export const enum CpuStatus {
    CARRY = 0x01,
    ZERO = 0x02,
    IRQ_DISABLE = 0x04,
    DECIMAL = 0x08,
    BREAK = 0x10,
    UNUSED = 0x20,
    OVERFLOW = 0x40,
    NEGATIVE = 0x80
};

export const POWERON_CPU_STATE = Object.freeze({
    acc: 0,
    x: 0,
    y: 0,
    stack: 0xFD,
    pc: 0xC000,
    status: 0x24,
    tot_cycles: 7,
    instruction: 0xEA,
    addr: 0,
    addr_mode: AddressingMode.Impl,
    instr: Instruction.NOP
} as ICpuState);
//endregion

//region PPU utilities
export interface IPpuState {
    //#region Loopy registers
    // These registers represent internal registers that handle numerous
    // operations on the NES, such as PPUADDR addressing. The exact names
    // of these variables from Loopy's "The Skinny on NES Scrolling"
    /** The 15-bit VRAM address register */
    v: u16;
    /** The 15-bit temporary VRAM address register */
    t: u16;
    /** The 3-bit fine X scroll register */
    x: u8;
    /** The PPUADDR write latch */
    w: boolean;
    //#endregion

    // The palette attribute shift registers
    // The PPU has a pair of shift registers for tile data, one for the high bit
    // and one for the low bit. It has another pair for the palette.
    bg_tile_hi_shift_reg: u16;
    bg_tile_lo_shift_reg: u16;
    bg_attr_hi_shift_reg: u8;
    bg_attr_lo_shift_reg: u8;
    /** The 2-bit attribute for the next tile to render, which feeds the shift registers */
    bg_attr_latch: 0 | 1 | 2 | 3;

    //#region Byte buffers
    // The PPU reads various parts of the rendering data at different points in
    // a rendering lifecycle, and those are loaded into the registers at the end
    // of an 8-cycle period. Until then, they're held in temporary registers,
    // which the below variables model
    temp_nt_byte: u8;
    temp_at_byte: u8;
    temp_bg_lo_byte: u8;
    temp_bg_hi_byte: u8;
    //#endregion

    //#region PPU Control Registers
    // These are registers that are exposed to the CPU bus, like $PPUSTATUS and
    // $PPUMASK
    /** The $PPUCTRL register */
    control: u8;
    /** The $PPUMASK register */
    mask: u8;
    /** The $PPUSTATUS register */
    status: u8;
    //#endregion

    //#region Emulation helpers
    /** The pixel currently being output by the PPU. */
    pixel_cycle: number;
    /** The scanline currently being rendered. */
    scanline: number;
    /** Whether the PPU has completed a frame */
    frame_ready: boolean;
    /** Whether a VBlank interrupt has occured */
    vblank_nmi_ready: boolean;
    /**
     * Buffer containing the value of the address given in PPUADDR.
     * 
     * # Note
     *
     * Reads from regions of PPU memory (excluding the palette memory) are
     * delayed by one clock cycle, as the PPU first _recieves_ the address,
     * then puts that address on it's internal bus. On the _next_ cycle, it
     * then _writes_ that value to a buffer on the CPU bus. The effect of this
     * is that reads from the PPU take _two_ cycles instead of one.
     *
     * For palette memory, however, there happens to be entirely combinatorial
     * logic to plumb this read; meaning that no clock ticking has to occur.
     * _however_, reads will still populate the buffer! Except with name
     */
    ppudata_buffer: u8;
    /** The last value put on a PPU control port */
    last_control_port_value: u8;
    //#endregion
}

export const PPU_POWERON_STATE = Object.freeze({
    v: 0,
    t: 0,
    x: 0,
    w: false,
    bg_tile_hi_shift_reg: 0,
    bg_tile_lo_shift_reg: 0,
    bg_attr_hi_shift_reg: 0,
    bg_attr_lo_shift_reg: 0,
    bg_attr_latch: 0,
    temp_nt_byte: 0,
    temp_bg_hi_byte: 0,
    temp_bg_lo_byte: 0,
    temp_at_byte: 0,
    control: 0,
    mask: 0,
    // magic constant given from NESDEV for PPU poweron state
    status: 0xA0,
    pixel_cycle: 0,
    scanline: 0,
    frame_ready: false,
    vblank_nmi_ready: false,
    last_control_port_value: 0
} as IPpuState)

/** Bitmasks for various components of a PPU register address */
export const enum PpuAddressPart {
    COARSE_X = 0x001F,
    COARSE_Y = 0x03E0,
    NAMETABLE_X = 0x0400,
    NAMETABLE_Y = 0x0800,
    FINE_Y = 0x7000
}

/** Bitmasks for fields of the PPU control register ($PPUCTRL) */
export const enum PpuControlFlags {
    /// Select which nametable to use. 0 = $2000, 1 = $2400, 2 = $2800, 3 = $2C00
    NAMETABLE_BASE_SELECT = 0x03,
    /// Select the increment mode for writes to $PPUDATA. 0 = add 1, 1 = add 32
    VRAM_INCREMENT_SELECT = 0x04,
    /// Select the base address for sprite tiles. 0 = $0000, 1 = $1000
    SPRITE_TILE_SELECT = 0x08,
    /// Select the base address for background tiles. 0 = $0000, 1 = $1000
    BG_TILE_SELECT = 0x10,
    /// If 1, use 8x16 sprites instead of the usual 8x8
    SPRITE_MODE_SELECT = 0x20,
    /// If 1, use the PPU's EXT pins to source the background color
    /// Note: This is not used in the NES since the EXT pins of the 2C02 are
    /// grounded (and thus enabling this bit will cause a ground fault on real
    /// hardware). Nesdev referrs to this flag as the "PPU master/slave select",
    /// Presumably this comes from the PPU's internal documentation.
    PPU_BG_COLOR_SELECT = 0x40,
    /// If 1, enable NMI generation on VBlank
    VBLANK_NMI_ENABLE = 0x80,
}

/// Bitmasks for the PPU mask register ($PPUMASK)
export const enum PpuMaskFlags {
    /// If true, use the leftmost pallete colors only
    USE_GRAYSCALE = 0x01,
    /// If false, don't render the background in the leftmost 8 columns
    BG_LEFT_ENABLE = 0x02,
    /// If false, don't render sprites in the leftmost 8 columns
    SPRITE_LEFT_ENABLE = 0x04,
    /// If false, don't render the background
    BG_ENABLE = 0x08,
    /// If false, don't render sprites
    SPRITE_ENABLE = 0x10,
    COLOR_EMPHASIS_RED = 0x20,
    COLOR_EMPHASIS_GREEN = 0x40,
    COLOR_EMPHASIS_BLUE = 0x80,
}

/// Bitmasks for the PPU status register ($PPUSTATUS)
export const enum PpuStatusFlags {
    STATUS_IGNORED = 0x1F,
    SPRITE_OVERFLOW = 0x20,
    SPRITE_0_HIT = 0x40,
    VBLANK = 0x80,
}

/// Constants for the CPU addresses of PPU control ports
export const enum PpuControlPorts {
    /// Write-only PPU control register
    PPUCTRL = 0x2000,
    /// PPU mask register
    PPUMASK = 0x2001,
    /// Read-only PPU status register
    PPUSTATUS = 0x2002,
    /// Latch to set the address for OAMDATA into the PPU's OAM memory
    OAMADDR = 0x2003,
    /// The value to be written into OAM
    OAMDATA = 0x2004,
    /// Write-twice latch for setting the scroll position
    PPUSCROLL = 0x2005,
    /// Write-twice latch for setting the address for the PPUDATA latch
    PPUADDR = 0x2006,
    /// Read-write port for interfacing with the PPU bus
    PPUDATA = 0x2007,
    /// Address for setting up OAM
    OAMDMA = 0x4014,
}

/// Palette table taken from NesDev
///
/// To index, multiply the color index by 3 and take the next 3 values in memory
/// as an (R,G,B) 8-byte triplet
export const PALLETE_TABLE: Readonly<Uint8Array> = new Uint8Array([
    //          0*
    /* *0 */    101, 101, 101,
    /* *1 */    0, 45, 105,
    /* *2 */    19, 31, 127,
    /* *3 */    60, 19, 124,
    /* *4 */    96, 11, 98,
    /* *5 */    115, 10, 55,
    /* *6 */    113, 15, 7,
    /* *7 */    90, 26, 0,
    /* *8 */    52, 40, 0,
    /* *9 */    11, 52, 0,
    /* *A */    0, 60, 0,
    /* *B */    0, 61, 16,
    /* *C */    0, 56, 64,
    /* *D */    0, 0, 0,
    /* *E */    0, 0, 0,
    /* *F */    0, 0, 0,
    //          1*
    /* *0 */    174, 174, 174,
    /* *1 */    15,  99,  179,
    /* *2 */    64, 81, 208,
    /* *3 */    120, 65, 204,
    /* *4 */    167, 54, 169,
    /* *5 */    192, 52, 112,
    /* *6 */    189, 60, 48,
    /* *7 */    159, 74, 0,
    /* *8 */    109, 92, 0,
    /* *9 */    54, 109, 0,
    /* *A */    7, 119, 4,
    /* *B */    0, 121, 61,
    /* *C */    0, 114, 125,
    /* *D */    0, 0, 0,
    /* *E */    0, 0, 0,
    /* *F */    0, 0, 0,
    //          2*
    /* *0 */    254, 254, 255,
    /* *1 */    93,  179, 255,
    /* *2 */    143, 161, 255,
    /* *3 */    200, 144, 255,
    /* *4 */    247, 133, 250,
    /* *5 */    255, 131, 192,
    /* *6 */    255, 139, 127,
    /* *7 */    239, 154, 73,
    /* *8 */    189, 172, 44,
    /* *9 */    133, 188, 47,
    /* *A */    85, 199, 83,
    /* *B */    60, 201, 140,
    /* *C */    62, 194, 205,
    /* *D */    78, 78, 78,
    /* *E */    0, 0, 0,
    /* *F */    0, 0, 0,
    //          3*
    /* *0 */    254, 254, 255,
    /* *1 */    188, 223, 255,
    /* *2 */    209, 216, 255,
    /* *3 */    232, 209, 255,
    /* *4 */    251, 205, 253,
    /* *5 */    255, 204, 229,
    /* *6 */    255, 207, 202,
    /* *7 */    248, 213, 180,
    /* *8 */    228, 220, 168,
    /* *9 */    204, 227, 169,
    /* *A */    185, 232, 184,
    /* *B */    174, 232, 208,
    /* *C */    175, 229, 234,
    /* *D */    182, 182, 182,
    /* *E */    0, 0, 0,
    /* *F */    0, 0, 0
]);

//endregion
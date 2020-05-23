//region CPU utilities
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
//endregion

//region PPU utilities
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
    //          0*              1*              2*              3*
    /* *0 */    101, 101, 101,  174, 174, 174,  254, 254, 255,  254, 254, 255, // White
    /* *1 */    0, 45, 105,     15,  99,  179,  93,  179, 255,  188, 223, 255, // Blue
    /* *2 */    19, 31, 127,    64, 81, 208,    143, 161, 255,  209, 216, 255,
    /* *3 */    60, 19, 124,    120, 65, 204,   200, 144, 255,  232, 209, 255,
    /* *4 */    96, 11, 98,     167, 54, 169,   247, 133, 250,  251, 205, 253,
    /* *5 */    115, 10, 55,    192, 52, 112,   255, 131, 192,  255, 204, 229,
    /* *6 */    113, 15, 7,     189, 60, 48,    255, 139, 127,  255, 207, 202, // Red
    /* *7 */    90, 26, 0,      159, 74, 0,     239, 154, 73,   248, 213, 180,
    /* *8 */    52, 40, 0,      109, 92, 0,     189, 172, 44,   228, 220, 168,
    /* *9 */    11, 52, 0,      54, 109, 0,     133, 188, 47,   204, 227, 169,
    /* *A */    0, 60, 0,       7, 119, 4,      85, 199, 83,    185, 232, 184, // Green
    /* *B */    0, 61, 16,      0, 121, 61,     60, 201, 140,   174, 232, 208,
    /* *C */    0, 56, 64,      0, 114, 125,    62, 194, 205,   175, 229, 234,
    /* *D */    0, 0, 0,        0, 0, 0,        78, 78, 78,     182, 182, 182, // White
    /* *E */    0, 0, 0,        0, 0, 0,        0, 0, 0,        0, 0, 0,       // Black
    /* *F */    0, 0, 0,        0, 0, 0,        0, 0, 0,        0, 0, 0
]);

//endregion
# ne.ts

A NES emulator written in TypeScript

## Building

`yarn`, then `yarn build`. You can also use NPM, of course.

## Resources

#### General

 - [NesDev wiki](wiki.nesdev.org)
 - [/r/EmuDev discord](https://discord.gg/dkmJAes)

#### 6502 CPU

- [_6502 Assembly Language Programming_](http://www.obelisk.me.uk/6502/index.html) by Andrew Jacobs
- [_The 6502 Instruction Set Decoded_](http://nparker.llx.com/a2/opcodes.html) by Neil Parker
    - This includes undocumented opcodes for the Apple II, which don't apply to
    the 2A03 used by the NES.
- [Rockwell R650x datasheet](http://archive.6502.org/datasheets/rockwell_r650x_r651x.pdf)
- [MOS MCS6501 datasheet](http://archive.6502.org/datasheets/mos_6501-6505_mpu_preliminary_aug_1975.pdf)
    - This scan has the highest resolution opcode table I can find
- [nestest](http://www.qmtpro.com/~nes/misc/nestest.txt)
    - Used as a unit test for verifying cycle-count accuracy and functionality.

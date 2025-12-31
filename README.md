# ne.ts

A NES emulator written in TypeScript

## Building

`yarn`, then `yarn build`. You can also use NPM, of course.

## Development

Start the Vite development server with Hot Module Replacement (HMR):

```bash
yarn dev
```

Other development commands:

```bash
yarn build        # Production build to dist/
yarn preview      # Preview production build
yarn typecheck    # Type-check without emitting
```

## Testing

The project uses Vitest 4.0.16 for testing. Tests run in TypeScript directly without a compilation step.

```bash
yarn test         # Run all tests once
yarn test:watch   # Run tests in watch mode
yarn test:ui      # Open Vitest interactive UI
yarn test:coverage # Run tests with coverage
```

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

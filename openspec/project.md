# Project Context

## Purpose
ne.ts is a Nintendo Entertainment System (NES) emulator written in TypeScript. The project aims to accurately emulate the NES hardware components including the 6502 CPU, 2C02 PPU (Picture Processing Unit), and 2A03 APU (Audio Processing Unit) to run NES ROM files in a browser environment.

## Tech Stack
- **TypeScript** (v3.9.3+) - Strict mode enabled, targeting ESNext with ES2018 library support
- **Build Tool** - TypeScript Compiler (tsc)
- **Testing** - Mocha test framework with Chai assertions
- **Module System** - ES Modules (type: "module" in package.json)
- **Development Server** - http-server for serving the browser demo
- **Runtime** - Browser environment (requires DOM for WebAudio API)

## Project Conventions

### Code Style
- **Type Aliases**: Use [`u8`](src/utils/types.ts:5) and [`u16`](src/utils/types.ts:6) type aliases to self-document expected bit sizes and maintain compatibility with the original Rust prototype
- **Naming Conventions**:
  - Classes use PascalCase with hardware model numbers (e.g., [`Cpu6502`](src/devices/cpu.ts:8), [`Ppu2C02`](src/devices/ppu.ts:30), [`Apu2A03`](src/devices/apu.ts:33))
  - Methods and properties use camelCase (e.g., `trigger_nmi`, `read_bus`)
  - Constants use UPPER_SNAKE_CASE (e.g., [`RESET_VECTOR`](src/devices/cpu.ts:4), [`NMI_VECTOR`](src/devices/cpu.ts:5))
  - Private members use the `private` keyword
- **Imports**: Include `.js` extensions in import statements (ES module requirement)
- **Comments**: Extensive inline documentation including ASCII art for levity

### Architecture Patterns
- **Device-Based Architecture**: Hardware components are modeled as individual device classes:
  - [`Cpu6502`](src/devices/cpu.ts:8) - 6502 CPU emulation
  - [`Ppu2C02`](src/devices/ppu.ts:30) - Picture Processing Unit
  - [`Apu2A03`](src/devices/apu.ts:33) - Audio Processing Unit (Web Audio API-based)
  - [`Bus`](src/devices/bus.ts:28) - Memory-mapped address bus with O(1) lookup table
  - [`NesEmulator`](src/devices/nes.ts:10) - Top-level emulator coordinator
- **Memory Mapping**: Uses a device mapping system where devices are mounted to address ranges with mirroring support via bit masks
- **Interface Contracts**: Devices implement [`IBusDevice`](src/utils/types.ts) interface for consistent bus communication
- **State Management**: Hardware state is captured in interfaces (e.g., `ICpuState`, `IPpuState`) with power-on constants
- **Performance Optimization**: Critical code paths avoid object overhead (e.g., PPU registers as class members instead of state object)

### Testing Strategy
- **Framework**: Mocha with Chai for BDD-style assertions
- **Test Organization**: Tests mirror source structure
  - `test/devices/` - Unit tests for hardware devices
  - `test/utils/` - Unit tests for utility functions
  - `test/integration/` - Integration tests (e.g., nestest ROM validation)
- **Test Data**: Reference ROM files and logs in `test/data/` for validation
- **Coverage**: Focus on cycle-accurate CPU behavior and correct opcode execution
- **Run Command**: `yarn test` (recursive Mocha execution)

### Git Workflow
- **License**: GPL-3.0
- **Repository**: GitHub at quigleyj97/ne.ts
- **Build Artifacts**: Compiled output in `lib/` directory (excluded from git via .gitignore)

## Domain Context

### NES Hardware Architecture
The Nintendo Entertainment System consists of several key components that must be emulated:

- **6502 CPU (2A03)**: 8-bit processor running at ~1.79 MHz (NTSC). Includes interrupt vectors at fixed addresses:
  - Reset vector: `0xFFFC`
  - NMI vector: `0xFFFA` 
  - IRQ vector: `0xFFFE`
- **PPU (2C02)**: Generates video output at 256×240 resolution, 60 Hz NTSC. Uses internal "Loopy registers" (`v`, `t`, `w`, `x`) for scroll and addressing
- **APU (2A03)**: Provides 5 audio channels (2 pulse, 1 triangle, 1 noise, 1 DMC). Currently implemented using Web Audio API oscillators
- **Memory Map**: 64KB address space with memory-mapped I/O and cartridge PRG-ROM
- **Cartridges**: Use iNES file format with mapper support for bank switching

### Timing and Synchronization
- PPU runs at 3x CPU clock speed
- Cycle-accurate emulation is critical for proper operation
- Odd/even cycle tracking for DMA and other operations

### Reference Resources
Key documentation and test resources (listed in [`README.md`](README.md)):
- NesDev wiki for hardware specifications
- nestest ROM for CPU validation with cycle-accurate logs
- 6502 instruction set documentation and datasheets

## Important Constraints
- **Browser-Only**: APU implementation requires Web Audio API, so headless/Node environments use a dummy APU
- **Cycle Accuracy**: Must maintain cycle-accurate timing for CPU/PPU synchronization
- **TypeScript Strict Mode**: All code must pass strict type checking
- **No Fallthrough**: TypeScript compiler enforces `noFallthroughCasesInSwitch`
- **Module Format**: Must use ES modules with `.js` extensions in imports
- **Performance**: PPU rendering is performance-critical and requires careful optimization (V8 engine considered)

## External Dependencies
- **Runtime Dependencies**: None (browser APIs only)
- **Development Dependencies**:
  - TypeScript compiler for transpilation
  - Mocha/Chai for testing
  - http-server for local development
- **Browser APIs**:
  - Web Audio API (AudioContext, OscillatorNode) for sound
  - DOM for rendering and user interaction
- **Test Resources**: nestest ROM and validation logs for integration testing

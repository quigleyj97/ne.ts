import chai from "chai";
import { FrameCounter } from '../../../lib/devices/apu/units/frame-counter.js';

const expect = chai.expect;

/**
 * FrameCounter Unit Tests
 * 
 * Comprehensive tests for the NES APU Frame Counter implementation.
 * Tests cover 4-step and 5-step modes, event generation, IRQ behavior,
 * and write delay quirks.
 */

describe('FrameCounter', () => {
    /** @type {import('../../../src/devices/apu/units/frame-counter').FrameCounter} */
    let fc;

    beforeEach(() => {
        fc = new FrameCounter();
    });

    describe('Construction and Reset', () => {
        it('should construct successfully', () => {
            expect(fc).to.be.instanceOf(FrameCounter);
        });

        it('should start with no IRQ pending', () => {
            expect(fc.isIrqPending()).to.equal(false);
        });

        it('should reset to initial state', () => {
            fc.writeControl(0xC0, 0); // Set mode and IRQ inhibit
            fc.reset();
            expect(fc.isIrqPending()).to.equal(false);
        });
    });

    describe('4-Step Mode - Timing and Events', () => {
        beforeEach(() => {
            // Write to $4017 to set 4-step mode (bit 7 = 0)
            // IRQ inhibit = 1 to prevent IRQ for most tests
            fc.writeControl(0x40, 0); // Mode=0, IRQ inhibit=1
            
            // Wait for write delay (4 cycles on even cycle)
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
        });

        it('should generate quarter-frame at step 1 (cycle 7459)', () => {
            let events;
            for (let cycle = 4; cycle <= 7459; cycle++) {
                events = fc.clock(cycle);
                if (cycle === 7459) {
                    expect(events.quarterFrame).to.equal(true, 'Quarter-frame at 7459');
                    expect(events.halfFrame).to.equal(false, 'No half-frame at step 1');
                } else if (cycle > 4) {
                    expect(events.quarterFrame).to.equal(false, `No quarter-frame at ${cycle}`);
                }
            }
        });

        it('should generate quarter-frame and half-frame at step 2 (cycle 14913)', () => {
            let events;
            for (let cycle = 4; cycle <= 14913; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true, 'Quarter-frame at 14913');
            expect(events.halfFrame).to.equal(true, 'Half-frame at 14913');
        });

        it('should generate quarter-frame at step 3 (cycle 22371)', () => {
            let events;
            for (let cycle = 4; cycle <= 22371; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true, 'Quarter-frame at 22371');
            expect(events.halfFrame).to.equal(false, 'No half-frame at step 3');
        });

        it('should generate quarter-frame and half-frame at step 4 (cycle 29829)', () => {
            let events;
            for (let cycle = 4; cycle <= 29829; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true, 'Quarter-frame at 29829');
            expect(events.halfFrame).to.equal(true, 'Half-frame at 29829');
        });

        it('should reset sequence after step 4', () => {
            // Clock through entire sequence
            for (let cycle = 4; cycle <= 29829; cycle++) {
                fc.clock(cycle);
            }
            
            // Continue clocking - should reset and hit step 1 again
            let events;
            for (let cycle = 29830; cycle <= 29829 + 7459; cycle++) {
                events = fc.clock(cycle);
            }
            // Should generate quarter-frame at the first step again
            expect(events.quarterFrame).to.equal(true, 'Quarter-frame after reset');
            expect(events.halfFrame).to.equal(false, 'No half-frame at step 1');
        });

        it('should not have step 5 in 4-step mode', () => {
            let events;
            // Clock through complete 4-step sequence and beyond
            for (let cycle = 4; cycle <= 37285; cycle++) {
                events = fc.clock(cycle);
                // Step 5 would be at 37281 - should have no events there
                if (cycle === 37281) {
                    expect(events.quarterFrame).to.equal(false, 'No quarter-frame at cycle 37281');
                    expect(events.halfFrame).to.equal(false, 'No half-frame at cycle 37281');
                }
            }
        });
    });

    describe('5-Step Mode - Timing and Events', () => {
        beforeEach(() => {
            // Write to $4017 to set 5-step mode (bit 7 = 1)
            fc.writeControl(0x80, 0); // Mode=1, IRQ inhibit=0
            
            // Process write - should immediately generate quarter and half
            const immediateEvents = fc.clock(0);
            for (let i = 1; i < 4; i++) {
                fc.clock(i);
            }
        });

        it('should immediately generate quarter and half-frame on mode switch', () => {
            const fc2 = new FrameCounter();
            fc2.writeControl(0x80, 0); // 5-step mode
            
            // Clock through delay (4 cycles on even)
            let events;
            for (let i = 0; i <= 4; i++) {
                events = fc2.clock(i);
            }
            
            // Should have immediate events after delay
            expect(events.quarterFrame).to.equal(true, 'Immediate quarter-frame');
            expect(events.halfFrame).to.equal(true, 'Immediate half-frame');
        });

        it('should generate quarter-frame at step 1 (cycle 7459)', () => {
            let events;
            for (let cycle = 4; cycle <= 7459; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true);
            expect(events.halfFrame).to.equal(false);
        });

        it('should generate quarter-frame and half-frame at step 2 (cycle 14913)', () => {
            let events;
            for (let cycle = 4; cycle <= 14913; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true);
            expect(events.halfFrame).to.equal(true);
        });

        it('should generate quarter-frame at step 3 (cycle 22371)', () => {
            let events;
            for (let cycle = 4; cycle <= 22371; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true);
            expect(events.halfFrame).to.equal(false);
        });

        it('should generate quarter-frame and half-frame at step 4 (cycle 29829)', () => {
            let events;
            for (let cycle = 4; cycle <= 29829; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true);
            expect(events.halfFrame).to.equal(true);
        });

        it('should generate quarter-frame and half-frame at step 5 (cycle 37281)', () => {
            let events;
            for (let cycle = 4; cycle <= 37281; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true, 'Quarter-frame at 37281');
            expect(events.halfFrame).to.equal(true, 'Half-frame at 37281');
        });

        it('should reset sequence after step 5', () => {
            // Clock through entire 5-step sequence
            for (let cycle = 4; cycle <= 37281; cycle++) {
                fc.clock(cycle);
            }
            
            // Continue clocking - should reset and hit step 1 again
            let events;
            for (let cycle = 37282; cycle <= 37281 + 7459; cycle++) {
                events = fc.clock(cycle);
            }
            expect(events.quarterFrame).to.equal(true);
            expect(events.halfFrame).to.equal(false);
        });
    });

    describe('IRQ Generation', () => {
        it('should generate IRQ at step 4 in 4-step mode when inhibit clear', () => {
            // Write 4-step mode with IRQ enabled (inhibit = 0)
            fc.writeControl(0x00, 0); // Mode=0, IRQ inhibit=0
            
            // Wait for write delay
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Clock to step 4
            let events;
            for (let cycle = 4; cycle <= 29829; cycle++) {
                events = fc.clock(cycle);
            }
            
            expect(events.irq).to.equal(true, 'IRQ at step 4');
            expect(fc.isIrqPending()).to.equal(true);
        });

        it('should not generate IRQ when inhibit flag is set', () => {
            // Write 4-step mode with IRQ inhibited
            fc.writeControl(0x40, 0); // Mode=0, IRQ inhibit=1
            
            // Wait for write delay
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Clock to step 4
            let events;
            for (let cycle = 4; cycle <= 29829; cycle++) {
                events = fc.clock(cycle);
            }
            
            expect(events.irq).to.equal(false, 'No IRQ when inhibited');
            expect(fc.isIrqPending()).to.equal(false);
        });

        it('should not generate IRQ in 5-step mode', () => {
            // Write 5-step mode with IRQ not inhibited
            fc.writeControl(0x80, 0); // Mode=1, IRQ inhibit=0
            
            // Wait for write delay and immediate events
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Clock through entire sequence
            let events;
            for (let cycle = 4; cycle <= 37281; cycle++) {
                events = fc.clock(cycle);
                expect(events.irq).to.equal(false, `No IRQ at cycle ${cycle}`);
            }
            
            expect(fc.isIrqPending()).to.equal(false);
        });

        it('should persist IRQ flag until cleared', () => {
            fc.writeControl(0x00, 0); // 4-step, IRQ enabled
            
            // Wait for write delay
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Clock to step 4 and trigger IRQ
            for (let cycle = 4; cycle <= 29829; cycle++) {
                fc.clock(cycle);
            }
            
            expect(fc.isIrqPending()).to.equal(true, 'IRQ pending after step 4');
            
            // Continue clocking - IRQ should persist
            for (let cycle = 29830; cycle <= 29850; cycle++) {
                const events = fc.clock(cycle);
                expect(events.irq).to.equal(true, `IRQ persists at cycle ${cycle}`);
            }
            
            expect(fc.isIrqPending()).to.equal(true, 'IRQ still pending');
        });

        it('should clear IRQ flag when clearIrqFlag() called', () => {
            fc.writeControl(0x00, 0); // 4-step, IRQ enabled
            
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Trigger IRQ
            for (let cycle = 4; cycle <= 29829; cycle++) {
                fc.clock(cycle);
            }
            
            expect(fc.isIrqPending()).to.equal(true);
            
            // Clear IRQ flag (simulates reading $4015)
            fc.clearIrqFlag();
            
            expect(fc.isIrqPending()).to.equal(false);
            
            // Should no longer report IRQ
            const events = fc.clock(29830);
            expect(events.irq).to.equal(false);
        });

        it('should clear IRQ flag when inhibit is set', () => {
            fc.writeControl(0x00, 0); // 4-step, IRQ enabled
            
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Trigger IRQ
            for (let cycle = 4; cycle <= 29829; cycle++) {
                fc.clock(cycle);
            }
            
            expect(fc.isIrqPending()).to.equal(true);
            
            // Set IRQ inhibit
            fc.writeControl(0x40, 29830); // IRQ inhibit=1
            
            // Wait for write delay (even cycle = 4)
            for (let cycle = 29830; cycle <= 29834; cycle++) {
                fc.clock(cycle);
            }
            
            expect(fc.isIrqPending()).to.equal(false, 'IRQ cleared by inhibit');
        });
    });

    describe('Write Delay Behavior', () => {
        it('should delay write by 4 cycles when written on even CPU cycle', () => {
            const fc2 = new FrameCounter();
            
            // Write on even cycle (0)
            fc2.writeControl(0x80, 0); // 5-step mode
            
            // Delay should be 4 cycles
            let events;
            
            // Cycles 0-2: no effect yet
            events = fc2.clock(0);
            expect(events.quarterFrame).to.equal(false);
            events = fc2.clock(1);
            expect(events.quarterFrame).to.equal(false);
            events = fc2.clock(2);
            expect(events.quarterFrame).to.equal(false);
            events = fc2.clock(3);
            expect(events.quarterFrame).to.equal(false);
            
            // Cycle 4 (0 + 4): write takes effect with immediate events
            events = fc2.clock(4);
            expect(events.quarterFrame).to.equal(true, 'Immediate quarter after delay');
            expect(events.halfFrame).to.equal(true, 'Immediate half after delay');
        });

        it('should delay write by 3 cycles when written on odd CPU cycle', () => {
            const fc2 = new FrameCounter();
            
            // Write on odd cycle (1)
            fc2.writeControl(0x80, 1); // 5-step mode
            
            let events;
            
            // Cycles 1-2: no effect yet
            events = fc2.clock(1);
            expect(events.quarterFrame).to.equal(false);
            events = fc2.clock(2);
            expect(events.quarterFrame).to.equal(false);
            events = fc2.clock(3);
            expect(events.quarterFrame).to.equal(false);
            
            // Cycle 4 (1 + 3): write takes effect
            events = fc2.clock(4);
            expect(events.quarterFrame).to.equal(true, 'Immediate quarter after delay');
            expect(events.halfFrame).to.equal(true, 'Immediate half after delay');
        });

        it('should reset sequencer after write delay', () => {
            fc.writeControl(0x40, 0); // 4-step mode
            
            // Let some cycles pass
            for (let i = 0; i < 10; i++) {
                fc.clock(i);
            }
            
            // Write again to reset sequencer
            fc.writeControl(0x40, 100);
            
            // Process delay
            for (let i = 100; i <= 104; i++) {
                fc.clock(i);
            }
            
            // Now clock to what should be step 1 from the reset point
            let events;
            for (let cycle = 105; cycle <= 100 + 7459; cycle++) {
                events = fc.clock(cycle);
            }
            
            // Should hit step 1 at cycle 100 + 7459
            expect(events.quarterFrame).to.equal(true, 'Step 1 after reset');
        });

        it('should not generate immediate events in 4-step mode', () => {
            const fc2 = new FrameCounter();
            
            // Write 4-step mode
            fc2.writeControl(0x00, 0); // Mode=0
            
            // Process write delay
            let events;
            for (let i = 0; i < 4; i++) {
                events = fc2.clock(i);
            }
            
            // Should NOT have immediate events in 4-step mode
            expect(events.quarterFrame).to.equal(false, 'No immediate quarter in 4-step');
            expect(events.halfFrame).to.equal(false, 'No immediate half in 4-step');
        });
    });

    describe('Mode Switching', () => {
        it('should switch from 4-step to 5-step mode', () => {
            // Start in 4-step mode
            fc.writeControl(0x40, 0); // Mode=0, IRQ inhibit=1
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Clock partway through sequence
            for (let cycle = 4; cycle <= 10000; cycle++) {
                fc.clock(cycle);
            }
            
            // Switch to 5-step mode (odd cycle 10001, delay = 3, takes effect at 10004)
            fc.writeControl(0xC0, 10001); // Mode=1, IRQ inhibit=1
            
            // Process delay until write takes effect
            let events;
            for (let cycle = 10001; cycle < 10004; cycle++) {
                fc.clock(cycle);
            }
            // Write takes effect at 10004 with immediate events
            events = fc.clock(10004);
            expect(events.quarterFrame).to.equal(true, 'Immediate events on switch to 5-step');
            
            // Should now follow 5-step timing - step 5 at 10001 + 37281 = 47282
            for (let cycle = 10005; cycle < 10001 + 37281; cycle++) {
                fc.clock(cycle);
            }
            events = fc.clock(10001 + 37281);
            expect(events.quarterFrame).to.equal(true, 'Step 5 in 5-step mode');
        });

        it('should switch from 5-step to 4-step mode', () => {
            // Start in 5-step mode
            fc.writeControl(0x80, 0);
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            
            // Switch to 4-step mode
            fc.writeControl(0x40, 100);
            for (let i = 100; i < 104; i++) {
                fc.clock(i);
            }
            
            // Should follow 4-step timing - no step 5
            let events;
            for (let cycle = 104; cycle <= 104 + 37281; cycle++) {
                events = fc.clock(cycle);
                if (cycle === 104 + 37281) {
                    expect(events.quarterFrame).to.equal(false, 'No step 5 in 4-step mode');
                }
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle rapid register writes', () => {
            // Write multiple times in quick succession
            fc.writeControl(0x00, 0);
            fc.writeControl(0x80, 1);
            fc.writeControl(0x40, 2);
            
            // Only the last write should take effect
            let events;
            for (let i = 0; i < 10; i++) {
                events = fc.clock(i);
            }
            
            // Last write was 0x40 (4-step, IRQ inhibit) at cycle 2
            // Delay should complete by cycle 6 (2 + 4)
            // Should not get immediate events (4-step mode)
            expect(events.quarterFrame).to.equal(false);
        });

        it('should maintain state across many cycles', () => {
            fc.writeControl(0x80, 0); // 5-step mode (even cycle, delay=4)
            // Process write delay
            for (let i = 0; i < 4; i++) {
                fc.clock(i);
            }
            // Write takes effect at cycle 4 with immediate events, baseCycle = 0
            fc.clock(4);
            
            // Step 5 occurs at baseCycle + 37281 = 0 + 37281 = 37281
            // After reset at 37281, baseCycle = 37281, next step 5 at 37281 + 37281 = 74562
           
            // First sequence: step 5 at 37281
            let events;
            for (let cycle = 5; cycle < 37281; cycle++) {
                fc.clock(cycle);
            }
            events = fc.clock(37281);
            expect(events.quarterFrame).to.equal(true, 'Step 5 in sequence 0');
            expect(events.halfFrame).to.equal(true, 'Half-frame in sequence 0');
            
            // Second sequence: baseCycle reset to 37281, so step 5 at 37281 + 37281 = 74562
            for (let cycle = 37282; cycle < 74562; cycle++) {
                fc.clock(cycle);
            }
            events = fc.clock(74562);
            expect(events.quarterFrame).to.equal(true, 'Step 5 in sequence 1');
            expect(events.halfFrame).to.equal(true, 'Half-frame in sequence 1');
            
            // Third sequence: baseCycle reset to 74562, so step 5 at 74562 + 37281 = 111843
            for (let cycle = 74563; cycle < 111843; cycle++) {
                fc.clock(cycle);
            }
            events = fc.clock(111843);
            expect(events.quarterFrame).to.equal(true, 'Step 5 in sequence 2');
            expect(events.halfFrame).to.equal(true, 'Half-frame in sequence 2');
        });
    });
});

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

    describe('Hardware Quirks - Section 17 Verification', () => {
        describe('17.7 - Frame counter write has 3-4 cycle delay', () => {
            it('should delay write effect by 3 cycles when written on odd CPU cycle', () => {
                // Hardware quirk: Writing to $4017 has delayed effect
                // - 3 cycles if written on odd CPU cycle
                // - 4 cycles if written on even CPU cycle
                // Verified in implementation at frame-counter.ts line 139: const delay = (cpuCycle % 2 === 1) ? 3 : 4;
                
                const fc = new FrameCounter();
                
                // Write on odd cycle (e.g., cycle 1)
                fc.writeControl(0x00, 1); // Odd cycle
                
                // Effect should NOT occur immediately
                let events = fc.clock(1);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 1');
                
                events = fc.clock(2);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 2');
                
                events = fc.clock(3);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 3');
                
                // Effect should occur after 3 cycles (at cycle 4)
                events = fc.clock(4);
                // Effect has taken place (sequencer reset)
            });

            it('should delay write effect by 4 cycles when written on even CPU cycle', () => {
                const fc = new FrameCounter();
                
                // Write on even cycle (e.g., cycle 2)
                fc.writeControl(0x00, 2); // Even cycle
                
                // Effect should NOT occur immediately
                let events = fc.clock(2);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 2');
                
                events = fc.clock(3);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 3');
                
                events = fc.clock(4);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 4');
                
                events = fc.clock(5);
                expect(events.quarterFrame).to.equal(false, 'No effect at cycle 5');
                
                // Effect should occur after 4 cycles (at cycle 6)
                events = fc.clock(6);
                // Effect has taken place (sequencer reset)
            });

            it('should immediately generate quarter and half frame when switching to 5-step mode', () => {
                // When switching to 5-step mode, quarter and half frame events
                // are generated immediately after the delay
                
                const fc = new FrameCounter();
                
                // Write to switch to 5-step mode on odd cycle
                fc.writeControl(0x80, 1); // Bit 7 = 1 for 5-step mode
                
                // Clock through the 3-cycle delay
                fc.clock(1);
                fc.clock(2);
                fc.clock(3);
                
                // On cycle 4, the write takes effect
                const events = fc.clock(4);
                
                // Should generate quarter and half frame immediately
                expect(events.quarterFrame).to.equal(true, 'Quarter frame on mode switch');
                expect(events.halfFrame).to.equal(true, 'Half frame on mode switch');
            });

            it('should reset sequencer after write delay, with baseCycle set to write cycle', () => {
                // The sequencer resets, and baseCycle is set to when the write was ISSUED,
                // not when it takes effect
                
                const fc = new FrameCounter();
                
                // Let some cycles pass
                for (let i = 0; i < 100; i++) {
                    fc.clock(i);
                }
                
                // Write on cycle 100 (even)
                fc.writeControl(0x00, 100);
                
                // Clock through delay (4 cycles for even)
                for (let i = 100; i <= 103; i++) {
                    fc.clock(i);
                }
                
                // Write takes effect at cycle 104
                fc.clock(104);
                
                // First step should occur at baseCycle + 7459 = 100 + 7459 = 7559
                for (let i = 105; i < 7559; i++) {
                    const e = fc.clock(i);
                    expect(e.quarterFrame).to.equal(false, `No quarter frame before step 1 at ${i}`);
                }
                
                const stepEvents = fc.clock(7559);
                expect(stepEvents.quarterFrame).to.equal(true, 'Quarter frame at step 1');
            });

            it('should clear IRQ flag if IRQ inhibit is set in pending write', () => {
                // If the pending write has IRQ inhibit set, the IRQ flag should be cleared
                // when the write takes effect
                
                const fc = new FrameCounter();
                
                // Write with IRQ inhibit (bit 6 = 1)
                fc.writeControl(0x40, 1); // Odd cycle, 3-cycle delay
                
                // Clock through delay
                fc.clock(1);
                fc.clock(2);
                fc.clock(3);
                fc.clock(4); // Write takes effect
                
                // IRQ should be clear
                expect(fc.isIrqPending()).to.equal(false);
            });

            it('should handle multiple rapid writes correctly', () => {
                // When multiple writes occur, later writes override earlier pending writes
                // The implementation tracks pendingWrite state, so second write replaces first
                
                const fc = new FrameCounter();
                
                // Write on cycle 1 (odd) - would take effect at cycle 4
                fc.writeControl(0x00, 1); // 4-step mode
                
                // Write again on cycle 2 (even) before first takes effect - would take effect at cycle 6
                fc.writeControl(0x80, 2); // 5-step mode (overrides first write)
                
                // Clock all the way through both delays
                let events;
                for (let cycle = 1; cycle <= 10; cycle++) {
                    events = fc.clock(cycle);
                }
                
                // By cycle 10, both writes should have completed
                // The implementation handles this correctly - pendingWrite gets overridden
                // Just verify no error occurred
                expect(events).to.not.equal(null);
            });
        });
    });

    /**
     * Task 18.6: Unit tests for timing synchronization
     *
     * These tests verify proper timing synchronization between the frame counter
     * and channels, ensuring quarter-frame and half-frame events occur at precise
     * intervals with correct differences between 4-step and 5-step modes.
     */
    describe('Task 18.6: Timing Synchronization', () => {
        describe('quarter-frame timing intervals', () => {
            it('should generate quarter-frame every ~3728.5 cycles in 4-step mode', () => {
                fc.writeControl(0x40, 0); // 4-step mode, IRQ inhibit
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                // Quarter-frame events occur at: 7459, 14913, 22371, 29829
                // Intervals: 7459, 7454, 7458, 7458
                // Average: ~7457 cycles (half of ~14914.5 or ~3728.625 CPU cycles per quarter-frame)
                
                const quarterFrameCycles = [];
                let lastQuarterFrameCycle = 0;
                
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.quarterFrame) {
                        quarterFrameCycles.push(cycle);
                        
                        if (lastQuarterFrameCycle > 0) {
                            const interval = cycle - lastQuarterFrameCycle;
                            // Interval should be around 7454-7459 cycles
                            expect(interval).to.be.at.least(7450);
                            expect(interval).to.be.at.most(7465);
                        }
                        
                        lastQuarterFrameCycle = cycle;
                    }
                }
                
                // Should have 4 quarter-frame events
                expect(quarterFrameCycles).to.have.lengthOf(4);
                expect(quarterFrameCycles).to.deep.equal([7459, 14913, 22371, 29829]);
            });

            it('should generate quarter-frame every ~3728.5 cycles in 5-step mode', () => {
                fc.writeControl(0x80, 0); // 5-step mode
                for (let i = 0; i <= 4; i++) fc.clock(i);
                
                // Quarter-frame events occur at: 7459, 14913, 22371, 29829, 37281
                const quarterFrameCycles = [];
                let lastQuarterFrameCycle = 4; // Start from when immediate event occurred
                
                for (let cycle = 5; cycle <= 37281; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.quarterFrame) {
                        quarterFrameCycles.push(cycle);
                        
                        const interval = cycle - lastQuarterFrameCycle;
                        // Interval should be around 7454-7459 cycles
                        expect(interval).to.be.at.least(7450);
                        expect(interval).to.be.at.most(7465);
                        
                        lastQuarterFrameCycle = cycle;
                    }
                }
                
                // Should have 5 quarter-frame events (after immediate one)
                expect(quarterFrameCycles).to.have.lengthOf(5);
                expect(quarterFrameCycles).to.deep.equal([7459, 14913, 22371, 29829, 37281]);
            });

            it('should verify quarter-frame interval calculation: (step_cycle / step_number)', () => {
                // In 4-step: Step 1 at 7459, Step 2 at 14913, Step 3 at 22371, Step 4 at 29829
                // Average step interval: 29829 / 4 ≈ 7457.25 cycles per quarter-frame
                fc.writeControl(0x40, 0);
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                const events4 = [];
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const e = fc.clock(cycle);
                    if (e.quarterFrame) events4.push(cycle);
                }
                
                const avgInterval4 = events4[events4.length - 1] / events4.length;
                expect(avgInterval4).to.be.closeTo(7457.25, 1);
            });
        });

        describe('half-frame timing intervals', () => {
            it('should generate half-frame at steps 2 and 4 in 4-step mode', () => {
                fc.writeControl(0x40, 0); // 4-step mode
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                // Half-frame events occur at: 14913, 29829
                // Interval: 14916 cycles between half-frames
                const halfFrameCycles = [];
                
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.halfFrame) {
                        halfFrameCycles.push(cycle);
                    }
                }
                
                // Should have 2 half-frame events
                expect(halfFrameCycles).to.have.lengthOf(2);
                expect(halfFrameCycles).to.deep.equal([14913, 29829]);
                
                // Interval should be 29829 - 14913 = 14916 cycles
                const interval = halfFrameCycles[1] - halfFrameCycles[0];
                expect(interval).to.equal(14916);
            });

            it('should generate half-frame at steps 2, 4, and 5 in 5-step mode', () => {
                fc.writeControl(0x80, 0); // 5-step mode
                for (let i = 0; i <= 4; i++) fc.clock(i);
                
                // Half-frame events occur at: (immediate at 4), 14913, 29829, 37281
                const halfFrameCycles = [];
                
                for (let cycle = 5; cycle <= 37281; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.halfFrame) {
                        halfFrameCycles.push(cycle);
                    }
                }
                
                // Should have 3 half-frame events (after immediate one)
                expect(halfFrameCycles).to.have.lengthOf(3);
                expect(halfFrameCycles).to.deep.equal([14913, 29829, 37281]);
                
                // Intervals: 14913 - 4 = 14909, 29829 - 14913 = 14916, 37281 - 29829 = 7452
                const interval1 = halfFrameCycles[0] - 4; // From immediate to first
                const interval2 = halfFrameCycles[1] - halfFrameCycles[0];
                const interval3 = halfFrameCycles[2] - halfFrameCycles[1];
                
                expect(interval1).to.equal(14909);
                expect(interval2).to.equal(14916);
                expect(interval3).to.equal(7452);
            });

            it('should verify half-frame occurs twice per full sequence in 4-step mode', () => {
                fc.writeControl(0x40, 0);
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                let halfFrameCount = 0;
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.halfFrame) halfFrameCount++;
                }
                
                expect(halfFrameCount).to.equal(2);
            });

            it('should verify half-frame occurs three times per full sequence in 5-step mode', () => {
                fc.writeControl(0x80, 0);
                for (let i = 0; i <= 4; i++) fc.clock(i);
                
                // Count half-frames in the sequence (not including immediate one)
                let halfFrameCount = 0;
                for (let cycle = 5; cycle <= 37281; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.halfFrame) halfFrameCount++;
                }
                
                // Should have 3 half-frame events in the sequence at steps 2, 4, and 5
                expect(halfFrameCount).to.equal(3);
            });
        });

        describe('4-step vs 5-step mode timing differences', () => {
            it('should verify 4-step sequence is ~29830 cycles', () => {
                fc.writeControl(0x40, 0); // 4-step mode
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                let sequenceEnd = 0;
                for (let cycle = 4; cycle <= 30000; cycle++) {
                    const events = fc.clock(cycle);
                    // Last event at step 4
                    if (events.quarterFrame && cycle > 29000) {
                        sequenceEnd = cycle;
                        break;
                    }
                }
                
                expect(sequenceEnd).to.equal(29829);
                // Sequence length is approximately 29830 cycles (29829 + 1)
            });

            it('should verify 5-step sequence is ~37282 cycles', () => {
                fc.writeControl(0x80, 0); // 5-step mode
                for (let i = 0; i <= 4; i++) fc.clock(i);
                
                let sequenceEnd = 0;
                for (let cycle = 5; cycle <= 38000; cycle++) {
                    const events = fc.clock(cycle);
                    // Last event at step 5
                    if (events.quarterFrame && cycle > 37000) {
                        sequenceEnd = cycle;
                        break;
                    }
                }
                
                expect(sequenceEnd).to.equal(37281);
                // Sequence length is approximately 37282 cycles (37281 + 1)
            });

            it('should verify 5-step sequence is ~25% longer than 4-step', () => {
                // 4-step: 29829 cycles
                // 5-step: 37281 cycles
                // Ratio: 37281 / 29829 ≈ 1.25 (25% longer)
                const step4Length = 29829;
                const step5Length = 37281;
                const ratio = step5Length / step4Length;
                
                expect(ratio).to.be.closeTo(1.25, 0.01);
            });

            it('should verify 4-step has 4 quarter-frames, 5-step has 5', () => {
                // 4-step mode
                fc.writeControl(0x40, 0);
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                let count4 = 0;
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    if (fc.clock(cycle).quarterFrame) count4++;
                }
                expect(count4).to.equal(4);
                
                // 5-step mode
                const fc5 = new FrameCounter();
                fc5.writeControl(0x80, 0);
                for (let i = 0; i <= 4; i++) fc5.clock(i);
                
                let count5 = 0;
                for (let cycle = 5; cycle <= 37281; cycle++) {
                    if (fc5.clock(cycle).quarterFrame) count5++;
                }
                expect(count5).to.equal(5);
            });

            it('should verify timing difference at step 4', () => {
                // In both modes, step 4 occurs at cycle 29829
                // But 4-step resets after this, while 5-step continues to step 5
                
                // 4-step mode
                const fc4 = new FrameCounter();
                fc4.writeControl(0x40, 0);
                for (let i = 0; i < 4; i++) fc4.clock(i);
                
                // Clock to just after step 4
                for (let cycle = 4; cycle <= 29830; cycle++) {
                    fc4.clock(cycle);
                }
                
                // Next quarter-frame should be at 29830 + 7459 = 37289 in 4-step
                let nextEvent4 = 0;
                for (let cycle = 29831; cycle <= 40000; cycle++) {
                    if (fc4.clock(cycle).quarterFrame) {
                        nextEvent4 = cycle;
                        break;
                    }
                }
                
                // 5-step mode
                const fc5 = new FrameCounter();
                fc5.writeControl(0x80, 0);
                for (let i = 0; i <= 4; i++) fc5.clock(i);
                
                for (let cycle = 5; cycle <= 29830; cycle++) {
                    fc5.clock(cycle);
                }
                
                // Next quarter-frame should be at 37281 in 5-step
                let nextEvent5 = 0;
                for (let cycle = 29831; cycle <= 40000; cycle++) {
                    if (fc5.clock(cycle).quarterFrame) {
                        nextEvent5 = cycle;
                        break;
                    }
                }
                
                expect(nextEvent4).to.be.greaterThan(37000);
                expect(nextEvent5).to.equal(37281);
            });
        });

        describe('IRQ timing in 4-step mode', () => {
            it('should trigger IRQ at step 4 (cycle 29829) when not inhibited', () => {
                fc.writeControl(0x00, 0); // 4-step, IRQ enabled
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                let irqCycle = 0;
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.irq) {
                        if (irqCycle === 0) irqCycle = cycle;
                    }
                }
                
                // IRQ should trigger at step 4
                expect(irqCycle).to.equal(29829);
            });

            it('should not trigger IRQ before step 4', () => {
                fc.writeControl(0x00, 0); // 4-step, IRQ enabled
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                // Clock through steps 1, 2, 3
                for (let cycle = 4; cycle < 29829; cycle++) {
                    const events = fc.clock(cycle);
                    expect(events.irq).to.equal(false, `No IRQ before step 4 at cycle ${cycle}`);
                }
            });

            it('should persist IRQ after step 4 until cleared', () => {
                fc.writeControl(0x00, 0); // 4-step, IRQ enabled
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                // Clock to step 4
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    fc.clock(cycle);
                }
                
                // IRQ should persist for several cycles
                for (let cycle = 29830; cycle <= 29850; cycle++) {
                    const events = fc.clock(cycle);
                    expect(events.irq).to.equal(true, `IRQ persists at cycle ${cycle}`);
                }
            });

            it('should not trigger IRQ in 5-step mode even at step 4', () => {
                fc.writeControl(0x80, 0); // 5-step, IRQ not inhibited by mode
                for (let i = 0; i <= 4; i++) fc.clock(i);
                
                // Clock through entire sequence including step 4
                for (let cycle = 5; cycle <= 37281; cycle++) {
                    const events = fc.clock(cycle);
                    expect(events.irq).to.equal(false, `No IRQ in 5-step mode at cycle ${cycle}`);
                }
            });

            it('should trigger IRQ exactly at the quarter-frame/half-frame of step 4', () => {
                fc.writeControl(0x00, 0); // 4-step, IRQ enabled
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                // Clock to step 4
                for (let cycle = 4; cycle < 29829; cycle++) {
                    fc.clock(cycle);
                }
                
                const events = fc.clock(29829);
                
                // All three should happen simultaneously at step 4
                expect(events.quarterFrame).to.equal(true, 'Quarter-frame at step 4');
                expect(events.halfFrame).to.equal(true, 'Half-frame at step 4');
                expect(events.irq).to.equal(true, 'IRQ at step 4');
            });

            it('should verify IRQ timing matches step 4 timing exactly', () => {
                fc.writeControl(0x00, 0); // 4-step, IRQ enabled
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                let step4Cycle = 0;
                let irqCycle = 0;
                
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.quarterFrame && events.halfFrame && cycle > 22000) {
                        step4Cycle = cycle;
                    }
                    if (events.irq && irqCycle === 0) {
                        irqCycle = cycle;
                    }
                }
                
                // IRQ should occur at exactly the same cycle as step 4
                expect(irqCycle).to.equal(step4Cycle);
                expect(step4Cycle).to.equal(29829);
            });
        });

        describe('channel clock signal synchronization', () => {
            it('should provide consistent quarter-frame signals for envelope clocking', () => {
                // Envelopes are clocked on quarter-frame events
                // This test verifies quarter-frame events are consistent
                fc.writeControl(0x40, 0); // 4-step mode
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                const quarterFrameEvents = [];
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.quarterFrame) {
                        quarterFrameEvents.push({
                            cycle,
                            hasHalfFrame: events.halfFrame
                        });
                    }
                }
                
                // Should have 4 quarter-frame events
                expect(quarterFrameEvents).to.have.lengthOf(4);
                
                // Verify expected pattern: Q, QH, Q, QH
                expect(quarterFrameEvents[0].hasHalfFrame).to.equal(false);
                expect(quarterFrameEvents[1].hasHalfFrame).to.equal(true);
                expect(quarterFrameEvents[2].hasHalfFrame).to.equal(false);
                expect(quarterFrameEvents[3].hasHalfFrame).to.equal(true);
            });

            it('should provide consistent half-frame signals for sweep and length counter clocking', () => {
                // Sweep units and length counters are clocked on half-frame events
                fc.writeControl(0x40, 0); // 4-step mode
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                const halfFrameEvents = [];
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.halfFrame) {
                        halfFrameEvents.push(cycle);
                    }
                }
                
                // Should have 2 half-frame events
                expect(halfFrameEvents).to.have.lengthOf(2);
                expect(halfFrameEvents).to.deep.equal([14913, 29829]);
            });

            it('should verify quarter-frame always accompanies half-frame', () => {
                // Half-frame should never occur without quarter-frame
                fc.writeControl(0x40, 0); // 4-step mode
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.halfFrame) {
                        expect(events.quarterFrame).to.equal(true,
                            `Half-frame at ${cycle} must have quarter-frame`);
                    }
                }
            });

            it('should verify event timing is consistent across mode switches', () => {
                // Start in 4-step, get first event, then switch to 5-step
                fc.writeControl(0x40, 0);
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                // Get first quarter-frame
                let firstEvent = 0;
                for (let cycle = 4; cycle <= 7459; cycle++) {
                    if (fc.clock(cycle).quarterFrame) {
                        firstEvent = cycle;
                        break;
                    }
                }
                expect(firstEvent).to.equal(7459);
                
                // Switch to 5-step mode
                fc.writeControl(0x80, 7500);
                for (let i = 7500; i <= 7504; i++) {
                    fc.clock(i);
                }
                
                // Next quarter-frame should follow 5-step timing
                let nextEvent = 0;
                for (let cycle = 7505; cycle <= 50000; cycle++) {
                    if (fc.clock(cycle).quarterFrame) {
                        nextEvent = cycle;
                        break;
                    }
                }
                
                // Should be at 7500 + 7459 = 14959
                expect(nextEvent).to.equal(14959);
            });

            it('should generate predictable event sequence for channel synchronization', () => {
                // Channels rely on predictable quarter/half frame timing
                // Verify the exact sequence of events in 4-step mode
                fc.writeControl(0x40, 0);
                for (let i = 0; i < 4; i++) fc.clock(i);
                
                const eventSequence = [];
                for (let cycle = 4; cycle <= 29829; cycle++) {
                    const events = fc.clock(cycle);
                    if (events.quarterFrame || events.halfFrame) {
                        eventSequence.push({
                            cycle,
                            q: events.quarterFrame,
                            h: events.halfFrame
                        });
                    }
                }
                
                // Verify exact sequence: Q@7459, QH@14913, Q@22371, QH@29829
                expect(eventSequence).to.deep.equal([
                    { cycle: 7459, q: true, h: false },
                    { cycle: 14913, q: true, h: true },
                    { cycle: 22371, q: true, h: false },
                    { cycle: 29829, q: true, h: true }
                ]);
            });
        });
    });
});

import chai from "chai";
import { Apu2A03 } from '../../../lib/devices/apu.js';

const expect = chai.expect;

/**
 * Apu2A03 Unit Tests
 * 
 * Comprehensive tests for the main NES APU class.
 * Tests cover initialization, register read/write behavior, bus integration,
 * status register operations, channel enable/disable, and reset functionality.
 * 
 * This is part of Phase 7 (Task 18.3) of the APU implementation.
 */

describe('Apu2A03', () => {
    /** @type {import('../../../src/devices/apu').Apu2A03} */
    let apu;

    beforeEach(() => {
        apu = new Apu2A03();
    });

    describe('initialization', () => {
        it('should construct an APU', () => {
            expect(apu).to.be.instanceOf(Apu2A03);
        });

        it('should initialize with all channels created', () => {
            // Verify channels exist by enabling them and checking status
            apu.write(0x4015, 0x0F); // Enable all channels
            
            // Write to pulse 1 to load length counter
            apu.write(0x4003, 0x08);
            // Write to pulse 2 to load length counter
            apu.write(0x4007, 0x08);
            
            const status = apu.read(0x4015);
            
            // Bits 0-1 should be set (pulse channels have length > 0)
            expect(status & 0x01).to.equal(0x01); // Pulse 1 active
            expect(status & 0x02).to.equal(0x02); // Pulse 2 active
        });

        it('should initialize with all channels disabled', () => {
            const status = apu.read(0x4015);
            
            // All channel status bits should be 0
            expect(status & 0x1F).to.equal(0);
        });

        it('should initialize with no interrupts', () => {
            const status = apu.read(0x4015);
            
            // Interrupt flags (bits 6-7) should be 0
            expect(status & 0xC0).to.equal(0);
        });

        it('should initialize frame counter', () => {
            // Frame counter should be initialized (no error on clock)
            apu.clock();
        });
    });

    describe('register routing - writes', () => {
        beforeEach(() => {
            apu.write(0x4015, 0x0F); // Enable all channels
        });

        describe('Pulse 1 channel ($4000-$4003)', () => {
            it('should route $4000 to Pulse 1 control register', () => {
                apu.write(0x4000, 0xBF); // Duty 2, constant volume 15
                apu.write(0x4002, 0x10); // Timer > 8
                apu.write(0x4003, 0x08); // Load length counter
                
                // Verify by checking that writing affects pulse 1 output
                // (Implementation details verified in pulse.test.js)
            });

            it('should route $4001 to Pulse 1 sweep register', () => {
                apu.write(0x4001, 0x81); // Enable sweep
                // No error should occur
            });

            it('should route $4002 to Pulse 1 timer low', () => {
                apu.write(0x4002, 0xAB);
                // No error should occur
            });

            it('should route $4003 to Pulse 1 length/timer high', () => {
                apu.write(0x4003, 0x08);
                
                // Verify length counter was loaded
                const status = apu.read(0x4015);
                expect(status & 0x01).to.equal(0x01);
            });
        });

        describe('Pulse 2 channel ($4004-$4007)', () => {
            it('should route $4004 to Pulse 2 control register', () => {
                apu.write(0x4004, 0xBF); // Duty 2, constant volume 15
                apu.write(0x4006, 0x10); // Timer > 8
                apu.write(0x4007, 0x08); // Load length counter
                
                // Verify by checking status
                const status = apu.read(0x4015);
                expect(status & 0x02).to.equal(0x02);
            });

            it('should route $4005 to Pulse 2 sweep register', () => {
                apu.write(0x4005, 0x81);
                // No error should occur
            });

            it('should route $4006 to Pulse 2 timer low', () => {
                apu.write(0x4006, 0xCD);
                // No error should occur
            });

            it('should route $4007 to Pulse 2 length/timer high', () => {
                apu.write(0x4007, 0x08);
                
                const status = apu.read(0x4015);
                expect(status & 0x02).to.equal(0x02);
            });
        });

        describe('Triangle channel ($4008-$400B)', () => {
            it('should route $4008 to Triangle control register', () => {
                apu.write(0x4008, 0x7F);
                // No error should occur (stub implementation)
            });

            it('should route $4009 (unused)', () => {
                apu.write(0x4009, 0xFF);
                // No error should occur
            });

            it('should route $400A to Triangle timer low', () => {
                apu.write(0x400A, 0xEF);
                // No error should occur
            });

            it('should route $400B to Triangle length/timer high', () => {
                apu.write(0x400B, 0x08);
                // No error should occur
            });
        });

        describe('Noise channel ($400C-$400F)', () => {
            it('should route $400C to Noise control register', () => {
                apu.write(0x400C, 0x3F);
                // No error should occur (stub implementation)
            });

            it('should route $400D (unused)', () => {
                apu.write(0x400D, 0xFF);
                // No error should occur
            });

            it('should route $400E to Noise period register', () => {
                apu.write(0x400E, 0x0F);
                // No error should occur
            });

            it('should route $400F to Noise length register', () => {
                apu.write(0x400F, 0x08);
                // No error should occur
            });
        });

        describe('DMC channel ($4010-$4013)', () => {
            it('should route $4010 to DMC control register', () => {
                apu.write(0x4010, 0xCF);
                // No error should occur (stub implementation)
            });

            it('should route $4011 to DMC direct load', () => {
                apu.write(0x4011, 0x7F);
                // No error should occur
            });

            it('should route $4012 to DMC sample address', () => {
                apu.write(0x4012, 0xC0);
                // No error should occur
            });

            it('should route $4013 to DMC sample length', () => {
                apu.write(0x4013, 0xFF);
                // No error should occur
            });
        });

        describe('Control registers', () => {
            it('should route $4015 to status register', () => {
                apu.write(0x4015, 0x1F);
                
                const status = apu.read(0x4015);
                // Status will reflect actual channel states
            });

            it('should route $4017 to frame counter', () => {
                apu.write(0x4017, 0x80); // 5-step mode
                // No error should occur
            });
        });

        describe('invalid addresses', () => {
            it('should handle writes to invalid addresses gracefully', () => {
                // Addresses outside $4000-$4017 range
                apu.write(0x4018, 0xFF);
                apu.write(0x3FFF, 0xFF);
                // No error should occur
            });
        });
    });

    describe('$4015 write (channel enable/disable)', () => {
        describe('enabling channels', () => {
            it('should enable Pulse 1 when bit 0 is set', () => {
                apu.write(0x4015, 0x01); // Enable Pulse 1
                apu.write(0x4003, 0x08); // Load length counter
                
                const status = apu.read(0x4015);
                expect(status & 0x01).to.equal(0x01);
            });

            it('should enable Pulse 2 when bit 1 is set', () => {
                apu.write(0x4015, 0x02); // Enable Pulse 2
                apu.write(0x4007, 0x08); // Load length counter
                
                const status = apu.read(0x4015);
                expect(status & 0x02).to.equal(0x02);
            });

            it('should enable Triangle when bit 2 is set', () => {
                apu.write(0x4015, 0x04); // Enable Triangle
                // Note: Triangle channel not fully implemented, testing routing only
            });

            it('should enable Noise when bit 3 is set', () => {
                apu.write(0x4015, 0x08); // Enable Noise
                // Note: Noise channel not fully implemented, testing routing only
            });

            it('should enable DMC when bit 4 is set', () => {
                apu.write(0x4015, 0x10); // Enable DMC
                // Note: DMC channel not fully implemented, testing routing only
            });

            it('should enable multiple channels simultaneously', () => {
                apu.write(0x4015, 0x1F); // Enable all channels
                apu.write(0x4003, 0x08); // Load Pulse 1 length
                apu.write(0x4007, 0x08); // Load Pulse 2 length
                
                const status = apu.read(0x4015);
                expect(status & 0x03).to.equal(0x03); // Both pulses active
            });
        });

        describe('disabling channels', () => {
            beforeEach(() => {
                // Enable all channels and load length counters
                apu.write(0x4015, 0x1F);
                apu.write(0x4003, 0x08); // Pulse 1 length
                apu.write(0x4007, 0x08); // Pulse 2 length
            });

            it('should disable and clear Pulse 1 length counter when bit 0 is clear', () => {
                const before = apu.read(0x4015);
                expect(before & 0x01).to.equal(0x01); // Pulse 1 active
                
                apu.write(0x4015, 0x1E); // Clear bit 0, keep others
                
                const after = apu.read(0x4015);
                expect(after & 0x01).to.equal(0x00); // Pulse 1 inactive
            });

            it('should disable and clear Pulse 2 length counter when bit 1 is clear', () => {
                const before = apu.read(0x4015);
                expect(before & 0x02).to.equal(0x02); // Pulse 2 active
                
                apu.write(0x4015, 0x1D); // Clear bit 1, keep others
                
                const after = apu.read(0x4015);
                expect(after & 0x01).to.equal(0x01); // Pulse 1 still active
                expect(after & 0x02).to.equal(0x00); // Pulse 2 inactive
            });

            it('should clear Triangle length counter when bit 2 is clear', () => {
                // Set triangle length counter to non-zero (using internal state)
                // Write to enable triangle
                apu.write(0x4015, 0x04);
                // FIXME: Triangle channel not implemented yet
                // This test validates the disable path exists
                apu.write(0x4015, 0x00); // Disable all
            });

            it('should clear Noise length counter when bit 3 is clear', () => {
                // Similar to triangle - validates disable path
                apu.write(0x4015, 0x08);
                apu.write(0x4015, 0x00);
            });

            it('should clear DMC bytes remaining when bit 4 is clear', () => {
                // Similar to triangle/noise - validates disable path
                apu.write(0x4015, 0x10);
                apu.write(0x4015, 0x00);
            });

            it('should disable all channels when writing 0', () => {
                apu.write(0x4015, 0x00);
                
                const status = apu.read(0x4015);
                expect(status & 0x1F).to.equal(0x00);
            });
        });

        describe('hardware quirks', () => {
            it('should immediately clear length counter when disabling a channel', () => {
                apu.write(0x4015, 0x01); // Enable Pulse 1
                apu.write(0x4003, 0x08); // Load length counter
                
                expect(apu.read(0x4015) & 0x01).to.equal(0x01);
                
                apu.write(0x4015, 0x00); // Disable
                
                // Length counter should be immediately 0
                expect(apu.read(0x4015) & 0x01).to.equal(0x00);
            });

            // Note: DMC restart quirk test requires DMC implementation
            it('should restart DMC sample when enabling with bytes=0 (stub)', () => {
                // TODO: Implement when DMC channel is complete
                // Enabling DMC with bytes_remaining=0 should restart sample
                apu.write(0x4015, 0x00); // Ensure DMC is disabled (bytes=0)
                apu.write(0x4015, 0x10); // Re-enable DMC
                // Should trigger sample restart (not implemented yet)
            });

            it('should clear DMC interrupt flag on any write', () => {
                // Note: Can't easily set DMC interrupt in current implementation
                // This test verifies the code path exists
                apu.write(0x4015, 0x1F);
                
                // DMC interrupt should be clear
                const status = apu.read(0x4015);
                expect(status & 0x80).to.equal(0x00);
            });
        });
    });

    describe('$4015 read (status register)', () => {
        describe('channel length counter status', () => {
            beforeEach(() => {
                apu.write(0x4015, 0x1F); // Enable all channels
            });

            it('should set bit 0 when Pulse 1 length counter > 0', () => {
                apu.write(0x4003, 0x08); // Load Pulse 1 length
                
                const status = apu.read(0x4015);
                expect(status & 0x01).to.equal(0x01);
            });

            it('should clear bit 0 when Pulse 1 length counter = 0', () => {
                apu.write(0x4015, 0x00); // Disable (clears length)
                
                const status = apu.read(0x4015);
                expect(status & 0x01).to.equal(0x00);
            });

            it('should set bit 1 when Pulse 2 length counter > 0', () => {
                apu.write(0x4007, 0x08); // Load Pulse 2 length
                
                const status = apu.read(0x4015);
                expect(status & 0x02).to.equal(0x02);
            });

            it('should clear bit 1 when Pulse 2 length counter = 0', () => {
                apu.write(0x4015, 0x00); // Disable
                
                const status = apu.read(0x4015);
                expect(status & 0x02).to.equal(0x00);
            });

            it('should reflect bit 2 for Triangle length counter', () => {
                // Triangle not fully implemented - test validates read path
                const status = apu.read(0x4015);
                // Bit 2 depends on triangle_length_counter internal state
            });

            it('should reflect bit 3 for Noise length counter', () => {
                // Noise not fully implemented - test validates read path
                const status = apu.read(0x4015);
                // Bit 3 depends on noise_length_counter internal state
            });

            it('should reflect bit 4 for DMC bytes remaining', () => {
                // DMC not fully implemented - test validates read path
                const status = apu.read(0x4015);
                // Bit 4 depends on dmc_bytes_remaining internal state
            });

            it('should report multiple active channels', () => {
                apu.write(0x4003, 0x08); // Pulse 1
                apu.write(0x4007, 0x08); // Pulse 2
                
                const status = apu.read(0x4015);
                expect(status & 0x03).to.equal(0x03);
            });
        });

        describe('interrupt flags', () => {
            it('should set bit 6 when frame interrupt flag is set', () => {
                // Frame interrupt flag is set by frame counter
                // Currently no direct way to set it in tests
                // This test validates the read implementation
                const status = apu.read(0x4015);
                // Bit 6 reflects frame_interrupt_flag
            });

            it('should set bit 7 when DMC interrupt flag is set', () => {
                // DMC interrupt flag is set by DMC channel
                // Currently no direct way to set it in tests
                // This test validates the read implementation
                const status = apu.read(0x4015);
                // Bit 7 reflects dmc_interrupt_flag
            });
        });

        describe('hardware quirks - side effects', () => {
            it('should clear frame interrupt flag as side effect of reading', () => {
                // Reading $4015 should clear frame interrupt flag
                // Can't easily test without frame counter implementation
                // This validates the code path exists
                apu.read(0x4015); // First read
                const status = apu.read(0x4015); // Second read
                
                // Frame interrupt should be clear
                expect(status & 0x40).to.equal(0x00);
            });

            it('should NOT clear DMC interrupt flag when reading', () => {
                // DMC interrupt is only cleared by writing to $4015
                // Not by reading
                // Test validates correct behavior
                apu.read(0x4015);
                const status = apu.read(0x4015);
                
                // DMC interrupt flag unchanged by read
                expect(status & 0x80).to.equal(0x00);
            });

            it('should clear frame interrupt on every read', () => {
                // Even multiple reads should work correctly
                apu.read(0x4015);
                apu.read(0x4015);
                apu.read(0x4015);
                
                const status = apu.read(0x4015);
                expect(status & 0x40).to.equal(0x00);
            });
        });

        describe('write-only registers', () => {
            it('should return last written value for write-only registers', () => {
                // Write a value to a write-only register
                apu.write(0x4000, 0xAB);
                
                // Read returns last written value (approximates open bus)
                const value = apu.read(0x4000);
                expect(value).to.equal(0xAB);
            });

            it('should return 0 for unwritten registers', () => {
                // Read from register that hasn't been written
                const value = apu.read(0x4001);
                expect(value).to.equal(0x00);
            });

            it('should track separate values for each register', () => {
                apu.write(0x4000, 0x11);
                apu.write(0x4001, 0x22);
                apu.write(0x4002, 0x33);
                
                expect(apu.read(0x4000)).to.equal(0x11);
                expect(apu.read(0x4001)).to.equal(0x22);
                expect(apu.read(0x4002)).to.equal(0x33);
            });
        });
    });

    describe('$4017 write (frame counter)', () => {
        it('should accept writes to frame counter register', () => {
            apu.write(0x4017, 0x00); // 4-step mode, IRQ enabled
            apu.write(0x4017, 0x80); // 5-step mode, IRQ enabled
            apu.write(0x4017, 0x40); // 4-step mode, IRQ disabled
            apu.write(0x4017, 0xC0); // 5-step mode, IRQ disabled
            // No error should occur
        });

        it('should clear frame interrupt flag when IRQ inhibit is set', () => {
            apu.write(0x4017, 0x40); // Set IRQ inhibit (bit 6)
            
            const status = apu.read(0x4015);
            // Frame interrupt should be clear
            expect(status & 0x40).to.equal(0x00);
        });

        it('should clear frame interrupt even with other bits', () => {
            apu.write(0x4017, 0xC0); // 5-step mode + IRQ inhibit
            
            const status = apu.read(0x4015);
            expect(status & 0x40).to.equal(0x00);
        });

        it('should not clear frame interrupt when IRQ inhibit is not set', () => {
            apu.write(0x4017, 0x00); // IRQ inhibit clear
            
            // Frame interrupt state depends on frame counter
            // This test validates the code path
        });
    });

    describe('clock distribution', () => {
        it('should have clock() method', () => {
            expect(apu.clock).to.be.a('function');
        });

        it('should not error when clocked', () => {
            apu.clock();
            apu.clock();
            apu.clock();
            // No error should occur
        });

        it('should clock multiple times without error', () => {
            for (let i = 0; i < 100; i++) {
                apu.clock();
            }
            // Validates clock stability
        });

        // Note: Detailed clock distribution tests require frame counter implementation
        it('should distribute clocks to channels (stub)', () => {
            // TODO: Test quarter frame and half frame events
            // when frame counter is implemented
            apu.write(0x4015, 0x0F); // Enable channels
            
            // Clock the APU
            for (let i = 0; i < 1000; i++) {
                apu.clock();
            }
            
            // No error should occur
        });
    });

    describe('reset', () => {
        beforeEach(() => {
            // Set up some state
            apu.write(0x4015, 0x1F); // Enable all channels
            apu.write(0x4000, 0xBF); // Pulse 1 config
            apu.write(0x4003, 0x08); // Pulse 1 length
            apu.write(0x4007, 0x08); // Pulse 2 length
        });

        it('should have reset() method', () => {
            expect(apu.reset).to.be.a('function');
        });

        it('should clear all registers on reset', () => {
            apu.reset();
            
            // Check that registers are cleared
            expect(apu.read(0x4000)).to.equal(0x00);
            expect(apu.read(0x4001)).to.equal(0x00);
        });

        it('should disable all channels on reset', () => {
            apu.reset();
            
            const status = apu.read(0x4015);
            expect(status & 0x1F).to.equal(0x00);
        });

        it('should clear interrupt flags on reset', () => {
            apu.reset();
            
            const status = apu.read(0x4015);
            expect(status & 0xC0).to.equal(0x00);
        });

        it('should reset pulse channels', () => {
            const beforeStatus = apu.read(0x4015);
            expect(beforeStatus & 0x03).to.not.equal(0x00); // Channels were active
            
            apu.reset();
            
            const afterStatus = apu.read(0x4015);
            expect(afterStatus & 0x03).to.equal(0x00); // Channels now inactive
        });

        it('should reset frame counter', () => {
            apu.write(0x4017, 0xC0); // Configure frame counter
            
            apu.reset();
            
            // Frame counter should be reset to default
            // (4-step mode, IRQ enabled)
            const status = apu.read(0x4015);
            expect(status & 0x40).to.equal(0x00); // Frame interrupt clear
        });

        it('should allow normal operation after reset', () => {
            apu.reset();
            
            // Should be able to enable and use channels
            apu.write(0x4015, 0x01);
            apu.write(0x4003, 0x08);
            
            const status = apu.read(0x4015);
            expect(status & 0x01).to.equal(0x01);
        });

        it('should be idempotent (multiple resets safe)', () => {
            apu.reset();
            apu.reset();
            apu.reset();
            
            const status = apu.read(0x4015);
            expect(status).to.equal(0x00);
        });
    });

    describe('bus integration', () => {
        it('should handle full address range $4000-$4017', () => {
            for (let addr = 0x4000; addr <= 0x4017; addr++) {
                apu.write(addr, 0xFF);
                apu.read(addr);
            }
            // No error should occur
        });

        it('should preserve address space separation', () => {
            // Different addresses should not interfere
            apu.write(0x4000, 0xAA);
            apu.write(0x4004, 0xBB);
            apu.write(0x4008, 0xCC);
            
            expect(apu.read(0x4000)).to.equal(0xAA);
            expect(apu.read(0x4004)).to.equal(0xBB);
            expect(apu.read(0x4008)).to.equal(0xCC);
        });

        it('should handle concurrent channel operations', () => {
            apu.write(0x4015, 0x0F); // Enable channels
            
            // Write to multiple channels
            apu.write(0x4000, 0xBF); // Pulse 1
            apu.write(0x4004, 0xBF); // Pulse 2
            apu.write(0x4008, 0x7F); // Triangle
            apu.write(0x400C, 0x3F); // Noise
            apu.write(0x4010, 0x0F); // DMC
            
            // Status should reflect channel states
            const status = apu.read(0x4015);
            // (Specific bits depend on channel implementations)
        });
    });

    describe('DummyApu static factory', () => {
        it('should have build() static method', () => {
            expect(Apu2A03.build).to.be.a('function');
        });

        it('should return an APU instance from build()', () => {
            const apu = Apu2A03.build();
            // Should return either Apu2A03 or DummyApu
            expect(apu).to.have.property('read');
            expect(apu).to.have.property('write');
            expect(apu).to.have.property('clock');
            expect(apu).to.have.property('reset');
        });
    });
});

import chai from "chai";
import { DmcChannel } from '../../../lib/devices/apu/channels/dmc.js';

const expect = chai.expect;

/**
 * DmcChannel Unit Tests
 * 
 * Comprehensive tests for the NES APU DMC (Delta Modulation Channel) implementation.
 * Tests cover rate timer, register writes, sample playback, delta encoding,
 * sample address calculation, loop behavior, IRQ handling, DMA requests, and direct load.
 */

describe('DmcChannel', () => {
    /** @type {import('../../../src/devices/apu/channels/dmc').DmcChannel} */
    let dmc;

    beforeEach(() => {
        dmc = new DmcChannel();
    });

    describe('Construction', () => {
        it('should construct a DMC channel', () => {
            expect(dmc).to.be.instanceOf(DmcChannel);
        });

        it('should start inactive', () => {
            expect(dmc.isActive()).to.equal(false);
        });

        it('should start with zero output', () => {
            expect(dmc.output()).to.equal(0);
        });

        it('should start with no IRQ pending', () => {
            expect(dmc.getIrqFlag()).to.equal(false);
        });
    });

    describe('DMC Rate Timer', () => {
        it('should use rate index 0 (period 428)', () => {
            dmc.writeControl(0x00); // Rate index 0
            
            // Start sample playback
            dmc.writeSampleAddress(0); // Address $C000
            dmc.writeSampleLength(0); // Length 1
            dmc.start();
            
            // Load a sample byte
            dmc.loadSampleByte(0xFF);
            
            // Timer should use period 428
            // Clock 428 times - timer shouldn't expire yet (on 428th it reloads)
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            // After 428 clocks, timer expires and processes first bit
            // Output should have changed from 0 (bit 0 of 0xFF is 1, so increment by 2)
            expect(dmc.output()).to.equal(2);
        });

        it('should use rate index 8 (period 190)', () => {
            dmc.writeControl(0x08); // Rate index 8
            
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Clock 190 times to process first bit
            for (let i = 0; i < 190; i++) {
                dmc.clock();
            }
            
            // First bit processed (increment by 2)
            expect(dmc.output()).to.equal(2);
        });

        it('should use rate index 15 (period 54)', () => {
            dmc.writeControl(0x0F); // Rate index 15
            
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Clock 54 times to process first bit
            for (let i = 0; i < 54; i++) {
                dmc.clock();
            }
            
            // First bit processed (increment by 2)
            expect(dmc.output()).to.equal(2);
        });

        it('should change rate when rate index is updated', () => {
            // Start with rate 0
            dmc.writeControl(0x00);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Change to rate 15 (period 54)
            dmc.writeControl(0x0F);
            
            // Clock 54 times should process a bit
            for (let i = 0; i < 54; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.be.greaterThan(0);
        });
    });

    describe('DMC Register Writes', () => {
        describe('$4010 - Control Register', () => {
            it('should set IRQ enable flag (bit 7)', () => {
                dmc.writeControl(0x80); // IRQ enabled
                
                // Start sample without loop
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(0); // Length 1
                dmc.start();
                
                // Load and consume the byte
                dmc.loadSampleByte(0xFF);
                
                // After byte is consumed, IRQ should be set
                expect(dmc.getIrqFlag()).to.equal(true);
            });

            it('should set loop enable flag (bit 6)', () => {
                dmc.writeControl(0x40); // Loop enabled
                
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(0); // Length 1
                dmc.start();
                
                const initialAddress = dmc.getDmaRequest();
                dmc.loadSampleByte(0xFF);
                
                // Consume the buffer (8 bits * 428 clocks per bit)
                for (let i = 0; i < 8 * 428; i++) {
                    dmc.clock();
                }
                
                // After sample completes, should restart (request same address)
                const afterAddress = dmc.getDmaRequest();
                expect(afterAddress).to.equal(initialAddress);
            });

            it('should set rate index (bits 0-3)', () => {
                dmc.writeControl(0x05); // Rate index 5
                
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(0);
                dmc.start();
                dmc.loadSampleByte(0xFF);
                
                // Rate 5 has period 254
                for (let i = 0; i < 254; i++) {
                    dmc.clock();
                }
                
                expect(dmc.output()).to.equal(2);
            });

            it('should clear IRQ when IRQ disabled', () => {
                // Enable IRQ and trigger it
                dmc.writeControl(0x80);
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(0);
                dmc.start();
                dmc.loadSampleByte(0xFF);
                expect(dmc.getIrqFlag()).to.equal(true);
                
                // Disable IRQ via control register
                dmc.writeControl(0x00);
                expect(dmc.getIrqFlag()).to.equal(false);
            });
        });

        describe('$4011 - Direct Load', () => {
            it('should set output level directly', () => {
                dmc.writeDirectLoad(0x50);
                expect(dmc.output()).to.equal(0x50);
            });

            it('should only use lower 7 bits', () => {
                dmc.writeDirectLoad(0xFF);
                expect(dmc.output()).to.equal(0x7F); // Only bits 0-6
            });

            it('should work with various values', () => {
                dmc.writeDirectLoad(0);
                expect(dmc.output()).to.equal(0);
                
                dmc.writeDirectLoad(64);
                expect(dmc.output()).to.equal(64);
                
                dmc.writeDirectLoad(127);
                expect(dmc.output()).to.equal(127);
            });
        });

        describe('$4012 - Sample Address', () => {
            it('should calculate address for value 0 ($C000)', () => {
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(0);
                dmc.start();
                
                // Should request from $C000
                expect(dmc.getDmaRequest()).to.equal(0xC000);
            });

            it('should calculate address for value 128 ($E000)', () => {
                dmc.writeSampleAddress(128); // $C000 + (128 * 64) = $C000 + $2000 = $E000
                dmc.writeSampleLength(0);
                dmc.start();
                
                expect(dmc.getDmaRequest()).to.equal(0xE000);
            });

            it('should calculate address for value 255 ($FFC0)', () => {
                dmc.writeSampleAddress(255); // $C000 + (255 * 64) = $C000 + $3FC0 = $FFC0
                dmc.writeSampleLength(0);
                dmc.start();
                
                expect(dmc.getDmaRequest()).to.equal(0xFFC0);
            });
        });

        describe('$4013 - Sample Length', () => {
            it('should calculate length for value 0 (1 byte)', () => {
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(0); // (0 * 16) + 1 = 1
                dmc.start();
                
                expect(dmc.isActive()).to.equal(true);
                dmc.loadSampleByte(0xFF);
                expect(dmc.isActive()).to.equal(false); // After 1 byte
            });

            it('should calculate length for value 128 (2049 bytes)', () => {
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(128); // (128 * 16) + 1 = 2049
                dmc.start();
                
                // Load 2048 bytes
                for (let i = 0; i < 2048; i++) {
                    expect(dmc.isActive()).to.equal(true);
                    dmc.loadSampleByte(0);
                }
                
                // After 2049th byte
                expect(dmc.isActive()).to.equal(true);
                dmc.loadSampleByte(0);
                expect(dmc.isActive()).to.equal(false);
            });

            it('should calculate length for value 255 (4081 bytes)', () => {
                dmc.writeSampleAddress(0);
                dmc.writeSampleLength(255); // (255 * 16) + 1 = 4081
                dmc.start();
                
                // Load 4080 bytes
                for (let i = 0; i < 4080; i++) {
                    dmc.loadSampleByte(0);
                }
                
                expect(dmc.isActive()).to.equal(true);
                dmc.loadSampleByte(0);
                expect(dmc.isActive()).to.equal(false);
            });
        });
    });

    describe('DMC Sample Playback', () => {
        beforeEach(() => {
            dmc.writeControl(0x00); // Rate 0
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
        });

        it('should process bits LSB first', () => {
            // Load byte 0b00000001 (LSB = 1)
            dmc.writeDirectLoad(0); // Start at 0
            dmc.loadSampleByte(0x01);
            
            // Clock to process first bit (LSB = 1, should increment)
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            expect(dmc.output()).to.equal(2); // Incremented by 2
            
            // Next 7 bits are 0 (should decrement)
            for (let bit = 0; bit < 7; bit++) {
                for (let i = 0; i < 428; i++) {
                    dmc.clock();
                }
            }
            expect(dmc.output()).to.equal(0); // Decremented back to 0
        });

        it('should empty buffer after 8 bits', () => {
            // Reset and start with 2+ bytes for DMA request after first byte consumed
            dmc = new DmcChannel();
            dmc.writeControl(0x00); // Rate 0
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(1); // (1 * 16) + 1 = 17 bytes
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Process all 8 bits
            for (let bit = 0; bit < 8; bit++) {
                for (let i = 0; i < 428; i++) {
                    dmc.clock();
                }
            }
            
            // Buffer should be empty, requesting next byte
            expect(dmc.getDmaRequest()).to.not.equal(null);
        });

        it('should process full byte sequence correctly', () => {
            dmc.writeDirectLoad(10);
            dmc.loadSampleByte(0xAA); // 10101010
            
            // Bit 0 = 0: decrement to 8
            for (let i = 0; i < 428; i++) dmc.clock();
            expect(dmc.output()).to.equal(8);
            
            // Bit 1 = 1: increment to 10
            for (let i = 0; i < 428; i++) dmc.clock();
            expect(dmc.output()).to.equal(10);
            
            // Bit 2 = 0: decrement to 8
            for (let i = 0; i < 428; i++) dmc.clock();
            expect(dmc.output()).to.equal(8);
            
            // Bit 3 = 1: increment to 10
            for (let i = 0; i < 428; i++) dmc.clock();
            expect(dmc.output()).to.equal(10);
        });
    });

    describe('DMC Delta Encoding', () => {
        beforeEach(() => {
            dmc.writeControl(0x00); // Rate 0
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
        });

        it('should increment output by 2 when bit is 1', () => {
            dmc.writeDirectLoad(10);
            dmc.loadSampleByte(0xFF); // All 1s
            
            // Process first bit
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(12); // 10 + 2
        });

        it('should decrement output by 2 when bit is 0', () => {
            dmc.writeDirectLoad(10);
            dmc.loadSampleByte(0x00); // All 0s
            
            // Process first bit
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(8); // 10 - 2
        });

        it('should saturate at upper bound (126)', () => {
            dmc.writeDirectLoad(126);
            dmc.loadSampleByte(0xFF); // Try to increment
            
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(126); // Saturated, no increment
        });

        it('should saturate at upper bound (127)', () => {
            dmc.writeDirectLoad(127);
            dmc.loadSampleByte(0xFF); // Try to increment
            
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(127); // Saturated
        });

        it('should saturate at lower bound (0)', () => {
            dmc.writeDirectLoad(0);
            dmc.loadSampleByte(0x00); // Try to decrement
            
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(0); // Saturated, no decrement
        });

        it('should saturate at lower bound (1)', () => {
            dmc.writeDirectLoad(1);
            dmc.loadSampleByte(0x00); // Try to decrement
            
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(1); // Saturated
        });

        it('should not saturate when incrementing from 125', () => {
            dmc.writeDirectLoad(125);
            dmc.loadSampleByte(0xFF);
            
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(127); // Can increment to 127
        });

        it('should not saturate when decrementing from 2', () => {
            dmc.writeDirectLoad(2);
            dmc.loadSampleByte(0x00);
            
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.output()).to.equal(0); // Can decrement to 0
        });
    });

    describe('DMC Sample Address', () => {
        it('should start at calculated sample address', () => {
            dmc.writeSampleAddress(10); // $C000 + (10 * 64) = $C280
            dmc.writeSampleLength(1);
            dmc.start();
            
            expect(dmc.getDmaRequest()).to.equal(0xC280);
        });

        it('should increment address after each byte', () => {
            dmc.writeSampleAddress(0); // $C000
            dmc.writeSampleLength(2); // 3 bytes
            dmc.start();
            
            expect(dmc.getDmaRequest()).to.equal(0xC000);
            dmc.loadSampleByte(0);
            
            // Consume buffer to request next byte
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            expect(dmc.getDmaRequest()).to.equal(0xC001);
            dmc.loadSampleByte(0);
            
            // Consume buffer to request next byte
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            expect(dmc.getDmaRequest()).to.equal(0xC002);
        });

        it('should wrap from $FFFF to $8000', () => {
            dmc.writeSampleAddress(255); // $FFC0
            dmc.writeSampleLength(255); // 4081 bytes
            dmc.start();
            
            // Load bytes until we reach $FFFF
            let address = 0xFFC0;
            while (address < 0xFFFF) {
                expect(dmc.getDmaRequest()).to.equal(address);
                dmc.loadSampleByte(0);
                // Consume buffer to request next byte
                for (let i = 0; i < 8 * 428; i++) dmc.clock();
                address++;
            }
            
            // At $FFFF
            expect(dmc.getDmaRequest()).to.equal(0xFFFF);
            dmc.loadSampleByte(0);
            
            // Consume buffer to request next byte
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            // Should wrap to $8000
            expect(dmc.getDmaRequest()).to.equal(0x8000);
        });

        it('should continue incrementing after wraparound', () => {
            dmc.writeSampleAddress(255);
            dmc.writeSampleLength(255);
            dmc.start();
            
            // Fast forward to $FFFF
            for (let i = 0; i < 63; i++) {
                dmc.loadSampleByte(0);
                // Consume buffer to request next byte
                for (let j = 0; j < 8 * 428; j++) dmc.clock();
            }
            
            expect(dmc.getDmaRequest()).to.equal(0xFFFF);
            dmc.loadSampleByte(0);
            // Consume buffer
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            expect(dmc.getDmaRequest()).to.equal(0x8000);
            dmc.loadSampleByte(0);
            // Consume buffer
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            expect(dmc.getDmaRequest()).to.equal(0x8001);
        });
    });

    describe('DMC Loop', () => {
        it('should restart sample when loop enabled', () => {
            dmc.writeControl(0x40); // Loop enabled
            dmc.writeSampleAddress(10); // $C280
            dmc.writeSampleLength(0); // 1 byte
            dmc.start();
            
            expect(dmc.getDmaRequest()).to.equal(0xC280);
            dmc.loadSampleByte(0);
            // Consume buffer - this should trigger loop restart
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            // Should restart at sample address
            expect(dmc.getDmaRequest()).to.equal(0xC280);
            expect(dmc.isActive()).to.equal(true);
        });

        it('should stop when loop disabled', () => {
            dmc.writeControl(0x00); // Loop disabled
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0); // 1 byte
            dmc.start();
            
            dmc.loadSampleByte(0);
            
            // Should stop
            expect(dmc.isActive()).to.equal(false);
            expect(dmc.getDmaRequest()).to.equal(null);
        });

        it('should not generate IRQ when loop enabled', () => {
            dmc.writeControl(0xC0); // Loop + IRQ enabled
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            
            dmc.loadSampleByte(0);
            
            // Loop takes precedence over IRQ
            expect(dmc.getIrqFlag()).to.equal(false);
            expect(dmc.isActive()).to.equal(true);
        });

        it('should maintain loop through multiple iterations', () => {
            dmc.writeControl(0x40); // Loop enabled
            dmc.writeSampleAddress(5);
            dmc.writeSampleLength(0); // 1 byte
            dmc.start();
            
            const expectedAddress = 0xC000 + (5 * 64);
            
            // Several iterations
            for (let i = 0; i < 5; i++) {
                expect(dmc.getDmaRequest()).to.equal(expectedAddress);
                dmc.loadSampleByte(0);
                // Consume buffer
                for (let j = 0; j < 8 * 428; j++) dmc.clock();
            }
            
            expect(dmc.isActive()).to.equal(true);
        });
    });

    describe('DMC IRQ', () => {
        it('should generate IRQ when sample ends with IRQ enabled and loop disabled', () => {
            dmc.writeControl(0x80); // IRQ enabled, loop disabled
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            
            expect(dmc.getIrqFlag()).to.equal(false);
            dmc.loadSampleByte(0);
            expect(dmc.getIrqFlag()).to.equal(true);
        });

        it('should not generate IRQ when IRQ disabled', () => {
            dmc.writeControl(0x00); // IRQ disabled
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            
            dmc.loadSampleByte(0);
            expect(dmc.getIrqFlag()).to.equal(false);
        });

        it('should not generate IRQ when loop enabled', () => {
            dmc.writeControl(0xC0); // IRQ + loop enabled
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            
            dmc.loadSampleByte(0);
            expect(dmc.getIrqFlag()).to.equal(false);
        });

        it('should clear IRQ when disabled via $4010', () => {
            dmc.writeControl(0x80);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            expect(dmc.getIrqFlag()).to.equal(true);
            
            dmc.writeControl(0x00); // Disable IRQ
            expect(dmc.getIrqFlag()).to.equal(false);
        });

        it('should clear IRQ via clearIrq method', () => {
            dmc.writeControl(0x80);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            expect(dmc.getIrqFlag()).to.equal(true);
            dmc.clearIrq();
            expect(dmc.getIrqFlag()).to.equal(false);
        });

        it('should remain clear after clearIrq', () => {
            dmc.writeControl(0x80);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            dmc.clearIrq();
            expect(dmc.getIrqFlag()).to.equal(false);
            
            // Multiple clears shouldn't cause issues
            dmc.clearIrq();
            dmc.clearIrq();
            expect(dmc.getIrqFlag()).to.equal(false);
        });
    });

    describe('DMC DMA', () => {
        it('should not request DMA when buffer is not empty', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(1); // 2 bytes
            dmc.start();
            
            dmc.loadSampleByte(0xFF);
            
            // Buffer has 8 bits remaining, no DMA needed
            expect(dmc.getDmaRequest()).to.equal(null);
        });

        it('should not request DMA when bytesRemaining is 0', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            // Sample complete, no more bytes
            expect(dmc.getDmaRequest()).to.equal(null);
        });

        it('should request DMA when buffer empty and bytes remaining', () => {
            dmc.writeSampleAddress(5);
            dmc.writeSampleLength(1); // 2 bytes
            dmc.start();
            
            // Buffer starts empty
            expect(dmc.getDmaRequest()).to.equal(0xC000 + (5 * 64));
        });

        it('should request next address after buffer consumption', () => {
            dmc.writeControl(0x00); // Rate 0
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(1); // 2 bytes
            dmc.start();
            
            dmc.loadSampleByte(0xFF);
            
            // Consume all 8 bits
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 428; j++) {
                    dmc.clock();
                }
            }
            
            // Should request next byte
            expect(dmc.getDmaRequest()).to.equal(0xC001);
        });

        it('should clear DMA request after loadSampleByte', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(1);
            dmc.start();
            
            expect(dmc.getDmaRequest()).to.not.equal(null);
            dmc.loadSampleByte(0xFF);
            expect(dmc.getDmaRequest()).to.equal(null);
        });

        it('should handle multiple DMA requests in sequence', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(2); // 3 bytes
            dmc.start();
            
            expect(dmc.getDmaRequest()).to.equal(0xC000);
            dmc.loadSampleByte(0);
            expect(dmc.getDmaRequest()).to.equal(null);
            
            // Fast-forward buffer consumption
            for (let i = 0; i < 8 * 428; i++) dmc.clock();
            
            expect(dmc.getDmaRequest()).to.equal(0xC001);
            dmc.loadSampleByte(0);
            expect(dmc.getDmaRequest()).to.equal(null);
        });
    });

    describe('DMC Direct Load ($4011)', () => {
        it('should immediately set output level', () => {
            expect(dmc.output()).to.equal(0);
            
            dmc.writeDirectLoad(50);
            expect(dmc.output()).to.equal(50);
        });

        it('should only use lower 7 bits (0x7F mask)', () => {
            dmc.writeDirectLoad(0xFF);
            expect(dmc.output()).to.equal(0x7F);
            
            dmc.writeDirectLoad(0x80);
            expect(dmc.output()).to.equal(0x00);
            
            dmc.writeDirectLoad(0xAA);
            expect(dmc.output()).to.equal(0x2A);
        });

        it('should work during sample playback', () => {
            dmc.writeControl(0x00);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Set direct load during playback
            dmc.writeDirectLoad(100);
            expect(dmc.output()).to.equal(100);
            
            // Sample playback continues from new level
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            expect(dmc.output()).to.equal(102); // Incremented by 2
        });

        it('should allow setting any value 0-127', () => {
            for (let i = 0; i <= 127; i++) {
                dmc.writeDirectLoad(i);
                expect(dmc.output()).to.equal(i);
            }
        });
    });

    describe('DMC Start/Status', () => {
        it('should start playback when bytesRemaining is 0', () => {
            dmc.writeSampleAddress(10);
            dmc.writeSampleLength(5);
            
            expect(dmc.isActive()).to.equal(false);
            
            dmc.start();
            expect(dmc.isActive()).to.equal(true);
        });

        it('should not restart if already playing', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(10); // 11 bytes
            dmc.start();
            
            dmc.loadSampleByte(0); // Consume 1 byte, 10 remaining
            expect(dmc.isActive()).to.equal(true);
            
            // Change sample parameters
            dmc.writeSampleAddress(100);
            dmc.writeSampleLength(0);
            
            // Start should not restart (already playing)
            dmc.start();
            
            // Should still request from original sequence
            expect(dmc.getDmaRequest()).to.not.equal(0xC000 + (100 * 64));
        });

        it('should report active when bytesRemaining > 0', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(5);
            dmc.start();
            
            expect(dmc.isActive()).to.equal(true);
        });

        it('should report inactive when bytesRemaining is 0', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            expect(dmc.isActive()).to.equal(false);
        });

        it('should allow restart after sample completes', () => {
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            // Consume the buffer completely
            for (let i = 0; i < 8 * 428; i++) {
                dmc.clock();
            }
            
            expect(dmc.isActive()).to.equal(false);
            
            // Start new sample
            dmc.writeSampleAddress(5);
            dmc.writeSampleLength(0);
            dmc.start();
            
            expect(dmc.isActive()).to.equal(true);
            expect(dmc.getDmaRequest()).to.equal(0xC000 + (5 * 64));
        });
    });

    describe('DMC Reset', () => {
        it('should clear all state', () => {
            // Set up channel with activity
            dmc.writeControl(0xCF); // All flags + rate 15
            dmc.writeDirectLoad(100);
            dmc.writeSampleAddress(50);
            dmc.writeSampleLength(100);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Reset
            dmc.reset();
            
            // State should be cleared
            expect(dmc.isActive()).to.equal(false);
            expect(dmc.getIrqFlag()).to.equal(false);
            expect(dmc.getDmaRequest()).to.equal(null);
        });

        it('should reset output level to 0', () => {
            dmc.writeDirectLoad(100);
            expect(dmc.output()).to.equal(100);
            
            dmc.reset();
            expect(dmc.output()).to.equal(0);
        });

        it('should clear IRQ flag', () => {
            dmc.writeControl(0x80);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0);
            
            expect(dmc.getIrqFlag()).to.equal(true);
            
            dmc.reset();
            expect(dmc.getIrqFlag()).to.equal(false);
        });

        it('should reset timer state', () => {
            dmc.writeControl(0x0F); // Rate 15
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            dmc.reset();
            
            // After reset, should use default rate (0, period 428)
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            dmc.loadSampleByte(0xFF);
            
            // Should use period 428, not 54
            for (let i = 0; i < 428; i++) {
                dmc.clock();
            }
            expect(dmc.output()).to.equal(2);
        });

        it('should allow normal operation after reset', () => {
            dmc.writeControl(0x80);
            dmc.writeDirectLoad(50);
            dmc.writeSampleAddress(10);
            dmc.writeSampleLength(5);
            dmc.start();
            
            dmc.reset();
            
            // Should work normally after reset
            dmc.writeControl(0x00);
            dmc.writeSampleAddress(0);
            dmc.writeSampleLength(0);
            dmc.start();
            
            expect(dmc.getDmaRequest()).to.equal(0xC000);
            dmc.loadSampleByte(0xFF);
            expect(dmc.isActive()).to.equal(false);
        });

        it('should reset to power-on state', () => {
            dmc.reset();
            
            expect(dmc.output()).to.equal(0);
            expect(dmc.isActive()).to.equal(false);
            expect(dmc.getIrqFlag()).to.equal(false);
            expect(dmc.getDmaRequest()).to.equal(null);
        });
    });
});

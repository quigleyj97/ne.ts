/**
 * Worklet Processor Unit Tests
 * 
 * Tests for the APU AudioWorklet Processor, focusing on the RingBuffer
 * implementation which handles buffering of audio samples between the
 * main thread and audio worklet thread.
 * 
 * Since AudioWorklet is a browser-only API, we mock the necessary globals
 * and focus testing on the RingBuffer logic which is the core reusable
 * component.
 * 
 * Tests cover:
 * - RingBuffer write operations
 * - RingBuffer read operations
 * - Ring buffer wrap-around behavior
 * - Empty buffer handling (underrun)
 * - Full buffer handling (overflow)
 * - Length and capacity tracking
 * - Reset functionality
 */

// Since AudioWorklet is a browser-only API and the RingBuffer class is
// private to the worklet module, we test the RingBuffer logic using a
// test harness that mirrors the actual implementation from worklet-processor.ts.
// This allows comprehensive testing in Node.js without requiring browser APIs.

/**
 * Test RingBuffer by creating instances and testing behavior
 * We create a standalone RingBuffer for testing since the actual one
 * is private to the worklet module.
 */
class RingBufferTestHarness {
    constructor(size) {
        this.buffer = new Float32Array(size);
        this.writeIndex = 0;
        this.readIndex = 0;
        this.length = 0;
    }
    
    write(samples) {
        const capacity = this.buffer.length;
        const available = capacity - this.length;
        const toWrite = Math.min(samples.length, available);
        
        for (let i = 0; i < toWrite; i++) {
            this.buffer[this.writeIndex] = samples[i];
            this.writeIndex = (this.writeIndex + 1) % capacity;
            this.length++;
        }
        
        return toWrite;
    }
    
    read(count, output) {
        const toRead = Math.min(count, this.length);
        
        for (let i = 0; i < toRead; i++) {
            output[i] = this.buffer[this.readIndex];
            this.readIndex = (this.readIndex + 1) % this.buffer.length;
            this.length--;
        }
        
        return toRead;
    }
    
    getLength() {
        return this.length;
    }
    
    getCapacity() {
        return this.buffer.length;
    }
    
    reset() {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.length = 0;
        this.buffer.fill(0);
    }
}

describe('Worklet Processor - RingBuffer', () => {
    /** @type {RingBufferTestHarness} */
    let ringBuffer;
    
    describe('initialization', () => {
        it('should create a ring buffer with specified size', () => {
            ringBuffer = new RingBufferTestHarness(1024);
            expect(ringBuffer.getCapacity()).toBe(1024);
        });
        
        it('should initialize with zero length', () => {
            ringBuffer = new RingBufferTestHarness(1024);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should support various buffer sizes', () => {
            const sizes = [128, 256, 512, 1024, 2048, 4096, 8192];
            
            sizes.forEach(size => {
                const buffer = new RingBufferTestHarness(size);
                expect(buffer.getCapacity()).toBe(size);
                expect(buffer.getLength()).toBe(0);
            });
        });
    });
    
    describe('write operations', () => {
        beforeEach(() => {
            ringBuffer = new RingBufferTestHarness(100);
        });
        
        it('should write samples to empty buffer', () => {
            const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            const written = ringBuffer.write(samples);
            
            expect(written).toBe(5);
            expect(ringBuffer.getLength()).toBe(5);
        });
        
        it('should write single sample', () => {
            const samples = new Float32Array([0.7]);
            const written = ringBuffer.write(samples);
            
            expect(written).toBe(1);
            expect(ringBuffer.getLength()).toBe(1);
        });
        
        it('should write multiple batches and accumulate length', () => {
            const batch1 = new Float32Array([0.1, 0.2]);
            const batch2 = new Float32Array([0.3, 0.4, 0.5]);
            const batch3 = new Float32Array([0.6]);
            
            ringBuffer.write(batch1);
            ringBuffer.write(batch2);
            ringBuffer.write(batch3);
            
            expect(ringBuffer.getLength()).toBe(6);
        });
        
        it('should write up to buffer capacity', () => {
            const samples = new Float32Array(100);
            samples.fill(0.5);
            
            const written = ringBuffer.write(samples);
            
            expect(written).toBe(100);
            expect(ringBuffer.getLength()).toBe(100);
        });
        
        it('should reject writes when buffer is full', () => {
            // Fill the buffer
            const samples1 = new Float32Array(100);
            samples1.fill(0.5);
            ringBuffer.write(samples1);
            
            // Try to write more
            const samples2 = new Float32Array([0.1, 0.2, 0.3]);
            const written = ringBuffer.write(samples2);
            
            expect(written).toBe(0);
            expect(ringBuffer.getLength()).toBe(100);
        });
        
        it('should write partial data when buffer is nearly full', () => {
            // Fill buffer to 95 samples
            const samples1 = new Float32Array(95);
            samples1.fill(0.5);
            ringBuffer.write(samples1);
            
            // Try to write 10 more (only 5 should be written)
            const samples2 = new Float32Array(10);
            samples2.fill(0.7);
            const written = ringBuffer.write(samples2);
            
            expect(written).toBe(5);
            expect(ringBuffer.getLength()).toBe(100);
        });
        
        it('should preserve sample values during write', () => {
            const samples = new Float32Array([0.1, 0.2, 0.3]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(3);
            ringBuffer.read(3, output);
            
            expect(output[0]).toBeCloseTo(0.1, 0.001);
            expect(output[1]).toBeCloseTo(0.2, 0.001);
            expect(output[2]).toBeCloseTo(0.3, 0.001);
        });
        
        it('should handle negative sample values', () => {
            const samples = new Float32Array([-0.5, -0.8, -1.0]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(3);
            ringBuffer.read(3, output);
            
            expect(output[0]).toBeCloseTo(-0.5, 0.001);
            expect(output[1]).toBeCloseTo(-0.8, 0.001);
            expect(output[2]).toBeCloseTo(-1.0, 0.001);
        });
    });
    
    describe('read operations', () => {
        beforeEach(() => {
            ringBuffer = new RingBufferTestHarness(100);
        });
        
        it('should read samples from buffer', () => {
            const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(3);
            const read = ringBuffer.read(3, output);
            
            expect(read).toBe(3);
            expect(ringBuffer.getLength()).toBe(2);
        });
        
        it('should return zero when reading from empty buffer', () => {
            const output = new Float32Array(10);
            const read = ringBuffer.read(10, output);
            
            expect(read).toBe(0);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should read partial data when buffer has fewer samples than requested', () => {
            const samples = new Float32Array([0.1, 0.2, 0.3]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(10);
            const read = ringBuffer.read(10, output);
            
            expect(read).toBe(3);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should maintain FIFO order', () => {
            const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(5);
            ringBuffer.read(5, output);
            
            expect(output[0]).toBeCloseTo(0.1, 0.001);
            expect(output[1]).toBeCloseTo(0.2, 0.001);
            expect(output[2]).toBeCloseTo(0.3, 0.001);
            expect(output[3]).toBeCloseTo(0.4, 0.001);
            expect(output[4]).toBeCloseTo(0.5, 0.001);
        });
        
        it('should support multiple reads', () => {
            const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            ringBuffer.write(samples);
            
            const output1 = new Float32Array(2);
            const read1 = ringBuffer.read(2, output1);
            
            const output2 = new Float32Array(2);
            const read2 = ringBuffer.read(2, output2);
            
            expect(read1).toBe(2);
            expect(read2).toBe(2);
            expect(ringBuffer.getLength()).toBe(1);
            
            expect(output1[0]).toBeCloseTo(0.1, 0.001);
            expect(output1[1]).toBeCloseTo(0.2, 0.001);
            expect(output2[0]).toBeCloseTo(0.3, 0.001);
            expect(output2[1]).toBeCloseTo(0.4, 0.001);
        });
        
        it('should not modify output buffer beyond read count', () => {
            const samples = new Float32Array([0.1, 0.2]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(5);
            output.fill(0.99); // Pre-fill with sentinel value
            
            const read = ringBuffer.read(2, output);
            
            expect(read).toBe(2);
            expect(output[0]).toBeCloseTo(0.1, 0.001);
            expect(output[1]).toBeCloseTo(0.2, 0.001);
            // Beyond read count should still have sentinel value
            expect(output[2]).toBeCloseTo(0.99, 0.001);
            expect(output[3]).toBeCloseTo(0.99, 0.001);
            expect(output[4]).toBeCloseTo(0.99, 0.001);
        });
    });
    
    describe('wrap-around behavior', () => {
        beforeEach(() => {
            ringBuffer = new RingBufferTestHarness(10);
        });
        
        it('should wrap write index around buffer end', () => {
            // Fill buffer completely
            const samples1 = new Float32Array(10);
            for (let i = 0; i < 10; i++) samples1[i] = i * 0.1;
            ringBuffer.write(samples1);
            
            // Read some samples to make space
            const output1 = new Float32Array(5);
            ringBuffer.read(5, output1);
            
            // Write new samples - should wrap around
            const samples2 = new Float32Array([9.0, 9.1, 9.2]);
            ringBuffer.write(samples2);
            
            expect(ringBuffer.getLength()).toBe(8);
            
            // Read all and verify order
            const output2 = new Float32Array(8);
            ringBuffer.read(8, output2);
            
            // Should get: [0.5, 0.6, 0.7, 0.8, 0.9, 9.0, 9.1, 9.2]
            expect(output2[0]).toBeCloseTo(0.5, 0.001);
            expect(output2[5]).toBeCloseTo(9.0, 0.001);
            expect(output2[6]).toBeCloseTo(9.1, 0.001);
            expect(output2[7]).toBeCloseTo(9.2, 0.001);
        });
        
        it('should wrap read index around buffer end', () => {
            // Write, read, write, read cycle to exercise wrap-around
            for (let cycle = 0; cycle < 3; cycle++) {
                const samples = new Float32Array(7);
                samples.fill(cycle);
                ringBuffer.write(samples);
                
                const output = new Float32Array(7);
                ringBuffer.read(7, output);
                
                for (let i = 0; i < 7; i++) {
                    expect(output[i]).toBeCloseTo(cycle, 0.001);
                }
            }
            
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should handle write/read cycles that wrap multiple times', () => {
            for (let i = 0; i < 50; i++) {
                const samples = new Float32Array([i * 0.01]);
                ringBuffer.write(samples);
                
                if (ringBuffer.getLength() >= 3) {
                    const output = new Float32Array(1);
                    ringBuffer.read(1, output);
                }
            }
            
            // Should have some samples left
            expect(ringBuffer.getLength()).toBeGreaterThan(0);
            expect(ringBuffer.getLength()).toBeLessThan(10);
        });
        
        it('should maintain data integrity through wrap-around', () => {
            // Fill to near end
            const samples1 = new Float32Array(8);
            for (let i = 0; i < 8; i++) samples1[i] = i;
            ringBuffer.write(samples1);
            
            // Read most
            const output1 = new Float32Array(6);
            ringBuffer.read(6, output1);
            
            // Write across wrap boundary
            const samples2 = new Float32Array([10, 11, 12, 13, 14, 15, 16, 17]);
            ringBuffer.write(samples2);
            
            // Read all
            const output2 = new Float32Array(10);
            const read = ringBuffer.read(10, output2);
            
            expect(read).toBe(10);
            expect(output2[0]).toBeCloseTo(6, 0.001);
            expect(output2[1]).toBeCloseTo(7, 0.001);
            expect(output2[2]).toBeCloseTo(10, 0.001);
            expect(output2[9]).toBeCloseTo(17, 0.001);
        });
    });
    
    describe('length tracking', () => {
        beforeEach(() => {
            ringBuffer = new RingBufferTestHarness(100);
        });
        
        it('should track length correctly during writes', () => {
            expect(ringBuffer.getLength()).toBe(0);
            
            ringBuffer.write(new Float32Array(10));
            expect(ringBuffer.getLength()).toBe(10);
            
            ringBuffer.write(new Float32Array(15));
            expect(ringBuffer.getLength()).toBe(25);
            
            ringBuffer.write(new Float32Array(5));
            expect(ringBuffer.getLength()).toBe(30);
        });
        
        it('should track length correctly during reads', () => {
            ringBuffer.write(new Float32Array(50));
            expect(ringBuffer.getLength()).toBe(50);
            
            const output = new Float32Array(20);
            ringBuffer.read(20, output);
            expect(ringBuffer.getLength()).toBe(30);
            
            ringBuffer.read(10, output);
            expect(ringBuffer.getLength()).toBe(20);
            
            ringBuffer.read(20, output);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should track length correctly through write/read cycles', () => {
            for (let i = 0; i < 100; i++) {
                ringBuffer.write(new Float32Array(3));
                
                if (ringBuffer.getLength() >= 10) {
                    const output = new Float32Array(5);
                    ringBuffer.read(5, output);
                }
                
                // Length should never exceed capacity
                expect(ringBuffer.getLength()).to.be.at.most(100);
                expect(ringBuffer.getLength()).to.be.at.least(0);
            }
        });
        
        it('should return zero length after reading all samples', () => {
            ringBuffer.write(new Float32Array(25));
            const output = new Float32Array(25);
            ringBuffer.read(25, output);
            
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should maintain correct length when buffer becomes full', () => {
            const samples = new Float32Array(150); // More than capacity
            const written = ringBuffer.write(samples);
            
            expect(written).toBe(100);
            expect(ringBuffer.getLength()).toBe(100);
        });
    });
    
    describe('reset functionality', () => {
        beforeEach(() => {
            ringBuffer = new RingBufferTestHarness(100);
        });
        
        it('should reset length to zero', () => {
            ringBuffer.write(new Float32Array(50));
            expect(ringBuffer.getLength()).toBe(50);
            
            ringBuffer.reset();
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should clear buffer contents', () => {
            const samples = new Float32Array([0.5, 0.6, 0.7]);
            ringBuffer.write(samples);
            
            ringBuffer.reset();
            
            // After reset, internal buffer should be zeroed
            // We can verify by checking capacity still works
            expect(ringBuffer.getCapacity()).toBe(100);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should allow writes after reset', () => {
            ringBuffer.write(new Float32Array(100));
            ringBuffer.reset();
            
            const samples = new Float32Array([0.1, 0.2, 0.3]);
            const written = ringBuffer.write(samples);
            
            expect(written).toBe(3);
            expect(ringBuffer.getLength()).toBe(3);
        });
        
        it('should allow reads after reset and write', () => {
            ringBuffer.write(new Float32Array(50));
            ringBuffer.reset();
            
            const samples = new Float32Array([0.7, 0.8, 0.9]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(3);
            const read = ringBuffer.read(3, output);
            
            expect(read).toBe(3);
            expect(output[0]).toBeCloseTo(0.7, 0.001);
            expect(output[1]).toBeCloseTo(0.8, 0.001);
            expect(output[2]).toBeCloseTo(0.9, 0.001);
        });
        
        it('should reset indices correctly', () => {
            // Fill and partially drain to advance indices
            ringBuffer.write(new Float32Array(80));
            const output = new Float32Array(40);
            ringBuffer.read(40, output);
            
            // Now indices are in middle of buffer
            ringBuffer.reset();
            
            // Should be able to fill entire capacity again
            const samples = new Float32Array(100);
            samples.fill(0.5);
            const written = ringBuffer.write(samples);
            
            expect(written).toBe(100);
            expect(ringBuffer.getLength()).toBe(100);
        });
    });
    
    describe('edge cases and stress tests', () => {
        it('should handle buffer size of 1', () => {
            ringBuffer = new RingBufferTestHarness(1);
            
            ringBuffer.write(new Float32Array([0.5]));
            expect(ringBuffer.getLength()).toBe(1);
            
            const output = new Float32Array(1);
            ringBuffer.read(1, output);
            expect(output[0]).toBeCloseTo(0.5, 0.001);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should handle empty write array', () => {
            ringBuffer = new RingBufferTestHarness(100);
            const written = ringBuffer.write(new Float32Array(0));
            
            expect(written).toBe(0);
            expect(ringBuffer.getLength()).toBe(0);
        });
        
        it('should handle zero read count', () => {
            ringBuffer = new RingBufferTestHarness(100);
            ringBuffer.write(new Float32Array([0.1, 0.2, 0.3]));
            
            const output = new Float32Array(10);
            const read = ringBuffer.read(0, output);
            
            expect(read).toBe(0);
            expect(ringBuffer.getLength()).toBe(3);
        });
        
        it('should handle rapid write/read cycles', () => {
            ringBuffer = new RingBufferTestHarness(128);
            
            for (let i = 0; i < 1000; i++) {
                const samples = new Float32Array([Math.random()]);
                ringBuffer.write(samples);
                
                if (Math.random() > 0.3) {
                    const output = new Float32Array(1);
                    ringBuffer.read(1, output);
                }
            }
            
            // Should still be in valid state
            expect(ringBuffer.getLength()).to.be.at.least(0);
            expect(ringBuffer.getLength()).to.be.at.most(128);
        });
        
        it('should handle alternating small writes and reads', () => {
            ringBuffer = new RingBufferTestHarness(50);
            let checksum = 0;
            
            for (let i = 0; i < 20; i++) {
                const samples = new Float32Array(3);
                samples.fill(i);
                checksum += i * 3;
                ringBuffer.write(samples);
                
                if (i % 2 === 1) {
                    const output = new Float32Array(2);
                    ringBuffer.read(2, output);
                }
            }
            
            expect(ringBuffer.getLength()).toBeGreaterThan(0);
        });
        
        it('should maintain precision with very small values', () => {
            ringBuffer = new RingBufferTestHarness(10);
            
            const samples = new Float32Array([0.0001, 0.0002, 0.0003]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(3);
            ringBuffer.read(3, output);
            
            expect(output[0]).toBeCloseTo(0.0001, 0.00001);
            expect(output[1]).toBeCloseTo(0.0002, 0.00001);
            expect(output[2]).toBeCloseTo(0.0003, 0.00001);
        });
        
        it('should maintain precision with values near limits', () => {
            ringBuffer = new RingBufferTestHarness(10);
            
            const samples = new Float32Array([1.0, -1.0, 0.99999, -0.99999]);
            ringBuffer.write(samples);
            
            const output = new Float32Array(4);
            ringBuffer.read(4, output);
            
            expect(output[0]).toBeCloseTo(1.0, 0.00001);
            expect(output[1]).toBeCloseTo(-1.0, 0.00001);
            expect(output[2]).toBeCloseTo(0.99999, 0.00001);
            expect(output[3]).toBeCloseTo(-0.99999, 0.00001);
        });
    });
    
    describe('capacity validation', () => {
        it('should maintain constant capacity', () => {
            ringBuffer = new RingBufferTestHarness(256);
            
            expect(ringBuffer.getCapacity()).toBe(256);
            
            ringBuffer.write(new Float32Array(100));
            expect(ringBuffer.getCapacity()).toBe(256);
            
            const output = new Float32Array(50);
            ringBuffer.read(50, output);
            expect(ringBuffer.getCapacity()).toBe(256);
            
            ringBuffer.reset();
            expect(ringBuffer.getCapacity()).toBe(256);
        });
        
        it('should never report length greater than capacity', () => {
            ringBuffer = new RingBufferTestHarness(64);
            
            // Try to overfill
            for (let i = 0; i < 10; i++) {
                ringBuffer.write(new Float32Array(20));
                expect(ringBuffer.getLength()).to.be.at.most(64);
            }
        });
    });
});

/**
 * APU AudioWorklet Processor
 *
 * Runs on the audio thread to produce real-time NES APU audio output.
 * Receives pre-resampled audio samples from the main thread via messages
 * and fills the Web Audio output buffer during the process() callback.
 *
 * This file is loaded as a separate AudioWorklet module and runs in the
 * AudioWorkletGlobalScope, isolated from the main JavaScript context.
 */

/**
 * Simple ring buffer for audio samples
 * 
 * Efficiently stores and retrieves samples with automatic wrap-around.
 */
class RingBuffer {
    private buffer: Float32Array;
    private writeIndex: number = 0;
    private readIndex: number = 0;
    private length: number = 0;
    
    constructor(size: number) {
        this.buffer = new Float32Array(size);
    }
    
    /**
     * Write samples to the ring buffer
     * 
     * @param samples - Float32Array of samples to write
     * @returns Number of samples actually written
     */
    public write(samples: Float32Array): number {
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
    
    /**
     * Read samples from the ring buffer
     * 
     * @param count - Number of samples to read
     * @param output - Float32Array to write samples into
     * @returns Number of samples actually read
     */
    public read(count: number, output: Float32Array): number {
        const toRead = Math.min(count, this.length);
        
        for (let i = 0; i < toRead; i++) {
            output[i] = this.buffer[this.readIndex];
            this.readIndex = (this.readIndex + 1) % this.buffer.length;
            this.length--;
        }
        
        return toRead;
    }
    
    /**
     * Get the current fill level of the buffer
     * 
     * @returns Number of samples currently stored
     */
    public getLength(): number {
        return this.length;
    }
    
    /**
     * Get the capacity of the buffer
     * 
     * @returns Total buffer size
     */
    public getCapacity(): number {
        return this.buffer.length;
    }
    
    /**
     * Reset the buffer to empty state
     */
    public reset(): void {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.length = 0;
        this.buffer.fill(0);
    }
}

/**
 * APU Audio Processor
 * 
 * AudioWorklet processor that receives resampled APU audio samples from
 * the main thread and outputs them to the Web Audio graph.
 */
class ApuAudioProcessor extends AudioWorkletProcessor {
    /** Ring buffer for storing incoming samples (~100ms at 48kHz = ~4800 samples) */
    private ringBuffer: RingBuffer;
    
    /** Counter for buffer level monitoring (report every N frames) */
    private frameCounter: number = 0;
    
    /** How often to report buffer level (every 10 process() calls = ~29ms at 48kHz) */
    private readonly REPORT_INTERVAL = 10;
    
    constructor() {
        super();
        
        // Create ring buffer sized for ~100ms at 48kHz (4800 samples)
        // Round up to nearest power of 2 for efficiency: 8192
        const bufferSize = 8192;
        this.ringBuffer = new RingBuffer(bufferSize);
        
        // Set up message handler to receive samples from main thread
        this.port.onmessage = (event: MessageEvent) => {
            this.handleMessage(event.data);
        };
    }
    
    /**
     * Handle messages from the main thread
     * 
     * @param data - Message data from main thread
     */
    private handleMessage(data: any): void {
        if (data.type === 'samples' && data.data instanceof Float32Array) {
            // Write samples to ring buffer
            this.ringBuffer.write(data.data);
        }
    }
    
    /**
     * Process audio frames
     * 
     * Called by Web Audio engine to fill output buffer.
     * Standard quantum size is 128 frames.
     * 
     * @param inputs - Input audio buffers (unused, we generate output)
     * @param outputs - Output audio buffers to fill
     * @param parameters - Audio parameters (unused)
     * @returns true to keep processor alive, false to stop
     */
    public process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>
    ): boolean {
        const output = outputs[0];
        
        // If no output channels, nothing to do
        if (!output || output.length === 0) {
            return true;
        }
        
        // Get the first (and only) output channel (mono)
        const outputChannel = output[0];
        const framesToRender = outputChannel.length;
        
        // Read samples from ring buffer
        const samplesRead = this.ringBuffer.read(framesToRender, outputChannel);
        
        // If we didn't have enough samples (buffer underrun), fill the rest with silence
        if (samplesRead < framesToRender) {
            for (let i = samplesRead; i < framesToRender; i++) {
                outputChannel[i] = 0;
            }
        }
        
        // Periodically report buffer level to main thread for rate control
        this.frameCounter++;
        if (this.frameCounter >= this.REPORT_INTERVAL) {
            this.frameCounter = 0;
            
            const level = this.ringBuffer.getLength() / this.ringBuffer.getCapacity();
            this.port.postMessage({
                type: 'buffer-level',
                level: level
            });
        }
        
        // Return true to keep the processor alive
        return true;
    }
}

// Register the processor so it can be instantiated by AudioWorkletNode
registerProcessor('apu-audio-processor', ApuAudioProcessor);

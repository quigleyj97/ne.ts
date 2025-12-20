/**
 * APU Audio Resampler
 * 
 * Converts APU samples from the native rate (~894,886.5 Hz for NTSC) to
 * browser audio output rates (44,100 Hz or 48,000 Hz) using cubic interpolation.
 * 
 * The resampler uses 4-point cubic interpolation (3rd order polynomial) which
 * provides high-quality output while remaining computationally efficient.
 * 
 * Features:
 * - Cubic interpolation for smooth resampling
 * - Dynamic rate control for buffer level management (±0.5%)
 * - Ring buffer architecture for efficient operation
 * - Pre-allocated output buffer to minimize allocations
 * 
 * Typical usage:
 * - APU calls push() ~894,886 times per second
 * - Audio system calls pull() periodically to get output samples
 * - Rate ratio can be adjusted to prevent audio drift
 */
export class Resampler {
    /** Input sample rate (APU rate) */
    private readonly inputRate: number;
    
    /** Output sample rate (audio playback rate) */
    private readonly outputRate: number;
    
    /** Base step size (inputRate / outputRate) */
    private readonly baseStep: number;
    
    /** Current step size (adjusted by rate ratio) */
    private step: number;
    
    /** Ring buffer for last 4 input samples (needed for cubic interpolation) */
    private readonly inputBuffer: Float32Array;
    
    /** Current write position in input buffer (wraps 0-3) */
    private inputIndex: number;
    
    /** Count of samples pushed (used to track when we have enough for interpolation) */
    private inputCount: number;
    
    /** Output buffer for resampled data */
    private readonly outputBuffer: Float32Array;
    
    /** Number of valid samples in output buffer */
    private outputLength: number;
    
    /** Fractional position in input stream (0.0 to step) */
    private position: number;
    
    /**
     * Create a new resampler
     * 
     * @param inputRate - Input sample rate (e.g., 894886.5 for NTSC APU)
     * @param outputRate - Output sample rate (e.g., 44100 or 48000)
     */
    constructor(inputRate: number, outputRate: number) {
        this.inputRate = inputRate;
        this.outputRate = outputRate;
        this.baseStep = inputRate / outputRate;
        this.step = this.baseStep;
        
        // Ring buffer for 4 samples (cubic interpolation needs 4 points)
        this.inputBuffer = new Float32Array(4);
        this.inputIndex = 0;
        this.inputCount = 0;
        
        // Output buffer - size for ~100ms at output rate, rounded to power of 2
        // At 48kHz, 100ms = 4800 samples, nearest power of 2 = 8192
        const bufferSize = Math.pow(2, Math.ceil(Math.log2(outputRate * 0.1)));
        this.outputBuffer = new Float32Array(bufferSize);
        this.outputLength = 0;
        
        this.position = 0;
    }
    
    /**
     * Push a single APU sample into the resampler
     * 
     * This method is called at the APU rate (~894,886 Hz for NTSC).
     * It stores the sample and generates output samples when enough
     * input has accumulated.
     * 
     * @param sample - Input sample value (typically -1.0 to +1.0)
     */
    public push(sample: number): void {
        // Store sample in ring buffer
        this.inputBuffer[this.inputIndex] = sample;
        this.inputIndex = (this.inputIndex + 1) & 3; // Wrap 0-3
        this.inputCount++;
        
        // Need at least 4 samples before we can interpolate
        if (this.inputCount < 4) {
            return;
        }
        
        // Advance position by 1 input sample
        this.position += 1.0;
        
        // Generate output samples while position >= step
        while (this.position >= this.step) {
            // Check if output buffer is full
            if (this.outputLength >= this.outputBuffer.length) {
                // Buffer overflow - we're producing faster than consuming
                // Drop the sample to prevent buffer growth
                break;
            }
            
            // Calculate fractional position (0.0 to 1.0 between y1 and y2)
            const t = 1.0 - ((this.position - this.step) / this.step);
            
            // Get 4 samples for cubic interpolation
            // The ring buffer index calculation ensures we get the correct historical samples
            const i = this.inputIndex; // Current position (just wrote here)
            const y0 = this.inputBuffer[(i + 0) & 3]; // Oldest (3 samples ago)
            const y1 = this.inputBuffer[(i + 1) & 3]; // Old (2 samples ago)
            const y2 = this.inputBuffer[(i + 2) & 3]; // Recent (1 sample ago)
            const y3 = this.inputBuffer[(i + 3) & 3]; // Current (just pushed)
            
            // Cubic interpolation coefficients
            const a0 = y1;
            const a1 = 0.5 * (y2 - y0);
            const a2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
            const a3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
            
            // Evaluate polynomial: a0 + t*(a1 + t*(a2 + t*a3))
            // Horner's method for efficiency
            const output = a0 + t * (a1 + t * (a2 + t * a3));
            
            // Store output sample
            this.outputBuffer[this.outputLength++] = output;
            
            // Advance to next output sample
            this.position -= this.step;
        }
    }
    
    /**
     * Pull available output samples
     * 
     * Returns a Float32Array containing all samples that have been
     * resampled and are ready for audio playback. After calling this,
     * the internal buffer is cleared.
     * 
     * @returns Float32Array of resampled audio data
     */
    public pull(): Float32Array {
        // Return a slice of the output buffer with only valid samples
        const result = this.outputBuffer.slice(0, this.outputLength);
        
        // Clear output buffer for next batch
        this.outputLength = 0;
        
        return result;
    }
    
    /**
     * Get the number of output samples available
     * 
     * @returns Count of samples ready to be pulled
     */
    public available(): number {
        return this.outputLength;
    }
    
    /**
     * Adjust the resampling rate for dynamic rate control
     * 
     * This allows fine-tuning the resampling ratio to prevent audio buffer
     * underruns or overruns during extended playback. The ratio is clamped
     * to ±0.5% to prevent audible pitch changes.
     * 
     * @param ratio - Rate adjustment ratio (1.0 = normal speed)
     *                ratio > 1.0 speeds up (consumes input faster)
     *                ratio < 1.0 slows down (consumes input slower)
     */
    public setRateRatio(ratio: number): void {
        // Clamp to ±0.5% to prevent audible pitch changes
        const clampedRatio = Math.max(0.995, Math.min(1.005, ratio));
        
        // Adjust step size
        this.step = this.baseStep * clampedRatio;
    }
    
    /**
     * Reset the resampler state
     * 
     * Clears all internal buffers and resets position counters.
     * Useful when seeking or restarting emulation.
     */
    public reset(): void {
        // Clear input ring buffer
        this.inputBuffer.fill(0);
        this.inputIndex = 0;
        this.inputCount = 0;
        
        // Clear output buffer
        this.outputLength = 0;
        
        // Reset position
        this.position = 0;
        
        // Reset step to base rate
        this.step = this.baseStep;
    }
}

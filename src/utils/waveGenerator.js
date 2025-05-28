/**
 * Wave Generator
 * 
 * Generates procedural waves for mood and energy values that change over time.
 * These waves are used by the track selection system to match tracks to the
 * current mood and energy levels.
 */

const fs = require('fs');
const path = require('path');
const { STATION_CONFIG } = require('../core/config');

// Default configuration
const DEFAULT_CONFIG = {
  minWavelength: 10 * 60 * 1000, // 10 minutes in ms
  maxWavelength: 100 * 60 * 1000, // 100 minutes in ms
  minValue: 1,
  maxValue: 10,
  persistence: true,
  persistencePath: path.join(__dirname, '../../data/waves.json')
};

class WaveGenerator {
  /**
   * Create a new wave generator
   * @param {Object} options - Configuration options
   * @param {string} options.name - Name of this wave (e.g., 'mood', 'energy')
   * @param {number} options.minWavelength - Minimum wavelength in milliseconds
   * @param {number} options.maxWavelength - Maximum wavelength in milliseconds
   * @param {number} options.minValue - Minimum value the wave can produce
   * @param {number} options.maxValue - Maximum value the wave can produce
   * @param {boolean} options.persistence - Whether to persist wave state
   * @param {string} options.persistencePath - Path to persistence file
   */
  constructor(options = {}) {
    this.name = options.name || 'wave';
    this.config = {
      ...DEFAULT_CONFIG,
      ...(STATION_CONFIG.waveGenerator || {}),
      ...options
    };

    // Wave parameters
    this.wavelength = this._randomInRange(
      this.config.minWavelength,
      this.config.maxWavelength
    );
    this.amplitude = (this.config.maxValue - this.config.minValue) / 2;
    this.offset = this.config.minValue + this.amplitude;
    this.phase = Math.random() * 2 * Math.PI; // Random starting phase
    this.startTime = Date.now();

    // Load persisted state if available
    if (this.config.persistence) {
      this._loadState();
    }

    console.log(`[WaveGenerator] Initialized ${this.name} wave: wavelength=${this.wavelength / 60000}min, amplitude=${this.amplitude}, phase=${this.phase}`);
  }

  /**
   * Get the wave value at a specific time
   * @param {number} timestamp - Timestamp to get value for (defaults to now)
   * @returns {number} - Wave value between minValue and maxValue
   */
  getValue(timestamp = Date.now()) {
    const elapsed = timestamp - this.startTime;
    const position = (elapsed / this.wavelength) * 2 * Math.PI;
    const value = Math.sin(position + this.phase) * this.amplitude + this.offset;
    
    // Ensure value is within bounds
    return Math.max(
      this.config.minValue,
      Math.min(this.config.maxValue, value)
    );
  }

  /**
   * Get the current wave value
   * @returns {number} - Current wave value
   */
  getCurrentValue() {
    return this.getValue(Date.now());
  }

  /**
   * Get values for a time range
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   * @param {number} steps - Number of steps to sample
   * @returns {Array<{time: number, value: number}>} - Array of time/value pairs
   */
  getValuesInRange(startTime, endTime, steps = 100) {
    const values = [];
    const stepSize = (endTime - startTime) / steps;

    for (let i = 0; i < steps; i++) {
      const time = startTime + (i * stepSize);
      values.push({
        time,
        value: this.getValue(time)
      });
    }

    return values;
  }

  /**
   * Save the current wave state
   * @returns {Promise<boolean>} - Success status
   */
  async saveState() {
    if (!this.config.persistence) return false;

    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Read existing waves file
      let waves = {};
      if (fs.existsSync(this.config.persistencePath)) {
        const data = fs.readFileSync(this.config.persistencePath, 'utf8');
        waves = JSON.parse(data);
      }

      // Update with current wave
      waves[this.name] = {
        wavelength: this.wavelength,
        amplitude: this.amplitude,
        offset: this.offset,
        phase: this.phase,
        startTime: this.startTime,
        savedAt: Date.now()
      };

      // Write back to file
      fs.writeFileSync(
        this.config.persistencePath,
        JSON.stringify(waves, null, 2),
        'utf8'
      );

      return true;
    } catch (error) {
      console.error(`[WaveGenerator] Error saving state for ${this.name}:`, error);
      return false;
    }
  }

  /**
   * Generate a visualization of the wave
   * @param {number} duration - Duration to visualize in milliseconds
   * @param {number} width - Width of the visualization in characters
   * @returns {string} - ASCII visualization of the wave
   */
  visualize(duration = 60 * 60 * 1000, width = 80) {
    const now = Date.now();
    const values = this.getValuesInRange(now, now + duration, width);
    
    const lines = [];
    const height = 10;
    const chars = ' ▁▂▃▄▅▆▇█';
    
    // Create the visualization
    for (let i = 0; i < width; i++) {
      const normalizedValue = (values[i].value - this.config.minValue) / 
        (this.config.maxValue - this.config.minValue);
      const charIndex = Math.floor(normalizedValue * (chars.length - 1));
      lines.push(chars[charIndex]);
    }
    
    return lines.join('');
  }

  /**
   * Load wave state from persistence
   * @private
   */
  _loadState() {
    try {
      if (!fs.existsSync(this.config.persistencePath)) {
        return;
      }

      const data = fs.readFileSync(this.config.persistencePath, 'utf8');
      const waves = JSON.parse(data);

      if (waves[this.name]) {
        const wave = waves[this.name];
        this.wavelength = wave.wavelength;
        this.amplitude = wave.amplitude;
        this.offset = wave.offset;
        this.phase = wave.phase;
        this.startTime = wave.startTime;

        console.log(`[WaveGenerator] Loaded state for ${this.name} wave from ${new Date(wave.savedAt).toISOString()}`);
      }
    } catch (error) {
      console.error(`[WaveGenerator] Error loading state for ${this.name}:`, error);
    }
  }

  /**
   * Generate a random number in a range
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} - Random number between min and max
   * @private
   */
  _randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }
}

module.exports = WaveGenerator;
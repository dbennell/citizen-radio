/**
 * Mood Energy Manager
 * 
 * Manages the mood and energy waves for the track selection system.
 * Provides an interface for getting current mood and energy values,
 * and for matching tracks to the current mood/energy state.
 */

const WaveGenerator = require('../utils/waveGenerator');
const { STATION_CONFIG } = require('../core/config');
const path = require('path');

class MoodEnergyManager {
  /**
   * Create a new mood/energy manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.config = {
      enabled: STATION_CONFIG.trackSelection?.moodEnergyEnabled || false,
      persistencePath: path.join(__dirname, '../../data/waves.json'),
      defaultMood: 5,
      defaultEnergy: 5,
      ...(STATION_CONFIG.moodEnergyManager || {}),
      ...options
    };

    // Initialize wave generators
    if (this.config.enabled) {
      this.moodWave = new WaveGenerator({
        name: 'mood',
        persistencePath: this.config.persistencePath
      });

      this.energyWave = new WaveGenerator({
        name: 'energy',
        persistencePath: this.config.persistencePath
      });

      console.log('[MoodEnergyManager] Initialized with wave generators');
      console.log(`[MoodEnergyManager] Current mood: ${this.getCurrentMood().toFixed(1)}, energy: ${this.getCurrentEnergy().toFixed(1)}`);
      
      // Visualize the waves for the next hour
      console.log('[MoodEnergyManager] Mood wave (next hour):');
      console.log(this.moodWave.visualize());
      console.log('[MoodEnergyManager] Energy wave (next hour):');
      console.log(this.energyWave.visualize());
    } else {
      console.log('[MoodEnergyManager] Initialized in disabled mode');
    }
  }

  /**
   * Get the current mood value
   * @returns {number} - Current mood value (1-10)
   */
  getCurrentMood() {
    if (!this.config.enabled || !this.moodWave) {
      return this.config.defaultMood;
    }
    return this.moodWave.getCurrentValue();
  }

  /**
   * Get the current energy value
   * @returns {number} - Current energy value (1-10)
   */
  getCurrentEnergy() {
    if (!this.config.enabled || !this.energyWave) {
      return this.config.defaultEnergy;
    }
    return this.energyWave.getCurrentValue();
  }

  /**
   * Get mood value at a specific time
   * @param {number} timestamp - Timestamp to get mood for
   * @returns {number} - Mood value at the specified time
   */
  getMoodAt(timestamp) {
    if (!this.config.enabled || !this.moodWave) {
      return this.config.defaultMood;
    }
    return this.moodWave.getValue(timestamp);
  }

  /**
   * Get energy value at a specific time
   * @param {number} timestamp - Timestamp to get energy for
   * @returns {number} - Energy value at the specified time
   */
  getEnergyAt(timestamp) {
    if (!this.config.enabled || !this.energyWave) {
      return this.config.defaultEnergy;
    }
    return this.energyWave.getValue(timestamp);
  }

  /**
   * Calculate how well a track matches the current mood/energy state
   * @param {Object} track - Track metadata
   * @param {number} track.mood - Track mood value (1-10)
   * @param {number} track.energy - Track energy value (1-10)
   * @returns {number} - Match score between 0 and 1
   */
  calculateMatchScore(track) {
    if (!this.config.enabled) {
      return 1; // Perfect match when disabled
    }

    const currentMood = this.getCurrentMood();
    const currentEnergy = this.getCurrentEnergy();
    
    // Use default values if track doesn't have mood/energy metadata
    const trackMood = track.mood || this.config.defaultMood;
    const trackEnergy = track.energy || this.config.defaultEnergy;
    
    // Calculate mood fit (0-1)
    const moodFit = 1 - Math.abs(trackMood - currentMood) / 10;
    
    // Calculate energy fit (0-1)
    const energyFit = 1 - Math.abs(trackEnergy - currentEnergy) / 10;
    
    // Average the two scores
    const matchScore = (moodFit + energyFit) / 2;
    
    return matchScore;
  }

  /**
   * Get the current mood/energy state as a descriptor
   * @returns {string} - Descriptive string of current mood/energy
   */
  getCurrentStateDescription() {
    if (!this.config.enabled) {
      return 'neutral';
    }

    const mood = this.getCurrentMood();
    const energy = this.getCurrentEnergy();
    
    // Mood descriptors
    let moodDesc;
    if (mood < 3) moodDesc = 'melancholic';
    else if (mood < 5) moodDesc = 'thoughtful';
    else if (mood < 7) moodDesc = 'content';
    else if (mood < 9) moodDesc = 'happy';
    else moodDesc = 'ecstatic';
    
    // Energy descriptors
    let energyDesc;
    if (energy < 3) energyDesc = 'calm';
    else if (energy < 5) energyDesc = 'relaxed';
    else if (energy < 7) energyDesc = 'moderate';
    else if (energy < 9) energyDesc = 'energetic';
    else energyDesc = 'intense';
    
    return `${moodDesc} and ${energyDesc}`;
  }

  /**
   * Save the current state of both waves
   * @returns {Promise<boolean>} - Success status
   */
  async saveState() {
    if (!this.config.enabled) {
      return false;
    }

    try {
      const moodSaved = await this.moodWave.saveState();
      const energySaved = await this.energyWave.saveState();
      
      return moodSaved && energySaved;
    } catch (error) {
      console.error('[MoodEnergyManager] Error saving state:', error);
      return false;
    }
  }

  /**
   * Sort tracks by how well they match the current mood/energy
   * @param {Array<Object>} tracks - Array of track metadata objects
   * @returns {Array<Object>} - Sorted array of tracks with match scores
   */
  sortTracksByMatch(tracks) {
    if (!this.config.enabled || !tracks || tracks.length === 0) {
      return tracks;
    }

    // Add match scores to tracks
    const tracksWithScores = tracks.map(track => ({
      ...track,
      matchScore: this.calculateMatchScore(track)
    }));
    
    // Sort by match score (highest first)
    return tracksWithScores.sort((a, b) => b.matchScore - a.matchScore);
  }
}

// Create singleton instance
const instance = new MoodEnergyManager();

// Save state periodically
if (instance.config.enabled) {
  setInterval(() => {
    instance.saveState()
      .then(success => {
        if (success) {
          console.log('[MoodEnergyManager] State saved successfully');
        }
      })
      .catch(error => {
        console.error('[MoodEnergyManager] Error in save interval:', error);
      });
  }, 15 * 60 * 1000); // Save every 15 minutes
}

module.exports = instance;
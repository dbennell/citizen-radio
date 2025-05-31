// audioAnalyzer.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const util = require('util');
const execPromise = util.promisify(exec);

class AudioAnalyzer {
    constructor() {
        this.results = new Map();
        this.dbPath = path.join(__dirname, '../../data/audio-analysis.json');
        this.commandsAvailable = {};
    }

    // Helper method to check if a command is available
    async isCommandAvailable(command) {
        if (this.commandsAvailable[command] !== undefined) {
            return this.commandsAvailable[command];
        }

        try {
            await execPromise(`which ${command}`);
            this.commandsAvailable[command] = true;
            return true;
        } catch (error) {
            this.commandsAvailable[command] = false;
            return false;
        }
    }

    async analyzeFile(filePath) {
        try {
            const analysis = {
                file: filePath,
                bpm: await this.detectBPM(filePath),
                energy: await this.calculateEnergy(filePath),
                mood: await this.analyzeMood(filePath),
                spectralFeatures: await this.extractSpectralFeatures(filePath),
                hasVocals: await this.detectVocals(filePath)
            };

            // If has vocals, add speech analysis
            if (analysis.hasVocals) {
                analysis.transcript = await this.extractSpeech(filePath);
                analysis.lyricMood = await this.analyzeLyricMood(analysis.transcript);
            }

            return analysis;
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error);
            return null;
        }
    }

    async detectBPM(filePath) {
        // Check if aubio is available
        const isAubioAvailable = await this.isCommandAvailable('aubio');

        if (isAubioAvailable) {
            // Use aubio for BPM detection
            try {
                const { stdout } = await execPromise(`aubio tempo "${filePath}"`);
                const bpm = parseFloat(stdout.trim());
                return bpm || null;
            } catch (error) {
                console.warn(`Warning: Error using aubio for BPM detection: ${error.message}`);
                // Fall back to simulated BPM
            }
        } else {
            console.warn('Warning: aubio is not installed. Using simulated BPM values.');
            console.warn('To install aubio, run: sudo apt-get install aubio-tools (Ubuntu/Debian) or brew install aubio (macOS)');
        }

        // Fallback: Generate a simulated BPM value
        return this.simulateBPM(filePath);
    }

    // Simulate BPM for when aubio is not available
    simulateBPM(filePath) {
        // Generate a realistic BPM value between 60 and 180
        return Math.floor(Math.random() * 120) + 60;
    }

    async calculateEnergy(filePath) {
        // Analyze RMS energy, dynamic range
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) reject(err);

                // Extract audio statistics
                const stream = metadata.streams.find(s => s.codec_type === 'audio');
                const duration = parseFloat(stream.duration);

                // Calculate energy metrics
                resolve({
                    rmsEnergy: this.calculateRMS(filePath),
                    dynamicRange: this.calculateDynamicRange(filePath),
                    loudness: this.calculateLoudness(filePath)
                });
            });
        });
    }

    async analyzeMood(filePath) {
        // Use spectral analysis to determine mood
        const features = await this.extractSpectralFeatures(filePath);

        // Simple mood classification based on audio features
        const mood = {
            valence: this.calculateValence(features), // Happy vs Sad
            arousal: this.calculateArousal(features), // Energetic vs Calm
            dominance: this.calculateDominance(features) // Aggressive vs Peaceful
        };

        return this.categorizeMood(mood);
    }

    categorizeMood({ valence, arousal, dominance }) {
        // Map to human-readable mood categories
        if (valence > 0.6 && arousal > 0.6) return 'energetic';
        if (valence > 0.6 && arousal < 0.4) return 'peaceful';
        if (valence < 0.4 && arousal > 0.6) return 'aggressive';
        if (valence < 0.4 && arousal < 0.4) return 'melancholic';
        return 'neutral';
    }

    async batchAnalyze(directory, extensions = ['.mp3', '.wav', '.flac']) {
        const files = this.findAudioFiles(directory, extensions);
        const results = [];

        console.log(`Analyzing ${files.length} audio files...`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[${i+1}/${files.length}] Analyzing: ${path.basename(file)}`);

            const analysis = await this.analyzeFile(file);
            if (analysis) {
                results.push(analysis);
                await this.saveAnalysis(file, analysis);
            }

            // Progress indicator
            if ((i + 1) % 10 === 0) {
                console.log(`Completed ${i + 1}/${files.length} files`);
            }
        }

        return results;
    }

    async saveAnalysis(filePath, analysis) {
        // Save to JSON file alongside the audio file
        const analysisPath = filePath.replace(/\.[^.]+$/, '.analysis.json');
        fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

        // Also update your central database
        await this.updateDatabase(filePath, analysis);
    }

    findAudioFiles(directory, extensions = ['.mp3', '.wav', '.flac']) {
        const files = [];

        if (!fs.existsSync(directory)) {
            console.error(`Directory does not exist: ${directory}`);
            return files;
        }

        const items = fs.readdirSync(directory);

        for (const item of items) {
            const itemPath = path.join(directory, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory()) {
                // Recursively search subdirectories
                const subFiles = this.findAudioFiles(itemPath, extensions);
                files.push(...subFiles);
            } else if (stat.isFile()) {
                // Check if file has one of the specified extensions
                const ext = path.extname(itemPath).toLowerCase();
                if (extensions.includes(ext)) {
                    files.push(itemPath);
                }
            }
        }

        return files;
    }

    async updateDatabase(filePath, analysis) {
        try {
            // Load existing database or create new one
            let db = {};
            if (fs.existsSync(this.dbPath)) {
                db = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            }

            // Add or update analysis for this file
            db[filePath] = {
                ...analysis,
                lastUpdated: new Date().toISOString()
            };

            // Save database
            fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2));
            return true;
        } catch (error) {
            console.error(`Error updating database for ${filePath}:`, error);
            return false;
        }
    }

    // Simplified implementation of spectral feature extraction
    async extractSpectralFeatures(filePath) {
        return {
            spectralCentroid: Math.random() * 0.5 + 0.25, // Simulated value between 0.25 and 0.75
            spectralRolloff: Math.random() * 0.5 + 0.25,
            spectralFlux: Math.random() * 0.5 + 0.25
        };
    }

    // Simplified implementation of vocal detection
    async detectVocals(filePath) {
        // For simplicity, assume 50% of tracks have vocals
        return Math.random() > 0.5;
    }

    // Simplified implementation of speech extraction
    async extractSpeech(filePath) {
        // In a real implementation, this would use speech-to-text
        return "Simulated transcript for " + path.basename(filePath);
    }

    // Simplified implementation of lyric mood analysis
    async analyzeLyricMood(transcript) {
        // In a real implementation, this would use NLP
        return {
            sentiment: Math.random() * 2 - 1, // -1 to 1
            topics: ["music", "love", "life"]
        };
    }

    // Simplified implementation of RMS energy calculation
    calculateRMS(filePath) {
        return Math.random() * 0.5 + 0.25; // Simulated value between 0.25 and 0.75
    }

    // Simplified implementation of dynamic range calculation
    calculateDynamicRange(filePath) {
        return Math.random() * 20 + 10; // Simulated value between 10 and 30 dB
    }

    // Simplified implementation of loudness calculation
    calculateLoudness(filePath) {
        return Math.random() * -10 - 10; // Simulated value between -20 and -10 LUFS
    }

    // Simplified implementation of valence calculation (happiness)
    calculateValence(features) {
        return Math.random() * 0.8 + 0.1; // Simulated value between 0.1 and 0.9
    }

    // Simplified implementation of arousal calculation (energy)
    calculateArousal(features) {
        return Math.random() * 0.8 + 0.1; // Simulated value between 0.1 and 0.9
    }

    // Simplified implementation of dominance calculation
    calculateDominance(features) {
        return Math.random() * 0.8 + 0.1; // Simulated value between 0.1 and 0.9
    }
}

module.exports = AudioAnalyzer;

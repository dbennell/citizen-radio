/**
 * Track Scoring Utilities
 * 
 * Implements the scoring formula for track selection as described in the
 * next-track-selection documentation. Scores tracks based on ratings,
 * play frequency, mood/energy fit, and request status.
 */

const moodEnergyManager = require('../managers/moodEnergyManager');
const { STATION_CONFIG } = require('../core/config');

// Default weights for different scoring components
const DEFAULT_WEIGHTS = {
  rating: 0.3,      // 40% weight for rating score
  frequency: 0.4,   // 30% weight for frequency score
  waveFit: 0.3,     // 30% weight for mood/energy fit
  requestBoost: 1.5 // Boost for requested tracks
};

/**
 * Normalize a value to a 0-1 scale
 * @param {number} value - Value to normalize
 * @param {number} min - Minimum possible value
 * @param {number} max - Maximum possible value
 * @returns {number} - Normalized value between 0 and 1
 */
function normalize(value, min, max) {
  if (min === max) return 0.5; // Avoid division by zero
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Calculate a score for a track based on its metadata
 * @param {Object} track - Track metadata
 * @param {Object} options - Scoring options
 * @param {Object} options.weights - Custom weights for scoring components
 * @param {number} options.maxPlaysSeen - Maximum play count seen across all tracks
 * @param {boolean} options.debug - Whether to include debug information in the result
 * @returns {number|Object} - Score between 0 and 1, or object with score and components if debug is true
 */
function scoreTrack(track, options = {}) {
  // Merge default weights with custom weights
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(STATION_CONFIG.trackSelection?.weights || {}),
    ...(options.weights || {})
  };

  // Get maximum play count for normalization
  const maxPlaysSeen = options.maxPlaysSeen || 200;

  // Calculate rating score (0-1)
  // Default to middle rating (3) if not available
  const rating = track.averageRating || track.rating || 3;
  const ratingScore = normalize(rating, 1, 5);

  // Calculate frequency score (0-1)
  // Lower play count = higher score
  const playCount = track.playCount || 0;
  const frequencyScore = 1 - (playCount / maxPlaysSeen);

  // Calculate mood/energy fit (0-1)
  // Use mood/energy manager to calculate fit
  const waveFit = moodEnergyManager.calculateMatchScore(track);

  // Calculate base score using weighted components
  let baseScore = (
    (ratingScore * weights.rating) + 
    (frequencyScore * weights.frequency) + 
    (waveFit * weights.waveFit)
  );

  // Apply request boost if track is requested
  if (track.isRequested) {
    baseScore += weights.requestBoost;
  }

  // Ensure score is between 0 and 1 + requestBoost
  const maxPossibleScore = 1 + (track.isRequested ? weights.requestBoost : 0);
  const finalScore = Math.max(0, Math.min(maxPossibleScore, baseScore));

  // Return detailed breakdown if debug is enabled
  if (options.debug) {
    return {
      score: finalScore,
      components: {
        ratingScore,
        frequencyScore,
        waveFit,
        isRequested: !!track.isRequested
      },
      weights,
      track: {
        title: track.title,
        artist: track.artist,
        rating,
        playCount,
        mood: track.mood,
        energy: track.energy
      }
    };
  }

  return finalScore;
}

/**
 * Score multiple tracks and sort them by score
 * @param {Array<Object>} tracks - Array of track metadata objects
 * @param {Object} options - Scoring options (see scoreTrack)
 * @returns {Array<Object>} - Tracks with scores, sorted by score (highest first)
 */
function scoreAndSortTracks(tracks, options = {}) {
  if (!tracks || !tracks.length) return [];

  // Find maximum play count for normalization
  const maxPlaysSeen = options.maxPlaysSeen || 
    Math.max(...tracks.map(t => t.playCount || 0), 1);

  // Score each track
  const scoredTracks = tracks.map(track => {
    const scoreResult = scoreTrack(track, { 
      ...options, 
      maxPlaysSeen,
      debug: true 
    });

    return {
      ...track,
      score: scoreResult.score,
      scoreComponents: scoreResult.components
    };
  });

  // Sort by score (highest first)
  return scoredTracks.sort((a, b) => b.score - a.score);
}

/**
 * Create a weighted selection pool (raffle) from scored tracks
 * @param {Array<Object>} scoredTracks - Array of tracks with scores
 * @param {Object} options - Options for raffle creation
 * @param {number} options.minTickets - Minimum tickets per track
 * @param {number} options.maxTickets - Maximum tickets per track
 * @returns {Array<Object>} - Raffle pool where tracks appear multiple times based on score
 */
function createRafflePool(scoredTracks, options = {}) {
  const config = {
    minTickets: STATION_CONFIG.trackSelection?.minTickets || 1,
    maxTickets: STATION_CONFIG.trackSelection?.maxTickets || 10,
    ...options
  };

  const rafflePool = [];

  for (const track of scoredTracks) {
    // Calculate tickets based on score
    // Score of 0 = minTickets, Score of 1 = maxTickets
    const scoreRatio = track.score > 1 ? 1 : track.score; // Cap at 1 for ticket calculation
    const tickets = Math.round(
      config.minTickets + (scoreRatio * (config.maxTickets - config.minTickets))
    );

    // Add track to raffle pool multiple times based on tickets
    for (let i = 0; i < tickets; i++) {
      rafflePool.push(track);
    }
  }

  return rafflePool;
}

/**
 * Pick a track using weighted random selection (raffle)
 * @param {Array<Object>} tracks - Array of track metadata objects
 * @param {Object} options - Options for scoring and raffle
 * @returns {Object|null} - Selected track or null if no tracks available
 */
function pickWeightedTrack(tracks, options = {}) {
  if (!tracks || !tracks.length) return null;

  // Score and sort tracks
  const scoredTracks = scoreAndSortTracks(tracks, options);

  // Create raffle pool
  const rafflePool = createRafflePool(scoredTracks, options);

  if (rafflePool.length === 0) return null;

  // Pick a random track from the pool
  return rafflePool[Math.floor(Math.random() * rafflePool.length)];
}

/**
 * Check if a track should be totally excluded based on recency
 * @param {Object} track - Track metadata
 * @param {Array<Object>} playLog - Recent play history
 * @param {Object} config - Configuration options
 * @returns {boolean} - True if track should be excluded
 */
function isTotallyExcluded(track, playLog, config = {}) {
  const cfg = {
    recentTimeWindowMs: STATION_CONFIG.trackSelection?.recentTimeWindowMs || (60 * 60 * 1000), // 1 hour
    recentTrackCount: STATION_CONFIG.trackSelection?.recentTrackCount || 20,
    ...config
  };

  // Skip if track has no lastPlayed timestamp
  if (!track.lastPlayed) return false;

  // Check time since last play
  const timeSince = Date.now() - new Date(track.lastPlayed).getTime();

  // Check if track appears in recent plays
  const trackId = track.id || track.relPath || track.filepath;
  const recentlyPlayed = playLog
    .slice(-cfg.recentTrackCount)
    .some(entry => {
      const entryId = entry.id || entry.relPath || entry.filepath;
      return entryId === trackId;
    });

  // Exclude if either condition is met
  return timeSince < cfg.recentTimeWindowMs || recentlyPlayed;
}

/**
 * Filter out totally excluded tracks
 * @param {Array<Object>} tracks - Array of track metadata objects
 * @param {Array<Object>} playLog - Recent play history
 * @param {Object} config - Configuration options
 * @returns {Array<Object>} - Filtered tracks
 */
function filterExcludedTracks(tracks, playLog, config = {}) {
  if (!tracks || !tracks.length) return [];
  if (!playLog || !playLog.length) return tracks;

  return tracks.filter(track => !isTotallyExcluded(track, playLog, config));
}

/**
 * Complete track selection process:
 * 1. Filter out excluded tracks
 * 2. Score remaining tracks
 * 3. Pick a track using weighted selection
 * 
 * @param {Array<Object>} tracks - Array of track metadata objects
 * @param {Array<Object>} playLog - Recent play history
 * @param {Object} options - Options for filtering, scoring, and selection
 * @returns {Object|null} - Selected track or null if no tracks available
 */
function selectNextTrack(tracks, playLog, options = {}) {
  if (!tracks || !tracks.length) return null;

  // Filter out excluded tracks
  const availableTracks = filterExcludedTracks(tracks, playLog, options);

  if (availableTracks.length === 0) {
    console.log('[TrackScoring] All tracks excluded, using full track list');
    return pickWeightedTrack(tracks, options);
  }

  // Pick a track using weighted selection
  return pickWeightedTrack(availableTracks, options);
}

module.exports = {
  scoreTrack,
  scoreAndSortTracks,
  createRafflePool,
  pickWeightedTrack,
  isTotallyExcluded,
  filterExcludedTracks,
  selectNextTrack,
  normalize
};

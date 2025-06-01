const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../src/managers/playLogManager');
jest.mock('../../../src/utils');
jest.mock('../../../src/core/config', () => ({
  STATION_CONFIG: {
    trackHistory: {
      historySize: 16
    },
    ratingSystem: {
      enabled: true,
      defaultRating: 3
    }
  },
  READY_DIR: jest.fn(type => `/mock/data/ready/${type}`)
}));
jest.mock('../../../src/managers/ratingsManager');

// Import mocked dependencies
const playLogManager = require('../../../src/managers/playLogManager');
const utils = require('../../../src/utils');
const config = require('../../../src/core/config');
const ratingsManager = require('../../../src/managers/ratingsManager');

// Import the module under test
const trackManager = require('../../../src/managers/trackManager');

describe('Track Manager', () => {
  // Mock console methods
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    jest.resetAllMocks();

    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    path.relative.mockImplementation((from, to) => {
      // Simple mock implementation that removes the from part from the to path
      return to.replace(from, '');
    });

    // Mock fs
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['track1.mp3', 'track2.mp3', 'track3.mp3', 'not-an-mp3.txt']);
    fs.unlinkSync.mockImplementation(() => {});

    // Mock playLogManager
    playLogManager.getPlayCount.mockImplementation((relPath) => {
      // Return different play counts for different tracks
      if (relPath.includes('track1')) return 2;
      if (relPath.includes('track2')) return 1;
      if (relPath.includes('track3')) return 0;
      return 0;
    });
    playLogManager.getLastPlays.mockReturnValue([
      { relPath: 'music/track1.mp3', type: 'music' },
      { relPath: 'dj/track1.mp3', type: 'dj' }
    ]);

    // Mock utils
    utils.extractMetadata.mockImplementation((filepath) => ({
      title: `Title from ${path.basename(filepath)}`,
      artist: `Artist from ${path.basename(filepath)}`,
      album: `Album from ${path.basename(filepath)}`
    }));

    // Mock ratingsManager
    ratingsManager.getRatingForTrack.mockImplementation((relPath) => {
      // Return different ratings for different tracks
      if (relPath.includes('track1')) return 5;
      if (relPath.includes('track2')) return 3;
      if (relPath.includes('track3')) return null;
      return null;
    });
    ratingsManager.getTicketsForTrack.mockImplementation((rating) => {
      // Simple implementation that returns the rating as tickets
      return rating || 3;
    });
  });

  test('should pick next track of specified type', async () => {
    const result = await trackManager.pickNextTrack('music');

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/data/ready/music');
    expect(fs.readdirSync).toHaveBeenCalledWith('/mock/data/ready/music');
    expect(result).toHaveProperty('filepath');
    expect(result).toHaveProperty('meta');
    expect(result.meta).toHaveProperty('type', 'music');
    expect(result.meta).toHaveProperty('relPath');
  });

  test('should handle empty directory', async () => {
    fs.readdirSync.mockReturnValue([]);

    const result = await trackManager.pickNextTrack('music');

    expect(result).toEqual({ filepath: null, meta: null });
  });

  test('should handle non-existent directory', async () => {
    fs.existsSync.mockReturnValue(false);

    const result = await trackManager.pickNextTrack('music');

    expect(result).toEqual({ filepath: null, meta: null });
  });

  test('should filter out non-mp3 files', async () => {
    const result = await trackManager.pickNextTrack('music');

    // Verify that only MP3 files were considered
    expect(result.filepath).toMatch(/\.mp3$/);
    expect(result.filepath).not.toMatch(/not-an-mp3\.txt$/);
  });

  test('should prefer never-played tracks', async () => {
    // Set up mock to make track3 never played
    playLogManager.getPlayCount.mockImplementation((relPath) => {
      if (relPath.includes('track3')) return 0;
      return 1;
    });

    // Make sure track3 is not in recent plays
    playLogManager.getLastPlays.mockReturnValue([
      { relPath: 'music/track1.mp3', type: 'music' },
      { relPath: 'music/track2.mp3', type: 'music' }
    ]);

    const result = await trackManager.pickNextTrack('music');

    // Should pick track3 as it's never been played
    expect(result.filepath).toContain('track3.mp3');
  });

  test('should avoid recently played tracks', async () => {
    // Set up mock to make all tracks played the same number of times
    playLogManager.getPlayCount.mockReturnValue(1);

    // Make track1 and track2 recently played
    playLogManager.getLastPlays.mockReturnValue([
      { relPath: 'music/track1.mp3', type: 'music' },
      { relPath: 'music/track2.mp3', type: 'music' }
    ]);

    const result = await trackManager.pickNextTrack('music');

    // Should pick track3 as it's not recently played
    expect(result.filepath).toContain('track3.mp3');
  });

  test('should use weighted selection for music tracks when rating system is enabled', async () => {
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = await trackManager.pickNextTrack('music');

    expect(ratingsManager.getRatingForTrack).toHaveBeenCalled();
    expect(ratingsManager.getTicketsForTrack).toHaveBeenCalled();

    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should use random selection for non-music tracks', async () => {
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = await trackManager.pickNextTrack('dj');

    // For non-music tracks, it should not use the rating system
    expect(ratingsManager.getRatingForTrack).not.toHaveBeenCalled();
    expect(ratingsManager.getTicketsForTrack).not.toHaveBeenCalled();

    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should perform weighted selection based on ratings', async () => {
    // Create candidates with different ratings
    const candidates = [
      { rel: 'music/track1.mp3', fp: '/mock/data/ready/music/track1.mp3' }, // Rating 5
      { rel: 'music/track2.mp3', fp: '/mock/data/ready/music/track2.mp3' }, // Rating 3
      { rel: 'music/track3.mp3', fp: '/mock/data/ready/music/track3.mp3' }  // Rating null (default 3)
    ];

    // Mock Math.random to return a predictable value that will select track1
    // Track1 has 5 tickets, track2 has 3 tickets, track3 has 3 tickets
    // Total tickets: 11, so index 5 (0.5 * 11 = 5.5 -> floor -> 5) should be track1
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = await trackManager.performWeightedSelection(candidates);

    expect(result).toEqual(candidates[0]); // Should select track1
    expect(ratingsManager.getRatingForTrack).toHaveBeenCalledWith('music/track1.mp3');
    expect(ratingsManager.getRatingForTrack).toHaveBeenCalledWith('music/track2.mp3');
    expect(ratingsManager.getRatingForTrack).toHaveBeenCalledWith('music/track3.mp3');
    expect(ratingsManager.getTicketsForTrack).toHaveBeenCalledWith(5);
    expect(ratingsManager.getTicketsForTrack).toHaveBeenCalledWith(3);
    expect(ratingsManager.getTicketsForTrack).toHaveBeenCalledWith(null);

    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should clean up segue files', () => {
    // Mock segue files
    fs.readdirSync.mockReturnValue(['segue_123.mp3', 'segue_456.mp3', 'not_a_segue.mp3']);

    trackManager.cleanupSegues();

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/data/ready/segue');
    expect(fs.readdirSync).toHaveBeenCalledWith('/mock/data/ready/segue');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/mock/data/ready/segue/segue_123.mp3');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/mock/data/ready/segue/segue_456.mp3');
    expect(fs.unlinkSync).not.toHaveBeenCalledWith('/mock/data/ready/segue/not_a_segue.mp3');
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 2 segue files'));
  });

  test('should handle errors when cleaning up segue files', () => {
    // Mock segue files
    fs.readdirSync.mockReturnValue(['segue_123.mp3']);
    fs.unlinkSync.mockImplementation(() => {
      throw new Error('Unlink error');
    });

    trackManager.cleanupSegues();

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Error deleting segue file'),
      expect.any(Error)
    );
  });

  test('should handle non-existent segue directory', () => {
    fs.existsSync.mockReturnValue(false);

    trackManager.cleanupSegues();

    expect(fs.readdirSync).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

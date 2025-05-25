const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');

// Save original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('Play Log Manager', () => {
  // Mock console methods
  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    
    // Reset module cache to test initialization
    jest.resetModules();
  });
  
  // Restore console methods
  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  test('should initialize cache from existing play log', () => {
    // Mock play log file
    const mockPlayLog = [
      JSON.stringify({
        timestamp: 1684929600000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      JSON.stringify({
        timestamp: 1684929700000,
        relPath: 'music/track2.mp3',
        type: 'music',
        meta: { title: 'Track 2', artist: 'Artist 2' }
      })
    ].join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module to trigger initialization
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Verify that the cache was initialized correctly
    expect(playLogManager.recentCache).toHaveLength(2);
    expect(playLogManager.recentCache[0].relPath).toBe('music/track1.mp3');
    expect(playLogManager.recentCache[1].relPath).toBe('music/track2.mp3');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('recentCache initialized with 2 entries'));
  });

  test('should initialize cache with placeholder when play log is empty', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('');
    
    // Import the module to trigger initialization
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Verify that the cache was initialized with a placeholder
    expect(playLogManager.recentCache).toHaveLength(1);
    expect(playLogManager.recentCache[0].type).toBe('placeholder');
    expect(playLogManager.recentCache[0].meta.title).toBe('Placeholder Track');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('play.log is empty'));
  });

  test('should initialize cache with error placeholder when play log read fails', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation(() => {
      throw new Error('Read error');
    });
    
    // Import the module to trigger initialization
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Verify that the cache was initialized with an error placeholder
    expect(playLogManager.recentCache).toHaveLength(1);
    expect(playLogManager.recentCache[0].type).toBe('error');
    expect(playLogManager.recentCache[0].meta.title).toBe('Error Placeholder');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to seed recentCache:'),
      expect.any(Error)
    );
  });

  test('should append play log entry to file and cache', () => {
    // Mock existing play log
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('');
    fs.appendFileSync.mockImplementation(() => {});
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Reset console.log mock to clear initialization logs
    console.log.mockReset();
    
    // Append a play log entry
    const relPath = 'music/track3.mp3';
    const type = 'music';
    const meta = { title: 'Track 3', artist: 'Artist 3' };
    
    playLogManager.appendPlayLog(relPath, type, meta);
    
    // Verify that the entry was appended to the file
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"relPath":"music/track3.mp3"')
    );
    
    // Verify that the entry was added to the cache
    expect(playLogManager.recentCache).toHaveLength(2); // Placeholder + new entry
    expect(playLogManager.recentCache[1].relPath).toBe('music/track3.mp3');
    expect(playLogManager.recentCache[1].type).toBe('music');
    expect(playLogManager.recentCache[1].meta).toEqual(meta);
    
    // Verify that the operation was logged
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Logging play: Track 3'));
  });

  test('should handle errors when appending play log', () => {
    // Mock existing play log
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('');
    fs.appendFileSync.mockImplementation(() => {
      throw new Error('Append error');
    });
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Reset console mocks to clear initialization logs
    console.log.mockReset();
    console.error.mockReset();
    
    // Append a play log entry
    const relPath = 'music/track3.mp3';
    const type = 'music';
    const meta = { title: 'Track 3', artist: 'Artist 3' };
    
    playLogManager.appendPlayLog(relPath, type, meta);
    
    // Verify that the error was logged
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to append play log:'),
      expect.any(Error)
    );
  });

  test('should read all plays from file', () => {
    // Mock play log file
    const mockPlayLog = [
      JSON.stringify({
        timestamp: 1684929600000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      JSON.stringify({
        timestamp: 1684929700000,
        relPath: 'music/track2.mp3',
        type: 'music',
        meta: { title: 'Track 2', artist: 'Artist 2' }
      })
    ].join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Read all plays
    const plays = playLogManager.getHistory();
    
    // Verify that all plays were read
    expect(plays).toHaveLength(2);
    expect(plays[0].relPath).toBe('music/track1.mp3');
    expect(plays[1].relPath).toBe('music/track2.mp3');
  });

  test('should filter plays by type', () => {
    // Mock play log file with different types
    const mockPlayLog = [
      JSON.stringify({
        timestamp: 1684929600000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      JSON.stringify({
        timestamp: 1684929700000,
        relPath: 'dj/track1.mp3',
        type: 'dj',
        meta: { title: 'DJ Track', artist: 'DJ Artist' }
      })
    ].join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Get plays filtered by type
    const musicPlays = playLogManager.getHistory('music');
    
    // Verify that only music plays were returned
    expect(musicPlays).toHaveLength(1);
    expect(musicPlays[0].relPath).toBe('music/track1.mp3');
    expect(musicPlays[0].type).toBe('music');
  });

  test('should handle invalid JSON in play log', () => {
    // Mock play log file with invalid JSON
    const mockPlayLog = [
      JSON.stringify({
        timestamp: 1684929600000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      'invalid json',
      JSON.stringify({
        timestamp: 1684929700000,
        relPath: 'music/track2.mp3',
        type: 'music',
        meta: { title: 'Track 2', artist: 'Artist 2' }
      })
    ].join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Read all plays
    const plays = playLogManager.getHistory();
    
    // Verify that invalid JSON was skipped
    expect(plays).toHaveLength(2);
    expect(plays[0].relPath).toBe('music/track1.mp3');
    expect(plays[1].relPath).toBe('music/track2.mp3');
  });

  test('should get play count for a specific track', () => {
    // Mock play log file with repeated tracks
    const mockPlayLog = [
      JSON.stringify({
        timestamp: 1684929600000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      JSON.stringify({
        timestamp: 1684929700000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      JSON.stringify({
        timestamp: 1684929800000,
        relPath: 'music/track2.mp3',
        type: 'music',
        meta: { title: 'Track 2', artist: 'Artist 2' }
      })
    ].join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Get play count for a specific track
    const count = playLogManager.getPlayCount('music/track1.mp3');
    
    // Verify that the count is correct
    expect(count).toBe(2);
  });

  test('should get last plays from cache', () => {
    // Mock play log file
    const mockPlayLog = [
      JSON.stringify({
        timestamp: 1684929600000,
        relPath: 'music/track1.mp3',
        type: 'music',
        meta: { title: 'Track 1', artist: 'Artist 1' }
      }),
      JSON.stringify({
        timestamp: 1684929700000,
        relPath: 'music/track2.mp3',
        type: 'music',
        meta: { title: 'Track 2', artist: 'Artist 2' }
      }),
      JSON.stringify({
        timestamp: 1684929800000,
        relPath: 'music/track3.mp3',
        type: 'music',
        meta: { title: 'Track 3', artist: 'Artist 3' }
      })
    ].join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Get last 2 plays
    const lastPlays = playLogManager.getLastPlays(2);
    
    // Verify that the last 2 plays were returned
    expect(lastPlays).toHaveLength(2);
    expect(lastPlays[0].relPath).toBe('music/track2.mp3');
    expect(lastPlays[1].relPath).toBe('music/track3.mp3');
  });

  test('should handle cache overflow', () => {
    // Create a mock play log with more entries than CACHE_LIMIT
    const mockEntries = [];
    for (let i = 0; i < 130; i++) {
      mockEntries.push(JSON.stringify({
        timestamp: 1684929600000 + i * 1000,
        relPath: `music/track${i}.mp3`,
        type: 'music',
        meta: { title: `Track ${i}`, artist: `Artist ${i}` }
      }));
    }
    const mockPlayLog = mockEntries.join('\n');
    
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockPlayLog);
    
    // Import the module
    const playLogManager = require('../../../src/managers/playLogManager');
    
    // Verify that the cache was limited to CACHE_LIMIT entries
    expect(playLogManager.recentCache.length).toBe(128);
    
    // Verify that the oldest entries were dropped
    expect(playLogManager.recentCache[0].relPath).toBe('music/track2.mp3');
    expect(playLogManager.recentCache[127].relPath).toBe('music/track129.mp3');
  });
});
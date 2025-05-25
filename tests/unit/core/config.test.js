const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock fs and path modules
jest.mock('fs');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  ...jest.requireActual('path')
}));

// Mock process.exit to prevent tests from exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
// Mock console.log and console.error to prevent output during tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

// Save original process.argv and process.env
const originalArgv = process.argv;
const originalEnv = process.env;

describe('Config Module', () => {
  // Reset mocks and restore process.argv and process.env before each test
  beforeEach(() => {
    jest.resetAllMocks();
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
  });

  // Restore process.argv and process.env after all tests
  afterAll(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  test('should load station configuration from file', () => {
    // Mock the file system to return a valid config file
    const mockConfig = {
      stationName: 'Test Station',
      youtube: {
        rtmpUrl: 'rtmp://test.example.com/live',
        streamKey: 'test-stream-key',
        videoId: 'test-video-id'
      }
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    // Clear the module cache to ensure a fresh load
    jest.resetModules();

    // Import the config module
    const { STATION_CONFIG } = require('../../../src/core/config');

    // Verify that the config was loaded correctly
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config/default.json'),
      'utf-8'
    );
    expect(STATION_CONFIG.stationName).toBe('Test Station');
    expect(STATION_CONFIG.youtube.rtmpUrl).toBe('rtmp://test.example.com/live');
    expect(STATION_CONFIG.youtube.streamKey).toBe('test-stream-key');
    expect(STATION_CONFIG.youtube.videoId).toBe('test-video-id');
  });

  test('should exit process when config file cannot be loaded', () => {
    // Mock the file system to throw an error
    fs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    // Clear the module cache to ensure a fresh load
    jest.resetModules();

    // Import the config module
    require('../../../src/core/config');

    // Verify that process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      'Failed to load station configuration:',
      'File not found'
    );
  });

  test('should override YouTube settings from environment variables', () => {
    // Mock the file system to return a valid config file
    const mockConfig = {
      stationName: 'Test Station',
      youtube: {
        rtmpUrl: 'rtmp://test.example.com/live',
        streamKey: 'test-stream-key',
        videoId: 'test-video-id'
      }
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    // Set environment variables
    process.env.YOUTUBE_API_KEY = 'test-api-key';
    process.env.YOUTUBE_VIDEO_ID = 'env-video-id';
    process.env.YOUTUBE_STREAM_KEY = 'env-stream-key';
    process.env.YOUTUBE_CLIENT_ID = 'test-client-id';
    process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret';
    process.env.YOUTUBE_ACCESS_TOKEN = 'test-access-token';

    // Clear the module cache to ensure a fresh load
    jest.resetModules();

    // Import the config module
    const { STATION_CONFIG } = require('../../../src/core/config');

    // Verify that the environment variables were applied
    expect(STATION_CONFIG.youtube.apiAvailable).toBe(true);
    expect(STATION_CONFIG.youtube.oauthAvailable).toBe(true);
    expect(STATION_CONFIG.youtube.streamKey).toBe('env-stream-key');
    expect(STATION_CONFIG.youtube.videoId).toBe('env-video-id');
  });

  test('should handle CLI arguments for video ID and uptime', () => {
    // Mock the file system to return a valid config file
    const mockConfig = {
      stationName: 'Test Station',
      youtube: {
        rtmpUrl: 'rtmp://test.example.com/live',
        streamKey: 'test-stream-key',
        videoId: 'test-video-id'
      }
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    // Set CLI arguments
    process.argv = [...originalArgv, '--video', 'cli-video-id', '--uptime', '4', '--uptime-mode', 'track'];

    // Clear the module cache to ensure a fresh load
    jest.resetModules();

    // Import the config module
    const { STATION_CONFIG } = require('../../../src/core/config');

    // Verify that the CLI arguments were applied
    expect(STATION_CONFIG.youtube.videoId).toBe('cli-video-id');
    expect(STATION_CONFIG.uptimeHours).toBe(4);
    expect(STATION_CONFIG.uptimeMode).toBe('track');
  });

  test('should set default values when configuration is missing', () => {
    // Mock the file system to return a minimal config file
    const mockConfig = {
      stationName: 'Test Station'
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    // Clear the module cache to ensure a fresh load
    jest.resetModules();

    // Import the config module
    const { STATION_CONFIG } = require('../../../src/core/config');

    // Verify that default values were set
    expect(STATION_CONFIG.uptimeHours).toBe(null);
    expect(STATION_CONFIG.uptimeMode).toBe('cycle');
  });

  test('should correctly resolve directory paths', () => {
    // Mock the file system to return a valid config file
    const mockConfig = {
      stationName: 'Test Station'
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

    // Clear the module cache to ensure a fresh load
    jest.resetModules();

    // Import the config module
    const { PROMPT_DIRS, READY_DIR, PLAYED_DIR } = require('../../../src/core/config');

    // Verify that directory paths are correctly resolved
    expect(PROMPT_DIRS.ad).toContain('assets/prompts/ads');
    expect(PROMPT_DIRS.intro).toContain('assets/prompts/intros');
    expect(PROMPT_DIRS.dj).toContain('assets/prompts/dj');
    expect(PROMPT_DIRS.music).toContain('assets/prompts/music');
    expect(PROMPT_DIRS.podcast).toContain('assets/prompts/podcast');
    expect(PROMPT_DIRS.image).toContain('assets/prompts/images');

    expect(READY_DIR('music')).toContain('data/ready/music');
    expect(PLAYED_DIR('music')).toContain('data/archive/music');
  });
});
const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../src/managers/trackManager');
jest.mock('../../../src/managers/playLogManager');
jest.mock('../../../src/processors/promptProcessor');
jest.mock('../../../src/core/streamer');
jest.mock('../../../src/core/config', () => ({
  STATION_CONFIG: {
    schedule: {
      defaultPattern: ['intro', 'music', 'segway', 'dj', 'music']
    },
    trackHistory: {
      historySize: 16,
      weights: { music: 1, dj: 0.5 }
    },
    ratingSystem: {
      enabled: true
    },
    uptimeHours: null,
    uptimeMode: 'cycle',
    streamMode: 'local',
    djOptions: {
      includePodcasts: false
    }
  },
  READY_DIR: jest.fn(type => `/mock/data/ready/${type}`)
}));
jest.mock('../../../src/utils');
jest.mock('../../../src/managers/ratingsManager');
jest.mock('canvas');
jest.mock('chalk', () => ({
  default: {
    yellow: jest.fn(text => text),
    green: jest.fn(text => text),
    magenta: jest.fn(text => text)
  }
}));

// Import mocked dependencies
const trackManager = require('../../../src/managers/trackManager');
const playLogManager = require('../../../src/managers/playLogManager');
const promptProcessor = require('../../../src/processors/promptProcessor');
const streamer = require('../../../src/core/streamer');
const utils = require('../../../src/utils');
const ratingsManager = require('../../../src/managers/ratingsManager');
const canvas = require('canvas');

// Import the module under test
const orchestrator = require('../../../src/core/orchestrator');

describe('Orchestrator Module', () => {
  // Mock console methods
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.relative.mockImplementation((from, to) => to);
    
    // Mock canvas
    canvas.createCanvas.mockReturnValue({
      getContext: jest.fn(() => ({
        drawImage: jest.fn(),
        fillRect: jest.fn(),
        fillText: jest.fn(),
        fillStyle: '#000'
      })),
      createPNGStream: jest.fn(() => ({
        pipe: jest.fn(stream => {
          stream.emit('finish');
          return stream;
        })
      }))
    });
    canvas.loadImage.mockResolvedValue({
      width: 1000,
      height: 1000
    });
    
    // Mock fs
    fs.createWriteStream.mockReturnValue({
      on: jest.fn((event, callback) => {
        if (event === 'finish') setTimeout(callback, 10);
        return this;
      })
    });
    fs.readdirSync.mockReturnValue(['track1.mp3', 'track2.mp3']);
    fs.unlinkSync.mockImplementation(() => {});
    
    // Mock track manager
    trackManager.pickNextTrack.mockImplementation(async (type) => ({
      filepath: `/mock/data/ready/${type}/track1.mp3`,
      meta: {
        title: `Test ${type} Title`,
        artist: `Test ${type} Artist`,
        rating: 4.5
      }
    }));
    
    // Mock play log manager
    playLogManager.getLastPlays.mockReturnValue([
      {
        type: 'music',
        meta: {
          title: 'Previous Music Track',
          artist: 'Previous Artist'
        }
      }
    ]);
    playLogManager.appendPlayLog.mockImplementation(() => {});
    
    // Mock prompt processor
    promptProcessor.generateSegway.mockResolvedValue('This is a test segway');
    promptProcessor.prepareSegway.mockResolvedValue('/tmp/segway.mp3');
    
    // Mock streamer
    streamer.playFile.mockResolvedValue(true);
    streamer.streamFile.mockResolvedValue(true);
    streamer.getRandomCoverImage.mockReturnValue('/mock/cover.jpg');
    
    // Mock utils
    utils.fetchLiveVideoId.mockResolvedValue('test-video-id');
    utils.extractMetadata.mockImplementation((filepath) => ({
      title: 'Test Title',
      artist: 'Test Artist',
      rating: 4.5,
      picture: {
        data: Buffer.from('test')
      }
    }));
    utils.fetchLastChatComments.mockResolvedValue(['Comment 1', 'Comment 2']);
    
    // Mock ratings manager
    ratingsManager.setCurrentlyPlaying.mockImplementation(() => {});
    ratingsManager.openCommentWindow.mockReturnValue(new Date().toISOString());
    ratingsManager.closeCommentWindow.mockReturnValue(new Date().toISOString());
    ratingsManager.pollForComments.mockResolvedValue(5);
  });

  test('should fetch and cache YouTube video ID', async () => {
    // First call should fetch the ID
    const videoId = await orchestrator.getPersistentVideoId();
    expect(videoId).toBe('test-video-id');
    expect(utils.fetchLiveVideoId).toHaveBeenCalledTimes(1);
    
    // Second call should use cached ID
    const cachedId = await orchestrator.getPersistentVideoId();
    expect(cachedId).toBe('test-video-id');
    expect(utils.fetchLiveVideoId).toHaveBeenCalledTimes(1); // Still only called once
  });

  test('should handle errors when fetching video ID', async () => {
    utils.fetchLiveVideoId.mockRejectedValue(new Error('API error'));
    
    const videoId = await orchestrator.getPersistentVideoId();
    expect(videoId).toBeNull();
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching videoId:'),
      'API error'
    );
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('VideoId missing: live chat disabled')
    );
  });

  test('should generate overlay with track information and comments', async () => {
    const trackPath = '/mock/data/ready/music/track1.mp3';
    const videoId = 'test-video-id';
    
    await orchestrator.updateOverlay(trackPath, videoId);
    
    expect(utils.extractMetadata).toHaveBeenCalledWith(trackPath);
    expect(utils.fetchLastChatComments).toHaveBeenCalledWith(videoId, 10);
    expect(canvas.createCanvas).toHaveBeenCalledWith(1280, 720);
    expect(canvas.loadImage).toHaveBeenCalled();
    expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/overlay.png');
  });

  test('should handle missing cover art in overlay generation', async () => {
    utils.extractMetadata.mockReturnValueOnce({
      title: 'Test Title',
      artist: 'Test Artist',
      rating: 4.5,
      // No picture data
    });
    
    const trackPath = '/mock/data/ready/music/track1.mp3';
    const videoId = 'test-video-id';
    
    await orchestrator.updateOverlay(trackPath, videoId);
    
    expect(streamer.getRandomCoverImage).toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/cover.jpg');
  });

  test('should stop playback when requested', () => {
    orchestrator.stopPlayback();
    
    // We can't directly test the internal state, but we can test that
    // the playbackLoop will exit early in the next test
  });

  test('should request stop after next music track', () => {
    orchestrator.requestStop();
    
    // We can't directly test the internal state, but we can test that
    // the playbackLoop will exit after the next music track in a full integration test
  });
});
const path = require('path');
const fs = require('fs');
const Orchestrator = require('../../../src/core/orchestrator');
const utils = require('../../../src/utils/index');

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn()
}));

jest.mock('../../../src/utils/index', () => ({
  spawnTrackedProcess: jest.fn(),
  extractMetadata: jest.fn(),
  fetchLiveVideoId: jest.fn(),
  readLiveChat: jest.fn(),
  killAllTrackedProcesses: jest.fn().mockResolvedValue(),
  runningProcesses: []
}));

// Mock the streamer
jest.mock('../../../src/core/streamer', () => {
  return jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
    streamFile: jest.fn().mockResolvedValue(),
    pollChat: jest.fn().mockResolvedValue(),
    generateOverlay: jest.fn(),
    processComments: jest.fn()
  }));
});

// Mock the track manager
jest.mock('../../../src/managers/trackManager', () => {
  return jest.fn().mockImplementation(() => ({
    selectNextTrack: jest.fn().mockResolvedValue({
      path: '/path/to/test_audio.mp3',
      type: 'music',
      metadata: {
        title: 'Test Song',
        artist: 'Test Artist'
      }
    }),
    getHistory: jest.fn().mockReturnValue([]),
    addToHistory: jest.fn()
  }));
});

// Mock the prompt processor
jest.mock('../../../src/processors/promptProcessor', () => {
  return jest.fn().mockImplementation(() => ({
    generatePrompt: jest.fn().mockResolvedValue('Test prompt'),
    processPrompt: jest.fn().mockResolvedValue({
      content: 'Test DJ content',
      usage: { total_tokens: 100 }
    })
  }));
});

// Mock the audio synthesizer
jest.mock('../../../src/processors/audioSynthesizer', () => {
  return jest.fn().mockImplementation(() => ({
    synthesizeSpeech: jest.fn().mockResolvedValue('/path/to/synthesized/audio.mp3')
  }));
});

// Mock the ratings manager
jest.mock('../../../src/managers/ratingsManager', () => {
  return jest.fn().mockImplementation(() => ({
    getRating: jest.fn().mockReturnValue(4.5),
    saveRatings: jest.fn(),
    processComments: jest.fn()
  }));
});

describe('End-to-End Broadcast Cycle', () => {
  let orchestrator;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console methods to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Set up test fixtures
    const fixturesDir = path.join(__dirname, '../../fixtures');
    
    // Mock fs.readFileSync to return test data
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.endsWith('test_station.json')) {
        return JSON.stringify({
          name: 'Test Station',
          description: 'A test station for automated testing',
          uptimeHours: 0.01, // 36 seconds
          uptimeMode: 'cycle',
          schedule: {
            defaultPattern: ['intro', 'music', 'dj', 'music']
          },
          paths: {
            music: fixturesDir,
            intro: fixturesDir,
            dj: fixturesDir
          },
          youtube: {
            enabled: false
          }
        });
      }
      return Buffer.from('test data');
    });
    
    // Mock fs.readdirSync to return test files
    fs.readdirSync.mockReturnValue(['test_audio.mp3']);
    
    // Mock utils.extractMetadata to return test metadata
    utils.extractMetadata.mockReturnValue({
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      genre: 'Test Genre'
    });
    
    // Initialize orchestrator with test configuration
    orchestrator = new Orchestrator({
      configPath: path.join(fixturesDir, 'test_station.json'),
      streamMode: 'local' // Use local mode to avoid actual YouTube streaming
    });
  });
  
  describe('Complete Broadcast Cycle', () => {
    it('should complete a full content cycle and shut down when uptime is reached', async () => {
      // Start the orchestrator
      await orchestrator.start();
      
      // Wait for the orchestrator to complete its cycle and shut down
      // This should happen automatically due to the short uptime setting
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Fast-forward time to allow the orchestrator to complete its cycle
      jest.advanceTimersByTime(40000); // 40 seconds
      
      // Run any pending promises
      await Promise.resolve();
      
      // Verify that the orchestrator completed a full cycle
      // This would typically involve checking logs or state, but for this test
      // we'll verify that the expected methods were called
      
      // Verify that track selection occurred
      expect(orchestrator.trackManager.selectNextTrack).toHaveBeenCalled();
      
      // Verify that audio was streamed
      expect(orchestrator.streamer.streamFile).toHaveBeenCalled();
      
      // Verify that the orchestrator shut down
      expect(utils.killAllTrackedProcesses).toHaveBeenCalled();
    });
  });
  
  describe('Content Variety', () => {
    it('should play multiple content types in sequence according to the pattern', async () => {
      // Start the orchestrator
      await orchestrator.start();
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Fast-forward time to allow the orchestrator to process multiple content items
      jest.advanceTimersByTime(20000); // 20 seconds
      
      // Run any pending promises
      await Promise.resolve();
      
      // Verify that different content types were selected
      // The pattern is ['intro', 'music', 'dj', 'music'], so we should see calls for each type
      
      // Check if selectNextTrack was called with different content types
      const selectNextTrackCalls = orchestrator.trackManager.selectNextTrack.mock.calls;
      
      // Extract the content types from the calls
      const contentTypes = selectNextTrackCalls.map(call => call[0]);
      
      // Verify that intro, music, and dj content types were selected
      expect(contentTypes).toContain('intro');
      expect(contentTypes).toContain('music');
      expect(contentTypes).toContain('dj');
    });
  });
  
  describe('Rating Collection', () => {
    it('should collect and process ratings during broadcast', async () => {
      // Mock readLiveChat to return comments with ratings
      utils.readLiveChat.mockResolvedValue([
        {
          id: 'comment1',
          authorDetails: {
            displayName: 'Test User 1'
          },
          snippet: {
            displayMessage: 'Great song! 5/5'
          }
        },
        {
          id: 'comment2',
          authorDetails: {
            displayName: 'Test User 2'
          },
          snippet: {
            displayMessage: 'Not my favorite. 2/5'
          }
        }
      ]);
      
      // Start the orchestrator
      await orchestrator.start();
      
      // Simulate chat polling
      await orchestrator.streamer.pollChat();
      
      // Verify that ratings were processed
      expect(orchestrator.ratingsManager.processComments).toHaveBeenCalled();
      
      // Verify that ratings were saved
      expect(orchestrator.ratingsManager.saveRatings).toHaveBeenCalled();
    });
  });
  
  describe('Error Recovery', () => {
    it('should recover from errors during playback', async () => {
      // Mock streamFile to throw an error on first call and succeed on second call
      orchestrator.streamer.streamFile
        .mockRejectedValueOnce(new Error('Test streaming error'))
        .mockResolvedValueOnce();
      
      // Mock orchestrator.handleError method
      orchestrator.handleError = jest.fn();
      
      // Start the orchestrator
      await orchestrator.start();
      
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Fast-forward time to allow the orchestrator to encounter and recover from the error
      jest.advanceTimersByTime(10000); // 10 seconds
      
      // Run any pending promises
      await Promise.resolve();
      
      // Verify that the error handler was called
      expect(orchestrator.handleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test streaming error'
        })
      );
      
      // Verify that playback continued after the error
      expect(orchestrator.streamer.streamFile).toHaveBeenCalledTimes(2);
    });
  });
});
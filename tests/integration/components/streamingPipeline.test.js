const path = require('path');
const { spawn } = require('child_process');
const Streamer = require('../../../src/core/streamer');
const utils = require('../../../src/utils/index');

// Mock dependencies
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('../../../src/utils/index', () => ({
  spawnTrackedProcess: jest.fn(),
  extractMetadata: jest.fn(),
  fetchLiveVideoId: jest.fn(),
  readLiveChat: jest.fn(),
  runningProcesses: []
}));

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    youtube: jest.fn().mockReturnValue({
      liveBroadcasts: {
        list: jest.fn()
      },
      videos: {
        list: jest.fn()
      },
      liveChatMessages: {
        list: jest.fn()
      }
    })
  }
}));

describe('Streaming Pipeline Integration', () => {
  let streamer;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console methods to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Set up test fixtures
    const fixturesDir = path.join(__dirname, '../../../tests/fixtures');
    const testAudioPath = path.join(fixturesDir, 'test_audio.mp3');
    
    // Mock utils.extractMetadata to return test metadata
    utils.extractMetadata.mockReturnValue({
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      genre: 'Test Genre'
    });
    
    // Mock utils.fetchLiveVideoId to return a test video ID
    utils.fetchLiveVideoId.mockResolvedValue('test-video-id');
    
    // Mock utils.readLiveChat to return test comments
    utils.readLiveChat.mockResolvedValue([
      {
        id: 'comment1',
        authorDetails: {
          displayName: 'Test User 1'
        },
        snippet: {
          displayMessage: 'Great song! 5/5'
        }
      }
    ]);
    
    // Mock spawnTrackedProcess to return a mock process
    const mockProcess = {
      stdin: {
        write: jest.fn(),
        end: jest.fn()
      },
      stdout: {
        on: jest.fn()
      },
      stderr: {
        on: jest.fn()
      },
      on: jest.fn(),
      kill: jest.fn()
    };
    
    utils.spawnTrackedProcess.mockReturnValue(mockProcess);
    
    // Initialize streamer with test configuration
    streamer = new Streamer({
      streamMode: 'youtube',
      videoId: 'test-video-id',
      audioFormat: {
        sampleRate: 44100,
        channels: 2,
        encoding: 's16le'
      }
    });
  });
  
  describe('Audio Processing → FFmpeg Encoding → YouTube Streaming', () => {
    it('should set up FFmpeg process with correct parameters for streaming', async () => {
      // Start streaming
      await streamer.start();
      
      // Verify that spawnTrackedProcess was called with FFmpeg and correct parameters
      expect(utils.spawnTrackedProcess).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-f', 's16le',
          '-ar', '44100',
          '-ac', '2',
          '-i', 'pipe:0'  // Input from stdin
        ]),
        expect.objectContaining({
          stdio: expect.arrayContaining(['pipe', 'pipe', 'pipe'])
        })
      );
    });
    
    it('should stream audio file through FFmpeg pipeline', async () => {
      // Mock the FFmpeg process
      const mockProcess = {
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        stdout: {
          on: jest.fn()
        },
        stderr: {
          on: jest.fn()
        },
        on: jest.fn()
      };
      
      utils.spawnTrackedProcess.mockReturnValue(mockProcess);
      
      // Stream a test audio file
      await streamer.streamFile('/path/to/test_audio.mp3');
      
      // Verify that metadata was extracted
      expect(utils.extractMetadata).toHaveBeenCalledWith('/path/to/test_audio.mp3');
      
      // Verify that FFmpeg process was created
      expect(utils.spawnTrackedProcess).toHaveBeenCalled();
    });
  });
  
  describe('Overlay Generation → Video Integration', () => {
    it('should generate video overlay with track metadata', async () => {
      // Mock streamer.generateOverlay method
      streamer.generateOverlay = jest.fn();
      
      // Stream a test audio file with metadata
      const metadata = {
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album'
      };
      
      await streamer.streamFile('/path/to/test_audio.mp3', metadata);
      
      // Verify that generateOverlay was called with the correct metadata
      expect(streamer.generateOverlay).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album'
      }));
    });
  });
  
  describe('Live Chat Monitoring → Comment Processing', () => {
    it('should fetch and process live chat comments', async () => {
      // Mock fetchLiveVideoId to return a test video ID
      utils.fetchLiveVideoId.mockResolvedValue('test-video-id');
      
      // Mock readLiveChat to return test comments
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
      
      // Mock streamer.processComments method
      streamer.processComments = jest.fn();
      
      // Start streaming
      await streamer.start();
      
      // Simulate chat polling
      await streamer.pollChat();
      
      // Verify that readLiveChat was called with the correct video ID
      expect(utils.readLiveChat).toHaveBeenCalledWith('test-video-id');
      
      // Verify that processComments was called with the comments
      expect(streamer.processComments).toHaveBeenCalledWith([
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
    });
  });
  
  describe('Error Handling and Recovery', () => {
    it('should handle FFmpeg process errors', async () => {
      // Mock a process that will emit an error
      const mockProcess = {
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        stdout: {
          on: jest.fn()
        },
        stderr: {
          on: jest.fn()
        },
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'error') {
            // Simulate an error event
            handler(new Error('FFmpeg process error'));
          }
          return mockProcess;
        }),
        kill: jest.fn()
      };
      
      utils.spawnTrackedProcess.mockReturnValue(mockProcess);
      
      // Mock streamer.handleError method
      streamer.handleError = jest.fn();
      
      // Start streaming
      await streamer.start();
      
      // Verify that the error handler was called
      expect(streamer.handleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'FFmpeg process error'
        })
      );
    });
    
    it('should handle network disconnections', async () => {
      // Mock fetchLiveVideoId to initially return a video ID and then null (simulating disconnection)
      utils.fetchLiveVideoId
        .mockResolvedValueOnce('test-video-id')
        .mockResolvedValueOnce(null);
      
      // Mock streamer.reconnect method
      streamer.reconnect = jest.fn().mockResolvedValue(true);
      
      // Start streaming
      await streamer.start();
      
      // Simulate a network disconnection by calling pollChat again
      await streamer.pollChat();
      
      // Verify that reconnect was called
      expect(streamer.reconnect).toHaveBeenCalled();
    });
  });
});
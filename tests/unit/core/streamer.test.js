const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { jest: jestObject } = require('@jest/globals');
const EventEmitter = require('events');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('child_process');
jest.mock('../../../src/utils', () => ({
  spawnTrackedProcess: jest.fn()
}));
jest.mock('../../../src/core/config', () => ({
  STATION_CONFIG: {
    youtube: {
      rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
      streamKey: 'test-stream-key'
    },
    streamMode: 'youtube'
  },
  READY_DIR: jest.fn(type => `/mock/data/ready/${type}`)
}));

// Import mocked dependencies
const utils = require('../../../src/utils');

// Import the module under test
const streamer = require('../../../src/core/streamer');

describe('Streamer Module', () => {
  // Mock console methods
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  // Create mock process objects
  let mockAudioBuffer;
  let mockYoutubeStreamer;
  let mockLocalPlayer;
  let mockFileStreamer;

  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    
    // Mock fs
    fs.readdirSync.mockReturnValue(['cover1.jpg', 'cover2.png', 'not-an-image.txt']);
    fs.existsSync.mockReturnValue(true);
    fs.copyFileSync.mockImplementation(() => {});
    
    // Create mock process objects with EventEmitter functionality
    mockAudioBuffer = new EventEmitter();
    mockAudioBuffer.stdin = new EventEmitter();
    mockAudioBuffer.stdin.end = jest.fn();
    mockAudioBuffer.killed = false;
    mockAudioBuffer.kill = jest.fn();
    mockAudioBuffer.pid = 1001;
    
    mockYoutubeStreamer = new EventEmitter();
    mockYoutubeStreamer.killed = false;
    mockYoutubeStreamer.kill = jest.fn();
    mockYoutubeStreamer.pid = 1002;
    
    mockLocalPlayer = new EventEmitter();
    mockLocalPlayer.killed = false;
    mockLocalPlayer.kill = jest.fn();
    mockLocalPlayer.pid = 1003;
    
    mockFileStreamer = new EventEmitter();
    mockFileStreamer.stdout = new EventEmitter();
    mockFileStreamer.stdout.pipe = jest.fn(() => {
      const mockPipe = new EventEmitter();
      return mockPipe;
    });
    mockFileStreamer.killed = false;
    mockFileStreamer.kill = jest.fn();
    mockFileStreamer.pid = 1004;
    
    // Mock child_process
    childProcess.execSync.mockImplementation(() => {});
    
    // Mock utils.spawnTrackedProcess to return appropriate mock process
    utils.spawnTrackedProcess.mockImplementation((command, args) => {
      if (args.includes('pipe:0') && args.includes('/tmp/audio_buffer.fifo')) {
        return mockAudioBuffer;
      } else if (args.includes('rtmp://a.rtmp.youtube.com/live2/test-stream-key')) {
        return mockYoutubeStreamer;
      } else if (args.includes('pulse')) {
        return mockLocalPlayer;
      } else if (args.includes('pipe:1')) {
        return mockFileStreamer;
      }
      return new EventEmitter(); // Default fallback
    });
  });

  test('should get random cover image', () => {
    const coverImage = streamer.getRandomCoverImage();
    
    expect(fs.readdirSync).toHaveBeenCalled();
    expect(coverImage).toMatch(/\/mock\/data\/ready\/image\/(cover1\.jpg|cover2\.png)/);
    expect(coverImage).not.toMatch(/not-an-image\.txt/);
  });

  test('should throw error when no cover images are found', () => {
    fs.readdirSync.mockReturnValue(['not-an-image.txt']);
    
    expect(() => {
      streamer.getRandomCoverImage();
    }).toThrow('No images found in');
  });

  test('should initialize YouTube streamer', () => {
    streamer.startYouTubeStreamer();
    
    // Verify FIFO handling
    expect(fs.existsSync).toHaveBeenCalledWith('/tmp/audio_buffer.fifo');
    
    // Verify processes were spawned
    expect(utils.spawnTrackedProcess).toHaveBeenCalledTimes(2);
    
    // Verify audio buffer process was created with correct args
    expect(utils.spawnTrackedProcess).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining([
        '-f', 's16le',
        '-ar', '44100',
        '-ac', '2',
        '-i', 'pipe:0'
      ]),
      expect.anything()
    );
    
    // Verify YouTube streamer process was created with correct args
    expect(utils.spawnTrackedProcess).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining([
        '-i', '/tmp/overlay.png',
        '-i', '/tmp/audio_buffer.fifo',
        '-f', 'flv',
        'rtmp://a.rtmp.youtube.com/live2/test-stream-key'
      ]),
      expect.anything()
    );
    
    // Verify ffmpegStdin was set
    expect(streamer.getFfmpegStdin()).toBe(mockAudioBuffer.stdin);
  });

  test('should create FIFO if it does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    
    streamer.startYouTubeStreamer();
    
    expect(childProcess.execSync).toHaveBeenCalledWith('mkfifo /tmp/audio_buffer.fifo');
  });

  test('should handle errors in YouTube streamer initialization', () => {
    fs.existsSync.mockImplementation(() => {
      throw new Error('Test error');
    });
    
    expect(() => {
      streamer.startYouTubeStreamer();
    }).toThrow();
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Error initializing YouTube streamer:'),
      expect.anything()
    );
  });

  test('should play local file', async () => {
    const playPromise = streamer.playFile('/path/to/audio.mp3');
    
    // Simulate successful completion
    mockLocalPlayer.emit('close', 0);
    
    await playPromise;
    
    expect(utils.spawnTrackedProcess).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining([
        '-i', '/path/to/audio.mp3',
        '-f', 'pulse',
        'default'
      ]),
      expect.anything()
    );
  });

  test('should handle errors in local playback', async () => {
    const playPromise = streamer.playFile('/path/to/audio.mp3');
    
    // Simulate error
    mockLocalPlayer.emit('close', 1);
    
    await expect(playPromise).rejects.toThrow('FFmpeg playback exited with code 1');
  });

  test('should stream file to YouTube', async () => {
    // Initialize YouTube streamer first
    streamer.startYouTubeStreamer();
    
    const streamPromise = streamer.streamFile('/path/to/audio.mp3');
    
    // Simulate successful completion
    mockFileStreamer.emit('close', 0);
    
    await streamPromise;
    
    expect(utils.spawnTrackedProcess).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining([
        '-i', '/path/to/audio.mp3',
        '-f', 's16le',
        '-ar', '44100',
        '-ac', '2',
        'pipe:1'
      ]),
      expect.anything()
    );
    
    expect(mockFileStreamer.stdout.pipe).toHaveBeenCalledWith(
      mockAudioBuffer.stdin,
      { end: false }
    );
  });

  test('should handle errors in file streaming', async () => {
    // Initialize YouTube streamer first
    streamer.startYouTubeStreamer();
    
    const streamPromise = streamer.streamFile('/path/to/audio.mp3');
    
    // Simulate error
    mockFileStreamer.emit('error', new Error('Streaming error'));
    
    await expect(streamPromise).rejects.toThrow('Streaming error');
  });

  test('should handle pipe errors in file streaming', async () => {
    // Initialize YouTube streamer first
    streamer.startYouTubeStreamer();
    
    const streamPromise = streamer.streamFile('/path/to/audio.mp3');
    
    // Get the pipe mock
    const pipeMock = mockFileStreamer.stdout.pipe.mock.results[0].value;
    
    // Simulate pipe error
    pipeMock.emit('error', new Error('Pipe error'));
    
    await expect(streamPromise).rejects.toThrow('Pipe stream error: Pipe error');
    expect(mockFileStreamer.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('should stop YouTube streamer', async () => {
    // Initialize YouTube streamer first
    streamer.startYouTubeStreamer();
    
    // Mock setTimeout to execute immediately
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 999;
    });
    
    await streamer.stopYouTubeStreamer();
    
    expect(mockYoutubeStreamer.kill).toHaveBeenCalledWith('SIGINT');
    expect(mockAudioBuffer.stdin.end).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith('✅ YouTube streamer shutdown complete');
  });

  test('should handle errors when stopping YouTube streamer', async () => {
    // Initialize YouTube streamer first
    streamer.startYouTubeStreamer();
    
    // Make kill throw an error
    mockYoutubeStreamer.kill.mockImplementation(() => {
      throw new Error('Kill error');
    });
    
    // Make stdin.end throw an error
    mockAudioBuffer.stdin.end.mockImplementation(() => {
      throw new Error('End error');
    });
    
    // Mock setTimeout to execute immediately
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 999;
    });
    
    await streamer.stopYouTubeStreamer();
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to kill YouTube streamer process:'),
      'Kill error'
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to close FFmpeg stdin:'),
      'End error'
    );
  });
});
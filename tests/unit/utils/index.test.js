const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const NodeID3 = require('node-id3');

// Import the utils module
const utils = require('../../../src/utils/index');

// Mock dependencies
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
  unlinkSync: jest.fn()
}));

jest.mock('node-id3', () => ({
  read: jest.fn()
}));

// Mock the google API
jest.mock('googleapis', () => ({
  google: {
    youtube: jest.fn().mockReturnValue({
      liveBroadcasts: {
        list: jest.fn()
      },
      search: {
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

describe('Utils - File and Process Functions', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    sinon.restore();
  });

  describe('spawnTrackedProcess', () => {
    it('should spawn a process and track it', () => {
      // Mock the spawn function to return a mock process
      const mockProc = {
        on: jest.fn(),
        pid: 12345
      };
      spawn.mockReturnValue(mockProc);

      // Call the function
      const result = utils.spawnTrackedProcess('test-command', ['arg1', 'arg2']);

      // Verify the spawn function was called with the correct arguments
      expect(spawn).toHaveBeenCalledWith('test-command', ['arg1', 'arg2'], {});
      
      // Verify the process was tracked
      expect(utils.runningProcesses).toContain(mockProc);
      
      // Verify event listeners were added
      expect(mockProc.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockProc.on).toHaveBeenCalledWith('error', expect.any(Function));
      
      // Verify the function returned the process
      expect(result).toBe(mockProc);
    });

    it('should remove the process from tracking when it closes', () => {
      // Mock the spawn function to return a mock process
      const mockProc = {
        on: jest.fn(),
        pid: 12345
      };
      spawn.mockReturnValue(mockProc);

      // Capture the close handler
      let closeHandler;
      mockProc.on.mockImplementation((event, handler) => {
        if (event === 'close') closeHandler = handler;
      });

      // Call the function
      utils.spawnTrackedProcess('test-command', ['arg1', 'arg2']);
      
      // Verify the process was tracked
      expect(utils.runningProcesses).toContain(mockProc);
      
      // Simulate the process closing
      closeHandler();
      
      // Verify the process was removed from tracking
      expect(utils.runningProcesses).not.toContain(mockProc);
    });
  });

  describe('buildFallbackMetadata', () => {
    it('should build metadata from filename', () => {
      const result = utils.buildFallbackMetadata('/path/to/test-song.mp3');
      
      expect(result).toEqual({
        title: 'test-song',
        filename: 'test-song.mp3'
      });
    });
  });

  describe('extractMetadata', () => {
    it('should return fallback metadata if file does not exist', () => {
      // Mock fs.existsSync to return false
      fs.existsSync.mockReturnValue(false);
      
      const result = utils.extractMetadata('/path/to/nonexistent.mp3');
      
      expect(result).toEqual({
        title: 'nonexistent',
        filename: 'nonexistent.mp3'
      });
    });

    it('should return fallback metadata if file is empty', () => {
      // Mock fs.existsSync to return true and fs.statSync to return size 0
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 0 });
      
      const result = utils.extractMetadata('/path/to/empty.mp3');
      
      expect(result).toEqual({
        title: 'empty',
        filename: 'empty.mp3'
      });
    });

    it('should return fallback metadata if no ID3 tags are found', () => {
      // Mock fs.existsSync to return true and fs.statSync to return size > 0
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 });
      
      // Mock NodeID3.read to return null
      NodeID3.read.mockReturnValue(null);
      
      const result = utils.extractMetadata('/path/to/no-tags.mp3');
      
      expect(result).toEqual({
        title: 'no-tags',
        filename: 'no-tags.mp3'
      });
    });

    it('should extract metadata from ID3 tags', () => {
      // Mock fs.existsSync to return true and fs.statSync to return size > 0
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 });
      
      // Mock NodeID3.read to return tags
      NodeID3.read.mockReturnValue({
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        genre: 'Test Genre',
        comment: 'Test Comment'
      });
      
      const result = utils.extractMetadata('/path/to/song.mp3');
      
      expect(result).toEqual({
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        genre: 'Test Genre',
        comment: 'Test Comment',
        filename: 'song.mp3'
      });
    });

    it('should handle image data in ID3 tags', () => {
      // Mock fs.existsSync to return true and fs.statSync to return size > 0
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 });
      
      // Mock NodeID3.read to return tags with image
      const imageBuffer = Buffer.from('test-image-data');
      NodeID3.read.mockReturnValue({
        title: 'Test Song',
        image: {
          imageBuffer,
          mime: 'image/jpeg'
        }
      });
      
      const result = utils.extractMetadata('/path/to/song.mp3');
      
      expect(result).toEqual({
        title: 'Test Song',
        artist: null,
        album: null,
        genre: null,
        comment: null,
        filename: 'song.mp3',
        picture: {
          data: imageBuffer,
          mime: 'image/jpeg'
        }
      });
    });
  });

  describe('moveFileToPlayed', () => {
    it('should delete segway files instead of moving them', () => {
      // Mock path.dirname to return the ready directory
      const readyDir = path.join(__dirname, 'ready', 'segway');
      sinon.stub(path, 'dirname').returns(readyDir);
      
      utils.moveFileToPlayed('/path/to/segway.mp3', 'segway');
      
      // Verify fs.unlinkSync was called
      expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/segway.mp3');
      
      // Verify fs.renameSync was not called
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('should move non-segway files to the played directory', () => {
      // Mock path.dirname to return the ready directory for the first call
      // and something else for subsequent calls
      const readyDir = path.join(__dirname, 'ready', 'music');
      sinon.stub(path, 'dirname');
      path.dirname.onFirstCall().returns(readyDir);
      path.dirname.onSecondCall().returns('/some/other/path');
      
      // Mock path.basename to return the filename
      sinon.stub(path, 'basename').returns('song.mp3');
      
      // Mock path.join to return the target path
      const playedDir = path.join(__dirname, 'played', 'music');
      const targetPath = path.join(playedDir, 'song.mp3');
      sinon.stub(path, 'join');
      path.join.onFirstCall().returns(playedDir);
      path.join.onSecondCall().returns(targetPath);
      
      utils.moveFileToPlayed('/path/to/song.mp3', 'music');
      
      // Verify fs.mkdirSync was called
      expect(fs.mkdirSync).toHaveBeenCalledWith(playedDir, { recursive: true });
      
      // Verify fs.renameSync was called
      expect(fs.renameSync).toHaveBeenCalledWith('/path/to/song.mp3', targetPath);
    });
  });

  describe('killAllTrackedProcesses', () => {
    it('should resolve immediately if no processes are running', async () => {
      // Clear the runningProcesses array
      utils.runningProcesses.length = 0;
      
      // Mock console.log to verify it was called
      const consoleLogSpy = jest.spyOn(console, 'log');
      
      await utils.killAllTrackedProcesses();
      
      // Verify console.log was called with the expected message
      expect(consoleLogSpy).toHaveBeenCalledWith('No processes to kill. Cleanup complete.');
    });

    it('should attempt to kill all running processes', async () => {
      // Create mock processes
      const mockProc1 = {
        pid: 12345,
        killed: false,
        kill: jest.fn()
      };
      const mockProc2 = {
        pid: 67890,
        killed: false,
        kill: jest.fn()
      };
      
      // Add the mock processes to the runningProcesses array
      utils.runningProcesses.push(mockProc1, mockProc2);
      
      // Mock setTimeout to call the callback immediately
      jest.useFakeTimers();
      
      // Start the kill process
      const promise = utils.killAllTrackedProcesses();
      
      // Verify SIGTERM was sent to both processes
      expect(mockProc1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProc2.kill).toHaveBeenCalledWith('SIGTERM');
      
      // Fast-forward the timer
      jest.runAllTimers();
      
      // Wait for the promise to resolve
      await promise;
      
      // Verify the runningProcesses array was cleared
      expect(utils.runningProcesses.length).toBe(0);
    });
  });
});
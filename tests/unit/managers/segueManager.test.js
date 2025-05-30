/**
 * Unit tests for the SegueManager
 */

const segwayManager = require('../../../src/managers/segwayManager');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../src/utils/ttsHelper', () => ({
  generateTTS: jest.fn().mockResolvedValue('/path/to/mock/segue.mp3')
}));
jest.mock('../../../src/utils/openaiHelper', () => ({
  generateText: jest.fn().mockResolvedValue('This is a mock segue text')
}));

// Mock configuration
jest.mock('../../../src/core/config', () => ({
  get: jest.fn().mockImplementation((key) => {
    const config = {
      'schedule.autoSegways.enabled': true,
      'schedule.autoSegways.transitionChances': {
        'music->music': 0.8,
        'music->ad': 0.5,
        'ad->music': 0.7,
        'talk->music': 0.6,
        'intro->music': 0.9
      },
      'segwayFunny': 0.25,
      'aiPrompts.segue': 'Generate a segue between tracks',
      'aiPrompts.segwayFunny': 'Generate a funny segue between tracks',
      'ttsProfiles.segue': 'en-US-Neural2-D',
      'enhancedEngagement.segwayReferenceChance': 0.3
    };
    return key.split('.').reduce((o, i) => o[i], config);
  })
}));

describe('SegueManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock file system functions
    fs.promises = {
      readdir: jest.fn().mockResolvedValue(['segway_1234567890.mp3', 'segway_0987654321.mp3']),
      stat: jest.fn().mockResolvedValue({
        mtime: new Date(Date.now() - 60000), // 1 minute ago
        isFile: () => true
      }),
      unlink: jest.fn().mockResolvedValue(undefined)
    };
    
    path.join = jest.fn().mockImplementation((...args) => args.join('/'));
    path.resolve = jest.fn().mockImplementation((...args) => args.join('/'));
  });

  // Test ID: SM-UT-01
  describe('shouldGenerateSegway', () => {
    test('should return true for music->music transition with high probability', () => {
      const result = segwayManager.shouldGenerateSegway('music', 'music');
      expect(result).toBe(true);
    });

    test('should return false when autoSegways is disabled', () => {
      jest.spyOn(require('../../../src/core/config'), 'get')
        .mockImplementationOnce(() => false);
      
      const result = segwayManager.shouldGenerateSegway('music', 'music');
      expect(result).toBe(false);
    });

    test('should return false for transitions with 0% chance', () => {
      jest.spyOn(require('../../../src/core/config'), 'get')
        .mockImplementationOnce((key) => {
          if (key === 'schedule.autoSegways.transitionChances.music->ad') {
            return 0;
          }
          return true;
        });
      
      const result = segwayManager.shouldGenerateSegway('music', 'ad');
      expect(result).toBe(false);
    });
  });

  // Test ID: SM-UT-02
  describe('generateSegway', () => {
    test('should generate segue text for music-to-music transition', async () => {
      const prevMeta = { type: 'music', title: 'Previous Track', artist: 'Artist A' };
      const nextMeta = { type: 'music', title: 'Next Track', artist: 'Artist B' };
      const prevTracks = [{ meta: { title: 'Track 1', artist: 'Artist C' } }];
      const nextTracks = [{ meta: { title: 'Track 2', artist: 'Artist D' } }];
      
      const result = await segwayManager.generateSegway(prevMeta, nextMeta, prevTracks, nextTracks);
      
      expect(result).toBe('This is a mock segue text');
      expect(require('../../../src/utils/openaiHelper').generateText).toHaveBeenCalled();
    });

    test('should handle missing context gracefully', async () => {
      const prevMeta = null;
      const nextMeta = { type: 'music', title: 'Next Track', artist: 'Artist B' };
      
      const result = await segwayManager.generateSegway(prevMeta, nextMeta, [], []);
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  // Test ID: SM-UT-04
  describe('prepareSegway', () => {
    test('should prepare segue audio file', async () => {
      const segwayText = 'This is a test segue';
      const key = 'music->music';
      
      const result = await segwayManager.prepareSegway(segwayText, key);
      
      expect(result).toBe('/path/to/mock/segue.mp3');
      expect(require('../../../src/utils/ttsHelper').generateTTS).toHaveBeenCalledWith(
        segwayText,
        expect.any(String),
        expect.any(String)
      );
    });

    test('should handle errors gracefully', async () => {
      const segwayText = 'This is a test segue';
      const key = 'music->music';
      
      require('../../../src/utils/ttsHelper').generateTTS.mockRejectedValueOnce(new Error('TTS error'));
      
      await expect(segwayManager.prepareSegway(segwayText, key)).rejects.toThrow('TTS error');
    });
  });

  // Test ID: SM-UT-05
  describe('removeOldSegways', () => {
    test('should remove old segue files', async () => {
      const contentQueue = [
        { segue: 'segway_1234567890.mp3' }, // Referenced in queue
      ];
      const currentlyPlaying = null;
      
      await segwayManager.removeOldSegways(contentQueue, currentlyPlaying);
      
      // Should delete the unreferenced file
      expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('segway_0987654321.mp3'));
      // Should not delete the referenced file
      expect(fs.promises.unlink).not.toHaveBeenCalledWith(expect.stringContaining('segway_1234567890.mp3'));
    });

    test('should protect currently playing segue file', async () => {
      const contentQueue = [];
      const currentlyPlaying = 'segway_0987654321.mp3';
      
      await segwayManager.removeOldSegways(contentQueue, currentlyPlaying);
      
      // Should not delete the currently playing file
      expect(fs.promises.unlink).not.toHaveBeenCalledWith(expect.stringContaining('segway_0987654321.mp3'));
      // Should delete the other file
      expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('segway_1234567890.mp3'));
    });
  });
});
const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../src/processors/podcastParser');
jest.mock('../../../src/managers/voiceManager');
jest.mock('../../../src/processors/audioSynthesizer');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('Podcast Generator', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    path.dirname.mockImplementation((filePath) => {
      const parts = filePath.split('/');
      parts.pop();
      return parts.join('/');
    });
    
    // Mock fs
    fs.existsSync.mockReturnValue(true);
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
    fs.statSync.mockReturnValue({ size: 1024 });
    
    // Mock podcastParser
    const podcastParser = require('../../../src/processors/podcastParser');
    podcastParser.generateScript.mockResolvedValue('# Test Podcast Script\n\nHOST1: Hello and welcome to our podcast!\nGUEST1: Thanks for having me.');
    podcastParser.parseScript.mockReturnValue([
      { character: 'HOST1', role: 'host', text: 'Hello and welcome to our podcast!' },
      { character: 'GUEST1', role: 'guest', text: 'Thanks for having me.' }
    ]);
    podcastParser.processParticipantData.mockResolvedValue(true);
    
    // Mock voiceManager
    const voiceManager = require('../../../src/managers/voiceManager');
    voiceManager.assignVoiceToName.mockImplementation(async (name, role, gender) => {
      return {
        voiceName: `${gender}-voice-${name}`,
        speakerId: `speaker-${name}`
      };
    });
    
    // Mock audioSynthesizer
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    audioSynthesizer.synthesizeSpeechWithVoice.mockResolvedValue(true);
    audioSynthesizer.stitchAudio.mockImplementation((files, output) => output);
  });

  test('should generate podcast from prompt', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      topic: 'Technology',
      durationMinutes: 5,
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast was generated successfully
    expect(result.success).toBe(true);
    expect(result.outputFile).toBe('/mock/output/podcast.mp3');
    
    // Verify that the script was generated and saved
    const podcastParser = require('../../../src/processors/podcastParser');
    expect(podcastParser.generateScript).toHaveBeenCalledWith(
      'Generate a podcast about technology',
      5,
      expect.objectContaining({
        hostNames: ['HOST1'],
        guestNames: ['GUEST1'],
        participantData: expect.any(Object)
      }),
      true
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/mock/temp/script.txt',
      expect.any(String),
      'utf8'
    );
    
    // Verify that the script was parsed
    expect(podcastParser.parseScript).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        hostNames: ['HOST1'],
        guestNames: ['GUEST1'],
        participantData: expect.any(Object)
      })
    );
    
    // Verify that voices were assigned
    const voiceManager = require('../../../src/managers/voiceManager');
    expect(voiceManager.assignVoiceToName).toHaveBeenCalledWith('HOST1', 'host', 'male');
    expect(voiceManager.assignVoiceToName).toHaveBeenCalledWith('GUEST1', 'guest', 'female');
    
    // Verify that speech was synthesized
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    expect(audioSynthesizer.synthesizeSpeechWithVoice).toHaveBeenCalledTimes(2);
    
    // Verify that audio was stitched
    expect(audioSynthesizer.stitchAudio).toHaveBeenCalledWith(
      expect.any(Array),
      '/mock/output/podcast.mp3'
    );
  });

  test('should generate podcast from topic', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    const opts = {
      topic: 'Technology',
      durationMinutes: 5,
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast was generated successfully
    expect(result.success).toBe(true);
    
    // Verify that the script was generated with the topic
    const podcastParser = require('../../../src/processors/podcastParser');
    expect(podcastParser.generateScript).toHaveBeenCalledWith(
      'Technology',
      5,
      expect.anything(),
      false
    );
  });

  test('should extract topic from participant metadata', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    const opts = {
      durationMinutes: 5,
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { 
          gender: 'male', 
          role: 'host',
          _metadata: {
            topic: 'Artificial Intelligence'
          }
        },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast was generated successfully
    expect(result.success).toBe(true);
    
    // Verify that the script was generated with the topic from metadata
    const podcastParser = require('../../../src/processors/podcastParser');
    expect(podcastParser.generateScript).toHaveBeenCalledWith(
      'Artificial Intelligence',
      5,
      expect.anything(),
      false
    );
  });

  test('should extract duration from participant metadata', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    const opts = {
      topic: 'Technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { 
          gender: 'male', 
          role: 'host',
          _metadata: {
            durationMinutes: 10
          }
        },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast was generated successfully
    expect(result.success).toBe(true);
    
    // Verify that the script was generated with the duration from metadata
    const podcastParser = require('../../../src/processors/podcastParser');
    expect(podcastParser.generateScript).toHaveBeenCalledWith(
      'Technology',
      10,
      expect.anything(),
      false
    );
  });

  test('should throw error when no prompt or topic is provided', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    const opts = {
      durationMinutes: 5,
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast generation failed
    expect(result.success).toBe(false);
    expect(result.error).toBe('No prompt or topic provided');
  });

  test('should handle script generation errors', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    // Mock script generation to fail
    const podcastParser = require('../../../src/processors/podcastParser');
    podcastParser.generateScript.mockRejectedValue(new Error('Script generation failed'));
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast generation failed
    expect(result.success).toBe(false);
    expect(result.error).toBe('Script generation failed');
  });

  test('should handle script parsing errors', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    // Mock script parsing to return empty array
    const podcastParser = require('../../../src/processors/podcastParser');
    podcastParser.parseScript.mockReturnValue([]);
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast generation failed
    expect(result.success).toBe(false);
    expect(result.error).toBe('No parts parsed from script');
  });

  test('should handle speech synthesis errors', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    // Mock speech synthesis to fail
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    audioSynthesizer.synthesizeSpeechWithVoice.mockRejectedValue(new Error('Speech synthesis failed'));
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast generation failed
    expect(result.success).toBe(false);
    expect(result.error).toBe('No audio generated. Script saved for debugging: /mock/temp/script.txt');
  });

  test('should handle empty audio files', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    // Mock fs.statSync to return size 0
    fs.statSync.mockReturnValue({ size: 0 });
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast generation failed
    expect(result.success).toBe(false);
    expect(result.error).toBe('No audio generated. Script saved for debugging: /mock/temp/script.txt');
  });

  test('should handle audio stitching errors', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    // Mock audio stitching to throw error
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    audioSynthesizer.stitchAudio.mockImplementation(() => {
      throw new Error('Audio stitching failed');
    });
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast generation failed
    expect(result.success).toBe(false);
    expect(result.error).toBe('Audio stitching failed');
  });

  test('should create parent directories for clips', async () => {
    const podcastGenerator = require('../../../src/processors/podcastGenerator');
    
    // Mock fs.existsSync to return false for parent directory
    fs.existsSync.mockReturnValueOnce(true) // For tempDirectory
                  .mockReturnValueOnce(false); // For parent directory
    
    const opts = {
      prompt: 'Generate a podcast about technology',
      outputFileName: '/mock/output/podcast.mp3',
      tempDirectory: '/mock/temp',
      hostNames: ['HOST1'],
      guestNames: ['GUEST1'],
      participantData: {
        'HOST1': { gender: 'male', role: 'host' },
        'GUEST1': { gender: 'female', role: 'guest' }
      }
    };
    
    const result = await podcastGenerator.run(opts);
    
    // Verify that the podcast was generated successfully
    expect(result.success).toBe(true);
    
    // Verify that parent directories were created
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('/mock/temp/speaker-HOST1'),
      expect.objectContaining({ recursive: true })
    );
  });
});
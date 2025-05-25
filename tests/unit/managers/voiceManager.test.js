const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('crypto');
jest.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    listVoices: jest.fn().mockResolvedValue([{
      voices: [
        {
          name: 'en-US-Wavenet-A',
          languageCodes: ['en-US'],
          ssmlGender: 'MALE'
        },
        {
          name: 'en-US-Wavenet-B',
          languageCodes: ['en-US'],
          ssmlGender: 'MALE'
        },
        {
          name: 'en-US-Wavenet-C',
          languageCodes: ['en-US'],
          ssmlGender: 'FEMALE'
        },
        {
          name: 'en-US-Wavenet-D',
          languageCodes: ['en-US'],
          ssmlGender: 'FEMALE'
        },
        {
          name: 'en-US-Wavenet-E',
          languageCodes: ['en-US'],
          ssmlGender: 'NEUTRAL'
        },
        {
          name: 'fr-FR-Wavenet-A',
          languageCodes: ['fr-FR'],
          ssmlGender: 'MALE'
        }
      ]
    }])
  }))
}));
jest.mock('../../../src/core/config', () => ({
  STATION_CONFIG: {
    ttsProfiles: {
      dj: 'en-US-Wavenet-A',
      host: 'en-US-Wavenet-C'
    },
    ttsAllowedPatterns: ['en-US-*']
  }
}));

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('Voice Manager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    
    // Mock fs
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    
    // Mock crypto
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('abcdef1234567890')
    };
    crypto.createHash.mockReturnValue(mockHash);
    
    // Reset module cache to test initialization
    jest.resetModules();
  });

  test('should initialize available voices', async () => {
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Call assignVoiceToName to trigger initialization
    await voiceManager.assignVoiceToName('TestName', 'TestRole', 'male');
    
    // Verify that listVoices was called
    const TextToSpeechClient = require('@google-cloud/text-to-speech').TextToSpeechClient;
    expect(TextToSpeechClient).toHaveBeenCalled();
    expect(TextToSpeechClient.mock.results[0].value.listVoices).toHaveBeenCalled();
  });

  test('should load existing voice mapping', async () => {
    // Mock existing mapping file
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      'ExistingName': {
        voiceName: 'en-US-Wavenet-B',
        speakerId: '123456'
      }
    }));
    
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Call assignVoiceToName with existing name
    const result = await voiceManager.assignVoiceToName('ExistingName', 'TestRole', 'male');
    
    // Verify that the existing mapping was returned
    expect(result).toEqual({
      voiceName: 'en-US-Wavenet-B',
      speakerId: '123456'
    });
    
    // Verify that no new mapping was saved
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('should assign male voice when requested', async () => {
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Call assignVoiceToName with male gender
    const result = await voiceManager.assignVoiceToName('TestMale', 'TestRole', 'male');
    
    // Verify that a male voice was assigned
    expect(result.voiceName).toBe('en-US-Wavenet-B');
    expect(result.speakerId).toBe('abcdef');
    
    // Verify that the mapping was saved
    expect(fs.writeFileSync).toHaveBeenCalled();
    
    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should assign female voice when requested', async () => {
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Call assignVoiceToName with female gender
    const result = await voiceManager.assignVoiceToName('TestFemale', 'TestRole', 'female');
    
    // Verify that a female voice was assigned
    expect(result.voiceName).toBe('en-US-Wavenet-D');
    expect(result.speakerId).toBe('abcdef');
    
    // Verify that the mapping was saved
    expect(fs.writeFileSync).toHaveBeenCalled();
    
    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should assign neutral voice when requested', async () => {
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Call assignVoiceToName with neutral gender
    const result = await voiceManager.assignVoiceToName('TestNeutral', 'TestRole', 'neutral');
    
    // Verify that a neutral voice was assigned
    expect(result.voiceName).toBe('en-US-Wavenet-E');
    expect(result.speakerId).toBe('abcdef');
    
    // Verify that the mapping was saved
    expect(fs.writeFileSync).toHaveBeenCalled();
    
    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should fallback to other genders when requested gender has no voices', async () => {
    // Mock TextToSpeechClient to return no neutral voices
    jest.mock('@google-cloud/text-to-speech', () => ({
      TextToSpeechClient: jest.fn().mockImplementation(() => ({
        listVoices: jest.fn().mockResolvedValue([{
          voices: [
            {
              name: 'en-US-Wavenet-A',
              languageCodes: ['en-US'],
              ssmlGender: 'MALE'
            },
            {
              name: 'en-US-Wavenet-C',
              languageCodes: ['en-US'],
              ssmlGender: 'FEMALE'
            }
          ]
        }])
      }))
    }));
    
    // Reset modules to apply new mock
    jest.resetModules();
    
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Call assignVoiceToName with neutral gender
    const result = await voiceManager.assignVoiceToName('TestNeutral', 'TestRole', 'neutral');
    
    // Verify that a voice was assigned (should fallback to male or female)
    expect(result.voiceName).toBeDefined();
    expect(result.speakerId).toBe('abcdef');
    
    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should filter voices based on allowed patterns', async () => {
    // Mock config with specific allowed patterns
    jest.mock('../../../src/core/config', () => ({
      STATION_CONFIG: {
        ttsProfiles: {
          dj: 'en-US-Wavenet-A',
          host: 'en-US-Wavenet-C'
        },
        ttsAllowedPatterns: ['en-US-Wavenet-B', 'en-US-Wavenet-D']
      }
    }));
    
    // Reset modules to apply new mock
    jest.resetModules();
    
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Call assignVoiceToName with male gender
    const resultMale = await voiceManager.assignVoiceToName('TestMale', 'TestRole', 'male');
    
    // Verify that only the allowed male voice was assigned
    expect(resultMale.voiceName).toBe('en-US-Wavenet-B');
    
    // Call assignVoiceToName with female gender
    const resultFemale = await voiceManager.assignVoiceToName('TestFemale', 'TestRole', 'female');
    
    // Verify that only the allowed female voice was assigned
    expect(resultFemale.voiceName).toBe('en-US-Wavenet-D');
    
    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should exclude built-in voices from assignment', async () => {
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return a predictable value
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Call assignVoiceToName with male gender
    const result = await voiceManager.assignVoiceToName('TestMale', 'TestRole', 'male');
    
    // Verify that the built-in voice (en-US-Wavenet-A) was not assigned
    expect(result.voiceName).not.toBe('en-US-Wavenet-A');
    
    // Restore Math.random
    mockRandom.mockRestore();
  });

  test('should throw error when no voices are available', async () => {
    // Mock TextToSpeechClient to return no voices
    jest.mock('@google-cloud/text-to-speech', () => ({
      TextToSpeechClient: jest.fn().mockImplementation(() => ({
        listVoices: jest.fn().mockResolvedValue([{
          voices: []
        }])
      }))
    }));
    
    // Reset modules to apply new mock
    jest.resetModules();
    
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Call assignVoiceToName and expect it to throw
    await expect(voiceManager.assignVoiceToName('TestName', 'TestRole', 'male'))
      .rejects.toThrow('No TTS voices left to assign!');
  });

  test('should remove assigned voice from all pools', async () => {
    // Import the module
    const voiceManager = require('../../../src/managers/voiceManager');
    
    // Mock Math.random to return predictable values
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    
    // Assign two different voices
    await voiceManager.assignVoiceToName('TestName1', 'TestRole', 'male');
    await voiceManager.assignVoiceToName('TestName2', 'TestRole', 'male');
    
    // Verify that different voices were assigned (first voice should be removed from pool)
    const savedMapping = JSON.parse(fs.writeFileSync.mock.calls[1][1]);
    expect(savedMapping.TestName1.voiceName).not.toBe(savedMapping.TestName2.voiceName);
    
    // Restore Math.random
    mockRandom.mockRestore();
  });
});
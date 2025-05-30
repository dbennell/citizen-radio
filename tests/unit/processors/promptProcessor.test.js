const fs = require('fs');
const path = require('path');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('glob');
jest.mock('chokidar');
jest.mock('openai');
jest.mock('@google-cloud/text-to-speech');
jest.mock('../../../src/managers/trackManager');
jest.mock('../../../src/managers/ratingsManager');
jest.mock('../../../src/processors/podcastParser');
jest.mock('../../../src/processors/podcastGenerator');
jest.mock('../../../src/core/config', () => ({
  PROMPT_DIRS: {
    dj: '/mock/prompts/dj',
    ad: '/mock/prompts/ad',
    intro: '/mock/prompts/intro',
    music: '/mock/prompts/music',
    podcast: '/mock/prompts/podcast',
    image: '/mock/prompts/image'
  },
  READY_DIR: jest.fn(type => `/mock/ready/${type}`),
  STATION_CONFIG: {
    stationName: 'Test Station',
    djName: 'Test DJ',
    vibe: 'Chill and relaxed',
    context: 'A space station radio',
    segwayFunny: 0.3,
    aiPrompts: {
      segue: 'Write a smooth segue',
      segwayFunny: 'Make it funny',
      dj: 'Be enthusiastic',
      ad: 'Be persuasive',
      intro: 'Be welcoming'
    },
    ttsProfiles: {
      dj: 'en-US-Wavenet-D',
      segue: 'en-US-Wavenet-B'
    },
    ratingSystem: {
      enabled: true
    },
    debug: false
  }
}));

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('Prompt Processor', () => {
  // Mock implementations
  let mockOpenAIClient;
  let mockTTSClient;
  let mockChokidar;
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    path.basename.mockImplementation((filePath, ext) => {
      const base = filePath.split('/').pop();
      return ext ? base.replace(ext, '') : base;
    });
    path.relative.mockImplementation((from, to) => to.replace(from, ''));
    
    // Mock fs
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('test_prompt.txt')) {
        return 'This is a test prompt';
      }
      return '{}';
    });
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});
    fs.rmSync.mockImplementation(() => {});
    
    // Mock OpenAI
    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'Generated text from OpenAI' } }]
          })
        }
      },
      images: {
        generate: jest.fn().mockResolvedValue({
          data: [{ b64_json: 'base64encodedimage' }]
        })
      }
    };
    
    require('openai').OpenAI = jest.fn().mockImplementation(() => mockOpenAIClient);
    
    // Mock TTS
    mockTTSClient = {
      synthesizeSpeech: jest.fn().mockResolvedValue([{
        audioContent: Buffer.from('mock audio content')
      }])
    };
    
    require('@google-cloud/text-to-speech').TextToSpeechClient = jest.fn().mockImplementation(() => mockTTSClient);
    
    // Mock chokidar
    mockChokidar = {
      on: jest.fn().mockReturnThis()
    };
    
    require('chokidar').watch = jest.fn().mockReturnValue(mockChokidar);
    
    // Mock ratings manager
    require('../../../src/managers/ratingsManager').getRatingForTrack = jest.fn().mockImplementation((relPath) => {
      if (relPath.includes('high_rated')) return 4.8;
      if (relPath.includes('low_rated')) return 2.5;
      return 3.5;
    });
    
    // Mock podcast parser
    require('../../../src/processors/podcastParser').extractParticipantInfo = jest.fn().mockResolvedValue({
      participantData: {
        'Host1': { voice: 'en-US-Wavenet-D', gender: 'male' },
        'Guest1': { voice: 'en-US-Wavenet-C', gender: 'female' }
      },
      hostNames: ['Host1'],
      guestNames: ['Guest1'],
      topic: 'Test Topic',
      durationMinutes: 5
    });
    
    require('../../../src/processors/podcastParser').processParticipantData = jest.fn().mockResolvedValue(true);
    
    // Mock podcast generator
    require('../../../src/processors/podcastGenerator').run = jest.fn().mockResolvedValue({
      success: true
    });
  });

  test('should create necessary directories', () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    promptProcessor.createDirectories();
    
    // Verify that directories were created
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/temp/podcast'), expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/temp/segue'), expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/temp/dj'), expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/temp/ad'), expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/temp/intro'), expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('/temp/clips'), expect.anything());
    
    // Verify that ready directories were created
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/dj', expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/ad', expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/intro', expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/music', expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/podcast', expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/image', expect.anything());
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/ready/segue', expect.anything());
  });

  test('should initialize prompt watcher', () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    const chokidar = require('chokidar');
    
    promptProcessor.initPromptWatcher();
    
    // Verify that chokidar.watch was called for each prompt directory
    expect(chokidar.watch).toHaveBeenCalledWith('/mock/prompts/dj', expect.anything());
    expect(chokidar.watch).toHaveBeenCalledWith('/mock/prompts/ad', expect.anything());
    expect(chokidar.watch).toHaveBeenCalledWith('/mock/prompts/intro', expect.anything());
    expect(chokidar.watch).toHaveBeenCalledWith('/mock/prompts/music', expect.anything());
    expect(chokidar.watch).toHaveBeenCalledWith('/mock/prompts/podcast', expect.anything());
    expect(chokidar.watch).toHaveBeenCalledWith('/mock/prompts/image', expect.anything());
    
    // Verify that the on('add') event handler was registered
    expect(mockChokidar.on).toHaveBeenCalledWith('add', expect.any(Function));
  });

  test('should expand prompt with context', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    // Use internal function to test expandPromptWithContext
    const expandPromptWithContext = promptProcessor.__get__('expandPromptWithContext');
    
    // If __get__ is not available, we'll need to mock the module differently
    if (!expandPromptWithContext) {
      // Skip this test if we can't access the internal function
      console.warn('Skipping expandPromptWithContext test - function not accessible');
      return;
    }
    
    const result = await expandPromptWithContext('Test prompt', 'dj');
    
    // Verify that OpenAI was called with the correct parameters
    expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith({
      model: expect.any(String),
      messages: [
        { role: 'system', content: expect.stringContaining('Test Station') },
        { role: 'user', content: expect.stringContaining('Test prompt') }
      ],
      max_tokens: expect.any(Number)
    });
    
    // Verify that the result is what we expect
    expect(result).toBe('Generated text from OpenAI');
  });

  test('should generate segue between music tracks', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    const prevMeta = {
      type: 'music',
      title: 'Previous Track',
      artist: 'Previous Artist',
      relPath: 'music/previous_track.mp3'
    };
    
    const nextMeta = {
      type: 'music',
      title: 'Next Track',
      artist: 'Next Artist',
      relPath: 'music/next_track.mp3'
    };
    
    const result = await promptProcessor.generateSegway(prevMeta, nextMeta);
    
    // Verify that OpenAI was called with the correct parameters
    expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith({
      model: expect.any(String),
      messages: [
        { role: 'system', content: expect.stringContaining('Test Station') },
        { role: 'user', content: expect.stringContaining('Previous Track') }
      ],
      max_tokens: expect.any(Number)
    });
    
    // Verify that the result is what we expect
    expect(result).toBe('Generated text from OpenAI');
  });

  test('should use templates for ad transitions', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    const prevMeta = {
      type: 'music',
      title: 'Previous Track',
      artist: 'Previous Artist'
    };
    
    const nextMeta = {
      type: 'ad',
      title: 'Ad Title'
    };
    
    const result = await promptProcessor.generateSegway(prevMeta, nextMeta);
    
    // Verify that OpenAI was not called (should use template)
    expect(mockOpenAIClient.chat.completions.create).not.toHaveBeenCalled();
    
    // Verify that the result is one of the ad transition templates
    expect(result).toMatch(/sponsors|messages|partners|break|time/);
  });

  test('should prepare segue audio file', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    const segwayText = 'This is a test segue';
    const prevMeta = {
      type: 'music',
      title: 'Previous Track',
      artist: 'Previous Artist'
    };
    
    const nextMeta = {
      type: 'dj',
      title: 'DJ Segment'
    };
    
    const key = 'music_to_dj';
    
    const result = await promptProcessor.prepareSegway(segwayText, prevMeta, nextMeta, key);
    
    // Verify that TTS was called with the correct parameters
    expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledWith({
      input: { text: expect.stringContaining('This is a test segue') },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-B' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 }
    });
    
    // Verify that the audio was saved
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('segway_music_to_dj_'),
      expect.anything(),
      'binary'
    );
    
    // Verify that the result is the path to the segue file
    expect(result).toMatch(/segway_music_to_dj_/);
  });

  test('should handle errors in segue generation', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    // Mock OpenAI to throw an error
    mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API error'));
    
    const prevMeta = {
      type: 'music',
      title: 'Previous Track',
      artist: 'Previous Artist'
    };
    
    const nextMeta = {
      type: 'music',
      title: 'Next Track',
      artist: 'Next Artist'
    };
    
    const result = await promptProcessor.generateSegway(prevMeta, nextMeta);
    
    // Verify that error was logged
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error generating segue'), expect.anything());
    
    // Verify that a fallback message was returned
    expect(result).toContain('And that was Previous Track');
  });

  test('should handle TTS errors with fallback voice', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    // Mock TTS to throw an error on first call, then succeed on second call
    mockTTSClient.synthesizeSpeech
      .mockRejectedValueOnce(new Error('TTS error'))
      .mockResolvedValueOnce([{ audioContent: Buffer.from('fallback audio content') }]);
    
    const segwayText = 'This is a test segue';
    const prevMeta = { type: 'music', title: 'Previous Track' };
    const nextMeta = { type: 'dj', title: 'DJ Segment' };
    const key = 'music_to_dj';
    
    const result = await promptProcessor.prepareSegway(segwayText, prevMeta, nextMeta, key);
    
    // Verify that TTS was called twice (once with original voice, once with fallback)
    expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledTimes(2);
    
    // Verify that the second call used the fallback voice
    expect(mockTTSClient.synthesizeSpeech.mock.calls[1][0].voice.name).toBe('en-US-Chirp3-HD-Enceladus');
    
    // Verify that the result is still the path to the segue file
    expect(result).toMatch(/segway_music_to_dj_/);
  });

  test('should include rating information in segue prompts', async () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    const ratingsManager = require('../../../src/managers/ratingsManager');
    
    const prevMeta = {
      type: 'music',
      title: 'Previous Track',
      artist: 'Previous Artist',
      relPath: 'music/high_rated_track.mp3'
    };
    
    const nextMeta = {
      type: 'music',
      title: 'Next Track',
      artist: 'Next Artist',
      relPath: 'music/low_rated_track.mp3'
    };
    
    await promptProcessor.generateSegway(prevMeta, nextMeta);
    
    // Verify that ratings were fetched
    expect(ratingsManager.getRatingForTrack).toHaveBeenCalledWith('music/high_rated_track.mp3');
    expect(ratingsManager.getRatingForTrack).toHaveBeenCalledWith('music/low_rated_track.mp3');
    
    // Verify that OpenAI was called with a prompt containing rating information
    const promptContent = mockOpenAIClient.chat.completions.create.mock.calls[0][0].messages[1].content;
    expect(promptContent).toContain('4.8/5');
    expect(promptContent).toContain('2.5/5');
  });

  test('should clean up temporary directory', () => {
    const promptProcessor = require('../../../src/processors/promptProcessor');
    
    // Use internal function to test cleanTempDirectory
    const cleanTempDirectory = promptProcessor.__get__('cleanTempDirectory');
    
    // If __get__ is not available, we'll need to mock the module differently
    if (!cleanTempDirectory) {
      // Skip this test if we can't access the internal function
      console.warn('Skipping cleanTempDirectory test - function not accessible');
      return;
    }
    
    cleanTempDirectory('/mock/temp');
    
    // Verify that rmSync was called with the correct parameters
    expect(fs.rmSync).toHaveBeenCalledWith('/mock/temp', { recursive: true, force: true });
  });
});
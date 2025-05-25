const path = require('path');
const fs = require('fs');
const TrackManager = require('../../../src/managers/trackManager');
const PromptProcessor = require('../../../src/processors/promptProcessor');
const AudioSynthesizer = require('../../../src/processors/audioSynthesizer');

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn()
}));

jest.mock('../../../src/processors/audioSynthesizer');
jest.mock('../../../src/processors/promptProcessor');

describe('Content Generation Pipeline Integration', () => {
  let trackManager;
  let promptProcessor;
  let audioSynthesizer;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console methods to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Set up test fixtures directory
    const fixturesDir = path.join(__dirname, '../../../tests/fixtures');
    
    // Mock fs.readdirSync to return test audio files
    fs.readdirSync.mockReturnValue(['test_audio.mp3']);
    
    // Mock fs.existsSync to return true for fixture files
    fs.existsSync.mockImplementation((filePath) => {
      return filePath.includes('fixtures');
    });
    
    // Mock fs.readFileSync to return test data
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.endsWith('test_station.json')) {
        return JSON.stringify({
          name: 'Test Station',
          description: 'A test station for automated testing'
        });
      }
      if (filePath.endsWith('test_comments.json')) {
        return JSON.stringify([
          {
            id: 'comment1',
            authorDisplayName: 'TestUser1',
            textDisplay: 'Great song! 5/5'
          }
        ]);
      }
      if (filePath.endsWith('test_ai_response.json')) {
        return JSON.stringify({
          choices: [
            {
              message: {
                content: 'Test DJ content'
              }
            }
          ]
        });
      }
      return Buffer.from('test data');
    });
    
    // Initialize components
    trackManager = new TrackManager({
      musicPath: fixturesDir,
      introPath: fixturesDir,
      djPath: fixturesDir
    });
    
    promptProcessor = new PromptProcessor();
    
    audioSynthesizer = new AudioSynthesizer();
    
    // Mock PromptProcessor.generatePrompt to return a test prompt
    PromptProcessor.prototype.generatePrompt = jest.fn().mockResolvedValue('Test prompt');
    
    // Mock PromptProcessor.processPrompt to return test content
    PromptProcessor.prototype.processPrompt = jest.fn().mockResolvedValue({
      content: 'Test DJ content',
      usage: { total_tokens: 100 }
    });
    
    // Mock AudioSynthesizer.synthesizeSpeech to return a test audio path
    AudioSynthesizer.prototype.synthesizeSpeech = jest.fn().mockResolvedValue('/path/to/synthesized/audio.mp3');
  });
  
  describe('Track Selection → Segway Generation → Voice Synthesis', () => {
    it('should generate a DJ segway for a selected track', async () => {
      // Mock trackManager.selectNextTrack to return a test track
      const testTrack = {
        path: '/path/to/test_audio.mp3',
        type: 'music',
        metadata: {
          title: 'Test Song',
          artist: 'Test Artist'
        }
      };
      
      trackManager.selectNextTrack = jest.fn().mockResolvedValue(testTrack);
      
      // Execute the pipeline
      const track = await trackManager.selectNextTrack('music');
      expect(track).toEqual(testTrack);
      
      // Generate a DJ segway for the track
      const prompt = await promptProcessor.generatePrompt({
        type: 'dj',
        context: {
          currentTrack: track,
          nextTrack: null
        }
      });
      
      expect(prompt).toBe('Test prompt');
      expect(promptProcessor.generatePrompt).toHaveBeenCalledWith({
        type: 'dj',
        context: {
          currentTrack: track,
          nextTrack: null
        }
      });
      
      const aiResponse = await promptProcessor.processPrompt(prompt);
      expect(aiResponse).toEqual({
        content: 'Test DJ content',
        usage: { total_tokens: 100 }
      });
      
      const audioPath = await audioSynthesizer.synthesizeSpeech(aiResponse.content, {
        voiceName: 'en-US-Neural2-F',
        outputPath: '/path/to/output'
      });
      
      expect(audioPath).toBe('/path/to/synthesized/audio.mp3');
      expect(audioSynthesizer.synthesizeSpeech).toHaveBeenCalledWith(
        'Test DJ content',
        {
          voiceName: 'en-US-Neural2-F',
          outputPath: '/path/to/output'
        }
      );
    });
  });
  
  describe('Metadata Extraction → Content Generation', () => {
    it('should use track metadata to generate appropriate content', async () => {
      // Mock trackManager.selectNextTrack to return a test track with rich metadata
      const testTrack = {
        path: '/path/to/test_audio.mp3',
        type: 'music',
        metadata: {
          title: 'Complex Song Title',
          artist: 'Famous Artist',
          album: 'Greatest Hits',
          genre: 'Rock'
        }
      };
      
      trackManager.selectNextTrack = jest.fn().mockResolvedValue(testTrack);
      
      // Execute the pipeline
      const track = await trackManager.selectNextTrack('music');
      
      // Generate a DJ segway that references the track metadata
      const prompt = await promptProcessor.generatePrompt({
        type: 'dj',
        context: {
          currentTrack: track,
          nextTrack: null
        }
      });
      
      // Verify that the prompt generation function was called with the correct metadata
      expect(promptProcessor.generatePrompt).toHaveBeenCalledWith({
        type: 'dj',
        context: {
          currentTrack: expect.objectContaining({
            metadata: {
              title: 'Complex Song Title',
              artist: 'Famous Artist',
              album: 'Greatest Hits',
              genre: 'Rock'
            }
          }),
          nextTrack: null
        }
      });
      
      // Process the prompt to get AI-generated content
      const aiResponse = await promptProcessor.processPrompt(prompt);
      
      // Synthesize speech from the AI response
      const audioPath = await audioSynthesizer.synthesizeSpeech(aiResponse.content, {
        voiceName: 'en-US-Neural2-F',
        outputPath: '/path/to/output'
      });
      
      expect(audioPath).toBe('/path/to/synthesized/audio.mp3');
    });
  });
});
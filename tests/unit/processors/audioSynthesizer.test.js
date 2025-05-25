const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { jest: jestObject } = require('@jest/globals');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('child_process');
jest.mock('@google-cloud/text-to-speech');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('Audio Synthesizer', () => {
  // Mock implementations
  let mockTTSClient;
  
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Setup default mocks
    path.join.mockImplementation((...args) => args.join('/'));
    path.dirname.mockImplementation((filePath) => {
      const parts = filePath.split('/');
      parts.pop();
      return parts.join('/');
    });
    path.basename.mockImplementation((filePath, ext) => {
      const base = filePath.split('/').pop();
      return ext ? base.replace(ext, '') : base;
    });
    path.extname.mockImplementation((filePath) => {
      const parts = filePath.split('.');
      return parts.length > 1 ? `.${parts.pop()}` : '';
    });
    
    // Mock fs
    fs.existsSync.mockReturnValue(false);
    fs.writeFileSync.mockImplementation(() => {});
    fs.readFileSync.mockImplementation(() => Buffer.from('mock audio content'));
    fs.statSync.mockReturnValue({ size: 1024 });
    fs.copyFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
    fs.rmSync.mockImplementation(() => {});
    
    // Mock TTS
    mockTTSClient = {
      synthesizeSpeech: jest.fn().mockResolvedValue([{
        audioContent: Buffer.from('mock audio content')
      }])
    };
    
    require('@google-cloud/text-to-speech').TextToSpeechClient = jest.fn().mockImplementation(() => mockTTSClient);
    
    // Mock execSync
    execSync.mockImplementation(() => {});
  });

  test('should synthesize speech with voice', async () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    const part = {
      text: 'This is a test speech',
      voiceName: 'en-US-Wavenet-D',
      character: 'Test Character'
    };
    
    const filePath = '/mock/output/speech.mp3';
    
    const result = await audioSynthesizer.synthesizeSpeechWithVoice(part, filePath);
    
    // Verify that TTS was called with the correct parameters
    expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledWith({
      input: { text: 'This is a test speech' },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
      audioConfig: { audioEncoding: 'MP3' }
    });
    
    // Verify that the audio was saved
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      filePath,
      expect.any(Buffer),
      'binary'
    );
    
    // Verify that the result is true
    expect(result).toBe(true);
  });

  test('should extract language code from voice name', async () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    const part = {
      text: 'This is a test speech',
      voiceName: 'fr-FR-Wavenet-A',
      character: 'French Character'
    };
    
    const filePath = '/mock/output/speech.mp3';
    
    await audioSynthesizer.synthesizeSpeechWithVoice(part, filePath);
    
    // Verify that TTS was called with the correct language code
    expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledWith({
      input: { text: 'This is a test speech' },
      voice: { languageCode: 'fr-FR', name: 'fr-FR-Wavenet-A' },
      audioConfig: { audioEncoding: 'MP3' }
    });
  });

  test('should skip synthesis for placeholder text', async () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    const part = {
      text: '<SOUND_EFFECT>',
      voiceName: 'en-US-Wavenet-D',
      character: 'Sound Effect'
    };
    
    const filePath = '/mock/output/speech.mp3';
    
    const result = await audioSynthesizer.synthesizeSpeechWithVoice(part, filePath);
    
    // Verify that TTS was not called
    expect(mockTTSClient.synthesizeSpeech).not.toHaveBeenCalled();
    
    // Verify that no file was written
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    
    // Verify that the result is false
    expect(result).toBe(false);
  });

  test('should handle errors during speech synthesis', async () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock TTS to throw an error
    mockTTSClient.synthesizeSpeech.mockRejectedValue(new Error('TTS error'));
    
    const part = {
      text: 'This is a test speech',
      voiceName: 'en-US-Wavenet-D',
      character: 'Test Character'
    };
    
    const filePath = '/mock/output/speech.mp3';
    
    // Verify that the error is propagated
    await expect(audioSynthesizer.synthesizeSpeechWithVoice(part, filePath))
      .rejects.toThrow('TTS error');
    
    // Verify that error was logged
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('TTS error for Test Character:'),
      expect.any(Error)
    );
  });

  test('should generate unique file path when file exists', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for the first path, then false
    fs.existsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    
    const filePath = '/mock/output/audio.mp3';
    const uniquePath = audioSynthesizer.generateUniqueFilePath(filePath);
    
    // Verify that a unique path was generated
    expect(uniquePath).toBe('/mock/output/audio_1.mp3');
    expect(fs.existsSync).toHaveBeenCalledTimes(2);
  });

  test('should return original path when file does not exist', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return false
    fs.existsSync.mockReturnValue(false);
    
    const filePath = '/mock/output/audio.mp3';
    const uniquePath = audioSynthesizer.generateUniqueFilePath(filePath);
    
    // Verify that the original path was returned
    expect(uniquePath).toBe(filePath);
    expect(fs.existsSync).toHaveBeenCalledTimes(1);
  });

  test('should clean up directory', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true
    fs.existsSync.mockReturnValue(true);
    
    const directory = '/mock/temp';
    audioSynthesizer.cleanup(directory);
    
    // Verify that rmSync was called with the correct parameters
    expect(fs.rmSync).toHaveBeenCalledWith(directory, { recursive: true, force: true });
  });

  test('should not attempt to clean up non-existent directory', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return false
    fs.existsSync.mockReturnValue(false);
    
    const directory = '/mock/temp';
    audioSynthesizer.cleanup(directory);
    
    // Verify that rmSync was not called
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  test('should stitch multiple audio files with crossfade', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for all files
    fs.existsSync.mockReturnValue(true);
    
    const files = [
      '/mock/input/audio1.mp3',
      '/mock/input/audio2.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    const result = audioSynthesizer.stitchAudio(files, output);
    
    // Verify that execSync was called with the correct parameters for 2 files
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('acrossfade'),
      expect.anything()
    );
    
    // Verify that the result is the output path
    expect(result).toBe(output);
  });

  test('should stitch more than two audio files with concat', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for all files
    fs.existsSync.mockReturnValue(true);
    
    const files = [
      '/mock/input/audio1.mp3',
      '/mock/input/audio2.mp3',
      '/mock/input/audio3.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    const result = audioSynthesizer.stitchAudio(files, output);
    
    // Verify that execSync was called for normalization and concatenation
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('loudnorm'),
      expect.anything()
    );
    
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('concat'),
      expect.anything()
    );
    
    // Verify that the result is the output path
    expect(result).toBe(output);
  });

  test('should copy single file directly when only one valid file', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for the file
    fs.existsSync.mockReturnValue(true);
    
    const files = [
      '/mock/input/audio1.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    const result = audioSynthesizer.stitchAudio(files, output);
    
    // Verify that copyFileSync was called instead of execSync
    expect(fs.copyFileSync).toHaveBeenCalledWith(files[0], output);
    expect(execSync).not.toHaveBeenCalled();
    
    // Verify that the result is the output path
    expect(result).toBe(output);
  });

  test('should filter out non-existent files when stitching', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return false for the first file, true for the second
    fs.existsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    
    const files = [
      '/mock/input/missing.mp3',
      '/mock/input/audio2.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    const result = audioSynthesizer.stitchAudio(files, output);
    
    // Verify that copyFileSync was called with only the valid file
    expect(fs.copyFileSync).toHaveBeenCalledWith('/mock/input/audio2.mp3', output);
    
    // Verify that the result is the output path
    expect(result).toBe(output);
  });

  test('should filter out empty files when stitching', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for all files
    fs.existsSync.mockReturnValue(true);
    
    // Mock fs.statSync to return size 0 for the first file, size 1024 for the second
    fs.statSync
      .mockReturnValueOnce({ size: 0 })
      .mockReturnValueOnce({ size: 1024 });
    
    const files = [
      '/mock/input/empty.mp3',
      '/mock/input/audio2.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    const result = audioSynthesizer.stitchAudio(files, output);
    
    // Verify that copyFileSync was called with only the valid file
    expect(fs.copyFileSync).toHaveBeenCalledWith('/mock/input/audio2.mp3', output);
    
    // Verify that the result is the output path
    expect(result).toBe(output);
  });

  test('should throw error when no valid files to stitch', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return false for all files
    fs.existsSync.mockReturnValue(false);
    
    const files = [
      '/mock/input/missing1.mp3',
      '/mock/input/missing2.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    // Verify that an error is thrown
    expect(() => {
      audioSynthesizer.stitchAudio(files, output);
    }).toThrow('No valid audio files to stitch');
  });

  test('should throw error when no files to stitch', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    const files = [];
    const output = '/mock/output/stitched.mp3';
    
    // Verify that an error is thrown
    expect(() => {
      audioSynthesizer.stitchAudio(files, output);
    }).toThrow('No audio files to stitch');
  });

  test('should fall back to simple concat when advanced processing fails', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for all files
    fs.existsSync.mockReturnValue(true);
    
    // Mock execSync to throw an error on first call, then succeed
    execSync
      .mockImplementationOnce(() => { throw new Error('FFmpeg error'); })
      .mockImplementationOnce(() => {});
    
    const files = [
      '/mock/input/audio1.mp3',
      '/mock/input/audio2.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    const result = audioSynthesizer.stitchAudio(files, output);
    
    // Verify that execSync was called twice (once for advanced, once for simple)
    expect(execSync).toHaveBeenCalledTimes(2);
    
    // Verify that the second call used simple concat
    expect(execSync.mock.calls[1][0]).toContain('concat');
    
    // Verify that the result is the output path
    expect(result).toBe(output);
  });

  test('should throw error when both ffmpeg methods fail', () => {
    const audioSynthesizer = require('../../../src/processors/audioSynthesizer');
    
    // Mock fs.existsSync to return true for all files
    fs.existsSync.mockReturnValue(true);
    
    // Mock execSync to throw errors on both calls
    execSync
      .mockImplementationOnce(() => { throw new Error('First FFmpeg error'); })
      .mockImplementationOnce(() => { throw new Error('Second FFmpeg error'); });
    
    const files = [
      '/mock/input/audio1.mp3',
      '/mock/input/audio2.mp3'
    ];
    
    const output = '/mock/output/stitched.mp3';
    
    // Verify that an error is thrown
    expect(() => {
      audioSynthesizer.stitchAudio(files, output);
    }).toThrow('FFmpeg failed: Second FFmpeg error');
  });
});
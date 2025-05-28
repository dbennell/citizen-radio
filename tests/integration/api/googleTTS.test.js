const { jest: jestObject } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const voiceManager = require('../../../src/managers/voiceManager');
const audioSynthesizer = require('../../../src/processors/audioSynthesizer');

// This test requires Google Cloud credentials to be properly set up
// It will be skipped if no credentials are found
const hasCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS && 
                      fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Conditionally skip tests if no credentials are available
const conditionalTest = hasCredentials ? describe : describe.skip;

conditionalTest('Google Cloud TTS API Integration', () => {
  let ttsClient;
  let tempOutputDir;

  beforeAll(() => {
    // Set up temporary output directory for synthesized audio
    tempOutputDir = path.join(__dirname, '../../../tests/fixtures/temp');
    if (!fs.existsSync(tempOutputDir)) {
      fs.mkdirSync(tempOutputDir, { recursive: true });
    }

    // Initialize TTS client
    ttsClient = new TextToSpeechClient();
  });

  afterAll(() => {
    // Clean up temporary files
    const files = fs.readdirSync(tempOutputDir);
    files.forEach(file => {
      if (file.endsWith('.mp3')) {
        fs.unlinkSync(path.join(tempOutputDir, file));
      }
    });
  });

  beforeEach(() => {
    jest.setTimeout(60000); // Increase timeout for API calls to 60 seconds
  });

  test('should connect to Google Cloud TTS API and synthesize speech', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Simple text to synthesize
    const text = "Hello, I'm testing the Google Cloud Text-to-Speech API integration.";

    // Make a direct API call
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' },
    });

    // Verify we got a response with audio content
    expect(response).toBeDefined();
    expect(response.audioContent).toBeDefined();
    expect(response.audioContent.length).toBeGreaterThan(0);

    // Write the audio content to a file to verify it's valid
    const outputFile = path.join(tempOutputDir, 'test_tts_output.mp3');
    fs.writeFileSync(outputFile, response.audioContent);

    // Verify the file exists and has content
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(fs.statSync(outputFile).size).toBeGreaterThan(0);
  });

  test('should list available voices', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Get the list of available voices
    const [result] = await ttsClient.listVoices({});

    // Verify we got a response with voices
    expect(result).toBeDefined();
    expect(result.voices).toBeDefined();
    expect(result.voices.length).toBeGreaterThan(0);

    // Verify we have English voices
    const englishVoices = result.voices.filter(
      voice => voice.languageCodes.some(code => code.startsWith('en-'))
    );
    expect(englishVoices.length).toBeGreaterThan(0);

    // Log some voice information for debugging
    console.log(`Found ${englishVoices.length} English voices`);
    console.log('Sample voice:', englishVoices[0].name);
  });

  test('should assign voices to speakers through voiceManager', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Test assigning a voice to a speaker
    const result = await voiceManager.assignVoiceToName('Test Speaker', 'Host', 'male');

    // Verify we got a valid voice assignment
    expect(result).toBeDefined();
    expect(result.voiceName).toBeDefined();
    expect(result.speakerId).toBeDefined();

    // Log the assigned voice for debugging
    console.log('Assigned voice:', result.voiceName);
  });

  test('should synthesize speech through audioSynthesizer', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    // Create an instance of the audio synthesizer
    const synth = new audioSynthesizer();

    // Test text to synthesize
    const text = "This is a test of the audio synthesizer component.";

    // Synthesize speech
    const outputFile = await synth.synthesizeSpeech(text, {
      voiceName: 'en-US-Wavenet-F',
      outputPath: tempOutputDir
    });

    // Verify we got a valid output file
    expect(outputFile).toBeDefined();
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(fs.statSync(outputFile).size).toBeGreaterThan(0);

    // Log the output file for debugging
    console.log('Synthesized audio file:', outputFile);
  });

  test('should handle API errors gracefully', async () => {
    // Skip if no credentials
    if (!hasCredentials) return;

    try {
      // Try to synthesize with an invalid voice name
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text: "This should fail." },
        voice: { name: 'non-existent-voice' },
        audioConfig: { audioEncoding: 'MP3' },
      });

      // If we get here, the API didn't throw an error as expected
      console.log('Unexpected success:', response);
      expect(false).toBe(true); // Force test to fail
    } catch (error) {
      // Verify we got an error as expected
      expect(error).toBeDefined();
      console.log('Expected API error:', error.message);
    }
  });
});

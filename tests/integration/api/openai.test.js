const { jest: jestObject } = require('@jest/globals');
const { Configuration, OpenAIApi } = require('openai');
const podcastGenerator = require('../../../src/processors/podcastGenerator');
const promptProcessor = require('../../../src/processors/promptProcessor');

// This test requires a valid OpenAI API key to be set in the environment
// It will be skipped if no API key is found
const hasApiKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0;

// Conditionally skip tests if no API key is available
const conditionalTest = hasApiKey ? describe : describe.skip;

conditionalTest('OpenAI API Integration', () => {
  let openai;

  beforeAll(() => {
    // Configure OpenAI with the API key from environment
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    openai = new OpenAIApi(configuration);
  });

  beforeEach(() => {
    jest.setTimeout(30000); // Increase timeout for API calls
  });

  test('should connect to OpenAI API and get a response', async () => {
    // Skip if no API key
    if (!hasApiKey) return;

    // Simple test prompt
    const prompt = "Hello, I'm testing the OpenAI API integration.";
    
    // Make a direct API call
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 50
    });
    
    // Verify we got a response
    expect(response.data).toBeDefined();
    expect(response.data.choices).toBeDefined();
    expect(response.data.choices.length).toBeGreaterThan(0);
    expect(response.data.choices[0].text).toBeDefined();
  });

  test('should handle API rate limits gracefully', async () => {
    // Skip if no API key
    if (!hasApiKey) return;

    // Make multiple rapid requests to potentially trigger rate limiting
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(openai.createCompletion({
        model: "text-davinci-003",
        prompt: `Test prompt ${i}`,
        max_tokens: 10
      }));
    }
    
    // We expect either successful responses or rate limit errors that we can handle
    const results = await Promise.allSettled(promises);
    
    // Check each result
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        expect(result.value.data.choices[0].text).toBeDefined();
      } else {
        // If rejected, it should be a rate limit error (429) or other API error
        console.log('API error:', result.reason.message);
        // We don't fail the test on API errors, just log them
      }
    });
  });

  test('should generate podcast content through podcastGenerator', async () => {
    // Skip if no API key
    if (!hasApiKey) return;

    // Mock the podcast generator's dependencies
    const mockPodcastGenerator = new podcastGenerator();
    
    // Test prompt for a simple podcast
    const prompt = `
      # Star Citizen News Network
      Host: Jessica Chen
      Guest: Commander Alex Roberts
      Topic: The latest developments in the Stanton system
      
      Jessica: Welcome to the Star Citizen News Network. I'm your host Jessica Chen.
      Alex: Thanks for having me, Jessica.
    `;
    
    // Generate the full podcast script
    const result = await mockPodcastGenerator.generatePodcastScript(prompt);
    
    // Verify we got a valid response
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(prompt.length);
    expect(result.content).toContain('Jessica:');
    expect(result.content).toContain('Alex:');
  });

  test('should elaborate DJ content through promptProcessor', async () => {
    // Skip if no API key
    if (!hasApiKey) return;

    // Mock the prompt processor
    const mockPromptProcessor = new promptProcessor();
    
    // Test DJ prompt
    const djPrompt = {
      type: 'dj',
      content: 'Introduce the next song: "Stellar Drift" by Nebula Sounds',
      context: {
        currentTrack: {
          title: 'Cosmic Journey',
          artist: 'Astral Pioneers'
        },
        nextTrack: {
          title: 'Stellar Drift',
          artist: 'Nebula Sounds'
        }
      }
    };
    
    // Process the prompt
    const result = await mockPromptProcessor.processPrompt(djPrompt);
    
    // Verify we got a valid response
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content).toContain('Stellar Drift');
    expect(result.content).toContain('Nebula Sounds');
  });
});
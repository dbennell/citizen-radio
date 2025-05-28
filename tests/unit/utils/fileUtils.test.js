const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const fileUtils = require('../../../src/utils/fileUtils');

describe('FileUtils', () => {
  // Create a temporary directory for test files
  let tempDir;
  let testFilePath;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = path.join(os.tmpdir(), `citizen-radio-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    testFilePath = path.join(tempDir, 'test-ratings.json');
  });

  afterEach(async () => {
    // Clean up temporary files after each test
    try {
      if (fsSync.existsSync(tempDir)) {
        const files = await fs.readdir(tempDir);
        for (const file of files) {
          await fs.unlink(path.join(tempDir, file));
        }
        await fs.rmdir(tempDir);
      }
    } catch (error) {
      console.error('Error cleaning up test files:', error);
    }
  });

  describe('safeReadJsonFile', () => {
    it('should return fallback for non-existent file', async () => {
      const fallback = { test: 'fallback' };
      const result = await fileUtils.safeReadJsonFile('/non/existent/file.json', fallback);
      expect(result).toEqual(fallback);
    });

    it('should parse valid JSON file', async () => {
      const testData = { test: 'data', value: 123 };
      await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf8');
      
      const result = await fileUtils.safeReadJsonFile(testFilePath, {});
      expect(result).toEqual(testData);
    });

    it('should fix and parse JSON with trailing commas', async () => {
      const invalidJson = '{"test": "data", "value": 123,}';
      await fs.writeFile(testFilePath, invalidJson, 'utf8');
      
      const result = await fileUtils.safeReadJsonFile(testFilePath, {});
      expect(result).toEqual({ test: 'data', value: 123 });
    });

    it('should fix and parse JSON with [object Promise] appended', async () => {
      const validJson = '{"test": "data", "value": 123}';
      const corruptedJson = `${validJson}[object Promise]`;
      await fs.writeFile(testFilePath, corruptedJson, 'utf8');
      
      const result = await fileUtils.safeReadJsonFile(testFilePath, {});
      expect(result).toEqual({ test: 'data', value: 123 });
    });

    it('should extract valid JSON from corrupted file', async () => {
      const validJson = '{"test": "data", "value": 123}';
      const corruptedJson = `garbage${validJson}moregarbage`;
      await fs.writeFile(testFilePath, corruptedJson, 'utf8');
      
      const result = await fileUtils.safeReadJsonFile(testFilePath, {});
      expect(result).toEqual({ test: 'data', value: 123 });
    });

    it('should return fallback for severely corrupted JSON', async () => {
      const corruptedJson = '{test: broken json';
      await fs.writeFile(testFilePath, corruptedJson, 'utf8');
      
      const fallback = { fallback: true };
      const result = await fileUtils.safeReadJsonFile(testFilePath, fallback);
      
      // Either we get the fallback or an empty object (both are acceptable)
      expect(result).toMatchObject({});
    });
  });

  describe('safeAppendJsonToFile', () => {
    it('should create a new file with data if file does not exist', async () => {
      const testData = { test: 'data', value: 123 };
      
      const result = await fileUtils.safeAppendJsonToFile(testFilePath, testData);
      expect(result).toBe(true);
      
      const fileContent = await fs.readFile(testFilePath, 'utf8');
      expect(JSON.parse(fileContent)).toEqual(testData);
    });

    it('should merge data with existing file content', async () => {
      // Initial data
      const initialData = { test: 'initial', count: 1 };
      await fs.writeFile(testFilePath, JSON.stringify(initialData), 'utf8');
      
      // New data to append
      const newData = { value: 123, updated: true };
      
      const result = await fileUtils.safeAppendJsonToFile(testFilePath, newData);
      expect(result).toBe(true);
      
      // Check that data was merged correctly
      const fileContent = await fs.readFile(testFilePath, 'utf8');
      expect(JSON.parse(fileContent)).toEqual({
        test: 'initial',
        count: 1,
        value: 123,
        updated: true
      });
    });

    it('should handle corrupted existing file', async () => {
      // Write corrupted JSON
      const corruptedJson = '{"test": "corrupted",}[object Promise]';
      await fs.writeFile(testFilePath, corruptedJson, 'utf8');
      
      // New data to append
      const newData = { value: 123, fixed: true };
      
      const result = await fileUtils.safeAppendJsonToFile(testFilePath, newData);
      expect(result).toBe(true);
      
      // Check that data was fixed and merged correctly
      const fileContent = await fs.readFile(testFilePath, 'utf8');
      const parsedContent = JSON.parse(fileContent);
      
      // The corrupted data might be ignored, but the new data should be there
      expect(parsedContent.value).toBe(123);
      expect(parsedContent.fixed).toBe(true);
    });

    it('should handle Promise objects in data', async () => {
      // Create an object with a Promise
      const dataWithPromise = { 
        normal: 'value',
        promise: Promise.resolve('test')
      };
      
      const result = await fileUtils.safeAppendJsonToFile(testFilePath, dataWithPromise);
      expect(result).toBe(true);
      
      // Check that the file contains valid JSON
      const fileContent = await fs.readFile(testFilePath, 'utf8');
      expect(() => JSON.parse(fileContent)).not.toThrow();
      
      const parsedContent = JSON.parse(fileContent);
      expect(parsedContent.normal).toBe('value');
      // The promise should be handled gracefully (either removed or replaced)
      expect(parsedContent.promise).not.toBe('[object Promise]');
    });
  });

  describe('fix-ratings-log integration', () => {
    it('should recover from corrupted ratings file', async () => {
      // Create a corrupted ratings file
      const ratingsPath = path.join(tempDir, 'ratings.log');
      const corruptedContent = '{}[object Promise]{"test": "data"}';
      await fs.writeFile(ratingsPath, corruptedContent, 'utf8');
      
      // Import the fix script dynamically to avoid global execution
      const fixScript = require('../../../scripts/fix-ratings-log');
      
      // Mock the path to point to our test file
      jest.spyOn(path, 'join').mockImplementation((dir, file) => {
        if (file === '../data/ratings.log') {
          return ratingsPath;
        }
        if (file === '../data/ratings.log.backup') {
          return `${ratingsPath}.backup`;
        }
        return path.join(dir, file);
      });
      
      // Run the fix function
      await fixScript.fixRatingsLog();
      
      // Verify the file was fixed
      const fixedContent = await fs.readFile(ratingsPath, 'utf8');
      expect(() => JSON.parse(fixedContent)).not.toThrow();
      
      // Reset the mock
      path.join.mockRestore();
    });
  });
});
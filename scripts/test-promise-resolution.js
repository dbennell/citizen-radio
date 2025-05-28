// Test script to verify that our fixes resolve the issue with writing Promises to files
const fs = require('fs');
const path = require('path');
const fileUtils = require('../src/utils/fileUtils');

// Create a test file path
const testFilePath = path.join(__dirname, '../data/test-ratings.log');

// Function that returns a Promise
async function getPromiseData() {
    return { value: 'resolved' };
}

// Function to test writing a Promise to a file without resolution
async function testWithoutResolution() {
    console.log('Testing without Promise resolution...');

    try {
        // Create two Promises
        const promise1 = getPromiseData();
        const promise2 = getPromiseData();

        // Concatenate Promises directly (this should result in [object Promise][object Promise])
        fs.writeFileSync(testFilePath, '' + promise1 + promise2, 'utf8');

        // Read the file to verify
        const fileContent = fs.readFileSync(testFilePath, 'utf8');
        console.log('File content without resolution:', fileContent);

        return fileContent;
    } catch (error) {
        console.error('Error in testWithoutResolution:', error);
        throw error;
    }
}

// Function to test writing a Promise to a file with resolution
async function testWithResolution() {
    console.log('Testing with Promise resolution...');

    try {
        // Create a Promise
        const promiseData = getPromiseData();

        // Resolve the Promise before writing to file
        const resolvedData = await Promise.resolve(promiseData);

        // Write the resolved data to a file
        fs.writeFileSync(testFilePath, JSON.stringify(resolvedData), 'utf8');

        // Read the file to verify
        const fileContent = fs.readFileSync(testFilePath, 'utf8');
        console.log('File content with resolution:', fileContent);

        return fileContent;
    } catch (error) {
        console.error('Error in testWithResolution:', error);
        throw error;
    }
}

// Function to test using our fixed fileUtils.updateJsonFile
async function testWithFileUtils() {
    console.log('Testing with fileUtils.updateJsonFile...');

    try {
        // Create a Promise
        const promiseData = getPromiseData();

        // Use our fixed updateJsonFile function
        await fileUtils.updateJsonFile(testFilePath, promiseData);

        // Read the file to verify
        const fileContent = fs.readFileSync(testFilePath, 'utf8');
        console.log('File content with fileUtils:', fileContent);

        return fileContent;
    } catch (error) {
        console.error('Error in testWithFileUtils:', error);
        throw error;
    }
}

// Run the tests
async function runTests() {
    try {
        // Test without resolution
        const withoutResolution = await testWithoutResolution();

        // Test with resolution
        const withResolution = await testWithResolution();

        // Test with fileUtils
        const withFileUtils = await testWithFileUtils();

        // Verify results
        console.log('\nResults:');
        console.log('Without resolution:', withoutResolution.includes('[object Promise]') ? 'FAILED - Contains [object Promise]' : 'PASSED');
        console.log('With resolution:', withResolution.includes('[object Promise]') ? 'FAILED - Contains [object Promise]' : 'PASSED');
        console.log('With fileUtils:', withFileUtils.includes('[object Promise]') ? 'FAILED - Contains [object Promise]' : 'PASSED');

        // Clean up
        fs.unlinkSync(testFilePath);
        console.log('Test file cleaned up.');
    } catch (error) {
        console.error('Error running tests:', error);
    }
}

// Run the tests
runTests();

# Segway System Test Plan

## 1. Overview

This test plan outlines a comprehensive testing strategy for the segway functionality in CitizenRadio. Segways are transition elements that provide smooth, contextual transitions between different content items, enhancing the listening experience by creating a more professional and cohesive radio broadcast.

## 2. Components Under Test

The segway system consists of several interconnected components:

1. **SegwayManager**: Responsible for generating segway text and preparing segway audio files
2. **ContentQueueManager**: Manages the content queue and determines when segways should be generated
3. **Orchestrator**: Handles the playback of segways and ensures proper cleanup of segway files

## 3. Test Categories

### 3.1 Unit Tests

#### 3.1.1 SegwayManager Tests

| Test ID | Test Description | Test Steps | Expected Result | Success Criteria |
|---------|-----------------|------------|----------------|------------------|
| SM-UT-01 | Test `shouldGenerateSegway()` with different transition types | 1. Call method with various transition types<br>2. Check return value | Returns boolean based on configuration probabilities | Method returns expected values for all transition types |
| SM-UT-02 | Test `generateSegway()` with music-to-music transition | 1. Prepare context with previous and next tracks<br>2. Call method<br>3. Check generated text | Returns contextually relevant segway text | Generated text references track information correctly |
| SM-UT-03 | Test `generateSegway()` with other transition types | 1. Prepare context with different content types<br>2. Call method<br>3. Check generated text | Returns appropriate template-based text | Generated text uses appropriate templates for transition type |
| SM-UT-04 | Test `prepareSegway()` functionality | 1. Provide segway text<br>2. Call method<br>3. Check generated audio file | Returns path to generated audio file | Audio file is created with correct content |
| SM-UT-05 | Test `removeOldSegways()` functionality | 1. Create test segway files<br>2. Call method<br>3. Check which files are removed | Old files are removed, referenced files are kept | Only appropriate files are removed |

#### 3.1.2 ContentQueueManager Segway-Related Tests

| Test ID | Test Description | Test Steps | Expected Result | Success Criteria |
|---------|-----------------|------------|----------------|------------------|
| CQM-UT-01 | Test segway generation in `prepareNextContent()` | 1. Set up queue with items<br>2. Call method<br>3. Check if segway is generated | Segway is generated for appropriate transitions | Segway is attached to queue item when conditions are met |
| CQM-UT-02 | Test `generateSegwaysForQueuePosition()` | 1. Set up queue with items<br>2. Call method for position 2<br>3. Check if segway is generated | Segway is generated for position 2 | Segway is attached to queue item at position 2 |
| CQM-UT-03 | Test duplicate segway prevention | 1. Generate segway for a transition<br>2. Try to generate another segway for same transition<br>3. Check if second segway is generated | Second segway is not generated | Duplicate segways are prevented |

#### 3.1.3 Orchestrator Segway-Related Tests

| Test ID | Test Description | Test Steps | Expected Result | Success Criteria |
|---------|-----------------|------------|----------------|------------------|
| O-UT-01 | Test segway playback before content | 1. Set up queue item with segway<br>2. Process item in playback loop<br>3. Check playback order | Segway is played before main content | Playback order is correct |
| O-UT-02 | Test segway file protection during cleanup | 1. Play segway<br>2. Call cleanup method<br>3. Check if segway file is protected | Currently playing segway file is not deleted | Segway file remains intact |

### 3.2 Integration Tests

| Test ID | Test Description | Test Steps | Expected Result | Success Criteria |
|---------|-----------------|------------|----------------|------------------|
| INT-01 | Test ContentQueueManager and SegwayManager integration | 1. Set up queue with items<br>2. Trigger segway generation<br>3. Check if SegwayManager methods are called correctly | SegwayManager methods are called with correct parameters | Segway is generated and attached to queue item |
| INT-02 | Test Orchestrator and SegwayManager integration | 1. Set up queue item with segway<br>2. Process item in Orchestrator<br>3. Check if segway is played and cleanup is called | Segway is played and cleanup is called | Playback and cleanup work correctly together |
| INT-03 | Test full segway generation and playback flow | 1. Set up queue with items<br>2. Trigger queue processing<br>3. Check entire flow from generation to playback | Complete flow works as expected | Segway is generated, attached, played, and cleaned up correctly |

### 3.3 End-to-End Tests

| Test ID | Test Description | Test Steps | Expected Result | Success Criteria |
|---------|-----------------|------------|----------------|------------------|
| E2E-01 | Test segway generation during initial queue population | 1. Initialize system<br>2. Check if segways are generated for initial queue | Segways are generated appropriately | Initial queue items have segways attached |
| E2E-02 | Test segway generation during queue replenishment | 1. Play items from queue<br>2. Trigger queue replenishment<br>3. Check if segways are generated for new items | Segways are generated for new items | New queue items have segways attached |
| E2E-03 | Test segway playback in full broadcast cycle | 1. Start broadcast cycle<br>2. Play multiple items with segways<br>3. Check if segways are played correctly | Segways are played before their content | Playback order is correct throughout cycle |

### 3.4 Edge Case Tests

| Test ID | Test Description | Test Steps | Expected Result | Success Criteria |
|---------|-----------------|------------|----------------|------------------|
| EC-01 | Test empty queue edge case | 1. Call `generateSegwaysForQueuePosition()` with empty queue<br>2. Check behavior | Method returns early without error | No errors occur |
| EC-02 | Test no last played item edge case | 1. Set up system with no play history<br>2. Trigger segway generation<br>3. Check behavior | "start" type is used for previous item | Segway is generated with appropriate context |
| EC-03 | Test queue position edge case | 1. Set up queue with fewer than 2 items<br>2. Call `generateSegwaysForQueuePosition()`<br>3. Check behavior | No segways are generated | Method handles case correctly |
| EC-04 | Test transition type edge case | 1. Configure certain transitions to have 0% chance<br>2. Trigger those transitions<br>3. Check if segways are generated | No segways are generated for those transitions | Configuration is respected |
| EC-05 | Test duplicate prevention edge case | 1. Use different transition key formats<br>2. Try to generate segways for same transition<br>3. Check if duplicate prevention works | Duplicate prevention may fail due to inconsistent keys | Test identifies the issue |
| EC-06 | Test segway cleanup edge case | 1. Create segway referenced by multiple queue items<br>2. Trigger cleanup<br>3. Check if file is protected | File is protected from deletion | Cleanup logic works correctly |

## 4. Mocking Requirements

To effectively test the segway system, the following components should be mocked:

1. **Text-to-Speech (TTS) Service**:
   - Mock the TTS service to avoid actual API calls during testing
   - Return predefined audio files or dummy paths

2. **OpenAI API**:
   - Mock the OpenAI API to avoid actual API calls during testing
   - Return predefined segway text based on input parameters

3. **File System Operations**:
   - Mock file system operations to avoid actual file creation/deletion
   - Track file operations to verify correct behavior

4. **Audio Playback**:
   - Mock audio playback to avoid actual audio playing during tests
   - Track playback calls to verify correct order and timing

5. **Configuration**:
   - Mock configuration to test different settings
   - Include test configurations for different transition probabilities

## 5. Test Environment Setup

### 5.1 Prerequisites

- Node.js testing framework (Jest recommended)
- Mock implementations for external services
- Test configuration files
- Sample content items of different types (music, ads, DJ talk)

### 5.2 Test Data

- Sample music tracks with metadata
- Sample advertisements
- Sample DJ talk segments
- Predefined segway text templates
- Predefined segway audio files

## 6. Success Criteria

The segway system tests will be considered successful if:

1. **Functionality**: All segway generation, attachment, playback, and cleanup functions work as expected
2. **Integration**: Components interact correctly with each other
3. **Edge Cases**: All identified edge cases are handled gracefully
4. **Performance**: Segway generation and cleanup don't cause performance issues
5. **Consistency**: Segways are consistently generated for appropriate transitions
6. **Duplicate Prevention**: No duplicate segways are generated for the same transition

## 7. Known Issues and Test Focus Areas

Based on the implementation analysis, special attention should be paid to:

1. **Inconsistent Transition Key Formats**: Test how different transition key formats affect duplicate prevention
2. **Missing Initial Segways**: Test segway generation during initial queue population
3. **Duplicate Segway Generation**: Test for cases where two segways might be generated for the same track
4. **Queue Position Changes**: Test segway generation when items move up in the queue

## 8. Test Execution Plan

1. Develop unit tests for individual components
2. Develop integration tests for component interactions
3. Develop end-to-end tests for full system behavior
4. Develop specific tests for identified edge cases
5. Execute tests in order of dependency (unit → integration → end-to-end)
6. Document and address any issues found during testing

## 9. Reporting

Test results should be documented with:

1. Pass/fail status for each test
2. Detailed error messages for failed tests
3. Performance metrics (execution time, resource usage)
4. Coverage metrics (code coverage percentage)
5. Recommendations for improvements based on test results

## 10. Conclusion

This test plan provides a comprehensive approach to testing the segway functionality in CitizenRadio. By following this plan, we can ensure that segways are generated, played, and cleaned up correctly, enhancing the listening experience with smooth transitions between content items.
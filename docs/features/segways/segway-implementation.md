# Segways in CitizenRadio

## Overview

Segways are transition elements that provide smooth, contextual transitions between different content items in the CitizenRadio system. They enhance the listening experience by creating a more professional and cohesive radio broadcast, mimicking how real radio DJs introduce upcoming tracks or transition between different content types.

This document provides a comprehensive explanation of how segways are implemented, managed, and integrated with other components in the CitizenRadio system.

## Purpose and Benefits

Segways serve several important purposes in the CitizenRadio system:

1. **Improved Listener Experience**: Segways create a more professional and cohesive radio experience by eliminating abrupt transitions between content items.

2. **Contextual Awareness**: Segways can reference previous content, upcoming content, and listener engagement, creating a more dynamic and responsive radio experience.

3. **Personality and Branding**: Segways help establish the station's personality and branding through consistent voice and style.

4. **Content Variety**: Segways add variety to the broadcast by introducing different types of transitions, including humorous ones.

## Implementation Architecture

### Core Components

The segway system consists of several interconnected components:

1. **ContentQueueManager**: Manages the content queue and determines when segways should be generated.

2. **SegwayManager**: Responsible for generating segway text and preparing segway audio files.

3. **Orchestrator**: Handles the playback of segways and ensures proper cleanup of segway files.

4. **Configuration**: Controls segway behavior through various configuration options.

### Segway Generation Process

The segway generation process follows these steps:

1. **Transition Determination**: The system determines if a segway should be generated for a specific transition based on configuration probabilities.

2. **Content Context Collection**: The system collects context about previous and upcoming content items, including metadata and ratings.

3. **Text Generation**: For music-to-music transitions, the system uses OpenAI to generate contextually relevant segway text. For other transitions, it selects from predefined templates.

4. **Audio Generation**: The generated text is converted to audio using Text-to-Speech (TTS) with a specific voice profile.

5. **Attachment to Content**: The segway is either attached to the upcoming content item or added as a separate item in the queue, depending on the configuration.

## Segway Types and Generation Logic

### Transition Types

The system handles different types of transitions:

1. **Music to Music**: Uses AI-generated segways that can reference track information, ratings, and listener engagement.

2. **Music to Ad**: Uses predefined templates to introduce advertisements.

3. **Ad to Music**: Uses predefined templates to transition back to music after advertisements.

4. **DJ Talk to Music**: Uses predefined templates to introduce music after DJ talk segments.

5. **Intro to Music**: Uses predefined templates to introduce music after station intros.

### Generation Logic

The decision to generate a segway is based on:

1. **Configuration Probabilities**: Each transition type has a configurable probability in the `autoSegways.transitionChances` configuration.

2. **Pattern Requests**: Segways can be explicitly requested in the content pattern.

3. **Queue Position**: Segways are typically generated for items that will be played soon, not for items far in the queue.

## Integration with Other Components

Segways interact with several other components in the CitizenRadio system:

### Content Queue Management

- The ContentQueueManager determines when segways should be generated based on the queue state and configuration.
- It attaches segways to content items or adds them as separate items in the queue.
- It prevents duplicate segway generation for the same transition.

### Playback System

- The Orchestrator plays segways before their associated content items.
- It protects currently playing segway files from being deleted during cleanup.
- It logs plays to the play log (but skips logging segways).

### Rating System

- Segways can reference track ratings to enhance the listening experience.
- For highly rated tracks, segways can include special introductions.

### Engagement System

- Segways can reference listener comments and engagement data.
- The `segwayReferenceChance` configuration controls how often segways reference engagement data.

## Configuration Options

The segway system is highly configurable through several configuration options:

### Basic Configuration

- `schedule.autoSegways.enabled`: Controls whether automatic segways are enabled.
- `schedule.autoSegways.transitionChances`: Defines the probability of generating segways for different transition types.
- `segwayFunny`: Controls the probability of adding humor to segways (default: 0.25).

### AI Prompts

- `aiPrompts.segway`: The base prompt for generating segway text.
- `aiPrompts.segwayFunny`: The prompt for adding humor to segways.

### TTS Configuration

- `ttsProfiles.segway`: The TTS voice profile to use for segways.

### Engagement Integration

- `enhancedEngagement.segwayReferenceChance`: Controls how often segways reference engagement data.

## File Management and Cleanup

Segway files are managed to prevent accumulation of unused files:

1. **Generation**: Segway audio files are generated with unique timestamps and stored in the segway directory.

2. **Protection**: Currently playing segway files are protected from deletion.

3. **Cleanup**: The Orchestrator calls `segwayManager.removeOldSegways()` to clean up segway files that are no longer needed.

4. **Age-Based Deletion**: Segway files older than a certain threshold (2 minutes) are eligible for deletion if they're not referenced in the queue.

## Technical Implementation Details

### ContentQueueManager

The ContentQueueManager is responsible for:

- Determining when segways should be generated
- Preventing duplicate segway generation
- Attaching segways to content items or adding them as separate items
- Managing the content queue and ensuring proper transitions

Key methods:
- `prepareNextContent()`: Prepares the next content item and generates segways if needed
- `generateSegwaysForQueuePosition()`: Generates segways for items at a specific position in the queue, ensuring consistent context
- `checkAndGenerateSegwaysForQueueItems()`: Legacy method that now calls the consolidated generateSegwaysForQueuePosition method

### SegwayManager

The SegwayManager is responsible for:

- Generating segway text based on content context
- Preparing segway audio files using TTS
- Cleaning up old segway files

Key methods:
- `generateSegway()`: Generates segway text based on content context
- `prepareSegway()`: Converts segway text to audio using TTS
- `removeOldSegways()`: Cleans up old segway files
- `shouldGenerateSegway()`: Determines if a segway should be generated for a specific transition

### Orchestrator

The Orchestrator is responsible for:

- Playing segways before their associated content items
- Protecting currently playing segway files from deletion
- Calling `segwayManager.removeOldSegways()` to clean up segway files

### Segway Triggering and Generation

Segway generation is triggered in two main ways:

1. **During Queue Replenishment**: When new content is added to the queue through the `prepareNextContent()` method:
   - The system checks if a segway is explicitly requested in the pattern (when 'segway' appears in the pattern)
   - It also generates segways automatically based on transition probabilities configured in `autoSegways.transitionChances`
   - Segways are only generated if the item will not be the last in the queue, ensuring we know what follows it
   - A unique transition key is created to prevent duplicate segway generation for the same transition
   - The system collects context from previous tracks (up to 2) and upcoming tracks (up to 2)
   - It then calls `segwayManager.generateSegway()` to create the segway text and `segwayManager.prepareSegway()` to convert it to audio

2. **For Consistent Queue Position Context**: Through the `generateSegwaysForQueuePosition()` method:
   - This is called after an item is added to the queue or when items move up in the queue
   - It specifically targets position 2 (index 1) in the queue to ensure consistent context
   - This ensures there are always 2 tracks on either side for context (1 previous, 2 upcoming)
   - It skips items that already have a segway or are segways themselves, unless force generation is requested
   - It creates a unique transition key to prevent duplicate segway generation for the same transition
   - The system collects context from previous tracks (up to 2) and upcoming tracks (up to 2)
   - A map of recent segways is maintained to prevent generating the same transition within 30 seconds

   Note: The legacy `checkAndGenerateSegwaysForQueueItems()` method now simply calls this consolidated function.

The generation process involves:

1. **Context Collection**:
   - Previous content: The last played item and up to 2 tracks from play history
   - Upcoming content: The next item to be played and up to 2 more items from the queue

2. **Segway Text Generation**:
   - For music-to-music transitions, AI-generated text based on the context
   - For other transitions, predefined templates

3. **Audio Generation**:
   - The text is converted to audio using Text-to-Speech with the configured voice profile
   - The audio file is saved with a unique timestamp in the segway directory

4. **Duplicate Prevention**:
   - A map of recent segways is maintained to prevent generating the same transition within 30 seconds
   - Each transition is uniquely identified by a key combining the previous and next content types and titles

### Segway Placement in Stream

Segways are placed in the stream in two different ways, depending on how they were triggered:

1. **Attached to Content Items**:
   - When segways are generated automatically based on transition probabilities
   - The segway is attached to the content item as a property (`queueItem.segway`)
   - When the Orchestrator processes the queue item, it first plays the attached segway before playing the main content
   - This ensures the segway is played immediately before its associated content

2. **As Separate Queue Items**:
   - When segways are explicitly requested in the pattern (when 'segway' appears in the pattern)
   - A separate queue item of type 'segway' is created and added to the queue before the main content
   - The Orchestrator processes this as a regular queue item, but doesn't log it to the play log

The playback sequence in the Orchestrator:

1. Get the next item from the queue using `contentQueue.getNextItem()`
2. If the item has an attached segway, play it first
3. After playing the segway, clean up old segway files while protecting the one just played
4. Play the main content
5. Mark the item as played and log it to the play log (skipping segways)

This approach ensures that segways are always played immediately before their associated content, creating smooth transitions between different content types. The system is flexible enough to handle both automatic segway generation based on probabilities and explicit segway requests in the content pattern.

## Future Enhancements

The commented-out EnhancedContentQueueManager suggests potential future enhancements to the segway system:

1. **Mood/Energy Integration**: Integrating segways with mood/energy wave matching for more cohesive transitions.

2. **Request Handling**: Enhancing segways to handle requested tracks differently.

3. **Advanced Track Selection**: Using advanced track selection algorithms to create better transitions.

Note: Pre-generating segways from the currently playing track to the next track is already implemented in the current system. The ContentQueueManager already looks at the track queue to see both forward and backward tracks and injects segways at the right point.

## Conclusion

Segways are a critical component of the CitizenRadio system, enhancing the listening experience by providing smooth, contextual transitions between different content items. The segway system is highly configurable and integrates with several other components to create a cohesive and professional radio broadcast.

The implementation balances flexibility, performance, and resource management to ensure a seamless listening experience while preventing resource leaks and unnecessary file accumulation.

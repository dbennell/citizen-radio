# Log Files Explanation

## Overview
This document explains the purpose of each log file in the CitizenRadio project and why they are necessary. It addresses the question of why we have multiple log files instead of consolidating them into fewer files.

## Current Log Files

### 1. chat.log
- **Purpose**: Stores all chat messages from the stream
- **Format**: JSON array of chat message objects
- **Usage**: Used for historical record of chat interactions and for analysis

### 2. play.log
- **Purpose**: Records all tracks played by the radio
- **Format**: Line-by-line JSON objects, each representing a play event
- **Usage**: Used for play history, analytics, and reporting

### 3. feedback.log
- **Purpose**: Temporary storage for feedback until enough entries are collected
- **Format**: JSON array of feedback entries
- **Usage**: Acts as a buffer to prevent frequent updates to MP3 files, which could be resource-intensive
- **Why separate from ratings.log**: While ratings.log stores persistent rating data, feedback.log is a temporary buffer that is cleared after processing. Combining them would make it difficult to distinguish between processed and unprocessed feedback.

### 5. processed_message_ids.json
- **Purpose**: Tracks which chat messages have been processed to avoid duplicates
- **Format**: JSON array of message IDs
- **Usage**: Ensures that each chat message is only processed once for ratings
- **Why separate from chat.log**: The processed message IDs need to be quickly accessible and modifiable. Embedding them in chat.log would require parsing the entire chat log each time we need to check if a message has been processed, which would be inefficient.

## Consolidation Considerations

While it might seem desirable to reduce the number of log files, each file serves a specific purpose that would be compromised by consolidation:

1. **Performance**: Separating the files allows for more efficient read/write operations. For example, we can append to play.log without having to read or modify ratings.log.

2. **Data Integrity**: Keeping the files separate reduces the risk of corruption. If one file is corrupted, the others remain intact.

3. **Functionality**: Each file has a different structure and purpose. Combining them would make the code more complex and harder to maintain.

4. **Temporary vs. Persistent**: Some files (like feedback.log) are temporary and are cleared after processing, while others (like ratings.log) are persistent. Combining them would make it difficult to manage their different lifecycles.

## Future Improvements

As noted in the "Sustainable Storage Solution" section of the user-ratings-implementation-gaps.md document, there are plans to improve the storage system:

1. Implement a file rotation and archiving system
2. Add compression functionality for archived files
3. Create a sampling mechanism to reduce storage requirements
4. Develop a cleanup routine for old rating data

These improvements will help manage the growth of the log files while maintaining their separate purposes.
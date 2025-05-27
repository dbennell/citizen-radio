ok we have both feedbackManager.js and ratingsManager.js now?

we only need one of these, we seem to have code stuck between 2 or 3 different approaches ...
its starting to seem quite muddled, so lets agree some firm concrete ideas and points...
and lets get some solid points and concepts down in writing first...


- For each streamed video ID we have a chat log being captured
  - We should take a copy of this log, every x seconds (depending on the configuration file value)
  - We must take care not to duplicate messages as we fetch them from the API and append any new ones to the log
  - perhaps we call this the chat.log
  - we do need a strategy for pruning/truncating this log in a rolling manner to stop it getting to long given the stream could be 24/7 for months

- While streaming an audio track in our stream to youtube playback function we want to continually take a tail of this log
  - we may as well trigger this tail operation after our API fetch as that is the only thing appending data to the log
  - we should take the last n elements (again configurable) to display in the 'user engagement overlay' that we show for each music track
  - but we want to filter the tail of that log even further for our display. 
    - they must contain a known rating emoji (from the EMOJI_RATINGS mapping in ratingsManager.js)
    - they must be associated with the currently streaming track
    - they must have been received since the start of the curently streaming track (or rather within the time tracks playback window)
    - this means as soon as we move to streaming the next track, all the old chat message elements in the tail of the chat.log will be filtered out

- This should be done for all audio tracks apart from segways, since segways are dynamically and unique generated JIT it doesn't make sense to rate indervidual segway audio tracks
  - However we should think how we can capture feedback about the overall general quality of the radio station and its DJ comment and segways.

- Now the main source and store of user feedback ratings and sentiment for every other purpose should be stored in the audio track .mp3 files themselves
  - Each file should have meta data for its rating score and user feedback sentiment.
  - Importantly, To avoid having to update each mp3 file's meta data for every review comment, we should append to a feecback.log
    - similar to the play.log but it would store the user comment, the track relPath and the assigned rating
    - it would do this using the same criteria we used to display the tail of the chat log
    - once we know a chat.log message is user feedback with a valid rating and we can identify the associated track from its timestamp we can append it to the log
    - as soon as we have enough user ratings stored for any given track (using updateThreshold in the config) in the feedback log we need to cut them out of the log
      - we can take the feedback elements we are just about to prune from the feedback log
      - and pass them to a function which will calculate the avarage score across all of these elements
      - we then fetch the meta data values from the mp3 file in question
      - we can then avarage are new score value with our previous score value to get a new meta score
      - and take all the feedback comments text plus the sentiment text from the files meta data and and pass it all to a sentiment analysis LLM
      - this will give us a new user rating sentiment statement that both takes into consideration the old sentiment statment and all the new feedback comments
      - we can then store back into the mp3 file the newly computed averaged rating score and updated sentiment statment


if a track does not have a rating score yet, we should not show anything for the rating on the track overlay bar at the bottom of the image
if feedback comments come in during a segway or x seconds after the end of a track (again configurable) we should assume they are accociated with the previous track, the one that just played.


please review these requirtments and check they make sense and you understand them.
We then need to review what state the code is currently in and create a plan of action to change and update the code.


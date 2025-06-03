Duration: The length of the song. Is it long or short?

Tempo (BPM): The overall estimated tempo of a track in beats per minute (BPM). The speed at which a song is recorded and performed has a profound impact on how it is perceived. Is it slow or fast?
0-79: Slow
80-129: Medium
130+: Fast

Key:  The key in which a song was composed. In music theory, the key of a piece is the group of pitches or scale that forms the basis of a music composition in classical, Western art, and Western pop music

Camelot: An alternative notation used by DJs.

Popularity: This depends on the total number of plays the track has had and how recent those plays are.

Happiness: Scores with a higher number sound more positive (e.g., happy, cheerful, euphoric), while tracks with a lower number sound more negative (e.g., sad, depressed, angry).

Danceability: Describes how suitable your favorite song is for dancing based on a combination of musical elements, including tempo, rhythm stability, beat strength, and overall regularity.

Energy: Represents a perceptual measure of intensity and activity. Typically, energetic tracks feel fast, loud, and noisy.

Acousticness: A measure of whether your music is acoustic. The higher the number, the more acoustic-sounding your music is.

Instrumentalness: The closer the instrumentalness value is to 100, the greater the likelihood the track contains no vocal content.

Liveness: Detects the presence of an audience in the recording. Higher liveness values represent an increased probability that the track was performed live.

Speechiness: Detects the presence of spoken words in a track. The closer to 100, the more likely the track is made entirely of spoken words.

Loudness: Measures how quiet or loud a song is, in decibels (dB). Typical values range between -60 and 0 dB.

Explicit: whether a song has explicit content or not.


Absolutely! You can achieve a basic but effective audio analysis in Node.js by leveraging open-source audio analysis libraries and AI/ML models without spending on commercial services. Here's a practical approach to accomplish this:

---

## 🎯 **What You Can Tag with Basic Analysis**

You mentioned basic properties, which can realistically include:

* **Genre (basic classification)**
* **Mood/Energy (calculated from loudness/dynamics)**
* **Tempo/BPM**
* **Danceability/Rhythm analysis (simple beats per minute extraction)**
* **General Loudness/Dynamics (volume analysis)**

---

## 🧰 **Libraries and Tools (Node.js Friendly)**

You have several practical open-source libraries/tools:

* **`music-metadata`**

  * Extract metadata tags and basic info.
  * [music-metadata npm](https://www.npmjs.com/package/music-metadata)

* **`meyda`**

  * Audio feature extraction (BPM, spectral data, MFCC, energy).
  * [meyda npm](https://www.npmjs.com/package/meyda)

* **`ffmpeg` & `ffprobe`**

  * For general audio manipulation and extracting duration, channels, sample rate, loudness.
  * [fluent-ffmpeg npm](https://www.npmjs.com/package/fluent-ffmpeg)

* **ML Models (Optional but effective)**

  * TensorFlow\.js for genre classification if you have time to train a simple classifier.
  * [TensorFlow.js](https://www.tensorflow.org/js)

---

## 📌 **Practical Example in Node.js (Basic MP3 Analysis)**

Here's a straightforward and practical starting point:

### Step 1: Install dependencies

```bash
npm install music-metadata meyda fluent-ffmpeg
```

> **Note:** Ensure you have **FFmpeg** installed on your system (`sudo apt install ffmpeg` on Linux).

---

### Step 2: Example Code (`analyze-track.js`)

```javascript
const mm = require('music-metadata');
const meyda = require('meyda');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

async function analyzeTrack(filePath) {
    const metadata = await mm.parseFile(filePath);
    const duration = metadata.format.duration;
    const bitrate = metadata.format.bitrate;
    const title = metadata.common.title || path.basename(filePath);

    console.log(`Analyzing: ${title}`);

    // Extracting BPM using Meyda (basic approximation)
    const audioBuffer = await getAudioBuffer(filePath);
    const features = meyda.extract(['tempo', 'energy', 'spectralCentroid'], audioBuffer);

    const analysis = {
        title: title,
        duration: Math.round(duration),
        bitrate,
        bpm: Math.round(features.tempo),
        energy: features.energy.toFixed(2),
        brightness: features.spectralCentroid.toFixed(2),
        genre: "unknown",  // Genre classification is advanced and requires ML
        mood: features.energy > 0.5 ? "energetic" : "calm"  // simplistic mood
    };

    console.log(analysis);
}

async function getAudioBuffer(filePath) {
    return new Promise((resolve, reject) => {
        const tempPath = './temp_audio.raw';

        ffmpeg(filePath)
            .audioChannels(1)
            .audioFrequency(44100)
            .format('f32le')
            .output(tempPath)
            .on('end', () => {
                const data = fs.readFileSync(tempPath);
                const floatArray = new Float32Array(data.buffer, data.byteOffset, data.length / 4);
                fs.unlinkSync(tempPath);
                resolve(floatArray);
            })
            .on('error', reject)
            .run();
    });
}

// Example usage
const trackPath = './example-track.mp3';
analyzeTrack(trackPath).catch(console.error);
```

---

## 🔎 **Explanation of the Example**

* Uses `music-metadata` to quickly extract basic metadata (duration, bitrate, title).
* `fluent-ffmpeg` converts audio to a raw format suitable for Meyda analysis.
* `meyda` extracts audio features like BPM and energy levels.

---

## 🚩 **Limitations of this Simple Method**

* **Genre classification**: requires training an ML model. TensorFlow\.js can do this but is a more advanced step.
* **Mood and energy**: Simplistic metrics used; real-world mood detection is more nuanced.
* **Accuracy**: Might occasionally misclassify or inaccurately measure BPM on tracks with irregular rhythms.

---

## 🎓 **Enhancing with ML (optional advanced step)**

If you're comfortable with more complexity:

* **TensorFlow\.js**:

  * Train a model using labeled audio data to classify genre or mood.
* **Pretrained audio models**:

  * Consider publicly available models via TensorFlow Hub or Hugging Face for improved accuracy.

---

## ✅ **Conclusion**

Using Node.js with `music-metadata`, `meyda`, and `ffmpeg` provides a practical and free way to achieve basic audio tagging for your AI-powered radio station.

Start with this straightforward approach, evaluate results, and only move to ML if needed to enhance accuracy or detail further.

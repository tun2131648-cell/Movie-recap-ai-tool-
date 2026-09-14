const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenAI } = require("@google/genai");
const wav = require("wav");
const ffmpeg = require("ffmpeg-static");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.send("Movie Recap AI Server is running!");
});


/* =========================
   RUN FFMPEG
========================= */

function runFFmpeg(args) {

  return new Promise((resolve, reject) => {

    const process = spawn(ffmpeg, args);

    let errorText = "";

    process.stderr.on("data", (data) => {
      errorText += data.toString();
    });

    process.on("close", (code) => {

      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            "FFmpeg error: " + errorText.slice(-2000)
          )
        );
      }

    });

  });

}


/* =========================
   SAVE GEMINI TTS WAV
========================= */

function savePCMAsWav(
  filename,
  base64Audio
) {

  return new Promise((resolve, reject) => {

    const pcm =
      Buffer.from(base64Audio, "base64");

    const writer =
      new wav.FileWriter(filename, {
        channels: 1,
        sampleRate: 24000,
        bitDepth: 16
      });

    writer.on("finish", resolve);
    writer.on("error", reject);

    writer.write(pcm);
    writer.end();

  });

}


/* =========================
   UPLOAD + AI PROCESSING
========================= */

app.post(
  "/upload",
  upload.single("video"),
  async (req, res) => {

    let inputFile = null;

    try {

      if (!req.file) {

        return res.status(400).json({
          success: false,
          error: "Video file မရပါ"
        });

      }

      inputFile = req.file.path;

      console.log(
        "Video received:",
        req.file.originalname
      );


      /* =====================
         1. GEMINI FILE UPLOAD
      ===================== */

      console.log(
        "Uploading video to Gemini..."
      );

      let videoFile =
        await ai.files.upload({
          file: inputFile,
          config: {
            mimeType:
              req.file.mimetype || "video/mp4"
          }
        });


      /* =====================
         2. WAIT FOR PROCESSING
      ===================== */

      while (
        videoFile.state === "PROCESSING"
      ) {

        console.log(
          "Gemini video processing..."
        );

        await new Promise(
          resolve =>
            setTimeout(resolve, 3000)
        );

        videoFile =
          await ai.files.get({
            name: videoFile.name
          });

      }


      if (
        videoFile.state === "FAILED"
      ) {

        throw new Error(
          "Gemini video processing failed"
        );

      }


      /* =====================
         3. TRANSLATE VIDEO
      ===================== */

      console.log(
        "Generating Myanmar translation..."
      );

      const interaction =
        await ai.interactions.create({

          model: "gemini-3.8-flash",

          input: [

            {
              type: "video",

              uri: videoFile.uri,

              mime_type:
                videoFile.mimeType,

              processing: "static"

            },

            {
              type: "text",

              text: `
Listen carefully to the spoken dialogue
in this video.

Translate the spoken dialogue into natural
Myanmar Burmese.

Do NOT summarize.

Keep the meaning of the original dialogue.

Return ONLY the Myanmar translated dialogue.
Do not add explanations.
              `
            }

          ]

        });


      const myanmarText =
        interaction.output_text;


      if (!myanmarText) {

        throw new Error(
          "Myanmar translation မရပါ"
        );

      }


      console.log(
        "Myanmar text generated."
      );


      /* =====================
         4. GEMINI TTS
      ===================== */

      console.log(
        "Generating Myanmar voice..."
      );

      const tts =
        await ai.interactions.create({

          model:
            "gemini-3.1-flash-tts-preview",

          input:
            `Read this Myanmar Burmese narration naturally and clearly:

${myanmarText}`,

          response_format: {
            type: "audio"
          },

          generation_config: {

            speech_config: [
              {
                voice: "Kore"
              }
            ]

          }

        });


      if (
        !tts.output_audio ||
        !tts.output_audio.data
      ) {

        throw new Error(
          "TTS audio မရပါ"
        );

      }


      const voiceFile =
        path.join(
          outputDir,
          "voice-" + Date.now() + ".wav"
        );


      await savePCMAsWav(
        voiceFile,
        tts.output_audio.data
      );


      /* =====================
         5. FINAL MP4
         ORIGINAL AUDIO REMOVED
      ===================== */

      const outputName =
        "movie-recap-" +
        Date.now() +
        ".mp4";

      const outputFile =
        path.join(
          outputDir,
          outputName
        );


      console.log(
        "Creating final MP4..."
      );


      await runFFmpeg([

        "-i",
        inputFile,

        "-i",
        voiceFile,

        "-map",
        "0:v:0",

        "-map",
        "1:a:0",

        "-c:v",
        "copy",

        "-c:a",
        "aac",

        "-b:a",
        "128k",

        "-shortest",

        "-y",

        outputFile

      ]);


      /* =====================
         CLEAN TEMP FILES
      ===================== */

      if (fs.existsSync(inputFile)) {
        fs.unlinkSync(inputFile);
      }

      if (fs.existsSync(voiceFile)) {
        fs.unlinkSync(voiceFile);
      }


      /* =====================
         DOWNLOAD URL
      ===================== */

      const downloadUrl =
        `${req.protocol}://${req.get("host")}/download/${outputName}`;


      console.log(
        "Processing complete!"
      );


      res.json({

        success: true,

        message:
          "AI processing ပြီးပါပြီ",

        downloadUrl:

          downloadUrl,

        filename:
          outputName

      });


    } catch (error) {

      console.error(
        "PROCESSING ERROR:",
        error
      );


      if (
        inputFile &&
        fs.existsSync(inputFile)
      ) {

        fs.unlinkSync(inputFile);

      }


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "AI processing မအောင်မြင်ပါ"

      });

    }

  }
);


/* =========================
   DOWNLOAD
========================= */

app.get(
  "/download/:filename",
  (req, res) => {

    const filename =
      path.basename(
        req.params.filename
      );

    const filePath =
      path.join(
        outputDir,
        filename
      );


    if (!fs.existsSync(filePath)) {

      return res.status(404).send(
        "MP4 file မတွေ့ပါ"
      );

    }


    res.download(
      filePath,
      filename
    );

  }
);


/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);

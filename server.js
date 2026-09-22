const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenAI } = require("@google/genai");
const ffmpegPath = require("ffmpeg-static");
const wav = require("wav");

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, "uploads");
const jobsDir = path.join(__dirname, "jobs");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(jobsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/jobs", express.static(jobsDir));

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY မတွေ့ပါ");
}

const ai = new GoogleGenAI({
  apiKey: API_KEY
});


/* =========================
   HELPERS
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function isRateLimitError(error) {
  const message = String(error?.message || error).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}


async function retryGemini(fn, name) {

  const waits = [
    30000,
    60000,
    90000
  ];

  for (let attempt = 0; attempt <= waits.length; attempt++) {

    try {
      return await fn();

    } catch (error) {

      if (
        !isRateLimitError(error) ||
        attempt >= waits.length
      ) {
        throw error;
      }

      const waitTime = waits[attempt];

      console.log(
        `⚠️ ${name} rate limit. ` +
        `${waitTime / 1000}s စောင့်ပြီး retry လုပ်မယ်...`
      );

      await sleep(waitTime);
    }
  }

  throw new Error(`${name} failed`);
}


/* =========================
   FFMPEG
========================= */

function runFFmpeg(args) {

  return new Promise((resolve, reject) => {

    const proc = spawn(ffmpegPath, args);

    let stderr = "";

    proc.stderr.on("data", data => {
      stderr += data.toString();
    });

    proc.on("error", error => {
      reject(error);
    });

    proc.on("close", code => {

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.slice(-6000) ||
          "FFmpeg processing failed"
        )
      );
    });
  });
}


/* =========================
   VIDEO DURATION
========================= */

function getVideoDuration(file) {

  return new Promise((resolve, reject) => {

    const proc = spawn(
      ffmpegPath,
      ["-i", file]
    );

    let output = "";

    proc.stderr.on("data", data => {
      output += data.toString();
    });

    proc.on("error", error => {
      reject(error);
    });

    proc.on("close", () => {

      const match = output.match(
        /Duration:\s*(\d+):(\d+):([\d.]+)/
      );

      if (!match) {
        reject(
          new Error("Video duration မဖတ်နိုင်ပါ")
        );
        return;
      }

      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);

      resolve(
        hours * 3600 +
        minutes * 60 +
        seconds
      );
    });
  });
}


/* =========================
   SAVE WAV
========================= */

function saveWaveFile(
  filename,
  pcmData,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
) {

  return new Promise((resolve, reject) => {

    const writer = new wav.FileWriter(
      filename,
      {
        channels,
        sampleRate: rate,
        bitDepth: sampleWidth * 8
      }
    );

    writer.on("finish", resolve);
    writer.on("error", reject);

    writer.write(pcmData);
    writer.end();
  });
}


/* =========================
   GEMINI VIDEO RECAP
========================= */

async function createRecap(
  videoPath,
  mimeType
) {

  console.log(
    "📤 Gemini ကို Video upload လုပ်နေပါတယ်..."
  );

  let videoFile = await retryGemini(
    () =>
      ai.files.upload({
        file: videoPath,
        config: {
          mimeType: mimeType
        }
      }),
    "Gemini Upload"
  );


  while (videoFile.state === "PROCESSING") {

    console.log(
      "⏳ Gemini video processing..."
    );

    await sleep(3000);

    videoFile = await ai.files.get({
      name: videoFile.name
    });
  }


  if (videoFile.state === "FAILED") {
    throw new Error(
      "Gemini video processing failed"
    );
  }


  console.log(
    "🤖 Gemini Video ကို analyze လုပ်နေပါတယ်..."
  );


  const interaction = await retryGemini(
    () =>
      ai.interactions.create({

        model: "gemini-3.8-flash",

        input: [

          {
            type: "video",
            uri: videoFile.uri,
            mime_type: videoFile.mimeType,
            processing: "static"
          },

          {
            type: "text",

            text: `
ဒီ video ကို သေချာကြည့်ပြီး
မြန်မာဘာသာနဲ့ movie recap narration ရေးပါ။

စည်းကမ်းများ -

- Video ထဲမှာ ဖြစ်တဲ့အကြောင်းအရာကိုပဲ ရေးပါ။
- မဖြစ်ခဲ့တဲ့အရာတွေကို မဖန်တီးပါနဲ့။
- အရေးကြီးတဲ့ scene တွေကို အစဉ်လိုက်ရေးပါ။
- မြန်မာလို သဘာဝကျကျ ရေးပါ။
- Voice နဲ့ဖတ်လို့ကောင်းအောင် ရေးပါ။
- စကားပြောပုံစံနဲ့ သဘာဝကျအောင်ရေးပါ။
- Markdown မသုံးပါနဲ့။
- Heading မသုံးပါနဲ့။
- Bullet point မသုံးပါနဲ့။
`
          }

        ]
      }),

    "Gemini Analysis"
  );


  const recap =
    interaction.output_text?.trim();


  if (!recap) {
    throw new Error(
      "Gemini Recap မရပါ"
    );
  }


  console.log(
    "✅ Gemini Recap ရပါပြီ"
  );

  return recap;
}


/* =========================
   BURMESE TTS
========================= */

async function createBurmeseVoice(
  text,
  outputFile
) {

  console.log(
    "🗣️ Burmese Voice ဖန်တီးနေပါတယ်..."
  );


  const prompt = `
မြန်မာဘာသာဖြင့် အောက်ပါ movie recap narration ကို
သဘာဝကျသော narrator အသံဖြင့် ဖတ်ပါ။

အသံပုံစံ:
- Natural Burmese narrator
- Clear
- Calm
- Movie recap style
- စာကိုသာ ဖတ်ပါ
- အပိုစကား မပြောပါနဲ့

Narration:

${text}
`;


  const interaction = await retryGemini(
    () =>
      ai.interactions.create({

        model:
          "gemini-3.1-flash-tts-preview",

        input: prompt,

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
      }),

    "Gemini TTS"
  );


  if (
    !interaction.output_audio ||
    !interaction.output_audio.data
  ) {

    throw new Error(
      "Burmese Voice audio မရပါ"
    );
  }


  const audioBuffer = Buffer.from(
    interaction.output_audio.data,
    "base64"
  );


  await saveWaveFile(
    outputFile,
    audioBuffer
  );


  console.log(
    "✅ Burmese Voice ရပါပြီ"
  );
}


/* =========================
   ASS SUBTITLE
========================= */

function escapeASS(text) {

  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}


function createASS(
  text,
  outputFile,
  position = 82,
  fontSize = 58,
  color = "&H00FFFFFF"
) {

  const safeText = escapeASS(text);

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${color},&H000000FF,&H00000000,&H99000000,0,0,0,0,100,100,0,0,1,2,1,5,60,60,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,9:59:59.00,Default,,60,60,30,,{\\pos(960,${Math.round(
    1080 * Number(position) / 100
  )})}${safeText}
`;

  fs.writeFileSync(
    outputFile,
    ass,
    "utf8"
  );
}


/* =========================
   MAKE PREVIEW VIDEO
========================= */

async function makePreviewVideo(
  originalVideo,
  voiceFile,
  subtitleFile,
  outputFile
) {

  console.log(
    "🎬 After Video Preview render လုပ်နေပါတယ်..."
  );


  const filter = [
    "[0:v]split=2[base][blur];",
    "[blur]crop=iw:ih*0.30:0:ih*0.70,gblur=sigma=18[blurred];",
    "[base][blurred]overlay=0:H-h[v1];",
    "[v1]subtitles=" +
      subtitleFile.replace(/\\/g, "/") +
      "[v]"
  ].join("");


  await runFFmpeg([

    "-y",

    "-i",
    originalVideo,

    "-i",
    voiceFile,

    "-filter_complex",
    filter,

    "-map",
    "[v]",

    "-map",
    "1:a:0",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "28",

    "-c:a",
    "aac",

    "-b:a",
    "128k",

    "-shortest",

    outputFile
  ]);


  console.log(
    "✅ After Video Preview ပြီးပါပြီ"
  );
}


/* =========================
   FINAL VIDEO
========================= */

async function makeFinalVideo(
  originalVideo,
  voiceFile,
  subtitleFile,
  outputFile
) {

  console.log(
    "🎬 Final MP4 render လုပ်နေပါတယ်..."
  );


  const filter = [
    "[0:v]split=2[base][blur];",
    "[blur]crop=iw:ih*0.30:0:ih*0.70,gblur=sigma=18[blurred];",
    "[base][blurred]overlay=0:H-h[v1];",
    "[v1]subtitles=" +
      subtitleFile.replace(/\\/g, "/") +
      "[v]"
  ].join("");


  await runFFmpeg([

    "-y",

    "-i",
    originalVideo,

    "-i",
    voiceFile,

    "-filter_complex",
    filter,

    "-map",
    "[v]",

    "-map",
    "1:a:0",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "27",

    "-c:a",
    "aac",

    "-b:a",
    "128k",

    "-shortest",

    outputFile
  ]);


  console.log(
    "✅ Final MP4 ပြီးပါပြီ"
  );
}


/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "Movie Recap AI Server is running!"
  });

});


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
          error: "Video မတွေ့ပါ"
        });

      }


      inputFile = req.file.path;


      const duration =
        await getVideoDuration(inputFile);


      console.log(
        `🎥 Video duration: ${duration.toFixed(1)} seconds`
      );


      if (duration > 300) {

        fs.unlinkSync(inputFile);

        return res.status(400).json({
          success: false,
          error: "Video က ၅ မိနစ်ထက် မကျော်ရပါ"
        });

      }


      const jobId =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;


      const jobDir =
        path.join(jobsDir, jobId);


      fs.mkdirSync(jobDir, {
        recursive: true
      });


      const originalPath =
        path.join(
          jobDir,
          "original.mp4"
        );


      fs.renameSync(
        inputFile,
        originalPath
      );


      inputFile = null;


      const recapPath =
        path.join(
          jobDir,
          "recap.txt"
        );


      const voicePath =
        path.join(
          jobDir,
          "voice.wav"
        );


      const previewASS =
        path.join(
          jobDir,
          "preview.ass"
        );


      const previewMP4 =
        path.join(
          jobDir,
          "preview.mp4"
        );


      const mimeType =
        req.file.mimetype ||
        "video/mp4";


      /* Gemini Recap */

      const recap =
        await createRecap(
          originalPath,
          mimeType
        );


      fs.writeFileSync(
        recapPath,
        recap,
        "utf8"
      );


      /* Burmese Voice */

      await createBurmeseVoice(
        recap,
        voicePath
      );


      /* Default subtitle */

      createASS(
        recap,
        previewASS,
        82,
        58,
        "&H00FFFFFF"
      );


      /* Preview */

      await makePreviewVideo(
        originalPath,
        voicePath,
        previewASS,
        previewMP4
      );


      return res.json({

        success: true,

        jobId,

        previewUrl:
          `/jobs/${jobId}/preview.mp4`,

        message:
          "After Video Preview ပြီးပါပြီ"
      });


    } catch (error) {

      console.error(
        "❌ Upload processing error:",
        error
      );


      if (
        inputFile &&
        fs.existsSync(inputFile)
      ) {

        try {
          fs.unlinkSync(inputFile);
        } catch {}
      }


      return res.status(500).json({

        success: false,

        error:
          error?.message ||
          "Processing မအောင်မြင်ပါ"
      });
    }
  }
);


/* =========================
   FINAL RENDER
========================= */

app.post(
  "/render",
  async (req, res) => {

    try {

      const {
        jobId,
        position,
        fontSize,
        color
      } = req.body;


      if (!jobId) {

        return res.status(400).json({
          success: false,
          error: "jobId မတွေ့ပါ"
        });

      }


      const jobDir =
        path.join(
          jobsDir,
          jobId
        );


      if (
        !fs.existsSync(jobDir)
      ) {

        return res.status(404).json({
          success: false,
          error: "Job မတွေ့ပါ"
        });

      }


      const originalPath =
        path.join(
          jobDir,
          "original.mp4"
        );


      const voicePath =
        path.join(
          jobDir,
          "voice.wav"
        );


      if (
        !fs.existsSync(originalPath) ||
        !fs.existsSync(voicePath)
      ) {

        return res.status(404).json({
          success: false,
          error:
            "Original video သို့မဟုတ် voice မတွေ့ပါ"
        });

      }


      const finalASS =
        path.join(
          jobDir,
          "final.ass"
        );


      const finalMP4 =
        path.join(
          jobDir,
          "final.mp4"
        );


      const safePosition =
        Math.max(
          5,
          Math.min(
            95,
            Number(position) || 82
          )
        );


      const safeFontSize =
        Math.max(
          24,
          Math.min(
            120,
            Number(fontSize) || 58
          )
        );


      const safeColor =
        typeof color === "string" &&
        /^&H[0-9A-Fa-f]{8}$/.test(color)
          ? color
          : "&H00FFFFFF";


      createASS(
        fs.readFileSync(
          path.join(jobDir, "recap.txt"),
          "utf8"
        ),
        finalASS,
        safePosition,
        safeFontSize,
        safeColor
      );


      await makeFinalVideo(
        originalPath,
        voicePath,
        finalASS,
        finalMP4
      );


      return res.json({

        success: true,

        downloadUrl:
          `/jobs/${jobId}/final.mp4`,

        message:
          "Final MP4 ပြီးပါပြီ"
      });


    } catch (error) {

      console.error(
        "❌ Final render error:",
        error
      );


      return res.status(500).json({

        success: false,

        error:
          error?.message ||
          "Final MP4 render မအောင်မြင်ပါ"
      });
    }
  }
);


/* =========================
   GLOBAL ERROR
========================= */

app.use(
  (error, req, res, next) => {

    console.error(
      "❌ Server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Server error"
    });
  }
);


/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});

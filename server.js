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
   BASIC HELPERS
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function isRateLimitError(error) {
  const message = String(error?.message || error);

  return (
    message.includes("429") ||
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("resource_exhausted")
  );
}


/*
  Gemini Free Tier 429 ဖြစ်ရင်
  အလိုအလျောက် စောင့်ပြီး retry လုပ်မယ်
*/
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
}


/* =========================
   FFMPEG
========================= */

function runFFmpeg(args) {

  return new Promise((resolve, reject) => {

    const process = spawn(
      ffmpegPath,
      args
    );

    let stderr = "";

    process.stderr.on("data", data => {
      stderr += data.toString();
    });

    process.on("error", error => {
      reject(error);
    });

    process.on("close", code => {

      if (code === 0) {

        resolve();

      } else {

        reject(
          new Error(
            stderr.slice(-5000) ||
            "FFmpeg processing failed"
          )
        );

      }

    });

  });
}


/* =========================
   VIDEO DURATION
========================= */

function getVideoDuration(file) {

  return new Promise((resolve, reject) => {

    const process = spawn(
      ffmpegPath,
      ["-i", file]
    );

    let output = "";

    process.stderr.on("data", data => {
      output += data.toString();
    });

    process.on("error", error => {
      reject(error);
    });

    /*
      ffmpeg -i တစ်ခုတည်းဆို
      exit code 1 ဖြစ်နိုင်တယ်။
      ဒါပေမယ့် Duration ကို stderr ထဲမှာ
      ရနေတဲ့အတွက် code ကိုမကြည့်ဘဲ parse လုပ်မယ်။
    */
    process.on("close", () => {

      const match = output.match(
        /Duration:\s*(\d+):(\d+):([\d.]+)/
      );

      if (!match) {

        reject(
          new Error(
            "Video duration မဖတ်နိုင်ပါ"
          )
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
   GEMINI VIDEO RECAP
========================= */

async function createRecap(
  videoPath,
  mimeType
) {

  console.log(
    "📤 Gemini ကို Video upload လုပ်နေပါတယ်..."
  );


  let videoFile =
    await retryGemini(
      () =>
        ai.files.upload({
          file: videoPath,
          config: {
            mimeType: mimeType
          }
        }),
      "Gemini Upload"
    );


  while (
    videoFile.state === "PROCESSING"
  ) {

    console.log(
      "⏳ Gemini video processing..."
    );

    await sleep(3000);

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


  console.log(
    "🤖 Gemini Video ကို analyze လုပ်နေပါတယ်..."
  );


  const interaction =
    await retryGemini(
      () =>
        ai.interactions.create({

          model:
            "gemini-3.8-flash",

          input: [

            {
              type: "video",

              uri:
                videoFile.uri,

              mime_type:
                videoFile.mimeType,

              processing:
                "static"
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
- မလိုအပ်တဲ့အကြောင်းအရာ မထည့်ပါနဲ့။
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


  const interaction =
    await retryGemini(
      () =>
        ai.interactions.create({

          model:
            "gemini-3.1-flash-tts-preview",

          input: `
Speak only the Burmese narration below.

Style:
- Natural Burmese
- Movie recap narrator
- Clear voice

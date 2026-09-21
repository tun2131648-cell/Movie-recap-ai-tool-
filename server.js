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

const uploads = path.join(__dirname, "uploads");
const outputs = path.join(__dirname, "outputs");
const temp = path.join(__dirname, "temp");

fs.mkdirSync(uploads, { recursive: true });
fs.mkdirSync(outputs, { recursive: true });
fs.mkdirSync(temp, { recursive: true });

app.use(cors());
app.use(express.json());

app.use("/outputs", express.static(outputs));

const upload = multer({
  dest: uploads,
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


function runFFmpeg(args) {

  return new Promise((resolve, reject) => {

    const process = spawn(ffmpegPath, args);

    let errorText = "";

    process.stderr.on("data", data => {
      errorText += data.toString();
    });

    process.on("error", reject);

    process.on("close", code => {

      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            errorText.slice(-4000) ||
            "FFmpeg processing failed"
          )
        );
      }

    });

  });

}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function getVideoDuration(file) {

  return new Promise((resolve, reject) => {

    const process = spawn(ffmpegPath, [
      "-i",
      file
    ]);

    let output = "";

    process.stderr.on("data", data => {
      output += data.toString();
    });

    process.on("close", () => {

      const match =
        output.match(
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
   GEMINI VIDEO RECAP
========================= */

async function createRecap(videoFile, mimeType) {

  console.log("📤 Uploading video to Gemini...");

  let file = await ai.files.upload({
    file: videoFile,
    config: {
      mimeType: mimeType
    }
  });


  while (file.state === "PROCESSING") {

    console.log("⏳ Gemini video processing...");

    await sleep(3000);

    file = await ai.files.get({
      name: file.name
    });

  }


  if (file.state === "FAILED") {
    throw new Error(
      "Gemini video processing failed"
    );
  }


  console.log("🤖 Gemini analyzing video...");


  const interaction =
    await ai.interactions.create({

      model: "gemini-3.8-flash",

      input: [

        {
          type: "video",
          uri: file.uri,
          mime_type: file.mimeType,
          processing: "static"
        },

        {
          type: "text",

          text: `
ဒီ video ကို သေချာကြည့်ပြီး
မြန်မာဘာသာနဲ့ Movie Recap narration ရေးပါ။

စည်းကမ်းများ -

1. Video ထဲမှာ ဖြစ်တဲ့အကြောင်းအရာကိုပဲ ရေးပါ။
2. အရေးကြီးတဲ့ scene တွေကို အစဉ်လိုက်ရေးပါ။
3. မြန်မာလို သဘာဝကျကျ ရေးပါ။
4. Voice နဲ့ဖတ်လို့ကောင်းအောင် ရေးပါ။
5. မလိုအပ်တဲ့အကြောင်းအရာ မထည့်ပါနဲ့။
6. Markdown မသုံးပါနဲ့။
7. Heading မသုံးပါနဲ့။
8. Bullet point မသုံးပါနဲ့။
`
        }

      ]

    });


  const text =
    interaction.output_text?.trim();


  if (!text) {
    throw new Error(
      "Gemini Recap မရပါ"
    );
  }


  console.log("✅ Recap received");

  return text;

}


/* =========================
   BURMESE TTS
========================= */

async function createVoice(text, outputFile) {

  console.log("🗣️ Creating Burmese voice...");


  for (let attempt = 1; attempt <= 3; attempt++) {

    try {

      const interaction =
        await ai.interactions.create({

          model:
            "gemini-3.1-flash-tts-preview",

          input: `
Synthesize natural Burmese (Myanmar) speech.

Style:
- Movie recap narration
- Natural
- Clear
- Medium speed
- Do not speak the instructions
- Speak only the Burmese narration

Narration:

${text}
`,

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
        !interaction.output_audio ||
        !interaction.output_audio.data
      ) {

        throw new Error(
          "TTS audio မရပါ"
        );

      }


      const pcm =
        Buffer.from(
          interaction.output_audio.data,
          "base64"
        );


      await new Promise(
        (resolve, reject) => {

          const writer =
            new wav.FileWriter(
              outputFile,
              {
                channels: 1,
                sampleRate: 24000,
                bitDepth: 16
              }
            );

          writer.on(
            "finish",
            resolve
          );

          writer.on(
            "error",
            reject
          );

          writer.write(pcm);
          writer.end();

        }
      );


      console.log("✅ Burmese voice created");

      return;

    }

    catch (error) {

      console.log(
        `TTS attempt ${attempt} failed`
      );

      if (attempt === 3) {
        throw error;
      }

      await sleep(1500);

    }

  }

}


/* =========================
   ASS SUBTITLE
========================= */

function escapeASS(text) {

  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");

}


function createASS(
  text,
  duration,
  position
) {

  const y =
    Math.round(
      1080 *
      (Number(position) / 100)
    );


  const safeText =
    escapeASS(text);


  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Myanmar,Arial,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,0,0,0,0,100,100,0,0,1,3,1,5,40,40,40,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:00.00,0:10:00.00,Myanmar,,0,0,0,,{\\pos(960,${y})}${safeText}
`;

}


/* =========================
   FINAL MP4
========================= */

async function renderFinalVideo(
  input,
  audio,
  subtitle,
  output
) {

  console.log(
    "🎬 Rendering final MP4..."
  );


  const subtitlePath =
    subtitle
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");

  const filter =

    "[0:v]split=2[original][blur];" +

    "[blur]" +
    "crop=iw:ih*0.28:0:ih*0.72," +
    "boxblur=12:2" +
    "[blurred];" +

    "[original][blurred]" +
    "overlay=0:H-h" +
    "[video];" +

    "[video]" +
    `subtitles=${subtitlePath}` +
    "[final]";


  await runFFmpeg([

    "-y",

    "-i",
    input,

    "-i",
    audio,

    "-filter_complex",
    filter,

    "-map",
    "[final]",

    "-map",
    "1:a:0",

    "-af",
    "apad",

    "-shortest",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    "-c:a",
    "aac",

    "-b:a",
    "128k",

    "-movflags",
    "+faststart",

    output

  ]);


  console.log(
    "✅ Final MP4 created"
  );

}


/* =========================
   UPLOAD API
========================= */

app.post(
  "/upload",
  upload.single("video"),
  async (req, res) => {

    let inputFile = null;
    let audioFile = null;
    let subtitleFile = null;
    let outputFile = null;


    try {

      if (!API_KEY) {

        throw new Error(
          "GEMINI_API_KEY မတွေ့ပါ"
        );

      }


      if (!req.file) {

        return res.status(400).json({
          success: false,
          error:
            "Video file မရပါ"
        });

      }


      inputFile =
        req.file.path;


      const duration =
        await getVideoDuration(
          inputFile
        );


      if (duration > 300) {

        throw new Error(
          "Video က ၅ မိနစ်ထက် မကျော်ရပါ"
        );

      }


      const mimeType =
        req.file.mimetype &&
        req.file.mimetype.startsWith("video/")
          ? req.file.mimetype
          : "video/mp4";


      console.log(
        "📁 Video:",
        req.file.originalname
      );


      /* 1 */
      const recap =
        await createRecap(
          inputFile,
          mimeType
        );


      /* 2 */

      const id =
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .substring(2, 8);


      audioFile =
        path.join(
          temp,
          `${id}.wav`
        );


      subtitleFile =
        path.join(
          temp,
          `${id}.ass`
        );


      outputFile =
        path.join(
          outputs,
          `${id}.mp4`
        );


      /* 3 */

      const position =
        Number(
          req.body.subtitleY || 82
        );


      fs.writeFileSync(

        subtitleFile,

        createASS(
          recap,
          duration,
          position
        ),

        "utf8"

      );


      /* 4 */

      await createVoice(
        recap,
        audioFile
      );


      /* 5 */

      await renderFinalVideo(
        inputFile,
        audioFile,
        subtitleFile,
        outputFile
      );


      const downloadUrl =
        `${req.protocol}://${req.get("host")}/outputs/${path.basename(outputFile)}`;


      console.log(
        "🎉 ALL DONE:",
        downloadUrl
      );


      res.json({

        success: true,

        result: recap,

        downloadUrl: downloadUrl

      });


    }

    catch (error) {

      console.error(
        "❌ PROCESS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Processing မအောင်မြင်ပါ"

      });

    }


    finally {

      for (
        const file
        of [
          inputFile,
          audioFile,
          subtitleFile
        ]
      ) {

        try {

          if (
            file &&
            fs.existsSync(file)
          ) {

            fs.unlinkSync(file);

          }

        }

        catch {}

      }

    }

  }
);


app.get(
  "/",
  (req, res) => {

    res.send(
      "Movie Recap AI Server is running!"
    );

  }
);


app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);

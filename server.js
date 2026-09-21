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
const jobsDir = path.join(__dirname, "jobs");

fs.mkdirSync(uploads, { recursive: true });
fs.mkdirSync(jobsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/jobs", express.static(jobsDir));

const upload = multer({
  dest: uploads,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("GEMINI_API_KEY မတွေ့ပါ");
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


async function retry429(fn, name = "API") {

  const delays = [
    30000,
    60000,
    90000
  ];

  for (let i = 0; i <= delays.length; i++) {

    try {

      return await fn();

    } catch (error) {

      const message =
        String(error?.message || error);

      const is429 =
        message.includes("429") ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("resource_exhausted");

      if (!is429 || i === delays.length) {
        throw error;
      }

      const wait =
        delays[i];

      console.log(
        `⚠️ ${name} rate limit. Waiting ${wait / 1000}s...`
      );

      await sleep(wait);
    }
  }
}


function runFFmpeg(args) {

  return new Promise((resolve, reject) => {

    const process = spawn(
      ffmpegPath,
      args
    );

    let stderr = "";

    process.stderr.on(
      "data",
      data => {
        stderr += data.toString();
      }
    );

    process.on(
      "error",
      reject
    );

    process.on(
      "close",
      code => {

        if (code === 0) {
          resolve();
        } else {

          reject(
            new Error(
              stderr.slice(-5000) ||
              "FFmpeg error"
            )
          );

        }

      }
    );

  });
}


function getDuration(file) {

  return new Promise((resolve, reject) => {

    const process =
      spawn(
        ffmpegPath,
        ["-i", file]
      );

    let output = "";

    process.stderr.on(
      "data",
      data => {
        output += data.toString();
      }
    );

    process.on(
      "close",
      () => {

        const match =
          output.match(
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

        const h =
          Number(match[1]);

        const m =
          Number(match[2]);

        const s =
          Number(match[3]);

        resolve(
          h * 3600 +
          m * 60 +
          s
        );

      }
    );

  });

}


function escapeASS(text) {

  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");

}


function assTime(seconds) {

  const h =
    Math.floor(seconds / 3600);

  const m =
    Math.floor(
      (seconds % 3600) / 60
    );

  const s =
    Math.floor(seconds % 60);

  const cs =
    Math.floor(
      (seconds -
        Math.floor(seconds)) *
      100
    );

  return (
    `${h}:${String(m).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")}.` +
    `${String(cs).padStart(2, "0")}`
  );

}


/* =========================
   GEMINI RECAP
========================= */

async function createRecap(
  video,
  mimeType
) {

  console.log(
    "📤 Uploading video to Gemini..."
  );

  let file =
    await retry429(
      () =>
        ai.files.upload({
          file: video,
          config: {
            mimeType: mimeType
          }
        }),
      "Gemini upload"
    );


  while (
    file.state === "PROCESSING"
  ) {

    console.log(
      "⏳ Gemini processing..."
    );

    await sleep(3000);

    file =
      await ai.files.get({
        name: file.name
      });

  }


  if (
    file.state === "FAILED"
  ) {

    throw new Error(
      "Gemini video processing failed"
    );

  }


  console.log(
    "🤖 Gemini analyzing..."
  );


  const interaction =
    await retry429(
      () =>
        ai.interactions.create({

          model:
            "gemini-3.8-flash",

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
မြန်မာဘာသာနဲ့ movie recap narration ရေးပါ။

စည်းကမ်းများ။

- Video ထဲမှာ ဖြစ်တာကိုပဲရေးပါ။
- အရေးကြီးတဲ့ scene တွေကို အစဉ်လိုက်ရေးပါ။
- မြန်မာလို သဘာဝကျကျရေးပါ။
- Voice နဲ့ဖတ်လို့ကောင်းအောင်ရေးပါ။
- မလိုအပ်တာမထည့်ပါနဲ့။
- Markdown မသုံးပါနဲ့။
- Heading မသုံးပါနဲ့။
- Bullet point မသုံးပါနဲ့။
`
            }

          ]

        }),
      "Gemini analysis"
    );


  const result =
    interaction.output_text?.trim();


  if (!result) {

    throw new Error(
      "Gemini recap မရပါ"
    );

  }


  return result;

}


/* =========================
   BURMESE VOICE
========================= */

async function createVoice(
  text,
  output
) {

  console.log(
    "🗣️ Creating Burmese voice..."
  );


  const interaction =
    await retry429(
      () =>
        ai.interactions.create({

          model:
            "gemini-3.1-flash-tts-preview",

          input: `
Speak only this Burmese narration.

Style:
Natural movie recap narrator.
Clear Burmese.
Medium speed.

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

        }),
      "Gemini TTS"
    );


  if (
    !interaction.output_audio ||
    !interaction.output_audio.data
  ) {

    throw new Error(
      "Burmese voice မရပါ"
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
          output,
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

}


/* =========================
   SUBTITLE
========================= */

function createASS(
  text,
  duration,
  position,
  fontSize,
  color,
  outline
) {

  let alignment = 5;

  let y = 540;

  const pos =
    Number(position);


  if (pos <= 25) {

    y = 150;

  } else if (pos <= 55) {

    y = 540;

  } else {

    y = 900;

  }


  const size =
    Number(fontSize || 58);


  const primary =
    color || "&H00FFFFFF";


  const outlineColor =
    outline || "&H00000000";


  const safe =
    escapeASS(text);


  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Myanmar,Arial,${size},${primary},${primary},${outlineColor},&H99000000,0,0,0,0,100,100,0,0,1,3,1,5,40,40,40,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:00.00,${assTime(duration)},Myanmar,,0,0,0,,{\\pos(960,${y})}${safe}
`;

}


/* =========================
   RENDER
========================= */

async function renderVideo(
  original,
  voice,
  subtitle,
  output
) {

  const subtitlePath =
    subtitle
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");

  const filter =
    "[0:v]split=2[main][blur];" +

    "[blur]" +
    "crop=iw:ih*0.30:0:ih*0.70," +
    "boxblur=14:3" +
    "[blurred];" +

    "[main][blurred]" +
    "overlay=0:H-h" +
    "[clean];" +

    "[clean]" +
    `subtitles=${subtitlePath}` +
    "[v]";


  await runFFmpeg([

    "-y",

    "-i",
    original,

    "-i",
    voice,

    "-filter_complex",
    filter,

    "-map",
    "[v]",

    "-map",
    "1:a:0",

    "-af",
    "apad",

    "-t",
    "300",

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

}


/* =========================
   UPLOAD
========================= */

app.post(
  "/upload",
  upload.single("video"),
  async (req, res) => {

    let input = null;

    try {

      if (!API_KEY) {

        throw new Error(
          "GEMINI_API_KEY မတွေ့ပါ"
        );

      }


      if (!req.file) {

        throw new Error(
          "Video file မရပါ"
        );

      }


      input =
        req.file.path;


      const duration =
        await getDuration(
          input
        );


      if (duration > 300) {

        throw new Error(
          "Video က ၅ မိနစ်ထက် မကျော်ရပါ"
        );

      }


      const mime =
        req.file.mimetype?.startsWith(
          "video/"
        )
          ? req.file.mimetype
          : "video/mp4";


      /* GEMINI RECAP */

      const recap =
        await createRecap(
          input,
          mime
        );


      /* JOB */

      const jobId =
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .slice(2, 8);


      const job =
        path.join(
          jobsDir,
          jobId
        );


      fs.mkdirSync(job);


      const original =
        path.join(
          job,
          "original.mp4"
        );


      const voice =
        path.join(
          job,
          "voice.wav"
        );


      const subtitle =
        path.join(
          job,
          "subtitle.ass"
        );


      const preview =
        path.join(
          job,
          "preview.mp4"
        );


      fs.copyFileSync(
        input,
        original
      );


      /* TTS */

      await createVoice(
        recap,
        voice
      );


      /* Default subtitle */

      fs.writeFileSync(

        subtitle,

        createASS(
          recap,
          duration,
          82,
          58,
          "&H00FFFFFF",
          "&H00000000"
        ),

        "utf8"

      );


      /* PREVIEW */

      await renderVideo(
        original,
        voice,
        subtitle,
        preview
      );


      res.json({

        success: true,

        jobId,

        recap,

        previewUrl:
          `${req.protocol}://${req.get("host")}/jobs/${jobId}/preview.mp4`

      });


    }

    catch (error) {

      console.error(
        "UPLOAD ERROR:",
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

      try {

        if (
          input &&
          fs.existsSync(input)
        ) {

          fs.unlinkSync(input);

        }

      } catch {}

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

        throw new Error(
          "jobId မရပါ"
        );

      }


      const job =
        path.join(
          jobsDir,
          jobId
        );


      if (!fs.existsSync(job)) {

        throw new Error(
          "Job မတွေ့ပါ"
        );

      }


      const original =
        path.join(
          job,
          "original.mp4"
        );


      const voice =
        path.join(
          job,
          "voice.wav"
        );


      const oldSubtitle =
        path.join(
          job,
          "subtitle.ass"
        );


      const preview =
        path.join(
          job,
          "preview.mp4"
        );


      if (
        !fs.existsSync(original) ||
        !fs.existsSync(voice) ||
        !fs.existsSync(oldSubtitle)
      ) {

        throw new Error(
          "Processing files မပြည့်စုံပါ"
        );

      }


      const recap =
        fs.readFileSync(
          path.join(
            job,
            "recap.txt"
          ),
          "utf8"
        );


      const duration =
        await getDuration(
          original
        );


      const subtitle =
        path.join(
          job,
          "final.ass"
        );


      const final =
        path.join(
          job,
          "final.mp4"
        );


      fs.writeFileSync(

        subtitle,

        createASS(
          recap,
          duration,
          position || 82,
          fontSize || 58,
          color || "&H00FFFFFF",
          "&H00000000"
        ),

        "utf8"

      );


      await renderVideo(
        original,
        voice,
        subtitle,
        final
      );


      res.json({

        success: true,

        downloadUrl:
          `${req.protocol}://${req.get("host")}/jobs/${jobId}/final.mp4`

      });


    }

    catch (error) {

      console.error(
        "RENDER ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error.message ||
          "Final render failed"

      });

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

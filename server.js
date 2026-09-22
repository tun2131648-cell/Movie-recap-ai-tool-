const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { GoogleGenAI } = require("@google/genai");
const ffmpegPath = require("ffmpeg-static");
const wav = require("wav");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
const JOBS = path.join(ROOT, "jobs");

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(JOBS, { recursive: true });

app.use("/jobs", express.static(JOBS));

const upload = multer({
  dest: UPLOADS,
  limits: { fileSize: 500 * 1024 * 1024 }
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const jobs = new Map();

function updateJob(jobId, progress, status, extra = {}) {
  const old = jobs.get(jobId) || {};

  jobs.set(jobId, {
    ...old,
    progress,
    status,
    updatedAt: Date.now(),
    ...extra
  });

  console.log(`[${jobId}] ${progress}% ${status}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geminiCall(fn) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || err);

      if (!msg.includes("429") || attempt === 3) {
        throw err;
      }

      const wait = attempt * 30000;

      console.log(
        `Gemini 429. Waiting ${wait / 1000}s...`
      );

      await sleep(wait);
    }
  }
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-y", ...args]);

    let stderr = "";

    p.stderr.on("data", data => {
      stderr += data.toString();
    });

    p.on("error", reject);

    p.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            "FFmpeg failed: " +
            stderr.slice(-3000)
          )
        );
      }
    });
  });
}

function getDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-i", file]);

    let err = "";

    p.stderr.on("data", data => {
      err += data.toString();
    });

    p.on("close", () => {
      const m = err.match(
        /Duration:\s*(\d+):(\d+):([\d.]+)/
      );

      if (!m) {
        return reject(
          new Error("Video duration မဖတ်နိုင်ပါ")
        );
      }

      resolve(
        Number(m[1]) * 3600 +
        Number(m[2]) * 60 +
        Number(m[3])
      );
    });
  });
}

function pcmToWav(pcmBase64, outFile) {
  return new Promise((resolve, reject) => {
    const writer = new wav.FileWriter(outFile, {
      channels: 1,
      sampleRate: 24000,
      bitDepth: 16
    });

    writer.on("error", reject);
    writer.on("finish", resolve);

    writer.write(
      Buffer.from(pcmBase64, "base64")
    );

    writer.end();
  });
}

async function makeRecap(job, videoFile) {

  updateJob(
    job.id,
    20,
    "🎞️ Gemini က Video ကို ခွဲခြမ်းနေပါတယ်..."
  );

  const uploaded = await geminiCall(() =>
    ai.files.upload({
      file: videoFile,
      config: {
        mimeType: job.mimeType
      }
    })
  );

  let state = uploaded.state;

  while (state === "PROCESSING") {

    await sleep(3000);

    const current = await ai.files.get({
      name: uploaded.name
    });

    state = current.state;
  }

  if (state === "FAILED") {
    throw new Error(
      "Gemini Video processing မအောင်မြင်ပါ"
    );
  }

  updateJob(
    job.id,
    42,
    "📝 မြန်မာ Movie Recap ရေးနေပါတယ်..."
  );

  const interaction = await geminiCall(() =>
    ai.interactions.create({
      model: "gemini-3.8-flash",

      input: [
        {
          type: "video",
          uri: uploaded.uri,
          mime_type:
            uploaded.mimeType ||
            job.mimeType,
          processing: "static"
        },

        {
          type: "text",

          text:
            "ဒီ video ကို မြန်မာဘာသာနဲ့ " +
            "movie recap အဖြစ် အတိုချုံးရေးပါ။ " +

            "Video ထဲက အဓိကဖြစ်ရပ်တွေကိုသာ " +
            "ရှင်းရှင်းလင်းလင်း ဖော်ပြပါ။ " +

            "အပိုရှင်းပြချက်၊ title၊ bullet point " +
            "မထည့်ပါနဲ့။ " +

            "အသံထွက်ဖတ်ရန် သဘာဝကျတဲ့ " +
            "မြန်မာစကားပြောပုံစံနဲ့ " +
            "paragraph တစ်ခုအဖြစ်သာ ပြန်ပေးပါ။"
        }
      ]
    })
  );

  const recap =
    String(
      interaction.output_text || ""
    ).trim();

  if (!recap) {
    throw new Error(
      "Gemini က Recap စာမပြန်ပါ"
    );
  }

  fs.writeFileSync(
    path.join(job.dir, "recap.txt"),
    recap,
    "utf8"
  );

  return recap;
}

async function makeVoice(job, recap) {

  updateJob(
    job.id,
    58,
    "🔊 မြန်မာအသံ ဖန်တီးနေပါတယ်..."
  );

  const interaction = await geminiCall(() =>
    ai.interactions.create({
      model:
        "gemini-3.1-flash-tts-preview",

      input:
        "Generate natural Burmese narration. " +
        "Speak only the Burmese narration below. " +
        "Do not read instructions aloud.\n\n" +
        recap,

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
    })
  );

  const audioData =
    interaction?.output_audio?.data;

  if (!audioData) {
    throw new Error(
      "TTS က Audio ပြန်မပေးပါ"
    );
  }

  const wavFile =
    path.join(job.dir, "voice.wav");

  await pcmToWav(
    audioData,
    wavFile
  );

  return wavFile;
}

function makeASS(
  job,
  position = 82,
  fontSize = 58,
  color = "&H00FFFFFF"
) {

  const recap =
    fs.readFileSync(
      path.join(job.dir, "recap.txt"),
      "utf8"
    )
    .replace(/\r?\n/g, " ")
    .replace(/[{}]/g, "");

  const y =
    Math.max(
      5,
      Math.min(
        95,
        Number(position) || 82
      )
    );

  const size =
    Math.max(
      24,
      Math.min(
        100,
        Number(fontSize) || 58
      )
    );

  const ass =
`[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,${size},${color},${color},&H00000000,&H99000000,1,0,0,0,100,100,0,0,1,4,1,5,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,9:59:59.00,Default,,0,0,0,0,${recap}
`;

  const file =
    path.join(
      job.dir,
      "subtitles.ass"
    );

  fs.writeFileSync(
    file,
    ass,
    "utf8"
  );

  return file;
}

async function makePreview(
  job,
  voiceFile
) {

  updateJob(
    job.id,
    76,
    "🎬 After Video Preview ဖန်တီးနေပါတယ်..."
  );

  const input =
    path.join(
      job.dir,
      "original.mp4"
    );

  const ass =
    makeASS(job);

  const out =
    path.join(
      job.dir,
      "preview.mp4"
    );

  await runFFmpeg([
    "-i",
    input,

    "-i",
    voiceFile,

    "-filter_complex",

    "[0:v]split=2[base][blur];" +
    "[blur]crop=iw:ih*0.30:0:ih*0.70," +
    "gblur=sigma=18[blurred];" +

    "[base][blurred]" +
    "overlay=0:H-h[blurredvideo];" +

    "[blurredvideo]subtitles=" +
    ass
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:") +
    "[v]",

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

    out
  ]);

  return out;
}

async function makeFinal(
  job,
  position,
  fontSize,
  color
) {

  updateJob(
    job.id,
    78,
    "🎬 Final MP4 ပြန် render လုပ်နေပါတယ်..."
  );

  const input =
    path.join(
      job.dir,
      "original.mp4"
    );

  const voice =
    path.join(
      job.dir,
      "voice.wav"
    );

  const ass =
    makeASS(
      job,
      position,
      fontSize,
      color
    );

  const out =
    path.join(
      job.dir,
      "final.mp4"
    );

  await runFFmpeg([
    "-i",
    input,

    "-i",
    voice,

    "-filter_complex",

    "[0:v]split=2[base][blur];" +
    "[blur]crop=iw:ih*0.30:0:ih*0.70," +
    "gblur=sigma=18[blurred];" +

    "[base][blurred]" +
    "overlay=0:H-h[blurredvideo];" +

    "[blurredvideo]subtitles=" +
    ass
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:") +
    "[v]",

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

    out
  ]);

  return out;
}

app.get("/", (req, res) => {

  res.json({
    success: true,
    message:
      "Movie Recap AI Server is running!"
  });

});

app.get(
  "/status/:jobId",
  (req, res) => {

    const job =
      jobs.get(
        req.params.jobId
      );

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job မတွေ့ပါ"
      });
    }

    res.json({
      success: true,
      ...job
    });

  }
);

app.post(
  "/upload",
  upload.single("video"),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Video မပါပါ"
        });
      }

      const duration =
        await getDuration(
          req.file.path
        );

      if (duration > 300) {

        fs.unlinkSync(
          req.file.path
        );

        return res.status(400).json({
          success: false,
          error:
            "Video က ၅ မိနစ်ထက် မကျော်ရပါ"
        });
      }

      const jobId =
        Date.now().toString();

      const dir =
        path.join(
          JOBS,
          jobId
        );

      fs.mkdirSync(
        dir,
        { recursive: true }
      );

      const original =
        path.join(
          dir,
          "original.mp4"
        );

      fs.renameSync(
        req.file.path,
        original
      );

      const job = {

        id: jobId,

        dir,

        duration,

        mimeType:
          req.file.mimetype,

        progress: 5,

        status:
          "📤 Video ရပါပြီ။ AI Processing စတင်နေပါတယ်...",

        state:
          "processing",

        createdAt:
          Date.now()
      };

      jobs.set(
        jobId,
        job
      );

      res.json({
        success: true,
        jobId
      });

      (async () => {

        try {

          const recap =
            await makeRecap(
              job,
              original
            );

          const voice =
            await makeVoice(
              job,
              recap
            );

          await makePreview(
            job,
            voice
          );

          updateJob(
            jobId,
            100,
            "✅ After Video Preview အဆင်သင့်ပါပြီ",
            {
              state:
                "preview_ready",

              previewUrl:
                `/jobs/${jobId}/preview.mp4`
            }
          );

        } catch (err) {

          console.error(
            `[${jobId}]`,
            err
          );

          updateJob(
            jobId,
            0,
            "❌ Processing မအောင်မြင်ပါ",
            {
              state:
                "error",

              error:
                err.message
            }
          );
        }

      })();

    } catch (err) {

      console.error(err);

      if (
        req.file?.path &&
        fs.existsSync(
          req.file.path
        )
      ) {
        fs.unlinkSync(
          req.file.path
        );
      }

      res.status(500).json({
        success: false,
        error:
          err.message
      });

    }

  }
);

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

      const job =
        jobs.get(jobId);

      if (
        !job ||
        job.state !==
          "preview_ready"
      ) {

        return res.status(400).json({
          success: false,
          error:
            "After Video မရသေးပါ"
        });

      }

      await makeFinal(
        job,
        position,
        fontSize,
        color
      );

      updateJob(
        jobId,
        100,
        "✅ Final MP4 ပြီးပါပြီ",
        {
          state:
            "done",

          downloadUrl:
            `/jobs/${jobId}/final.mp4`
        }
      );

      res.json({
        success: true,

        downloadUrl:
          `/jobs/${jobId}/final.mp4`
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        success: false,
        error:
          err.message
      });

    }

  }
);

app.use(
  (err, req, res, next) => {

    console.error(err);

    res.status(500).json({
      success: false,
      error:
        err.message ||
        "Server error"
    });

  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 Server running on port ${PORT}`
    );

  }
);

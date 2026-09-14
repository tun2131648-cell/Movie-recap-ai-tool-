const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("ffmpeg-static");
const { spawn } = require("child_process");

const app = express();

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir
});

app.get("/", (req, res) => {
  res.send("Movie Recap AI Server is running!");
});

app.post("/upload", upload.single("video"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Video file မရပါ"
      });
    }

    const inputFile = req.file.path;

    const outputName =
      "movie-recap-" + Date.now() + ".mp4";

    const outputFile =
      path.join(outputDir, outputName);

    console.log(
      "Video received:",
      req.file.originalname
    );

    console.log("FFmpeg:", ffmpeg);

    await new Promise((resolve, reject) => {

      const process = spawn(ffmpeg, [
        "-i",
        inputFile,

        "-c:v",
        "libx264",

        "-preset",
        "veryfast",

        "-c:a",
        "aac",

        "-y",
        outputFile
      ]);

      process.stderr.on("data", (data) => {
        console.log(data.toString());
      });

      process.on("close", (code) => {

        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              "FFmpeg processing failed"
            )
          );
        }

      });

    });

    if (fs.existsSync(inputFile)) {
      fs.unlinkSync(inputFile);
    }

    const downloadUrl =
      `${req.protocol}://${req.get("host")}/download/${outputName}`;

    res.json({

      success: true,

      message:
        "Video processing ပြီးပါပြီ",

      downloadUrl,

      filename:
        outputName

    });

  } catch (error) {

    console.error(
      "Processing error:",
      error
    );

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({

      success: false,

      error:
        "Video processing မအောင်မြင်ပါ"

    });

  }

});

app.get("/download/:filename", (req, res) => {

  const filename =
    path.basename(req.params.filename);

  const filePath =
    path.join(outputDir, filename);

  if (!fs.existsSync(filePath)) {

    return res.status(404).send(
      "MP4 file မတွေ့ပါ"
    );

  }

  res.download(
    filePath,
    filename
  );

});

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);

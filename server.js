const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, {
  recursive: true
});

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing");
}

const ai = new GoogleGenAI({
  apiKey: apiKey
});

app.get("/", (req, res) => {
  res.send("Movie Recap AI Server is running!");
});

app.post(
  "/upload",
  upload.single("video"),
  async (req, res) => {

    let inputFile = null;

    try {

      if (!apiKey) {
        throw new Error(
          "GEMINI_API_KEY မတွေ့ပါ"
        );
      }

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

      console.log(
        "Uploading video to Gemini..."
      );

      const uploadedFile =
        await ai.files.upload({
          file: inputFile,
          config: {
            mimeType:
              req.file.mimetype || "video/mp4"
          }
        });

      console.log(
        "Gemini upload complete:",
        uploadedFile.name
      );

      let videoFile = uploadedFile;

      while (
        videoFile.state === "PROCESSING"
      ) {

        console.log(
          "Waiting for Gemini..."
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

      console.log(
        "Video ready."
      );

      const response =
        await ai.models.generateContent({

          model: "gemini-2.5-flash",

          contents: [
            {
              fileData: {
                fileUri: videoFile.uri,
                mimeType: videoFile.mimeType
              }
            },
            {
              text: `
ဒီ video ကို သေချာကြည့်ပါ။

Video ထဲမှာ ဘာတွေဖြစ်နေသလဲ
မြန်မာဘာသာနဲ့ ရှင်းပြပါ။

အရေးကြီးတဲ့အကြောင်းအရာတွေကို
တိုတိုနဲ့ ရှင်းရှင်းလင်းလင်းရေးပါ။
              `
            }
          ]
        });

      const result = response.text;

      if (!result) {
        throw new Error(
          "Gemini response မရပါ"
        );
      }

      console.log(
        "Gemini result:",
        result
      );

      res.json({
        success: true,
        result: result
      });

    } catch (error) {

      console.error(
        "GEMINI ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          error.message ||
          "Gemini processing မအောင်မြင်ပါ"
      });

    } finally {

      if (
        inputFile &&
        fs.existsSync(inputFile)
      ) {
        fs.unlinkSync(inputFile);
      }

    }
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

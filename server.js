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
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY မတွေ့ပါ");
}

const ai = new GoogleGenAI({
  apiKey: apiKey
});

app.get("/", (req, res) => {
  res.send("Movie Recap AI Server is running!");
});

app.post("/upload", upload.single("video"), async (req, res) => {
  let inputFile = null;

  try {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY မတွေ့ပါ");
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Video file မရပါ"
      });
    }

    inputFile = req.file.path;

    const mimeType =
      req.file.mimetype &&
      req.file.mimetype.startsWith("video/")
        ? req.file.mimetype
        : "video/mp4";

    console.log("Video:", req.file.originalname);
    console.log("MIME:", mimeType);
    console.log("Uploading to Gemini...");

    const myFile = await ai.files.upload({
      file: inputFile,
      config: {
        mimeType: mimeType
      }
    });

    console.log("Gemini upload complete:", myFile.uri);

    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: [
        {
          type: "text",
          text: `
ဒီ video ကို သေချာကြည့်ပါ။

Movie recap အတွက် အရေးကြီးတဲ့
အဖြစ်အပျက်တွေကို မြန်မာဘာသာနဲ့
အစဉ်လိုက် ရှင်းပြပါ။

- မြန်မာလိုရေးပါ
- နားလည်လွယ်အောင်ရေးပါ
- အရေးကြီးတဲ့ scene တွေကိုပဲ ရွေးပါ
- Video ထဲမှာ မရှိတဲ့အကြောင်းအရာ မထည့်ပါနဲ့
          `
        },
        {
          type: "video",
          uri: myFile.uri,
          mimeType: mimeType
        }
      ]
    });

    const result = interaction.output_text;

    if (!result) {
      throw new Error("Gemini response မရပါ");
    }

    console.log("Gemini response received.");

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error("GEMINI ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Processing မအောင်မြင်ပါ"
    });

  } finally {
    if (inputFile && fs.existsSync(inputFile)) {
      fs.unlinkSync(inputFile);
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

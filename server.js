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
  console.error("GEMINI_API_KEY မတွေ့ပါ");
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

      const mimeType =
        req.file.mimetype &&
        req.file.mimetype.startsWith("video/")
          ? req.file.mimetype
          : "video/mp4";

      console.log(
        "Video MIME type:",
        mimeType
      );

      console.log(
        "Uploading video to Gemini..."
      );

      const myFile = await ai.files.upload({
        file: inputFile,
        config: {
          mimeType: mimeType
        }
      });

      console.log(
        "Gemini upload complete:",
        myFile.uri
      );

      const interaction =
        await ai.interactions.create({

          model: "gemini-3.6-flash",

          input: [

            {
              type: "text",

              text: `
ဒီ video ကို သေချာကြည့်ပြီး
မြန်မာဘာသာနဲ့ movie recap အတွက်
အရေးကြီးတဲ့အဖြစ်အပျက်တွေကို
အစဉ်လိုက် ရှင်းပြပါ။

စည်းကမ်းများ -

1. မြန်မာလိုရေးပါ။
2. အရေးကြီးတဲ့ scene တွေကိုပဲ ရွေးပါ။
3. တိုတိုနဲ့ ရှင်းရှင်းရေးပါ။
4. Video ထဲမှာ မရှိတဲ့အကြောင်းအရာ
   မထည့်ပါနဲ့။
5. ဇာတ်လမ်းကို အစစိတ်ဝင်းစားအောင်လုပ်ပါ မှအဆုံးထိစိတ်ဝင်စားအောင်လုပ်ပါ
   နားလည်လွယ်အောင်စိတ်ဝင်စားအောင် ရှင်းပြပါ။
              `
            },

            {
              type: "video",
              uri: myFile.uri,
              mime_type: mimeType
            }

          ]

        });

      const result =
        interaction.output_text;

      if (!result) {
        throw new Error(
          "Gemini response မရပါ"
        );
      }

      console.log(
        "Gemini result received."
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

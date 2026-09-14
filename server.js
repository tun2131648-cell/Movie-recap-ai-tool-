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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
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


      let videoFile =
        await ai.files.upload({
          file: inputFile,
          config: {
            mimeType:
              req.file.mimetype || "video/mp4"
          }
        });


      console.log(
        "Gemini file:",
        videoFile.name
      );


      while (
        videoFile.state === "PROCESSING"
      ) {

        console.log(
          "Gemini processing..."
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
        "Video is ready."
      );


      console.log(
        "Asking Gemini about video..."
      );


      const interaction =
        await ai.interactions.create({

          model: "gemini-3.8-flash",

          input: [

            {
              type: "video",

              uri:
                videoFile.uri,

              mime_type:
                videoFile.mimeType,

              processing: "static"
            },

            {
              type: "text",

              text: `
Analyze this video carefully.

Tell me what happens in the video
and describe the spoken dialogue or
important story content.

Return the answer in Burmese Myanmar language.

Keep the answer clear and concise.
              `
            }

          ]

        });


      const result =
        interaction.output_text;


      if (!result) {
        throw new Error(
          "Gemini က စာပြန်မပေးပါ"
        );
      }


      console.log(
        "Gemini response received."
      );


      console.log(
        result
      );


      if (
        inputFile &&
        fs.existsSync(inputFile)
      ) {
        fs.unlinkSync(inputFile);
      }


      res.json({

        success: true,

        message:
          "Gemini video test အောင်မြင်ပါပြီ",

        result: result

      });


    } catch (error) {

      console.error(
        "GEMINI ERROR:",
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
          "Gemini processing မအောင်မြင်ပါ"

      });

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

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());


/* =========================
   FOLDERS
========================= */

const uploadDir =
  path.join(__dirname, "uploads");

const outputDir =
  path.join(__dirname, "outputs");


if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true
  });
}


if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, {
    recursive: true
  });
}


/* =========================
   UPLOAD
========================= */

const upload =
  multer({
    dest: uploadDir
  });


/* =========================
   HOME
========================= */

app.get("/", (req, res) => {

  res.send(
    "Movie Recap AI Server is running!"
  );

});


/* =========================
   VIDEO UPLOAD
========================= */

app.post(
  "/upload",
  upload.single("video"),
  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          success: false,
          error: "Video file မရပါ"
        });

      }


      console.log(
        "Video received:",
        req.file.originalname
      );


      /*
        လက်ရှိအဆင့်မှာ uploaded video ကို
        output အဖြစ်သိမ်းထားမယ်။

        AI Subtitle + Myanmar Voice
        processing ကို နောက်အဆင့်မှာ
        ဒီနေရာမှာ ချိတ်မယ်။
      */


      const outputName =
        "movie-recap-" +
        Date.now() +
        ".mp4";


      const outputFile =
        path.join(
          outputDir,
          outputName
        );


      fs.copyFileSync(
        req.file.path,
        outputFile
      );


      fs.unlinkSync(
        req.file.path
      );


      const downloadUrl =
        `${req.protocol}://${req.get("host")}/download/${outputName}`;


      res.json({

        success: true,

        message:
          "Video processing ပြီးပါပြီ",

        downloadUrl:
          downloadUrl,

        filename:
          outputName

      });


    } catch (error) {

      console.error(
        "Processing error:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          "Video processing မအောင်မြင်ပါ"

      });

    }

  }
);


/* =========================
   DOWNLOAD MP4
========================= */

app.get(
  "/download/:filename",
  (req, res) => {

    const filename =
      path.basename(
        req.params.filename
      );


    const filePath =
      path.join(
        outputDir,
        filename
      );


    if (!fs.existsSync(filePath)) {

      return res.status(404).send(
        "MP4 file မတွေ့ပါ"
      );

    }


    res.download(
      filePath,
      filename
    );

  }
);


/* =========================
   SERVER
========================= */

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

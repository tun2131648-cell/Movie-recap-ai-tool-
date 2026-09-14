const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const upload = multer({
  dest: uploadDir
});

app.get("/", (req, res) => {
  res.send("Movie Recap AI Server is running!");
});

app.post("/upload", upload.single("video"), (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Video file မရပါ"
    });
  }

  console.log("Video received:", req.file.originalname);

  const inputFile = req.file.path;

  const outputName =
    "recap-" + Date.now() + ".mp4";

  const outputFile =
    path.join(outputDir, outputName);

  fs.copyFileSync(inputFile, outputFile);

  fs.unlinkSync(inputFile);

  const downloadUrl =
    `${req.protocol}://${req.get("host")}/download/${outputName}`;

  res.json({
    success: true,
    message: "Video processing ပြီးပါပြီ!",
    downloadUrl: downloadUrl,
    filename: outputName
  });

});

app.get("/download/:filename", (req, res) => {

  const filename =
    path.basename(req.params.filename);

  const filePath =
    path.join(outputDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("MP4 file မတွေ့ပါ");
  }

  res.download(filePath, filename);

});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Server running on port ${PORT}`
  );

});

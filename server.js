const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: "uploads/"
});

app.get("/", (req, res) => {
  res.send("Movie Recap AI Server is running!");
});

app.post("/upload", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Video file မရပါ"
    });
  }

  console.log("Video received:", req.file.originalname);

  res.json({
    success: true,
    message: "Video upload အောင်မြင်ပါတယ်!",
    filename: req.file.originalname
  });
});

const PORT = process.env.PORT ||

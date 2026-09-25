const API = "https://movie-recap-ai-tool.onrender.com";

const videoInput = document.getElementById("videoInput");
const fileName = document.getElementById("fileName");
const originalSection = document.getElementById("originalSection");
const originalVideo = document.getElementById("originalVideo");
const processingSection = document.getElementById("processingSection");
const status = document.getElementById("status");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

const afterSection = document.getElementById("afterSection");
const afterVideo = document.getElementById("afterVideo");

const position = document.getElementById("position");
const fontSize = document.getElementById("fontSize");
const fontSizeValue = document.getElementById("fontSizeValue");
const color = document.getElementById("color");
const applyButton = document.getElementById("applyButton");

const finalSection = document.getElementById("finalSection");
const finalVideo = document.getElementById("finalVideo");
const downloadButton = document.getElementById("downloadButton");

let selectedFile = null;
let jobId = null;
let statusTimer = null;


/* =========================
   FONT SIZE
========================= */

if (fontSize && fontSizeValue) {
    fontSize.addEventListener("input", function () {
        fontSizeValue.textContent = fontSize.value;
    });
}


/* =========================
   CREATE AI BUTTON
========================= */

const generateButton = document.createElement("button");

generateButton.type = "button";
generateButton.textContent = "🤖 AI Generate";
generateButton.className = "generateButton";
generateButton.style.display = "none";
generateButton.style.width = "100%";
generateButton.style.marginTop = "15px";
generateButton.style.padding = "15px";
generateButton.style.border = "0";
generateButton.style.borderRadius = "12px";
generateButton.style.background = "#5865f2";
generateButton.style.color = "#fff";
generateButton.style.fontSize = "18px";
generateButton.style.fontWeight = "bold";

if (originalSection) {
    originalSection.after(generateButton);
}


/* =========================
   SELECT VIDEO
========================= */

if (videoInput) {

    videoInput.addEventListener("change", function () {

        const file = videoInput.files[0];

        if (!file) {
            return;
        }

        selectedFile = file;

        if (originalVideo) {
            originalVideo.src = URL.createObjectURL(file);
            originalVideo.style.display = "block";
        }

        if (originalSection) {
            originalSection.hidden = false;
        }

        generateButton.style.display = "block";

        if (afterSection) {
            afterSection.hidden = true;
        }

        if (finalSection) {
            finalSection.hidden = true;
        }

        if (processingSection) {
            processing

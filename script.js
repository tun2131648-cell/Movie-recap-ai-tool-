const videoInput = document.getElementById("videoInput");
const fileName = document.getElementById("fileName");
const previewSection = document.getElementById("previewSection");
const videoPreview = document.getElementById("videoPreview");

const generateButton = document.getElementById("generateButton");

const processingSection = document.getElementById("processingSection");
const statusText = document.getElementById("statusText");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

const resultSection = document.getElementById("resultSection");
const resultVideo = document.getElementById("resultVideo");
const downloadButton = document.getElementById("downloadButton");

let selectedFile = null;
let videoObjectURL = null;


// ===============================
// VIDEO SELECT
// ===============================

videoInput.addEventListener("change", function () {

  const file = videoInput.files[0];

  if (!file) return;

  selectedFile = file;

  const fileSizeMB =
    file.size / (1024 * 1024);

  if (videoObjectURL) {
    URL.revokeObjectURL(videoObjectURL);
  }

  videoObjectURL =
    URL.createObjectURL(file);

  videoPreview.src =
    videoObjectURL;

  videoPreview.onloadedmetadata =
    function () {

      const duration =
        videoPreview.duration;

      const maxDuration =
        5 * 60;

      if (duration > maxDuration) {

        alert(
          "❌ Video က ၅ မိနစ်ထက် မကျော်ရပါ။"
        );

        videoInput.value = "";
        selectedFile = null;

        previewSection.hidden = true;

        return;
      }

      const minutes =
        Math.floor(duration / 60);

      const seconds =
        Math.floor(duration % 60);

      fileName.textContent =
        `📁 ${file.name} | ⏱️ ${minutes}:${String(seconds).padStart(2, "0")} | 💾 ${fileSizeMB.toFixed(1)} MB`;

      previewSection.hidden = false;
      resultSection.hidden = true;
    };
});


// ===============================
// GENERATE
// ===============================

generateButton.addEventListener(
  "click",
  async function () {

    if (!selectedFile) {

      alert(
        "အရင်ဆုံး Video ရွေးပါ။"
      );

      return;
    }

    generateButton.disabled = true;

    processingSection.hidden = false;
    resultSection.hidden = true;

    progressBar.style.width = "5%";
    progressText.textContent = "5%";

    statusText.textContent =
      "📤 Video ကို Server ဆီပို့နေပါတယ်...";

    const formData =
      new FormData();

    formData.append(
      "video",
      selectedFile
    );

    try {

      // ===============================
      // UPLOAD + AI PROCESSING
      // ===============================

      progressBar.style.width = "15%";
      progressText.textContent = "15%";

      statusText.textContent =
        "🤖 AI Processing စတင်နေပါတယ်...";

      const response =
        await fetch(
          "https://movie-recap-ai-tool.onrender.com/upload",
          {
            method: "POST",
            body: formData
          }
        );

      progressBar.style.width = "95%";
      progressText.textContent = "95%";

      statusText.textContent =
        "⏳ AI Result ကို လက်ခံနေပါတယ်...";

      const data =
        await response.json();

      if (
        response.ok &&
        data.success
      ) {

        progressBar.style.width =
          "100%";

        progressText.textContent =
          "100%";

        statusText.textContent =
          "✅ AI Processing ပြီးပါပြီ!";

        // Current backend returns recap text
        if (data.result) {

          resultSection.hidden =
            false;

          resultSection.scrollIntoView({
            behavior: "smooth"
          });

          // Show recap text
          resultVideo.style.display =
            "none";

          downloadButton.style.display =
            "none";

          const oldResult =
            document.getElementById(
              "recapText"
            );

          if (oldResult) {
            oldResult.remove();
          }

          const recap =
            document.createElement(
              "div"
            );

          recap.id =
            "recapText";

          recap.style.marginTop =
            "15px";

          recap.style.padding =
            "15px";

          recap.style.background =
            "#0f1219";

          recap.style.borderRadius =
            "12px";

          recap.style.lineHeight =
            "1.8";

          recap.textContent =
            data.result;

          resultSection.appendChild(
            recap
          );
        }

      } else {

        throw new Error(
          data.error ||
          "Processing မအောင်မြင်ပါ"
        );
      }

    } catch (error) {

      progressBar.style.width =
        "0%";

      progressText.textContent =
        "0%";

      statusText.textContent =
        "❌ " + error.message;

    } finally {

      generateButton.disabled =
        false;
    }
  }
);

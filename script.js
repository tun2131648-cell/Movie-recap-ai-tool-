const videoInput = document.getElementById("videoInput");
const fileName = document.getElementById("fileName");

const previewSection = document.getElementById("previewSection");
const videoPreview = document.getElementById("videoPreview");

const generateButton = document.getElementById("generateButton");

const processingSection =
  document.getElementById("processingSection");

const statusText =
  document.getElementById("statusText");

const progressBar =
  document.getElementById("progressBar");

const progressText =
  document.getElementById("progressText");

const resultSection =
  document.getElementById("resultSection");

const downloadButton =
  document.getElementById("downloadButton");


/* =========================
   VIDEO SELECT
========================= */

videoInput.addEventListener("change", function () {

  const file = videoInput.files[0];

  if (!file) {
    return;
  }

  fileName.textContent =
    "📁 " + file.name;

  const videoURL =
    URL.createObjectURL(file);

  videoPreview.src = videoURL;

  previewSection.hidden = false;

  resultSection.hidden = true;

  statusText.textContent =
    "Video ရွေးပြီးပါပြီ။ Generate နှိပ်ပါ။";

});


/* =========================
   GENERATE
========================= */

generateButton.addEventListener("click", async function () {

  const file = videoInput.files[0];

  if (!file) {

    alert("အရင်ဆုံး Video ရွေးပါ။");

    return;
  }


  generateButton.disabled = true;

  processingSection.hidden = false;

  resultSection.hidden = true;


  let progress = 0;

  progressBar.style.width = "0%";

  progressText.textContent = "0%";

  statusText.textContent =
    "📤 Video Upload လုပ်နေပါတယ်...";


  /*
    Fake progress က 90% အထိပဲသွားမယ်။
    Server က တကယ်ပြီးမှ 100% ဖြစ်မယ်။
  */

  const progressTimer =
    setInterval(function () {

      if (progress < 90) {

        progress += 1;

        progressBar.style.width =
          progress + "%";

        progressText.textContent =
          progress + "%";

      }

    }, 200);


  try {

    const formData =
      new FormData();

    formData.append(
      "video",
      file
    );


    statusText.textContent =
      "🤖 AI က Video ကို Processing လုပ်နေပါတယ်...";


    const response =
      await fetch(
        "https://movie-recap-ai-tool.onrender.com/upload",
        {
          method: "POST",
          body: formData
        }
      );


    const data =
      await response.json();


    clearInterval(progressTimer);


    if (
      response.ok &&
      data.success &&
      data.downloadUrl
    ) {

      progressBar.style.width =
        "100%";

      progressText.textContent =
        "100%";

      statusText.textContent =
        "✅ Processing ပြီးပါပြီ!";


      downloadButton.href =
        data.downloadUrl;


      resultSection.hidden =
        false;

    } else {

      throw new Error(
        data.error ||
        "Processing မအောင်မြင်ပါ"
      );

    }


  } catch (error) {

    clearInterval(progressTimer);


    progressBar.style.width =
      "0%";

    progressText.textContent =
      "0%";

    statusText.textContent =
      "❌ " + error.message;

  }


  generateButton.disabled =
    false;

});

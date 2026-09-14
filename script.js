const videoInput = document.getElementById("videoInput");
const fileName = document.getElementById("fileName");

const previewSection =
  document.getElementById("previewSection");

const videoPreview =
  document.getElementById("videoPreview");

const generateButton =
  document.getElementById("generateButton");

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

const resultVideo =
  document.getElementById("resultVideo");

const downloadButton =
  document.getElementById("downloadButton");


let selectedFile = null;
let videoObjectURL = null;


/* =========================
   VIDEO SELECT
========================= */

videoInput.addEventListener("change", function () {

  const file = videoInput.files[0];

  if (!file) {
    return;
  }


  selectedFile = file;


  /* File size */

  const fileSizeMB =
    file.size / (1024 * 1024);


  /* Create temporary video */

  if (videoObjectURL) {
    URL.revokeObjectURL(videoObjectURL);
  }

  videoObjectURL =
    URL.createObjectURL(file);

  videoPreview.src =
    videoObjectURL;


  /* Check duration */

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


      previewSection.hidden =
        false;


      resultSection.hidden =
        true;

    };

});


/* =========================
   GENERATE
========================= */

generateButton.addEventListener(
  "click",
  async function () {

    if (!selectedFile) {

      alert(
        "အရင်ဆုံး Video ရွေးပါ။"
      );

      return;

    }


    generateButton.disabled =
      true;


    processingSection.hidden =
      false;


    resultSection.hidden =
      true;


    progressBar.style.width =
      "0%";

    progressText.textContent =
      "0%";


    statusText.textContent =
      "📤 Video Upload လုပ်နေပါတယ်...";


    const formData =
      new FormData();


    formData.append(
      "video",
      selectedFile
    );


    /*
      Processing progress

      ၂ မိနစ် target အတွက်
      UI progress ကို 90% အထိ
      ဖြည်းဖြည်းတက်စေမယ်။
    */

    let progress = 0;


    const progressTimer =
      setInterval(function () {

        if (progress < 90) {

          progress += 1;

          progressBar.style.width =
            progress + "%";

          progressText.textContent =
            progress + "%";

        }

      }, 1300);


    try {

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


      clearInterval(
        progressTimer
      );


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


        /*
          After Video Preview
        */

        resultVideo.src =
          data.downloadUrl;


        resultVideo.load();


        /*
          Download button
        */

        downloadButton.href =
          data.downloadUrl;


        resultSection.hidden =
          false;


        /*
          After Video နေရာကို
          အလိုအလျောက် scroll
        */

        resultSection.scrollIntoView({
          behavior: "smooth"
        });


      } else {

        throw new Error(
          data.error ||
          "Processing မအောင်မြင်ပါ"
        );

      }


    } catch (error) {

      clearInterval(
        progressTimer
      );


      progressBar.style.width =
        "0%";

      progressText.textContent =
        "0%";


      statusText.textContent =
        "❌ " + error.message;

    }


    generateButton.disabled =
      false;

  }
);

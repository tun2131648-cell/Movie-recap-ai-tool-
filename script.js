const API = "https://movie-recap-ai-tool.onrender.com";

const videoInput = document.getElementById("videoInput");
const fileName = document.getElementById("fileName");

const originalSection =
  document.getElementById("originalSection");

const originalVideo =
  document.getElementById("originalVideo");

const processingSection =
  document.getElementById("processingSection");

const status =
  document.getElementById("status");

const progressBar =
  document.getElementById("progressBar");

const progressText =
  document.getElementById("progressText");

const afterSection =
  document.getElementById("afterSection");

const afterVideo =
  document.getElementById("afterVideo");

const position =
  document.getElementById("position");

const fontSize =
  document.getElementById("fontSize");

const fontSizeValue =
  document.getElementById("fontSizeValue");

const color =
  document.getElementById("color");

const applyButton =
  document.getElementById("applyButton");

const finalSection =
  document.getElementById("finalSection");

const finalVideo =
  document.getElementById("finalVideo");

const downloadButton =
  document.getElementById("downloadButton");


let selectedFile = null;
let jobId = null;
let statusTimer = null;


// ===============================
// Font Size
// ===============================

fontSize.addEventListener(
  "input",
  () => {
    fontSizeValue.textContent =
      fontSize.value;
  }
);


// ===============================
// Select Video
// ===============================

videoInput.addEventListener(
  "change",
  () => {

    const file =
      videoInput.files[0];

    if (!file) return;

    selectedFile = file;

    originalVideo.src =
      URL.createObjectURL(file);

    originalSection.hidden = false;

    afterSection.hidden = true;

    finalSection.hidden = true;

    originalVideo.onloadedmetadata =
      () => {

        if (
          originalVideo.duration >
          300
        ) {

          alert(
            "❌ Video က ၅ မိနစ်ထက် မကျော်ရပါ"
          );

          videoInput.value = "";

          selectedFile = null;

          originalSection.hidden =
            true;

          return;
        }

        const minutes =
          Math.floor(
            originalVideo.duration /
            60
          );

        const seconds =
          Math.floor(
            originalVideo.duration %
            60
          );

        fileName.textContent =
          `📁 ${file.name} | ⏱️ ${minutes}:${String(seconds).padStart(2,"0")}`;
      };
  }
);


// ===============================
// Generate Button
// ===============================

const generateButton =
  document.createElement("button");

generateButton.textContent =
  "🤖 AI Generate";

generateButton.className =
  "generateButton";

originalSection.after(
  generateButton
);


// ===============================
// Progress
// ===============================

function setProgress(
  percent,
  message
) {

  progressBar.style.width =
    percent + "%";

  progressText.textContent =
    percent + "%";

  status.textContent =
    message;
}


// ===============================
// Check Job Status
// ===============================

function startStatusChecking() {

  if (statusTimer) {

    clearInterval(
      statusTimer
    );
  }

  statusTimer =
    setInterval(
      async () => {

        try {

          const response =
            await fetch(
              `${API}/status/${jobId}`
            );

          const data =
            await response.json();

          if (!data.success) {
            return;
          }


          setProgress(
            data.progress || 0,
            data.status ||
              "🤖 Processing..."
          );


          // ======================
          // Preview Ready
          // ======================

          if (
            data.state ===
            "preview_ready"
          ) {

            clearInterval(
              statusTimer
            );

            statusTimer =
              null;

            afterVideo.src =
              API +
              data.previewUrl;

            afterSection.hidden =
              false;

            processingSection.hidden =
              false;

            afterVideo.load();

            afterSection.scrollIntoView({
              behavior: "smooth"
            });

            generateButton.disabled =
              false;

            return;
          }


          // ======================
          // Error
          // ======================

          if (
            data.state ===
            "error"
          ) {

            clearInterval(
              statusTimer
            );

            statusTimer =
              null;

            setProgress(
              0,
              "❌ " +
              (
                data.error ||
                "Processing မအောင်မြင်ပါ"
              )
            );

            generateButton.disabled =
              false;

            return;
          }

        } catch (error) {

          console.log(
            "Status error:",
            error
          );

        }

      },
      3000
    );
}


// ===============================
// Upload + AI Generate
// ===============================

generateButton.onclick =
  async () => {

    if (!selectedFile) {

      alert(
        "Video အရင်ရွေးပါ"
      );

      return;
    }


    generateButton.disabled =
      true;

    processingSection.hidden =
      false;

    afterSection.hidden =
      true;

    finalSection.hidden =
      true;


    setProgress(
      5,
      "📤 Video upload လုပ်နေပါတယ်..."
    );


    const form =
      new FormData();

    form.append(
      "video",
      selectedFile
    );


    try {

      const response =
        await fetch(
          `${API}/upload`,
          {
            method: "POST",
            body: form
          }
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.error ||
          "Upload failed"
        );
      }


      jobId =
        data.jobId;


      setProgress(
        8,
        "🤖 AI Processing စတင်နေပါတယ်..."
      );


      startStatusChecking();


    } catch (error) {

      console.error(error);

      setProgress(
        0,
        "❌ " +
        error.message
      );

      generateButton.disabled =
        false;
    }
};


// ===============================
// Create Final MP4
// ===============================

applyButton.addEventListener(
  "click",
  async () => {

    if (!jobId) {

      alert(
        "After Video မရသေးပါ"
      );

      return;
    }


    applyButton.disabled =
      true;

    processingSection.hidden =
      false;


    setProgress(
      10,
      "🎬 Final MP4 ပြန် render လုပ်နေပါတယ်..."
    );


    try {

      const response =
        await fetch(
          `${API}/render`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                jobId:
                  jobId,

                position:
                  position.value,

                fontSize:
                  fontSize.value,

                color:
                  color.value
              })
          }
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.error ||
          "Final render failed"
        );
      }


      setProgress(
        100,
        "✅ Final MP4 ပြီးပါပြီ!"
      );


      finalSection.hidden =
        false;


      finalVideo.src =
        API +
        data.downloadUrl;


      downloadButton.href =
        API +
        data.downloadUrl;


      finalVideo.load();


      finalSection.scrollIntoView({
        behavior: "smooth"
      });


    } catch (error) {

      console.error(error);

      setProgress(
        0,
        "❌ " +
        error.message
      );

    } finally {

      applyButton.disabled =
        false;

    }

  }
);၏

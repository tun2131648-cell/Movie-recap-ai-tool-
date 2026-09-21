const API =
  "https://movie-recap-ai-tool.onrender.com";


const videoInput =
  document.getElementById(
    "videoInput"
  );

const fileName =
  document.getElementById(
    "fileName"
  );

const originalSection =
  document.getElementById(
    "originalSection"
  );

const originalVideo =
  document.getElementById(
    "originalVideo"
  );

const processingSection =
  document.getElementById(
    "processingSection"
  );

const status =
  document.getElementById(
    "status"
  );

const progressBar =
  document.getElementById(
    "progressBar"
  );

const progressText =
  document.getElementById(
    "progressText"
  );

const afterSection =
  document.getElementById(
    "afterSection"
  );

const afterVideo =
  document.getElementById(
    "afterVideo"
  );

const position =
  document.getElementById(
    "position"
  );

const fontSize =
  document.getElementById(
    "fontSize"
  );

const fontSizeValue =
  document.getElementById(
    "fontSizeValue"
  );

const color =
  document.getElementById(
    "color"
  );

const applyButton =
  document.getElementById(
    "applyButton"
  );

const finalSection =
  document.getElementById(
    "finalSection"
  );

const finalVideo =
  document.getElementById(
    "finalVideo"
  );

const downloadButton =
  document.getElementById(
    "downloadButton"
  );


let selectedFile = null;

let jobId = null;


/* SIZE */

fontSize.addEventListener(
  "input",
  () => {

    fontSizeValue.textContent =
      fontSize.value;

  }
);


/* VIDEO SELECT */

videoInput.addEventListener(
  "change",
  () => {

    const file =
      videoInput.files[0];

    if (!file) return;


    selectedFile =
      file;


    originalVideo.src =
      URL.createObjectURL(
        file
      );


    originalSection.hidden =
      false;


    afterSection.hidden =
      true;


    finalSection.hidden =
      true;


    originalVideo.onloadedmetadata =
      () => {

        if (
          originalVideo.duration >
          300
        ) {

          alert(
            "❌ Video က ၅ မိနစ်ထက် မကျော်ရပါ"
          );

          videoInput.value =
            "";

          selectedFile =
            null;

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


/* PROGRESS */

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


/* GENERATE PREVIEW */

const generateButton =
  document.createElement(
    "button"
  );


generateButton.textContent =
  "🤖 AI Generate";


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


    let fake =
      setInterval(
        () => {

          let p =
            parseInt(
              progressText.textContent
            ) || 5;


          if (p < 90) {

            setProgress(
              p + 5,
              "🤖 AI Processing လုပ်နေပါတယ်..."
            );

          }

        },
        3000
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


      clearInterval(fake);


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.error ||
          "Processing failed"
        );

      }


      jobId =
        data.jobId;


      setProgress(
        100,
        "✅ After Video Preview ပြီးပါပြီ"
      );


      afterVideo.src =
        data.previewUrl;


      afterSection.hidden =
        false;


      afterVideo.load();


      afterSection.scrollIntoView({
        behavior: "smooth"
      });


    }

    catch (error) {

      clearInterval(fake);


      setProgress(
        0,
        "❌ " +
        error.message
      );

    }


    finally {

      generateButton.disabled =
        false;

    }

  };


/* Put Generate button */

document
  .getElementById("originalSection")
  .after(generateButton);


generateButton.className =
  "generateButton";


/* FINAL MP4 */

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

            body: JSON.stringify({

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
        data.downloadUrl;


      downloadButton.href =
        data.downloadUrl;


      finalVideo.load();


      finalSection.scrollIntoView({
        behavior: "smooth"
      });

    }

    catch (error) {

      setProgress(
        0,
        "❌ " +
        error.message
      );

    }


    finally {

      applyButton.disabled =
        false;

    }

  }
);

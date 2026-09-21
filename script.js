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


const previewSection =
  document.getElementById(
    "previewSection"
  );


const videoPreview =
  document.getElementById(
    "videoPreview"
  );


const customSection =
  document.getElementById(
    "customSection"
  );


const subtitleY =
  document.getElementById(
    "subtitleY"
  );


const positionValue =
  document.getElementById(
    "positionValue"
  );


const generateButton =
  document.getElementById(
    "generateButton"
  );


const processingSection =
  document.getElementById(
    "processingSection"
  );


const statusText =
  document.getElementById(
    "statusText"
  );


const progressBar =
  document.getElementById(
    "progressBar"
  );


const progressText =
  document.getElementById(
    "progressText"
  );


const resultSection =
  document.getElementById(
    "resultSection"
  );


const resultVideo =
  document.getElementById(
    "resultVideo"
  );


const downloadButton =
  document.getElementById(
    "downloadButton"
  );


let selectedFile = null;

let videoURL = null;



/* Subtitle Position */

subtitleY.addEventListener(
  "input",
  () => {

    positionValue.textContent =
      subtitleY.value + "%";

  }
);



/* Video Select */

videoInput.addEventListener(
  "change",
  () => {

    const file =
      videoInput.files[0];

    if (!file) return;


    selectedFile = file;


    if (videoURL) {

      URL.revokeObjectURL(
        videoURL
      );

    }


    videoURL =
      URL.createObjectURL(
        file
      );


    videoPreview.src =
      videoURL;


    videoPreview.onloadedmetadata =
      () => {

        const duration =
          videoPreview.duration;


        if (duration > 300) {

          alert(
            "❌ Video က ၅ မိနစ်ထက် မကျော်ရပါ"
          );


          videoInput.value =
            "";

          selectedFile =
            null;

          previewSection.hidden =
            true;

          customSection.hidden =
            true;

          return;

        }


        const minutes =
          Math.floor(
            duration / 60
          );


        const seconds =
          Math.floor(
            duration % 60
          );


        const size =
          (
            file.size /
            1024 /
            1024
          ).toFixed(1);


        fileName.textContent =
          `📁 ${file.name} | ⏱️ ${minutes}:${String(seconds).padStart(2,"0")} | 💾 ${size} MB`;


        previewSection.hidden =
          false;


        customSection.hidden =
          false;


        resultSection.hidden =
          true;

      };

  }
);



function progress(
  number,
  message
) {

  progressBar.style.width =
    number + "%";


  progressText.textContent =
    number + "%";


  statusText.textContent =
    message;

}



/* Generate */

generateButton.addEventListener(
  "click",
  async () => {

    if (!selectedFile) {

      alert(
        "အရင်ဆုံး Video ရွေးပါ"
      );

      return;

    }


    generateButton.disabled =
      true;


    processingSection.hidden =
      false;


    resultSection.hidden =
      true;


    progress(
      5,
      "📤 Video ကို Server ဆီပို့နေပါတယ်..."
    );


    const formData =
      new FormData();


    formData.append(
      "video",
      selectedFile
    );


    formData.append(
      "subtitleY",
      subtitleY.value
    );


    let fakeProgress =
      setInterval(
        () => {

          let current =
            parseInt(
              progressText.textContent
            ) || 5;


          if (current < 90) {

            progress(
              current + 5,
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
            body: formData
          }
        );


      clearInterval(
        fakeProgress
      );


      let data;


      try {

        data =
          await response.json();

      }

      catch {

        throw new Error(
          "Server response မမှန်ပါ"
        );

      }


      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(
          data.error ||
          "Processing မအောင်မြင်ပါ"
        );

      }


      progress(
        100,
        "✅ Final MP4 ပြီးပါပြီ!"
      );


      resultSection.hidden =
        false;


      resultVideo.src =
        data.downloadUrl;


      downloadButton.href =
        data.downloadUrl;


      downloadButton.download =
        "movie-recap-ai.mp4";


      resultVideo.load();


      setTimeout(
        () => {

          resultSection.scrollIntoView({
            behavior: "smooth"
          });

        },
        300
      );


    }

    catch (error) {

      clearInterval(
        fakeProgress
      );


      progress(
        0,
        "❌ " + error.message
      );

    }


    finally {

      generateButton.disabled =
        false;

    }

  }
);

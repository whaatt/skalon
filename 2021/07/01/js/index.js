const { jsPDF } = jspdf;

const ASPECT_RATIO = 8.5 / 11;
const PPI = 450;

const CONTENT_INNER = "content-inner";
const POSTER_BOX_SIZING_WRAPPER = "poster-box-sizing-wrapper";
const POSTER_BOX = "poster-box";
const POSTER_ICON = "poster-icon";
const SEAL = "seal";
const SEAL_TEXT = "seal-text";
const SEAL_INNER = "seal-inner";

const pixels = (value) => value.toString() + "px";

/**
 * Reconciles the contents of a poster box sizing wrapper to match the wrapper
 * size.
 */
const reconcilePosterBoxContents = (posterBoxSizingWrapper) => {
  for (const element of posterBoxSizingWrapper.getElementsByTagName("h1")) {
    element.style.fontSize = pixels(posterBoxSizingWrapper.clientHeight / 10);
  }

  Array.from(
    posterBoxSizingWrapper.getElementsByClassName(POSTER_ICON)
  ).forEach(
    (element) =>
      (element.style.fontSize = pixels(
        posterBoxSizingWrapper.clientHeight / 2.5
      ))
  );

  const sealBaseUnit = Math.ceil(posterBoxSizingWrapper.clientHeight / 336);
  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL)).forEach(
    (element) =>
      Object.assign(element.style, {
        height: pixels(sealBaseUnit * 20),
        width: pixels(sealBaseUnit * 20),
      })
  );

  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL_TEXT)).forEach(
    (element) => {
      Object.assign(element.style, {
        height: pixels(sealBaseUnit * 20),
        width: pixels(sealBaseUnit * 20),
      });
      element.style.fontSize = pixels(sealBaseUnit * 2);
      new CircleType(element).radius(sealBaseUnit * 10);
    }
  );

  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL_INNER)).forEach(
    (element) => {
      const innerDiameter = sealBaseUnit * 15;
      Object.assign(element.style, {
        height: pixels(innerDiameter),
        width: pixels(innerDiameter),
        fontSize: pixels(sealBaseUnit * 12),
      });
    }
  );
};

/**
 * Resizes the main poster box sizing wrapper.
 */
const resizePosterBox = () => {
  const contentInner = document.getElementById(CONTENT_INNER);
  const posterBoxSizingWrapper = contentInner.getElementsByClassName(
    POSTER_BOX_SIZING_WRAPPER
  )[0];

  const useHeightBasis =
    contentInner.clientHeight * ASPECT_RATIO <= contentInner.clientWidth;
  if (useHeightBasis) {
    Object.assign(posterBoxSizingWrapper.style, {
      height: "100%",
      width: pixels(contentInner.clientHeight * ASPECT_RATIO),
    });
  } else {
    Object.assign(posterBoxSizingWrapper.style, {
      width: "100%",
      height: pixels(contentInner.clientWidth / ASPECT_RATIO),
    });
  }

  reconcilePosterBoxContents(posterBoxSizingWrapper);
};

// Resize listener:
window.addEventListener("resize", resizePosterBox);
resizePosterBox();

/**
 * Saves the current poster to a JPEG or PDF.
 */
const savePoster = async (toPDF) => {
  const contentInner = document.getElementById(CONTENT_INNER);
  const posterBoxSizingWrapper = contentInner
    .getElementsByClassName(POSTER_BOX_SIZING_WRAPPER)[0]
    .cloneNode(true);

  // Resize poster to printable dimensions.
  Object.assign(posterBoxSizingWrapper.style, {
    position: "absolute",
    top: "-10000px",
    left: "-10000px",
    width: pixels(PPI * 8.5),
    height: pixels(PPI * 11),
  });
  document.body.append(posterBoxSizingWrapper);
  reconcilePosterBoxContents(posterBoxSizingWrapper);

  // Hide seal text, which doesn't serialize to canvas correctly.
  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL_TEXT)).forEach(
    (element) => (element.style.display = "none")
  );

  // Convert the cloned poster to a canvas.
  return html2canvas(posterBoxSizingWrapper).then(function (canvas) {
    posterBoxSizingWrapper.remove();

    // Convert the canvas to JPEG.
    const image = canvas.toDataURL("image/jpeg", 1.0);

    // If desired, convert the JPEG to a full-page PDF.
    if (toPDF) {
      const doc = new jsPDF({
        unit: "in",
        format: "letter",
        orientation: "portrait",
      });
      doc.addImage(image, "JPEG", 0, 0, 8.5, 11);
      doc.save("poster.pdf");
    } else {
      // This way of saving to JPEG is jank.
      const downloadLink = document.createElement("a");
      downloadLink.href = image;
      downloadLink.download = "poster.jpg";
      Object.assign(downloadLink.style, {
        position: "absolute",
        top: "-10000px",
        left: "-10000px",
      });
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    }
  });
};

// Export PDF button listener:
document.getElementById("export-pdf").addEventListener("click", (event) => {
  event.target.setAttribute("disabled", "true");
  savePoster(true).then(() => event.target.removeAttribute("disabled"));
});

// Export JPEG button listener:
document.getElementById("export-jpeg").addEventListener("click", (event) => {
  event.target.setAttribute("disabled", "true");
  savePoster(false).then(() => event.target.removeAttribute("disabled"));
});

import interact from "https://cdn.interactjs.io/v1.10.11/interactjs/index.js";

const { jsPDF } = jspdf;

const ASPECT_RATIO = 8.5 / 11;
const PPI = 450;

const CONTENT_INNER = "content-inner";
const POSTER_BOX_SIZING_WRAPPER = "poster-box-sizing-wrapper";
const POSTER_BOX = "poster-box";
const POSTER_BOX_INNER = "poster-box-inner";
const CONTENT_BOX = "content-box";

const SEAL = "seal";
const SEAL_TEXT = "seal-text";
const SEAL_INNER = "seal-inner";

const EXPORT_JPEG = "export-jpeg";
const EXPORT_PDF = "export-pdf";

const CK_BODY_WRAPPER = "ck-body-wrapper";

// Pixels to string converter.
const pixels = (value) => value.toString() + "px";

// Element ID helper (since elements cannot be hashed directly).
let globalId = 0;
const getHashableElementId = (element) => {
  if (element.id) {
    return element.id;
  }

  element.id = "content-box-" + (++globalId).toString();
  return element.id;
};

/*
 * Poster Box Setup
 */

/**
 * Reconciles the contents of a poster box sizing wrapper to match the wrapper
 * size.
 */
const reconcilePosterBoxContents = (posterBoxSizingWrapper) => {
  Array.from(posterBoxSizingWrapper.getElementsByClassName(POSTER_BOX)).forEach(
    (element) =>
      (element.style.fontSize = pixels(
        (posterBoxSizingWrapper.clientHeight / 100) * 6
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
 * Resizes the main poster box sizing wrapper and its constituents.
 */
const resizePosterBox = () => {
  const contentInner = document.getElementById(CONTENT_INNER);
  const posterBoxSizingWrapper = contentInner.getElementsByClassName(
    POSTER_BOX_SIZING_WRAPPER
  )[0];

  // Resize the poster box.
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

  // Resize any special contents.
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

// Setup the Export PDF button listener:
document.getElementById(EXPORT_PDF).addEventListener("click", (event) => {
  event.target.setAttribute("disabled", "true");
  savePoster(true).then(() => event.target.removeAttribute("disabled"));
});

// Setup the Export JPEG button listener:
document.getElementById(EXPORT_JPEG).addEventListener("click", (event) => {
  event.target.setAttribute("disabled", "true");
  savePoster(false).then(() => event.target.removeAttribute("disabled"));
});

/*
 * Content Box Setup
 */

const resizeXListener = (event) => {
  const target = event.target;
  const posterBoxInner = target.closest("." + POSTER_BOX_INNER);
  target.style.width =
    (event.rect.width / posterBoxInner.clientWidth) * 100 + "%";
};

const dragMoveListener = (event) => {
  const target = event.target;
  const posterBoxInner = target.closest("." + POSTER_BOX_INNER);
  const x =
    (parseFloat(target.getAttribute("data-x")) || 0) +
    event.dx / posterBoxInner.clientWidth;
  const y =
    (parseFloat(target.getAttribute("data-y")) || 0) +
    event.dy / posterBoxInner.clientHeight;

  target.style.left = x * 100 + "%";
  target.style.top = y * 100 + "%";
  target.setAttribute("data-x", x);
  target.setAttribute("data-y", y);
};

const editorMap = {};

function SpecialCharactersIcons(editor) {
  editor.plugins.get("SpecialCharacters").addItems("Arrows", [
    { title: "simple arrow left", character: "←" },
    { title: "simple arrow up", character: "↑" },
    { title: "simple arrow right", character: "\ueea1" },
    { title: "simple arrow down", character: "↓" },
  ]);
}

// Inline editor mode helper:
const useEditorMode = async (target) => {
  if (editorMap[getHashableElementId(target)]) {
    return;
  }
  interact(target).unset();
  editorMap[getHashableElementId(target)] = await InlineEditor.create(target, {
    extraPlugins: ["Alignment", "FontColor", "FontSize", "SpecialCharacters"],
    alignment: {
      options: ["left", "center", "right"],
    },
    fontColor: {
      colors: [
        {
          color: "rgb(242, 234, 88)",
          label: "Yellow",
        },
        {
          color: "rgb(255, 255, 254)",
          label: "White",
        },
        {
          color: "rgb(59, 107, 72)",
          label: "Green",
        },
      ],
    },
    toolbar: [
      "fontSize",
      "fontColor",
      "|",
      "alignment",
      "|",
      "specialCharacters",
    ],
  });
  document.querySelector(".ck.ck-toolbar-container").style.visibility =
    "hidden";
  setTimeout(
    () =>
      (document.querySelector(".ck.ck-toolbar-container").style.visibility =
        "initial"),
    100
  );
};

// Interactivity mode helper:
const useInteractivityMode = async (target) => {
  if (editorMap[getHashableElementId(target)]) {
    await editorMap[getHashableElementId(target)].destroy();
    delete editorMap[getHashableElementId(target)];
  }
  interact(target)
    .resizable({
      edges: { right: true },
      listeners: {
        move: resizeXListener,
      },
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
        }),
        interact.modifiers.restrictEdges({
          outer: "parent",
        }),
      ],
      inertia: false,
    })
    .draggable({
      listeners: { move: dragMoveListener },
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
        }),
        interact.modifiers.restrictEdges({
          outer: "parent",
        }),
      ],
      inertia: false,
    })
    .reflow({ name: "drag", axis: "xy" });
};

// Destroy element helper:
const destroyContentBox = async (target) => {
  interact(target).unset();
  if (editorMap[getHashableElementId(target)]) {
    await editorMap[getHashableElementId(target)].destroy();
    delete editorMap[getHashableElementId(target)];
  }
  target.remove();
};

// Install content box helper:
const installContentBox = (element) => {
  useInteractivityMode(element);

  // Handle Shift + Click to delete.
  element.addEventListener("click", (event) => {
    if (event.shiftKey) {
      destroyContentBox(element);
    }
  });

  // Handle double-click to edit text.
  element.addEventListener("dblclick", () => {
    setTimeout(() => {
      element.focus();
    }, 0);
    useEditorMode(element);
  });
};

// Setup the listeners to switch between editor and interactivity modes.
Array.from(document.getElementsByClassName(CONTENT_BOX)).forEach(
  installContentBox
);

// Handle click-out to exit text editor.
document.addEventListener("mousedown", (event) => {
  Array.from(document.getElementsByClassName(CONTENT_BOX)).forEach(
    (element) => {
      const ckBodyWrapper = document.getElementsByClassName(CK_BODY_WRAPPER);
      const clickedElement =
        event.target == element || element.contains(event.target);
      const toolbarClicked =
        ckBodyWrapper.length != 0 && ckBodyWrapper[0].contains(event.target);
      if (!clickedElement && !toolbarClicked) {
        useInteractivityMode(element);
      }
    }
  );
});

// Handle double-click to create element.
document.addEventListener("dblclick", (event) => {
  const posterBoxInner = document.getElementsByClassName(POSTER_BOX_INNER)[0];
  if (posterBoxInner == event.target) {
    const newContentBox = document.createElement("div");
    newContentBox.classList.add(CONTENT_BOX);
    posterBoxInner.appendChild(newContentBox);
    installContentBox(newContentBox);
  }
});

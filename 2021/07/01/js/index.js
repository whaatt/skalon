import interact from "https://cdn.interactjs.io/v1.10.11/interactjs/index.js";
import { ICON_LIST } from "./icons.js";

const { jsPDF } = jspdf;

const ASPECT_RATIO = 8.5 / 11;
const PPI = 450;

// Content hierarchy:
const CONTENT_INNER = "content-inner";
const POSTER_BOX_SIZING_WRAPPER = "poster-box-sizing-wrapper";
const POSTER_BOX = "poster-box";
const POSTER_BOX_INNER = "poster-box-inner";
const CONTENT_BOX = "content-box";
const CONTENT_BOX_SEAL = "content-box-seal";

// Seal classes:
const SEAL = "seal";
const SEAL_TEXT = "seal-text";
const SEAL_INNER = "seal-inner";

// Export classes:
const EXPORT_JPEG = "export-jpeg";
const EXPORT_PDF = "export-pdf";

// CKEditor classes:
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
 * Content Box Interaction Helpers
 */

const moveContentBox = (target, dx, dy) => {
  const posterBoxInner = target.closest("." + POSTER_BOX_INNER);
  const x =
    (parseFloat(target.getAttribute("data-x")) || 0) +
    dx / posterBoxInner.clientWidth;
  const y =
    (parseFloat(target.getAttribute("data-y")) || 0) +
    dy / posterBoxInner.clientHeight;

  target.style.left = x * 100 + "%";
  target.style.top = y * 100 + "%";
  target.setAttribute("data-x", x);
  target.setAttribute("data-y", y);
};

const resizeListener = (event, xOnly) => {
  const target = event.target;
  const posterBoxInner = target.closest("." + POSTER_BOX_INNER);
  moveContentBox(target, event.deltaRect.left, event.deltaRect.top);

  target.style.width =
    (event.rect.width / posterBoxInner.clientWidth) * 100 + "%";
  if (!xOnly) {
    target.style.height =
      (event.rect.height / posterBoxInner.clientHeight) * 100 + "%";
  }
};

const dragMoveListener = (event) => {
  const target = event.target;
  moveContentBox(target, event.dx, event.dy);
};

const setSnapGridDefaults = (target) => {
  const parent = target.parentElement;
  const xRanges = [[parent.clientWidth / 2, parent.clientWidth / 16]];
  const yRanges = [];
  const xyRanges = [];

  interact(target).draggable({
    listeners: { move: dragMoveListener },
    modifiers: [
      interact.modifiers.restrictRect({
        restriction: "parent",
        endOnly: true,
      }),
      interact.modifiers.snap({
        targets: [
          ...xRanges.map((xRange) => ({
            x: xRange[0],
            range: xRange[1],
          })),
          ...yRanges.map((yRange) => ({
            y: yRange[0],
            range: yRange[1],
          })),
          ...xyRanges.map((xyRanges) => ({
            x: xyRanges[0],
            y: xyRanges[1],
            range: xyRanges[2],
          })),
        ],
        relativePoints: [{ x: 0.5, y: 0.5 }],
        offset: "parent",
      }),
    ],
    inertia: false,
  });
};

/*
 * Poster Box Setup
 */

const circleTypes = {};
// Get a fresh circle type instance every time reconciliation occurs.
const getCircleType = (element) => {
  if (circleTypes[getHashableElementId(element)]) {
    circleTypes[getHashableElementId(element)].destroy();
  }
  circleTypes[getHashableElementId(element)] = new CircleType(element);
  return circleTypes[getHashableElementId(element)];
};

/**
 * Reconciles the contents of a poster box sizing wrapper to match the wrapper
 * size.
 */
const reconcilePosterBoxContents = (posterBoxSizingWrapper) => {
  Array.from(posterBoxSizingWrapper.getElementsByClassName(POSTER_BOX)).forEach(
    (element) =>
      (element.style.fontSize = pixels(
        (posterBoxSizingWrapper.clientHeight / 100) * 4
      ))
  );

  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL)).forEach(
    (element) => {
      const contentBox = element.parentElement;
      Object.assign(element.style, {
        height: pixels(contentBox.clientHeight),
        width: pixels(contentBox.clientHeight),
      });
    }
  );

  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL_TEXT)).forEach(
    (element) => {
      const contentBox = element.parentElement.parentElement;
      Object.assign(element.style, {
        height: pixels(contentBox.clientHeight),
        width: pixels(contentBox.clientHeight),
      });
      element.style.fontSize = pixels(contentBox.clientHeight / 10);
      getCircleType(element).radius(contentBox.clientHeight / 2);
    }
  );

  Array.from(posterBoxSizingWrapper.getElementsByClassName(SEAL_INNER)).forEach(
    (element) => {
      const contentBox = element.parentElement.parentElement;
      const innerDiameter = (contentBox.clientHeight * 3) / 4;
      Object.assign(element.style, {
        height: pixels(innerDiameter),
        width: pixels(innerDiameter),
        fontSize: pixels((contentBox.clientHeight / 5) * 3),
      });
    }
  );

  Array.from(
    posterBoxSizingWrapper.getElementsByClassName(CONTENT_BOX)
  ).forEach(setSnapGridDefaults);
};

/**
 * Reconciles the main poster box sizing wrapper and its constituents.
 */
const reconcilePosterBox = () => {
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

  // Reconcile any special contents.
  reconcilePosterBoxContents(posterBoxSizingWrapper);
};

// Setup resize listener:
window.addEventListener("resize", reconcilePosterBox);
reconcilePosterBox();

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

// Class for IcoFont icons.
function SpecialCharactersIcons(editor) {
  editor.plugins.get("SpecialCharacters").addItems(
    "Icons",
    ICON_LIST.map((icon) => ({ title: icon[0], character: icon[1] }))
  );
}

// Inline editor mode helper:
const editorMap = {};
const useEditorMode = async (target) => {
  if (editorMap[getHashableElementId(target)]) {
    return;
  }
  interact(target).unset();
  const sizeEm = [1, 0.75, 1.125, 1.25, 2, 5, 8];
  const sizeLabels = [
    "Text",
    "Text Small",
    "Header Small",
    "Header Medium",
    "Header Large",
    "Medium Icon",
    "Giant Icon",
  ];
  editorMap[getHashableElementId(target)] = await InlineEditor.create(target, {
    extraPlugins: [
      "Alignment",
      "FontColor",
      "FontSize",
      "Link",
      "SpecialCharacters",
      SpecialCharactersIcons,
    ],
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
    fontSize: {
      options: sizeEm.map((val, i) => ({
        model: val,
        title: sizeLabels[i],
        view: {
          name: "span",
          styles: {
            "font-size": `${val}em`,
          },
        },
      })),
    },
    toolbar: [
      "fontSize",
      "fontColor",
      "link",
      "|",
      "bold",
      "|",
      "alignment",
      "|",
      "specialCharacters",
    ],
  });
  document.querySelector(".ck.ck-toolbar-container") &&
    (document.querySelector(".ck.ck-toolbar-container").style.visibility =
      "hidden");
  setTimeout(
    () =>
      document.querySelector(".ck.ck-toolbar-container") &&
      (document.querySelector(".ck.ck-toolbar-container").style.visibility =
        "initial"),
    100
  );
};

const toSeal = (target) => {
  const firstText = target.querySelector(["p", ".seal-text"]);
  const textContent = firstText ? firstText.textContent : "...";
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
  target.innerHTML =
    '<div class="seal">' +
    `<div class="seal-text">${textContent}</div>` +
    '<div class="seal-inner"></div>' +
    "</div>";
};

// Interactivity mode helper:
const useInteractivityMode = async (target) => {
  if (editorMap[getHashableElementId(target)]) {
    await editorMap[getHashableElementId(target)].destroy();
    delete editorMap[getHashableElementId(target)];
  }

  // Handle saving a seal.
  if (target.classList.contains("content-box-seal")) {
    toSeal(target);
    // Sizes the actual seal elements.
    reconcilePosterBox();
  }

  const resizableConfig = target.classList.contains("content-box-seal")
    ? {
        edges: { right: true, bottom: true },
        listeners: {
          move: resizeListener,
        },
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: "parent",
          }),
          interact.modifiers.aspectRatio({
            ratio: 1,
          }),
        ],
      }
    : {
        edges: { right: true },
        listeners: {
          move: (event) => resizeListener(event, true),
        },
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: "parent",
          }),
        ],
        inertia: false,
      };

  // Set up interaction.
  interact(target)
    .resizable(resizableConfig)
    .on("dragend", (event) => {
      Array.from(document.getElementsByClassName(CONTENT_BOX)).forEach(
        (element) => (element.style.zIndex = 0)
      );
      event.target.style.zIndex = 1;
    })
    .on("resizeend", () => reconcilePosterBox());
  setSnapGridDefaults(target);
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
    // Compute click offset within element.
    var rect = posterBoxInner.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;

    // Create content box and move it to the click position.
    const newContentBox = document.createElement("div");
    newContentBox.classList.add(CONTENT_BOX);
    if (event.shiftKey) {
      newContentBox.classList.add(CONTENT_BOX_SEAL);
      toSeal(newContentBox);
    }
    posterBoxInner.appendChild(newContentBox);
    installContentBox(newContentBox);
    moveContentBox(
      newContentBox,
      x - newContentBox.clientWidth / 2,
      y - newContentBox.clientHeight / 2
    );
  }
});

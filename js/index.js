const title = document.getElementById("title-highlight");
title.onclick = function () {
  if (document.body.classList.contains("dark")) {
    document.body.classList = [];
    if (window.localStorage) {
      window.localStorage.removeItem("dark");
    }
  } else {
    document.body.classList = ["dark"];
    if (window.localStorage) {
      window.localStorage.setItem("dark", "true");
    }
  }
};
let initializeDarkMode = false;
if (
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches
) {
  initializeDarkMode = true;
}
if (window.localStorage && window.localStorage.getItem("dark") !== null) {
  initializeDarkMode = true;
}
if (initializeDarkMode) {
  document.body.classList = ["dark"];
}

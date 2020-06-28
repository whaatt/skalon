const canonicalPath = "/2018/05/01/";
if (window.location.pathname !== canonicalPath) {
  history.replaceState({}, "", canonicalPath);
}

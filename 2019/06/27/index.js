const canonicalPath = '/2018/06/27';
if (window.location.pathname !== canonicalPath) {
    history.replaceState({}, '', canonicalPath);
}

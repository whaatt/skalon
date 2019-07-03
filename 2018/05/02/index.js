const canonicalPath = '/2018/05/02/';
if (window.location.pathname !== canonicalPath) {
    history.replaceState({}, '', canonicalPath);
}

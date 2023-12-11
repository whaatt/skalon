const canonicalPath = '/2018/05/03';
if (window.location.pathname !== canonicalPath) {
    history.replaceState({}, '', canonicalPath);
}

// Content scripts are classic scripts: `"type": "module"` is not a supported
// content_scripts key, and a static import here fails to parse, silently
// killing the whole script. Dynamic import is the supported way in, so this
// stays a one-line loader and main.js holds the real work.
import(chrome.runtime.getURL('src/content/main.js'));

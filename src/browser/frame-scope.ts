/** Resolve an explicit same-origin iframe without falling back to the parent document. */
export function frameDocumentJs(selector?: string): string {
  if (selector === undefined) return '({ document })';
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    let matches;
    try { matches = document.querySelectorAll(selector); }
    catch (error) {
      return { error: { code: 'invalid_selector', message: 'Invalid iframe selector: ' + selector,
        hint: 'Pass the CSS selector of one same-origin iframe.' } };
    }
    if (matches.length !== 1) {
      return { error: { code: matches.length ? 'selector_ambiguous' : 'selector_not_found',
        message: 'Iframe selector ' + selector + ' matched ' + matches.length + ' elements',
        hint: 'Pass the CSS selector of exactly one iframe.' } };
    }
    const frame = matches[0];
    if (frame.tagName.toLowerCase() === 'iframe') {
      try { if (frame.contentDocument) return { document: frame.contentDocument }; } catch (_) {}
    }
    return { error: { code: 'frame_unavailable', message: 'Cannot access iframe: ' + selector,
      hint: '--frame requires a loaded same-origin iframe. Inspect browser frames for cross-origin targets.' } };
  })()`;
}

/** Native mouse input uses the top viewport; DOM rectangles use the owning frame. */
export const FRAME_POINT_JS = `
  function topViewportPoint(doc, x, y) {
    let clear = true;
    for (let frame = doc.defaultView?.frameElement; frame; frame = doc.defaultView?.frameElement) {
      const rect = frame.getBoundingClientRect();
      const scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
      const scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
      x = rect.left + (frame.clientLeft + x) * scaleX;
      y = rect.top + (frame.clientTop + y) * scaleY;
      doc = frame.ownerDocument;
      const at = doc.elementFromPoint(x, y);
      if (!at || (at !== frame && !frame.contains(at))) clear = false;
    }
    return { x: Math.round(x), y: Math.round(y), clear };
  }
`;

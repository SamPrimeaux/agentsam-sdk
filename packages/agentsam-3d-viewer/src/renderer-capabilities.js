/** Detect software WebGL renderers so physically expensive transmission can fall back safely. */
export function isSoftwareWebGLRenderer(renderer) {
  if (!renderer || typeof renderer.getContext !== 'function') return false;
  try {
    const gl = renderer.getContext();
    const extension = gl.getExtension?.('WEBGL_debug_renderer_info');
    const rendererName = String(gl.getParameter?.(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software rasterizer/i.test(rendererName);
  } catch {
    return false;
  }
}

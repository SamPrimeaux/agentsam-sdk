async function loadSharp(injected) {
  if (injected) return injected;
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch (error) {
    const wrapped = new Error(
      "Raster normalization requires the optional 'sharp' runtime dependency.",
    );
    wrapped.code = "sharp_unavailable";
    wrapped.cause = error;
    throw wrapped;
  }
}

function hasOperation(operations, id) {
  return (operations || []).some((operation) =>
    typeof operation === "string" ? operation === id : operation?.id === id,
  );
}

function operation(operations, id) {
  return (operations || []).find((item) =>
    typeof item === "string" ? item === id : item?.id === id,
  );
}

export async function inspectRaster(input, { sharp: injectedSharp } = {}) {
  const sharp = await loadSharp(injectedSharp);
  const image = sharp(input, { failOn: "warning" }).rotate();
  const metadata = await image.metadata();

  const descriptor = {
    format: metadata.format || null,
    mediaKind: "raster",
    widthPx: metadata.width || null,
    heightPx: metadata.height || null,
    colorSpace: metadata.space || null,
    hasAlpha: metadata.hasAlpha ?? null,
    channels: metadata.channels || null,
    density: metadata.density || null,
  };

  if (!metadata.hasAlpha) {
    return Object.freeze({
      ...descriptor,
      contentWidthPx: metadata.width || null,
      contentHeightPx: metadata.height || null,
      transparentBorderDetected: false,
      isAlphaTrimmed: true,
    });
  }

  try {
    const { info } = await sharp(input, { failOn: "warning" })
      .rotate()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });

    const trimmed =
      Boolean(metadata.width && info.width && info.width < metadata.width) ||
      Boolean(metadata.height && info.height && info.height < metadata.height);

    return Object.freeze({
      ...descriptor,
      contentWidthPx: info.width || metadata.width || null,
      contentHeightPx: info.height || metadata.height || null,
      transparentBorderDetected: trimmed,
      isAlphaTrimmed: !trimmed,
    });
  } catch {
    return Object.freeze({
      ...descriptor,
      contentWidthPx: metadata.width || null,
      contentHeightPx: metadata.height || null,
      transparentBorderDetected: null,
      isAlphaTrimmed: false,
    });
  }
}

export async function normalizeRaster(
  input,
  {
    operations = [],
    format = "png",
    sharp: injectedSharp,
  } = {},
) {
  const sharp = await loadSharp(injectedSharp);
  let image = sharp(input, { failOn: "warning" }).rotate();

  if (hasOperation(operations, "trim_alpha")) {
    image = image.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  const colorOperation = operation(operations, "normalize_color_space");
  const requestedColorSpace =
    typeof colorOperation === "object"
      ? colorOperation.params?.colorSpace || "srgb"
      : "srgb";
  if (colorOperation) {
    image = image.toColourspace(requestedColorSpace);
    if (typeof image.withIccProfile === "function") {
      image = image.withIccProfile(requestedColorSpace);
    } else {
      image = image.withMetadata();
    }
  }

  const target = String(format || "png").toLowerCase();
  if (target === "png") {
    image = image.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
    });
  } else if (target === "jpg" || target === "jpeg") {
    image = image.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
  } else if (target === "webp") {
    image = image.webp({ quality: 92, smartSubsample: true });
  } else if (target === "tiff") {
    image = image.tiff({ compression: "lzw" });
  } else {
    const error = new Error(`Unsupported raster normalization output: ${target}`);
    error.code = "unsupported_raster_output";
    throw error;
  }

  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const descriptor = await inspectRaster(data, { sharp });

  return Object.freeze({
    buffer: data,
    info: Object.freeze({ ...info }),
    descriptor,
    operations: Object.freeze(
      operations.map((item) => (typeof item === "string" ? item : item.id)),
    ),
  });
}

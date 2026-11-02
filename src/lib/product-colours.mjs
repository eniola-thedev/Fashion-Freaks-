export function parseProductColours(value) {
  if (!Array.isArray(value) || value.length > 80) {
    return null;
  }

  const names = new Set();
  const publicIds = new Set();
  let totalImages = 0;
  const colours = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const name =
      typeof item.name === "string" ? item.name.trim() : "";
    const hexColor =
      typeof item.hexColor === "string" ? item.hexColor.trim() : "";
    const nameKey = name.toLocaleLowerCase();

    if (
      !name ||
      name.length > 80 ||
      !/^#[0-9a-f]{6}$/i.test(hexColor) ||
      names.has(nameKey) ||
      !Array.isArray(item.images) ||
      item.images.length > 20
    ) {
      return null;
    }

    names.add(nameKey);
    totalImages += item.images.length;
    if (totalImages > 300) {
      return null;
    }

    const images = [];
    for (const image of item.images) {
      if (typeof image !== "object" || image === null) {
        return null;
      }

      const imageUrl =
        typeof image.imageUrl === "string" ? image.imageUrl.trim() : "";
      const imagePublicId =
        typeof image.imagePublicId === "string"
          ? image.imagePublicId.trim()
          : null;
      const imageUploadProof =
        typeof image.imageUploadProof === "string"
          ? image.imageUploadProof
          : null;
      const isPrimary = image.isPrimary;

      if (
        !imageUrl ||
        imageUrl.length > 2000 ||
        (imagePublicId !== null &&
          (!imagePublicId ||
            imagePublicId.length > 255 ||
            publicIds.has(imagePublicId))) ||
        typeof isPrimary !== "boolean"
      ) {
        return null;
      }

      try {
        const url = new URL(imageUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return null;
        }
      } catch {
        return null;
      }

      if (imagePublicId) {
        publicIds.add(imagePublicId);
      }

      images.push({
        imageUrl,
        imagePublicId,
        imageUploadProof,
        isPrimary,
      });
    }

    if (
      images.filter((image) => image.isPrimary).length > 1 ||
      (images.length > 0 &&
        !images.some((image) => image.isPrimary))
    ) {
      return null;
    }

    colours.push({ name, hexColor, images });
  }

  return colours;
}

export function colourHexFromName(name) {
  const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const colours = {
    black: "#111111",
    white: "#ffffff",
    navy: "#14213d",
    "navy blue": "#14213d",
    grey: "#808080",
    gray: "#808080",
    "light grey": "#d3d3d3",
    "light gray": "#d3d3d3",
    charcoal: "#36454f",
    beige: "#d8c3a5",
    brown: "#7b4b2a",
    olive: "#808000",
    green: "#228b22",
    red: "#c62828",
    blue: "#2457a7",
    "light blue": "#87ceeb",
    pink: "#e8a4b8",
    cream: "#fffdd0",
    burgundy: "#800020",
    khaki: "#c3b091",
    purple: "#7040a0",
    orange: "#e67e22",
    yellow: "#f1c40f",
  };

  return colours[normalized] ?? "#808080";
}

export function isValidProductImageUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildProductGallerySlides(
  colours,
  variants,
  fallbackImageUrl
) {
  const slides = [];

  for (const colour of colours) {
    const colourImages = (colour.images ?? [])
      .filter((image) => isValidProductImageUrl(image.imageUrl))
      .sort(
        (first, second) =>
          Number(second.isPrimary) - Number(first.isPrimary) ||
          first.position - second.position
      );
    const images = colourImages.length > 0
      ? colourImages.map((image) => image.imageUrl)
      : variants
          .filter(
            (variant) =>
              variant.colour.trim().toLocaleLowerCase() ===
                colour.name.trim().toLocaleLowerCase() &&
              isValidProductImageUrl(variant.imageUrl)
          )
          .map((variant) => variant.imageUrl);
    const seenImages = new Set();

    for (const imageUrl of images) {
      if (seenImages.has(imageUrl)) continue;
      seenImages.add(imageUrl);
      slides.push({ imageUrl, colourName: colour.name });
    }
  }

  if (
    colours.length === 0 &&
    isValidProductImageUrl(fallbackImageUrl)
  ) {
    slides.push({ imageUrl: fallbackImageUrl, colourName: null });
  }

  return slides;
}

export function validateProductColourImageProofs(
  colours,
  existingImages,
  verifyProof,
  isCloudinaryAsset
) {
  return colours.every((colour) =>
    colour.images.every((image) => {
      if (!image.imagePublicId) {
        return !image.imageUploadProof;
      }

      if (!isCloudinaryAsset(image.imageUrl, image.imagePublicId)) {
        return false;
      }

      const existing = existingImages.some(
        (candidate) =>
          candidate.imageUrl === image.imageUrl &&
          candidate.imagePublicId === image.imagePublicId
      );
      return existing || verifyProof(
        image.imageUploadProof,
        image.imageUrl,
        image.imagePublicId
      );
    })
  );
}

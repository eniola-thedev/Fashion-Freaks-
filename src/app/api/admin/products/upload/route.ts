import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  CloudinaryConfigurationError,
  uploadProductImage,
} from "@/lib/cloudinary";
import {
  getProductImageLimits,
  ProductImageValidationError,
  validateProductImage,
} from "@/lib/product-image.mjs";
import { createProductImageProof } from "@/lib/product-image-proof.mjs";

async function readBoundedBody(
  request: NextRequest,
  maxBytes: number
): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const limits = getProductImageLimits();
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > limits.maxBytes + 128 * 1024
    ) {
      return NextResponse.json(
        { error: "The image upload exceeds the configured file-size limit." },
        { status: 413 }
      );
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json(
        { error: "Submit an image using a multipart form." },
        { status: 400 }
      );
    }

    const boundedBody = await readBoundedBody(
      request,
      limits.maxBytes + 128 * 1024
    );
    if (!boundedBody) {
      return NextResponse.json(
        { error: "The image upload exceeds the configured request-size limit." },
        { status: 413 }
      );
    }

    let formData: FormData;
    try {
      formData = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: new Uint8Array(boundedBody),
      }).formData();
    } catch (error) {
      if (error instanceof TypeError) {
        return NextResponse.json(
          { error: "The image upload form is malformed." },
          { status: 400 }
        );
      }

      throw error;
    }
    if (Array.from(formData.keys()).some((key) => key !== "file")) {
      return NextResponse.json(
        { error: "Unexpected upload form fields." },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (
      !(file instanceof File) ||
      formData.getAll("file").length !== 1
    ) {
      return NextResponse.json(
        { error: "Select an image file to upload." },
        { status: 400 }
      );
    }

    if (file.size > limits.maxBytes) {
      return NextResponse.json(
        { error: "The image upload exceeds the configured file-size limit." },
        { status: 413 }
      );
    }

    const validatedImage = await validateProductImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      file.name,
      limits
    );
    const uploaded = await uploadProductImage(validatedImage.buffer);

    return NextResponse.json({
      imageUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      proof: createProductImageProof(
        uploaded.secure_url,
        uploaded.public_id
      ),
      width: validatedImage.width,
      height: validatedImage.height,
    });
  } catch (error) {
    if (error instanceof ProductImageValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof CloudinaryConfigurationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      );
    }

    console.error("Product image upload failed:", error);
    return NextResponse.json(
      { error: "Could not upload this image. Please try again." },
      { status: 502 }
    );
  }
}

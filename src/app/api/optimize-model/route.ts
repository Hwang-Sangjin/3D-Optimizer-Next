import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// glTF-Transform 임포트
import { Document, NodeIO } from "@gltf-transform/core";
import {
  resample,
  prune,
  dedup,
  draco,
  textureCompress,
} from "@gltf-transform/functions";
import sharp from "sharp";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import * as draco3d from "draco3dgltf"; // draco3d 대신 draco3dgltf 사용

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let tempFilePath: string | undefined; // Exception handling: declare tempFilePath outside try block
  let io: NodeIO; // Declare io outside try block to ensure it's accessible

  try {
    // Initialize NodeIO within the async POST function
    // This allows using 'await' for draco3d.createDecoderModule() and .createEncoderModule()
    // and correctly setting the WASM file location.
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(), // Optional.
      "draco3d.encoder": await draco3d.createEncoderModule(), // Optional.
    });

    const formData = await req.formData();
    const file = formData.get("model") as File;

    if (!file) {
      return NextResponse.json(
        { error: "파일이 업로드되지 않았습니다." },
        { status: 400 }
      );
    }

    // 1. Read binary data from the File object
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // 2. Save to a temporary file
    const tempDir = os.tmpdir();
    const tempFileName = `${Date.now()}-${file.name}`;
    tempFilePath = path.join(tempDir, tempFileName);

    console.log("!!!!!! : ", tempFilePath);

    await fs.writeFile(tempFilePath, Buffer.from(uint8Array));

    // 3. Load glTF file with glTF-Transform
    const document = await io.read(tempFilePath);

    // Validate if the document was loaded successfully
    if (!document) {
      throw new Error(
        "glTF 문서 로드에 실패했습니다. 파일이 유효한 glTF/GLB 형식이 아닐 수 있습니다."
      );
    }

    // 4. Apply all optimization functions in a single transform call
    await document.transform(
      resample(), // Losslessly resample animation frames.
      prune(), // Remove unused nodes, textures, or other data.
      dedup(), // Remove duplicate vertex or texture data, if any.
      draco(), // Compress mesh geometry with Draco.
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [1024, 1024],
      })
    );

    // 5. Convert the optimized document to a binary buffer
    const optimizedBuffer = await io.writeBinary(document);

    // 6. Clean up the temporary file
    if (tempFilePath) {
      await fs.unlink(tempFilePath);
    }

    // 7. Return the optimized file as a response
    return new NextResponse(optimizedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary", // MIME type for GLB files
        "Content-Disposition": `attachment; filename="optimized-${file.name}"`, // Set download filename
      },
    });
  } catch (error) {
    console.error("파일 처리 중 오류 발생:", error);
    // Clean up temporary file in case of an error
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        console.error("임시 파일 삭제 중 오류 발생:", cleanupError);
      }
    }
    return NextResponse.json(
      { error: "파일 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

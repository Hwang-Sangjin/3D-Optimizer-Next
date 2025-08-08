// /app/api/download/route.ts (Next.js 13+ 기준)
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json(
      { error: "fileId 쿼리 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, `${fileId}-optimized.glb`);

  try {
    // 파일이 존재하는지 체크
    await fs.promises.access(filePath, fs.constants.R_OK);

    // 스트림으로 읽어서 응답
    const fileStream = fs.createReadStream(filePath);

    return new NextResponse(fileStream, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Disposition": `attachment; filename="${fileId}-optimized.glb"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
}

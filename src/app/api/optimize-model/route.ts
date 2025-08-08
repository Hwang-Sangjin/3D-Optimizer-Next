export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import os from "os";
import { writeFile, stat } from "fs/promises";
import { NodeIO, Logger } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import * as draco3d from "draco3dgltf";
import sharp from "sharp";

import {
  dedup,
  prune,
  resample,
  draco,
  compressTexture,
} from "@gltf-transform/functions";
import * as meshopt from "meshoptimizer";

// 글로벌 로거 초기화 - SILENT 레벨로 설정하여 로깅 문제 회피
const globalLogger = new Logger(Logger.Verbosity.SILENT);

// 전역 로거 설정을 강제로 초기화
try {
  // 전역 객체에 로거 설정 (런타임에만 실행됨)
  (globalThis as any).__GLTF_TRANSFORM_LOGGER__ = globalLogger;
  (global as any).__GLTF_TRANSFORM_LOGGER__ = globalLogger;
} catch (e) {
  console.warn("로거 전역 설정 실패:", e);
}

// Draco 모듈을 미리 생성 (전역 레벨에서)
let decoderModule: unknown = null;
let encoderModule: unknown = null;
let dracoInitialized = false;

async function initializeDraco() {
  if (dracoInitialized) return { decoderModule, encoderModule };

  try {
    decoderModule = await draco3d.createDecoderModule({
      locateFile: (file: string) => {
        return path.join(process.cwd(), "node_modules/draco3dgltf", file);
      },
    });

    encoderModule = await draco3d.createEncoderModule({
      locateFile: (file: string) => {
        return path.join(process.cwd(), "node_modules/draco3dgltf", file);
      },
    });

    dracoInitialized = true;
    console.log("Draco 모듈 초기화 성공");
    return { decoderModule, encoderModule };
  } catch (error) {
    console.error("Draco 모듈 초기화 실패:", error);
    return { decoderModule: null, encoderModule: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileId = uuidv4();
    const fileName = file.name || "model.glb";
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `${fileId}-${fileName}`);
    const outputPath = path.join(tempDir, `${fileId}-optimized.glb`);

    await writeFile(inputPath, buffer);

    // 원본 파일 크기 측정
    const originalStats = await stat(inputPath);
    const originalSize = originalStats.size;
    console.log(`📁 원본 파일 크기: ${(originalSize / 1024).toFixed(2)} KB`);

    // 파일 크기 변화 추적을 위한 함수
    const checkFileSize = async (stage: string) => {
      try {
        // 임시로 현재 상태를 파일에 저장해서 크기 측정
        const tempPath = path.join(tempDir, `${fileId}-temp-${stage}.glb`);
        await io.write(tempPath, document);
        const tempStats = await stat(tempPath);
        const currentSize = tempStats.size;
        const reduction = ((originalSize - currentSize) / originalSize) * 100;
        console.log(
          `📊 ${stage} 후 크기: ${(currentSize / 1024).toFixed(2)} KB (${
            reduction >= 0 ? "-" : "+"
          }${Math.abs(reduction).toFixed(1)}%)`
        );

        // 임시 파일 정리는 OS가 알아서 처리
        return currentSize;
      } catch (error) {
        console.warn(`⚠️ ${stage} 크기 측정 실패:`, error);
        return originalSize;
      }
    };

    // Draco 모듈 초기화
    const { decoderModule: decoder, encoderModule: encoder } =
      await initializeDraco();
    const useDraco = decoder && encoder;

    // NodeIO 설정 - 글로벌 로거 명시적 설정
    const io = new NodeIO()
      .setLogger(globalLogger)
      .registerExtensions(KHRONOS_EXTENSIONS);

    // Draco 의존성 등록 (사용 가능한 경우)
    if (useDraco) {
      try {
        io.registerDependencies({
          "draco3d.decoder": decoder,
          "draco3d.encoder": encoder,
        });
        console.log("Draco 의존성 등록 성공");
      } catch (depError) {
        console.warn("Draco 의존성 등록 실패:", depError);
      }
    }

    const document = await io.read(inputPath);

    // 최적화 적용 - 단계별 안전한 접근
    let optimizationLevel = "none";

    try {
      // 1단계: 가장 안전한 기본 정리
      await document.transform(dedup());
      optimizationLevel = "basic";
      console.log("✅ Dedup 완료");
      await checkFileSize("Dedup");

      // 2단계: 사용되지 않는 리소스 제거
      await document.transform(prune());
      optimizationLevel = "intermediate";
      console.log("✅ Prune 완료");
      await checkFileSize("Prune");

      // 3단계: 애니메이션 리샘플링 (조건부)
      if (document.getRoot().listAnimations().length > 0) {
        try {
          await document.transform(resample());
          optimizationLevel = "advanced";
          console.log("✅ Resample 완료");
          await checkFileSize("Resample");
        } catch (resampleError) {
          console.warn("⚠️ Resample 실패:", resampleError);
        }
      }

      // 4단계: 텍스처 압축
      if (document.getRoot().listTextures().length > 0) {
        try {
          const textures = document.getRoot().listTextures();
          console.log(`🖼️ 텍스처 ${textures.length}개 발견, WebP 압축 시작...`);

          for (const texture of textures) {
            await compressTexture(texture, {
              encoder: sharp,
              targetFormat: 'webp',
              resize: [1024, 1024]
            });
          }
          
          optimizationLevel = "texture-compressed";
          console.log("✅ 텍스처 압축 완료");
          await checkFileSize("TextureCompress");
        } catch (compressError) {
          console.warn("⚠️ 텍스처 압축 실패:", compressError);
        }
      } else {
        console.log("ℹ️ 텍스처가 없어서 압축 단계 건너뜀");
      }

      // 5단계: 메시 단순화 - 다른 최적화 방법으로 대체
      try {
        // simplify 대신 weld (버텍스 병합)과 기타 최적화 사용
        try {
          // weld 함수를 사용해서 중복 버텍스 제거
          const { weld } = await import("@gltf-transform/functions");

          const weldFn = weld({
            tolerance: 0.0001, // 매우 작은 허용 오차로 버텍스 병합
          });

          await document.transform(weldFn);
          optimizationLevel = "welded";
          console.log("✅ Weld 기반 메시 최적화 완료");
          await checkFileSize("Weld");
        } catch (weldError: unknown) {
          console.warn("⚠️ Weld 사용 불가, quantization으로 대체");

          // 방법 2: Draco quantization을 미리 적용해서 메시 품질 조정
          try {
            // 가벼운 quantization으로 메시 데이터 최적화
            const quantizeTransform = draco({
              quantizePosition: 12,
              quantizeNormal: 10,
              quantizeTexcoord: 10,
            });

            await document.transform(quantizeTransform);
            optimizationLevel = "pre-quantized";
            console.log("✅ Pre-quantization 메시 최적화 완료");
            await checkFileSize("Pre-quantization");
          } catch (quantizeError: unknown) {
            const errorMessage =
              quantizeError instanceof Error
                ? quantizeError.message
                : String(quantizeError);
            console.warn("⚠️ Pre-quantization 실패:", errorMessage);
            console.log("ℹ️ 메시 최적화 건너뛰고 Draco 압축으로 진행");
          }
        }
      } catch (meshOptError: unknown) {
        const errorMessage =
          meshOptError instanceof Error
            ? meshOptError.message
            : String(meshOptError);
        console.warn("⚠️ 모든 메시 최적화 방법 실패:", errorMessage);
        console.log("ℹ️ 메시 최적화 포기, Draco 압축으로 진행");
      }

      // 6단계: Draco 압축 - 더 안전한 방식으로 시도
      if (useDraco) {
        try {
          // 먼저 기본 옵션으로 시도
          const dracoTransform = draco();

          // 로거를 강제로 설정 (타입 검사 우회)
          const transformWithLogger = dracoTransform as { logger?: Logger };
          if (transformWithLogger && typeof transformWithLogger === "object") {
            transformWithLogger.logger = globalLogger;
          }

          await document.transform(dracoTransform);
          // simplify를 건너뛰었으므로 draco가 최고 레벨
          optimizationLevel = "draco";
          console.log("✅ Draco 압축 완료");
          await checkFileSize("Draco");
        } catch (dracoError) {
          console.warn("⚠️ Draco 압축 실패:", dracoError);

          // 대안: 더 간단한 draco 옵션으로 재시도
          try {
            await document.transform(draco({ quantizePosition: 12 }));
            optimizationLevel = "draco-simple";
            console.log("✅ Draco 간단 압축 완료");
            await checkFileSize("Draco Simple");
          } catch (dracoError2) {
            console.warn("⚠️ Draco 재시도도 실패:", dracoError2);
            // Draco도 실패하면 resample이나 intermediate가 최종 레벨
          }
        }
      } else {
        console.log("ℹ️ Draco 모듈 없음, 건너뜀");
        // Draco 없으면 resample이나 intermediate가 최종 레벨
      }
    } catch (transformError) {
      console.error("❌ Transform 에러:", transformError);
      optimizationLevel = "error";

      // 에러 발생 시 최소한의 최적화라도 시도
      try {
        // 새로운 document로 다시 읽어서 기본 최적화 적용
        const document2 = await io.read(inputPath);
        await document2.transform(dedup(), prune());
        await io.write(outputPath, document2);
        optimizationLevel = "minimal";
        console.log("✅ 최소 최적화 완료");

        return NextResponse.json({
          message: `최소 최적화 완료 (레벨: ${optimizationLevel})`,
          optimizedPath: outputPath,
          dracoEnabled: false,
          optimizationLevel,
          note: "일부 최적화 단계에서 에러가 발생하여 최소 최적화만 적용되었습니다.",
        });
      } catch (fallbackError) {
        console.error("❌ 최소 최적화도 실패:", fallbackError);
      }
    }

    await io.write(outputPath, document);

    // 최종 파일 크기 측정 및 요약
    const finalStats = await stat(outputPath);
    const finalSize = finalStats.size;
    const totalReduction = ((originalSize - finalSize) / originalSize) * 100;

    console.log("\n📊 === 최적화 완료 요약 ===");
    console.log(`📁 원본 크기: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`📁 최종 크기: ${(finalSize / 1024).toFixed(2)} KB`);
    console.log(
      `📈 전체 압축률: ${totalReduction >= 0 ? "-" : "+"}${Math.abs(
        totalReduction
      ).toFixed(1)}% (${originalSize - finalSize} bytes 절약)`
    );
    console.log(`🏆 최적화 레벨: ${optimizationLevel}`);
    console.log("========================\n");

    return NextResponse.json({
      message: `최적화 완료 (레벨: ${optimizationLevel})`,
      optimizedModelUrl: `/api/download?fileId=${fileId}`, // 클라이언트가 접근할 URL
      dracoEnabled: ["draco", "draco-simple"].includes(optimizationLevel),
      optimizationLevel,
      fileSize: {
        original: originalSize,
        optimized: finalSize,
        reduction: totalReduction,
        savedBytes: originalSize - finalSize,
      },
      applied: {
        dedup: optimizationLevel !== "none",
        prune: [
          "intermediate",
          "advanced",
          "draco",
          "draco-simple",
          "minimal",
          "welded",
          "pre-quantized",
        ].includes(optimizationLevel),
        resample: ["advanced", "draco", "draco-simple"].includes(
          optimizationLevel
        ),
        simplify: ["welded", "pre-quantized"].includes(optimizationLevel), // weld나 pre-quantization이 적용된 경우
        draco: ["draco", "draco-simple"].includes(optimizationLevel),
      },
      note:
        optimizationLevel === "welded"
          ? "Simplify 대신 Weld 기반 메시 최적화가 적용되었습니다."
          : optimizationLevel === "pre-quantized"
          ? "Simplify 대신 Pre-quantization 메시 최적화가 적용되었습니다."
          : "Simplify는 라이브러리 버전 호환성 문제로 인해 일시적으로 비활성화되었습니다.",
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "최적화 중 오류가 발생했습니다.";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("파일 저장 에러:", error);
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorStack,
      },
      { status: 500 }
    );
  }
}

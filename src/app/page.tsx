"use client";

import { useState } from "react";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [optimizedModelUrl, setOptimizedModelUrl] = useState("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setMessage("");
      setOptimizedModelUrl("");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setMessage("파일을 선택해주세요.");
      return;
    }

    setMessage("모델을 업로드하고 최적화 중입니다...");

    const formData = new FormData();
    formData.append("model", selectedFile);

    try {
      const response = await fetch("/api/optimize-model", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("모델 최적화 및 업로드 성공!");
        setOptimizedModelUrl(data.optimizedModelUrl);
      } else {
        setMessage(`에러: ${data.message || "알 수 없는 오류"}`);
      }
    } catch (error) {
      console.error("업로드 중 오류 발생:", error);
      setMessage("업로드 중 네트워크 오류가 발생했습니다.");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>3D 모델 최적화 서비스</h1>
      <form onSubmit={handleSubmit}>
        <input type="file" accept=".glb,.gltf" onChange={handleFileChange} />
        <button type="submit" style={{ marginLeft: "10px" }}>
          업로드 및 최적화
        </button>
      </form>
      {message && (
        <p
          style={{
            marginTop: "20px",
            color: message.startsWith("에러") ? "red" : "green",
          }}
        >
          {message}
        </p>
      )}
      {optimizedModelUrl && (
        <div style={{ marginTop: "20px" }}>
          <p>최적화된 모델 URL:</p>
          <a href={optimizedModelUrl} target="_blank" rel="noopener noreferrer">
            {optimizedModelUrl}
          </a>
          {/* 여기에 최적화된 모델을 렌더링하는 Three.js/React Three Fiber 컴포넌트를 추가할 수 있습니다. */}
        </div>
      )}
    </div>
  );
}

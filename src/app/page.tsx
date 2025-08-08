"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [optimizedModelUrl, setOptimizedModelUrl] = useState("");
  const [list, setList] = useState(null);
  const [brand, setBrand] = useState("");
  // URL 입력 필드 값을 저장할 state 추가
  const [url, setUrl] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);

  const getListJson = async () => {
    try {
      const response = await fetch(
        "https://3dr.prod.arcdata.naverlabs.io/v1/file/3DR/poc/objects/list.json",
        {
          method: "GET",
        }
      );

      const data = await response.json();

      setList(data);
    } catch (error) {
      console.log(error);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setMessage("");
      setOptimizedModelUrl("");
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target && typeof e.target.result === "string") {
          setSelectedImage(e.target.result);
        }
      };
      reader.readAsDataURL(event.target.files[0]);
    }
  };

  const handleBrandChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setBrand(event.target.value);
    // 'null'을 선택하면 URL을 초기화
    if (event.target.value === "null") {
      setUrl("");
    }
  };

  // URL 입력 필드 값 변경 핸들러
  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setMessage("파일을 선택해주세요.");
      return;
    }

    setMessage("모델을 업로드하고 최적화 중입니다...");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("brand", brand);
    formData.append("url", url); // URL 값도 폼 데이터에 추가

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

  useEffect(() => {
    getListJson();
  }, []);

  useEffect(() => {
    if (list) {
      for (const obj in list) {
        console.log(obj);
      }
    }
  }, [list]);

  const handleImageClick = () => {
    imageInputRef.current?.click();
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>3D 모델 최적화 서비스</h1>
      <form onSubmit={handleSubmit}>
        <input type="file" accept=".glb,.gltf" onChange={handleFileChange} />
        <button type="submit" style={{ marginLeft: "10px" }}>
          업로드 및 최적화
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          <select>
            {list &&
              Object.keys(list).map((key) => <option key={key}>{key}</option>)}
          </select>

          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={imageInputRef}
            style={{ display: "none" }}
          />

          <div
            onClick={handleImageClick}
            style={{
              width: "100px",
              height: "100px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
              backgroundColor: selectedImage ? "transparent" : "#f0f0f0",
              overflow: "hidden",
            }}
          >
            {selectedImage ? (
              <img
                src={selectedImage}
                alt="미리보기 이미지"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ color: "#888" }}>이미지 선택</span>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <label htmlFor="name">모델 이름:</label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder="모델 이름 입력"
          />

          <label htmlFor="brand">브랜드:</label>
          <select
            id="brand"
            name="brand"
            value={brand}
            onChange={handleBrandChange}
          >
            <option value="">--선택--</option>
            <option value="Ikea">Ikea</option>
            <option value="Iloom">Iloom</option>
            <option value="null">null</option>
          </select>

          {(brand === "Ikea" || brand === "Iloom") && (
            <>
              <label htmlFor="url">URL:</label>
              <input
                type="url"
                id="url"
                name="url"
                placeholder="URL 입력"
                value={url}
                onChange={handleUrlChange}
              />
            </>
          )}
        </div>
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
        </div>
      )}
    </div>
  );
}

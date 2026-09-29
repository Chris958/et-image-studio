"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Stage = "idle" | "generating" | "preview" | "approved" | "high" | "error";

type Shot = {
  id: number;
  title: string;
  label: string;
  purpose: string;
  prompt: string;
  enabled: boolean;
  stage: Stage;
  preview?: string;
  high?: string;
  note: string;
  error?: string;
};

type Upload = { id: string; file: File; url: string };

const STYLE_PROFILE = `温暖柔和的自然光；真实面料、刺绣、缝线和轻微自然褶皱；米白、暖灰、浅木色等低饱和中性色；现代手作品牌感与轻微编辑杂志风；干净但不空洞；不过度磨皮、锐化、虚化或使用夸张 HDR；不得出现塑料质感、漂浮感或明显 AI/CGI 痕迹。所有产品颜色、结构、图案、文字、刺绣和材质必须严格忠于参考图片。`;

const SHOTS: Omit<Shot, "stage" | "note">[] = [
  { id: 1, title: "首图", label: "点击英雄图", purpose: "搜索页吸引点击并快速识别产品", enabled: true, prompt: "单顶帽子的三分之四正面英雄图。帽子占画面约 65%–72%，产品位于中央裁切安全区，帽冠、帽檐和刺绣完整。背景简洁但有真实质感，产品最清晰、最明亮，不添加促销文字或无关道具。" },
  { id: 2, title: "场景图", label: "自然佩戴", purpose: "帮助买家想象真实使用效果", enabled: true, prompt: "真实模特在自然日常环境中佩戴帽子。动作放松自然，帽子是绝对视觉重点，面部、服装和环境退居次要。准确展示帽型、帽檐与刺绣。" },
  { id: 3, title: "比例图", label: "佩戴尺度", purpose: "说明帽深、帽檐和头部比例", enabled: true, prompt: "正面或轻微侧面的真实佩戴比例图，清楚展示帽深、帽冠高度、帽檐长度和与成人头部的真实比例。避免广角变形。" },
  { id: 4, title: "刺绣细节", label: "面料微距", purpose: "证明刺绣和材质质量", enabled: true, prompt: "微距细节图，聚焦正面刺绣针脚、图案边缘、面料织纹和帽冠结构。保持真实颜色和自然纤维，不做夸张锐化。" },
  { id: 5, title: "侧面图", label: "帽型结构", purpose: "展示帽冠、拼片与帽檐弧度", enabled: true, prompt: "干净的帽子侧面产品图，完整展示帽冠高度、拼片结构、透气孔和帽檐弧度。机位、背景和光线与首图一致。" },
  { id: 6, title: "背面图", label: "调节结构", purpose: "展示后部开口和调节方式", enabled: true, prompt: "帽子背面产品图，完整展示后部开口、调节扣、接缝和真实存在的品牌标签。不得虚构扣型或标签。" },
  { id: 7, title: "内里细节", label: "替代包装图", purpose: "展示汗带、标签与内部走线", enabled: true, prompt: "帽子内部近距离细节图，展示汗带、尺码标签、内衬和内部走线。仅展示参考图中真实可见或可可靠推断的结构，不能发明文字。" },
  { id: 8, title: "帽檐细节", label: "替代过程图", purpose: "用成品工艺证明制作质量", enabled: true, prompt: "帽檐工艺微距图，展示帽檐层次、车线间距、布料纹理和边缘收口，呈现真实手作质量。" },
  { id: 9, title: "颜色组合", label: "变体对比", purpose: "帮助买家选择真实颜色或款式", enabled: true, prompt: "仅组合展示参考图片中确实存在的颜色或款式变体。保持相同机位、比例和光线；若只有单一款式，则生成另一张自然侧面佩戴图，不得虚构颜色。" },
  { id: 10, title: "补充场景", label: "品牌情绪", purpose: "强化目标人群和生活方式", enabled: true, prompt: "第二张真实生活方式场景图，可选择咖啡店、城市街道或自然户外。低饱和色彩与真实光影，道具和模特不能抢过帽子。" },
];

const stageLabel: Record<Stage, string> = {
  idle: "待生成", generating: "生成中", preview: "低清预览", approved: "已确认", high: "高清完成", error: "需要处理",
};

export default function Home() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [style, setStyle] = useState(STYLE_PROFILE);
  const [productName, setProductName] = useState("");
  const [productFacts, setProductFacts] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [shots, setShots] = useState<Shot[]>(() => SHOTS.map((shot) => ({ ...shot, stage: "idle", note: "" })));
  const [batchRunning, setBatchRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("etsy-hat-style-profile");
    if (saved) setStyle(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("etsy-hat-style-profile", style);
  }, [style]);

  const enabledCount = shots.filter((shot) => shot.enabled).length;
  const completedCount = shots.filter((shot) => shot.stage === "preview" || shot.stage === "approved" || shot.stage === "high").length;
  const approvedCount = shots.filter((shot) => shot.stage === "approved" || shot.stage === "high").length;
  const progress = enabledCount ? Math.round((completedCount / enabledCount) * 100) : 0;

  const canGenerate = uploads.length > 0 && !batchRunning;

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []).slice(0, Math.max(0, 8 - uploads.length));
    const next = incoming.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setUploads((current) => [...current, ...next]);
    event.target.value = "";
  };

  const removeUpload = (id: string) => {
    setUploads((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const updateShot = (id: number, patch: Partial<Shot>) => {
    setShots((current) => current.map((shot) => shot.id === id ? { ...shot, ...patch } : shot));
  };

  const buildPrompt = (shot: Shot, high = false) => `
Use case: Etsy hat product photography
Output role: ${shot.title} — ${shot.label}
Product name: ${productName || "帽子商品"}
Verified product facts: ${productFacts || "仅以参考图片为准，不补充未经证实的产品信息。"}

Global visual style:
${style}

Shot specification:
${shot.prompt}

Single-image adjustment:
${shot.note || "无额外调整。"}

Production constraints:
- 画面比例严格为 5:4 横向，核心产品保持在中央约 80% 的跨比例裁切安全区。
- 必须保持产品身份一致：颜色、轮廓、帽型、面料、刺绣图案、文字、标签、扣件和比例均以参考图为唯一事实来源。
- 禁止增加不存在的文字、徽标、图案、颜色、部件、包装或制作场景。
- 禁止漂浮、塑料质感、畸变帽檐、错误刺绣、虚假磨损、过度景深和明显 AI/CGI 质感。
- 不添加水印、边框、促销角标或说明文字。
${high ? "- 使用已确认的低清预览锁定构图、机位、场景和光线，只提升分辨率、纹理与边缘质量，不重新设计画面。" : "- 这是低清构图预览，优先保证构图、产品真实性和整体光线，不追求无意义的超细节。"}
`.trim();

  const requestImage = async (shot: Shot, high = false) => {
    if (!uploads.length) return;
    updateShot(shot.id, { stage: "generating", error: undefined });
    try {
      const form = new FormData();
      form.append("prompt", buildPrompt(shot, high));
      form.append("quality", high ? "high" : "low");
      form.append("size", high ? "3008x2400" : "960x768");
      form.append("mode", high ? "high" : "preview");

      if (high && shot.preview) {
        const previewBlob = await (await fetch(shot.preview)).blob();
        form.append("images", new File([previewBlob], `approved-${shot.id}.jpg`, { type: "image/jpeg" }));
      }
      uploads.forEach((upload) => form.append("images", upload.file, upload.file.name));

      const requestHeaders: Record<string, string> = {};
      if (apiKey) requestHeaders["x-openai-key"] = apiKey;
      if (baseUrl) requestHeaders["x-openai-base-url"] = baseUrl;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: Object.keys(requestHeaders).length ? requestHeaders : undefined,
        body: form,
      });
      const result = await response.json() as { dataUrl?: string; error?: string };
      if (!response.ok || !result.dataUrl) throw new Error(result.error || "图片生成失败，请稍后重试。");

      if (high) {
        const finalImage = await cropToEtsyFinal(result.dataUrl);
        updateShot(shot.id, { high: finalImage, stage: "high" });
      } else {
        updateShot(shot.id, { preview: result.dataUrl, high: undefined, stage: "preview" });
      }
    } catch (error) {
      updateShot(shot.id, { stage: "error", error: error instanceof Error ? error.message : "生成失败" });
    }
  };

  const generateAllPreviews = async () => {
    if (!canGenerate) return;
    setBatchRunning(true);
    const queue = shots.filter((shot) => shot.enabled);
    for (const shot of queue) await requestImage(shot, false);
    setBatchRunning(false);
  };

  const generateApprovedHigh = async () => {
    if (!canGenerate) return;
    setBatchRunning(true);
    const queue = shots.filter((shot) => shot.stage === "approved");
    for (const shot of queue) await requestImage(shot, true);
    setBatchRunning(false);
  };

  const download = (shot: Shot) => {
    const image = shot.high || shot.preview;
    if (!image) return;
    const link = document.createElement("a");
    link.href = image;
    link.download = `${String(shot.id).padStart(2, "0")}-${shot.title}-${shot.high ? "3000x2400" : "preview"}.jpg`;
    link.click();
  };

  const resetProject = () => {
    uploads.forEach((upload) => URL.revokeObjectURL(upload.url));
    setUploads([]);
    setProductName("");
    setProductFacts("");
    setShots(SHOTS.map((shot) => ({ ...shot, stage: "idle", note: "" })));
  };

  const readyForHigh = useMemo(() => shots.some((shot) => shot.stage === "approved"), [shots]);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">H</span>
          <div><strong>ET Image Studio</strong><span>Etsy 图片工作台</span></div>
        </div>
        <div className="top-actions">
          <span className="spec-pill">3000 × 2400 · 5:4 · sRGB</span>
          <button className="button ghost" onClick={resetProject}>新建项目</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">统一风格 · 统一流程 · 持续复用</span>
          <h1>从产品参考图到完整 Etsy 图片组</h1>
          <p>先用低分辨率确认构图和场景，只为满意的图片输出高清成品。每张图都可以独立调整，不必重做整套。</p>
        </div>
        <div className="progress-panel">
          <div className="progress-copy"><span>本轮进度</span><strong>{completedCount}/{enabledCount}</strong></div>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="progress-meta"><span>{uploads.length} 张参考图</span><span>{approvedCount} 张已确认</span></div>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="setup-panel">
          <div className="section-heading"><span className="step">1</span><div><h2>上传产品图片</h2><p>建议包含正面、侧面、背面和关键细节</p></div></div>
          <button className="upload-zone" onClick={() => fileInput.current?.click()}>
            <span className="upload-icon">＋</span><strong>选择图片</strong><small>JPG、PNG、WEBP · 最多 8 张</small>
          </button>
          <input ref={fileInput} className="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} />
          {uploads.length > 0 && <div className="upload-grid">{uploads.map((upload, index) => <figure key={upload.id}><img src={upload.url} alt={`产品参考图 ${index + 1}`} /><button aria-label={`删除参考图 ${index + 1}`} onClick={() => removeUpload(upload.id)}>×</button><figcaption>参考 {index + 1}</figcaption></figure>)}</div>}

          <label className="field"><span>产品名称</span><input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如：复古刺绣棒球帽" /></label>
          <label className="field"><span>已确认的产品信息</span><textarea value={productFacts} onChange={(event) => setProductFacts(event.target.value)} rows={4} placeholder="例如：米白色棉布、后置金属调节扣、正面红色刺绣。只填写真实信息。" /></label>

          <details className="style-settings">
            <summary>统一风格设定</summary>
            <textarea value={style} onChange={(event) => setStyle(event.target.value)} rows={7} />
            <small>修改会自动保存在当前设备，后续项目继续沿用。</small>
          </details>

          <details className="style-settings">
            <summary>图片服务连接</summary>
            <label className="field"><span>OpenAI API Key（可选）</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="已在服务端配置时无需填写" autoComplete="off" /></label>
            <label className="field"><span>Base URL（可选）</span><input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" autoComplete="off" spellCheck={false} /></label>
            <small>留空时使用 OpenAI 官方地址。API Key 与 Base URL 仅保留在本次打开的页面内，不写入设备存储。</small>
          </details>

          <button className="button primary full" disabled={!canGenerate} onClick={generateAllPreviews}>{batchRunning ? "正在生成预览…" : "生成全部低清预览"}</button>
          {!uploads.length && <p className="hint">上传至少一张产品参考图后即可开始。</p>}
        </aside>

        <section className="shots-panel">
          <div className="shots-header">
            <div className="section-heading"><span className="step">2</span><div><h2>图片任务</h2><p>逐张确认，也可以关闭不需要的任务</p></div></div>
            <button className="button accent" disabled={!readyForHigh || batchRunning} onClick={generateApprovedHigh}>输出所有已确认高清图</button>
          </div>

          <div className="shots-grid">
            {shots.map((shot) => (
              <article className={`shot-card ${shot.stage}`} key={shot.id}>
                <div className="shot-preview">
                  {(shot.high || shot.preview) ? <img src={shot.high || shot.preview} alt={`${shot.title}预览`} /> : <EmptyPreview shot={shot} />}
                  <span className="shot-number">{String(shot.id).padStart(2, "0")}</span>
                  <span className={`stage ${shot.stage}`}>{stageLabel[shot.stage]}</span>
                </div>
                <div className="shot-body">
                  <div className="shot-title-row"><div><h3>{shot.title}</h3><span>{shot.label}</span></div><label className="switch"><input type="checkbox" checked={shot.enabled} onChange={(event) => updateShot(shot.id, { enabled: event.target.checked })} /><i /></label></div>
                  <p className="purpose">{shot.purpose}</p>
                  <label className="adjustment"><span>单张调整要求</span><textarea rows={2} value={shot.note} onChange={(event) => updateShot(shot.id, { note: event.target.value, stage: shot.stage === "approved" ? "preview" : shot.stage })} placeholder="例如：背景改为浅木桌面，帽檐稍微朝左…" /></label>
                  {shot.error && <p className="error-message">{shot.error}</p>}
                  <div className="card-actions">
                    <button className="button ghost" disabled={!uploads.length || shot.stage === "generating" || batchRunning} onClick={() => requestImage(shot, false)}>{shot.preview ? "重做预览" : "低清预览"}</button>
                    {shot.preview && shot.stage !== "high" && <button className={`button ${shot.stage === "approved" ? "approved-button" : "secondary"}`} onClick={() => updateShot(shot.id, { stage: shot.stage === "approved" ? "preview" : "approved" })}>{shot.stage === "approved" ? "已确认 ✓" : "确认构图"}</button>}
                    {shot.stage === "approved" && <button className="button primary" disabled={batchRunning} onClick={() => requestImage(shot, true)}>生成高清</button>}
                    {(shot.preview || shot.high) && <button className="icon-button" aria-label={`下载${shot.title}`} onClick={() => download(shot)}>↓</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function EmptyPreview({ shot }: { shot: Shot }) {
  return <div className="empty-preview"><div className={`hat-symbol hat-${shot.id}`}><i /><b /><em /></div><span>{shot.label}</span></div>;
}

async function cropToEtsyFinal(source: string): Promise<string> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 3000;
  canvas.height = 2400;
  const context = canvas.getContext("2d");
  if (!context) return source;
  const sourceWidth = Math.min(image.naturalWidth, 3008);
  const sourceHeight = Math.min(image.naturalHeight, 2400);
  const cropX = Math.max(0, (sourceWidth - 3000) / 2);
  context.drawImage(image, cropX, 0, Math.min(3000, sourceWidth), sourceHeight, 0, 0, 3000, 2400);
  return canvas.toDataURL("image/jpeg", 0.95);
}

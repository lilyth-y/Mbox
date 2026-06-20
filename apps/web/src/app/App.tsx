import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Box, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import { MboxPageShell } from "../components/MboxPageShell";
import { CategoryPanel } from "../features/gallery/CategoryPanel";
import { GalleryPanel } from "../features/gallery/GalleryPanel";
import { processDataAssetBatch } from "../features/processing/processAssetBatch";
import { processUploadedImages } from "../features/processing/processImage";
import { applyBackgroundGeneration } from "../features/processing/applyBackgroundGeneration";
import {
  applyBackgroundRemoval,
  applyBackgroundRemovalBatch,
} from "../features/processing/applyBackgroundRemoval";
import { hasSubjectCutout } from "../shared/lib/cutoutPresentation";
import { BackgroundGenerationPanel } from "../features/background/BackgroundGenerationPanel";
import { UploadPanel } from "../features/upload/UploadPanel";
import { AfterEffectsPanel, DEFAULT_POST_PROCESSING } from "../features/postprocess/AfterEffectsPanel";
import {
  applyPostProcessingToImage,
  refocusProcessedImage,
} from "../features/postprocess/applyPostProcessing";
import { recommendPostProcessing } from "../features/postprocess/recommendPostProcessing";
import type {
  AppTab,
  BackgroundTemplateId,
  ImageCenter,
  ImagePreprocessMode,
  PostProcessingSettings,
  HoloEvent,
  ProcessedImage,
  ProcessingProgress,
} from "../shared/types";
import { createProgressReporter } from "../shared/lib/processingProgress";
import { ProcessingProgressDisplay } from "../features/processing/ProcessingProgressDisplay";
import { EventManagerPanel } from "../features/events/EventManagerPanel";
import { auditVoluMaxVaultIntegrity } from "../shared/lib/voluMaxVaultIntegrity";
import {
  bootstrapLocalWorkspace,
  bootstrapRemoteWorkspace,
  type EventWorkspaceState,
  createEventWorkspace,
  deleteEventWorkspace,
  persistEventVault,
  switchToEvent,
  usesServerVault,
} from "../features/events/workspaceBackend";
import { API_PUBLIC_URL, ENABLE_DEV_ASSET_BATCH } from "../shared/config/runtime";
import {
  canAddPresentationImage,
  canFitVaultPayload,
  estimateVaultPayloadBytes,
  formatPresentationBytes,
  getPresentationTotalBytes,
  MAX_PRESENTATION_BYTES,
  MAX_VAULT_BYTES,
} from "../shared/lib/mediaLimits";
import { formatVaultQuotaMessage, getVaultStorageUsageBytes } from "../features/events/indexedDbVault";
import { WorkflowVideoCompositePanel } from "../features/composite/WorkflowVideoCompositePanel";

import {
  DEFAULT_IMAGE_CATEGORIES,
  ensureCategoryListed,
} from "../features/gallery/recommendImageCategory";
import {
  applyStoredCategoryAssignments,
  loadCategoryCatalog,
  saveCategoryAssignments,
  saveCategoryCatalog,
} from "../features/gallery/categoryStorage";

const CubeView = lazy(() =>
  import("../features/cube/CubeView").then((m) => ({ default: m.CubeView })),
);

export default function App() {
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [events, setEvents] = useState<HoloEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState("");
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [status, setStatus] = useState("이미지를 업로드해주세요.");
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [focusTarget, setFocusTarget] = useState("");
  const [preprocessMode, setPreprocessMode] = useState<ImagePreprocessMode>("original");
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [backgroundTemplateId, setBackgroundTemplateId] = useState<BackgroundTemplateId>("studio");
  const [backgroundCustomPrompt, setBackgroundCustomPrompt] = useState("");
  const [postProcessingSettings, setPostProcessingSettings] =
    useState<PostProcessingSettings>(DEFAULT_POST_PROCESSING);
  const [activeTab, setActiveTab] = useState<AppTab>("upload");
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = loadCategoryCatalog();
    return saved && saved.length > 0 ? saved : [...DEFAULT_IMAGE_CATEGORIES];
  });
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    saveCategoryCatalog(categories);
  }, [categories]);

  useEffect(() => {
    const loadWorkspace = async (): Promise<{
      workspace: EventWorkspaceState;
      statusMessage: string;
    }> => {
      if (!usesServerVault()) {
        const workspace = await bootstrapLocalWorkspace();
        const eventName =
          workspace.events.find((event) => event.id === workspace.activeEventId)?.name ?? "이벤트";
        return {
          workspace,
          statusMessage: `보관함을 불러왔습니다. (${workspace.processedImages.length}장 · ${eventName} · 이 브라우저에 최대 1GB)`,
        };
      }

      try {
        const workspace = await bootstrapRemoteWorkspace();
        const eventName =
          workspace.events.find((event) => event.id === workspace.activeEventId)?.name ?? "이벤트";
        return {
          workspace,
          statusMessage: `클라우드 보관함을 불러왔습니다. (${workspace.processedImages.length}장 · ${eventName} · PC/모바일 동일 작업실)`,
        };
      } catch (remoteError) {
        const remoteMessage =
          remoteError instanceof Error ? remoteError.message : "Unknown error";
        const workspace = await bootstrapLocalWorkspace();
        const eventName =
          workspace.events.find((event) => event.id === workspace.activeEventId)?.name ?? "이벤트";
        return {
          workspace,
          statusMessage:
            `클라우드 보관함 연결 실패 — 이 브라우저 보관함으로 시작합니다. (${workspace.processedImages.length}장 · ${eventName}) 원인: ${remoteMessage}`,
        };
      }
    };

    loadWorkspace()
      .then(({ workspace, statusMessage }) => {
        setEvents(workspace.events);
        setActiveEventId(workspace.activeEventId);
        setProcessedImages(workspace.processedImages);
        setSelectedImageId(workspace.processedImages[0]?.id ?? null);
        setWorkspaceReady(true);
        const notice = workspace.voluMaxVaultNotice?.trim();
        setStatus(notice ? `${statusMessage} ${notice}` : statusMessage);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        setWorkspaceReady(true);
        setStatus(`보관함 로드 실패: ${message}`);
      });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    (
      window as Window & { __mboxVoluMaxAudit?: () => ReturnType<typeof auditVoluMaxVaultIntegrity> }
    ).__mboxVoluMaxAudit = () => auditVoluMaxVaultIntegrity(processedImages);
  }, [processedImages]);

  useEffect(() => {
    if (!workspaceReady || !activeEventId || isProcessing) {
      return;
    }

    let cancelled = false;
    const debounceMs = usesServerVault() ? 3_000 : 800;
    const timer = window.setTimeout(() => {
      persistEventVault(activeEventId, processedImages, eventsRef.current)
        .then(({ saved, events: nextEvents, vaultSave }) => {
          if (cancelled) {
            return;
          }
          if (!usesServerVault()) {
            setEvents(nextEvents);
          }
          if (!saved && processedImages.length > 0 && !usesServerVault()) {
            const quotaHint =
              vaultSave?.reason === "quota" && vaultSave.usageBytes
                ? `보관함 한도 초과 (${formatVaultQuotaMessage(vaultSave.usageBytes)}).`
                : "브라우저 저장에 실패했습니다.";
            setStatus((previous) =>
              /완료/.test(previous)
                ? `${previous} (${quotaHint} 같은 탭에서 3D·MP4까지 이어가세요.)`
                : `${quotaHint} 같은 탭에서 작업을 마친 뒤 MP4로보내세요.`
            );
          }
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          const message = error instanceof Error ? error.message : "Unknown error";
          if (/429/.test(message)) {
            setStatus(
              "클라우드 보관함 저장이 잠시 제한되었습니다. 1분 후 자동으로 다시 시도되거나, 잠시 뒤 새로고침하세요."
            );
            return;
          }
          setStatus(`보관함 저장 실패: ${message}`);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [processedImages, activeEventId, workspaceReady, isProcessing]);

  const activeEvent = events.find((event) => event.id === activeEventId) ?? events[0];

  const handleSelectEvent = async (eventId: string) => {
    if (eventId === activeEventId || isProcessing || !workspaceReady) {
      return;
    }

    try {
      const workspace = await switchToEvent(
        activeEventId,
        eventId,
        processedImages,
        events
      );
      setEvents(workspace.events);
      setActiveEventId(workspace.activeEventId);
      setProcessedImages(workspace.processedImages);
      setSelectedImageId(workspace.processedImages[0]?.id ?? null);
      setSourceImages([]);
      const nextEvent = workspace.events.find((event) => event.id === eventId);
      setStatus(
        `'${nextEvent?.name ?? "이벤트"}' 보관함을 불러왔습니다. (${workspace.processedImages.length}장)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`이벤트 전환 실패: ${message}`);
    }
  };

  const handleCreateEvent = async (name: string, description?: string) => {
    if (isProcessing || !workspaceReady) {
      return;
    }

    try {
      const workspace = await createEventWorkspace(
        name,
        description,
        activeEventId,
        processedImages,
        events
      );
      setEvents(workspace.events);
      setActiveEventId(workspace.activeEventId);
      setProcessedImages(workspace.processedImages);
      setSelectedImageId(null);
      setSourceImages([]);
      setActiveTab("upload");
      const created = workspace.events.find((event) => event.id === workspace.activeEventId);
      setStatus(`'${created?.name ?? name}' 이벤트를 생성했습니다. 이미지를 추가해 주세요.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`이벤트 생성 실패: ${message}`);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (events.length <= 1 || isProcessing || !workspaceReady) {
      return;
    }

    try {
      const workspace = await deleteEventWorkspace(eventId, events);
      setEvents(workspace.events);
      setActiveEventId(workspace.activeEventId);
      setProcessedImages(workspace.processedImages);
      setSelectedImageId(workspace.processedImages[0]?.id ?? null);
      setSourceImages([]);
      const nextActive = workspace.events.find((event) => event.id === workspace.activeEventId);
      setStatus(
        `'${nextActive?.name ?? "이벤트"}' 이벤트로 전환했습니다. (${workspace.processedImages.length}장)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`이벤트 삭제 실패: ${message}`);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setStatus("이미지 파일을 선택해주세요.");
      return;
    }

    try {
      const images = await Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === "string") {
                  resolve(result);
                  return;
                }
                reject(new Error("Failed to read file."));
              };
              reader.onerror = () => reject(new Error("Failed to read file."));
              reader.readAsDataURL(file);
            })
        )
      );

      setSourceImages(images);
      setStatus(
        images.length === 1
          ? "이미지 업로드 완료. 분석을 시작할 수 있습니다."
          : `${images.length}장 업로드 완료. 분석을 시작할 수 있습니다.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`이미지를 읽는 중 오류가 발생했습니다: ${message}`);
    }
  };

  const handleProcess = async () => {
    if (sourceImages.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress(null);
    const processedEntries: ProcessedImage[] = [];
    const total = sourceImages.length;
    const reporter = createProgressReporter(total, setProcessingProgress);

    try {
      reporter.setPhase("processing");
      const batchProcessed = await processUploadedImages(sourceImages, {
        onStatus: setStatus,
        focusTarget,
        preprocessMode,
        sequenceOrder: processedImages.length,
        onProgress: (current, batchTotal, message) => {
          reporter.setCurrent(current, message, current < batchTotal ? "analyzing" : "cropping");
          setStatus(message);
        },
      });

      const otherEventsVaultBytes = usesServerVault()
        ? 0
        : await getVaultStorageUsageBytes(activeEventId);

      for (const entry of batchProcessed) {
        const nextGallery = [...processedImages, ...processedEntries];
        if (!canAddPresentationImage(nextGallery, entry.byteSize)) {
          setStatus(
            `3D 재생 1GB 한도를 초과해 ${processedEntries.length}장만 저장했습니다. ${formatPresentationBytes(
              getPresentationTotalBytes(nextGallery)
            )} / ${formatPresentationBytes(MAX_PRESENTATION_BYTES)}`
          );
          break;
        }

        const nextEventVaultBytes = estimateVaultPayloadBytes([...nextGallery, entry]);
        if (
          !usesServerVault() &&
          !canFitVaultPayload(otherEventsVaultBytes, nextEventVaultBytes, MAX_VAULT_BYTES)
        ) {
          setStatus(
            `보관함 1GB 한도를 초과해 ${processedEntries.length}장만 저장했습니다. ${formatPresentationBytes(
              otherEventsVaultBytes + nextEventVaultBytes
            )} / ${formatPresentationBytes(MAX_VAULT_BYTES)}`
          );
          break;
        }

        processedEntries.push(entry);
      }
      reporter.setCurrent(processedEntries.length, `${processedEntries.length}/${total}장 처리됨`, "cropping");

      if (processedEntries.length === 0) {
        return;
      }

      setProcessedImages((previous) =>
        applyStoredCategoryAssignments([...processedEntries, ...previous], activeEventId)
      );
      setSelectedImageId(processedEntries[0]?.id ?? null);
      const doneMessage =
        processedEntries.length === 1
          ? preprocessMode === "background_removed"
            ? "분석·크롭이 완료되었습니다. 갤러리에서 이미지를 선택한 뒤 배경 제거를 적용하세요."
            : "이미지 분석·크롭이 완료되었습니다. 필요하면 배경 제거 또는 배경 생성을 적용하세요."
          : `${processedEntries.length}장 분석·크롭이 완료되었습니다. 갤러리에서 후속 작업을 이어가세요.`;
      reporter.complete(doneMessage);
      setStatus(doneMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`처리 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const handleProcessAssetBatch = async () => {
    setIsProcessing(true);
    setProcessingProgress(null);

    try {
      const entries = await processDataAssetBatch({
        onStatus: setStatus,
        onProgress: setProcessingProgress,
        focusTarget,
        preprocessMode,
      });
      const assignedEntries = applyStoredCategoryAssignments(entries, activeEventId);
      setProcessedImages(assignedEntries);
      setSelectedImageId(assignedEntries[0]?.id ?? null);
      setStatus(
        `'${activeEvent?.name ?? "이벤트"}' · data/asset 배치 처리가 완료되었습니다. ${assignedEntries.length}장 · ${formatPresentationBytes(
          getPresentationTotalBytes(assignedEntries)
        )} / ${formatPresentationBytes(MAX_PRESENTATION_BYTES)}`
      );
      setActiveTab("postprocess");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`배치 처리 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const handleAddCategory = (category: string) => {
    const trimmed = category.trim();
    if (!trimmed) {
      return;
    }
    setCategories((previous) => ensureCategoryListed(previous, trimmed));
  };

  const handleAssignCategory = (imageId: number, category: string) => {
    setCategories((previous) => ensureCategoryListed(previous, category));
    setProcessedImages((previous) => {
      const next = previous.map((image) =>
        image.id === imageId ? { ...image, userCategory: category } : image
      );
      saveCategoryAssignments(next, activeEventId);
      return next;
    });
    setStatus(`카테고리를 '${category}'로 확정했습니다.`);
  };

  const handleApplyAiSuggestedCategory = (imageId: number) => {
    const image = processedImages.find((entry) => entry.id === imageId);
    if (!image) {
      return;
    }
    handleAssignCategory(imageId, image.aiSuggestedCategory);
    setStatus(`AI 추천 카테고리 '${image.aiSuggestedCategory}'를 적용했습니다.`);
  };

  const handleApplyBackgroundRemoval = async () => {
    if (!selectedImageId) {
      setStatus("배경 제거를 적용할 이미지를 갤러리에서 선택하세요.");
      return;
    }

    const selectedImage = processedImages.find((image) => image.id === selectedImageId);
    if (!selectedImage) {
      setStatus("선택한 이미지를 찾을 수 없습니다.");
      return;
    }

    setIsProcessing(true);

    try {
      const updated = await applyBackgroundRemoval(selectedImage, { onStatus: setStatus });
      const otherImages = processedImages.filter((image) => image.id !== updated.id);
      if (!canAddPresentationImage(otherImages, updated.byteSize)) {
        setStatus(
          `1GB 한도를 초과해 배경 제거 결과를 저장하지 않았습니다. 현재 사용량 ${formatPresentationBytes(
            getPresentationTotalBytes(processedImages)
          )} / ${formatPresentationBytes(MAX_PRESENTATION_BYTES)}`
        );
        return;
      }
      setProcessedImages((previous) =>
        previous.map((image) => (image.id === updated.id ? updated : image))
      );
      setStatus("배경 제거(누끼)가 완료되었습니다. 3D 큐브에서 인물·배경 분리 연출을 사용할 수 있습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`배경 제거 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyBackgroundRemovalBatch = async () => {
    const pending = processedImages.filter((image) => !hasSubjectCutout(image));
    if (pending.length === 0) {
      setStatus("배경 제거가 필요한 이미지가 없습니다.");
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(null);
    const reporter = createProgressReporter(pending.length, setProcessingProgress);

    try {
      reporter.setPhase("processing");
      const updatedGallery = await applyBackgroundRemovalBatch(processedImages, {
        onStatus: setStatus,
        onProgress: (current, _total, message) => {
          reporter.setCurrent(current, message, "processing");
        },
      });

      if (getPresentationTotalBytes(updatedGallery) > MAX_PRESENTATION_BYTES) {
        setStatus(
          `1GB 한도를 초과해 일괄 배경 제거 결과를 저장하지 않았습니다. ${formatPresentationBytes(
            getPresentationTotalBytes(updatedGallery)
          )} / ${formatPresentationBytes(MAX_PRESENTATION_BYTES)}`
        );
        return;
      }

      setProcessedImages(updatedGallery);
      const cutoutCount = updatedGallery.filter((image) => hasSubjectCutout(image)).length;
      const doneMessage = `${cutoutCount}장이 누끼(배경 제거) 상태입니다. 3D 큐브 탭에서 연출을 적용하세요.`;
      reporter.complete(doneMessage);
      setStatus(doneMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`일괄 배경 제거 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const handleApplyBackground = async () => {
    if (!selectedImageId) {
      setStatus("배경 생성을 적용할 이미지를 갤러리에서 선택하세요.");
      return;
    }

    const selectedImage = processedImages.find((image) => image.id === selectedImageId);
    if (!selectedImage) {
      setStatus("선택한 이미지를 찾을 수 없습니다.");
      return;
    }

    setIsProcessing(true);

    try {
      const updated = await applyBackgroundGeneration(
        selectedImage,
        backgroundTemplateId,
        backgroundCustomPrompt,
        { onStatus: setStatus }
      );
      const otherImages = processedImages.filter((image) => image.id !== updated.id);
      if (!canAddPresentationImage(otherImages, updated.byteSize)) {
        setStatus(
          `1GB 한도를 초과해 배경 생성 결과를 저장하지 않았습니다. 현재 사용량 ${formatPresentationBytes(
            getPresentationTotalBytes(processedImages)
          )} / ${formatPresentationBytes(MAX_PRESENTATION_BYTES)}`
        );
        return;
      }
      setProcessedImages((previous) =>
        previous.map((image) => (image.id === updated.id ? updated : image))
      );
      setStatus("배경 생성이 완료되었습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`배경 생성 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedImage = processedImages.find((image) => image.id === selectedImageId) ?? null;

  useEffect(() => {
    setPostProcessingSettings(selectedImage?.postProcessing ?? DEFAULT_POST_PROCESSING);
  }, [selectedImage?.id, selectedImage?.postProcessing]);

  const updateProcessedImage = (updated: ProcessedImage) => {
    setProcessedImages((previous) =>
      previous.map((image) => (image.id === updated.id ? updated : image))
    );
  };

  const handleCaptionChange = (imageId: number, caption: string) => {
    setProcessedImages((previous) =>
      previous.map((image) => (image.id === imageId ? { ...image, caption } : image))
    );
  };

  const handleFocusCenterCommit = async (imageId: number, center: ImageCenter) => {
    const image = processedImages.find((entry) => entry.id === imageId);
    if (!image) {
      return;
    }

    setIsProcessing(true);
    try {
      const updated = await refocusProcessedImage(image, center);
      const otherImages = processedImages.filter((entry) => entry.id !== imageId);
      if (!canAddPresentationImage(otherImages, updated.byteSize)) {
        setStatus("1GB 한도를 초과해 포커스 조정 결과를 저장하지 않았습니다.");
        return;
      }
      updateProcessedImage(updated);
      setStatus("포커스 위치를 반영해 이미지를 다시 맞췄습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`포커스 조정 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyPostProcessing = async () => {
    if (!selectedImage) {
      setStatus("후처리를 적용할 이미지를 선택하세요.");
      return;
    }

    setIsProcessing(true);
    try {
      const updated = await applyPostProcessingToImage(selectedImage, postProcessingSettings);
      const otherImages = processedImages.filter((image) => image.id !== updated.id);
      if (!canAddPresentationImage(otherImages, updated.byteSize)) {
        setStatus("1GB 한도를 초과해 후처리 결과를 저장하지 않았습니다.");
        return;
      }
      updateProcessedImage(updated);
      setStatus("선택한 이미지에 후처리를 적용했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`후처리 적용 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyPostProcessingAll = async () => {
    if (processedImages.length === 0) {
      setStatus("후처리를 적용할 이미지가 없습니다.");
      return;
    }

    setIsProcessing(true);
    try {
      const updatedImages: ProcessedImage[] = [];
      for (const image of processedImages) {
        const updated = await applyPostProcessingToImage(image, postProcessingSettings);
        if (!canAddPresentationImage(updatedImages, updated.byteSize)) {
          setStatus(`1GB 한도에 도달해 ${updatedImages.length}장까지만 후처리를 적용했습니다.`);
          break;
        }
        updatedImages.push(updated);
      }
      if (updatedImages.length > 0) {
        setProcessedImages(updatedImages);
        setStatus(`후처리를 ${updatedImages.length}장에 적용했습니다.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`후처리 일괄 적용 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyAiRecommendedFocus = async (imageId: number) => {
    const image = processedImages.find((entry) => entry.id === imageId);
    if (!image) {
      return;
    }
    const recommended = image.aiRecommendedCenter ?? image.center;
    setIsProcessing(true);
    try {
      const updated = await refocusProcessedImage(image, recommended);
      const otherImages = processedImages.filter((entry) => entry.id !== imageId);
      if (!canAddPresentationImage(otherImages, updated.byteSize)) {
        setStatus("1GB 한도를 초과해 AI 추천 포커스를 저장하지 않았습니다.");
        return;
      }
      updateProcessedImage(updated);
      setStatus("AI 추천 포커스를 적용했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(`AI 추천 포커스 적용 중 오류가 발생했습니다: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecommendPostProcessing = () => {
    if (!selectedImage) {
      setStatus("AI 후처리 추천을 불러올 이미지를 선택하세요.");
      return;
    }
    setPostProcessingSettings(recommendPostProcessing(selectedImage));
    setStatus("AI 후처리 추천값을 불러왔습니다. 적용 버튼으로 반영하세요.");
  };

  return (
    <MboxPageShell wide>
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl serif-title metallic-text">mbox</h1>
          <p className="text-mbox-muted text-sm mt-1">이미지 분석, 크롭, 배경 생성 및 3D 시각화 파이프라인</p>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-mbox-subtle italic">{status}</p>
          <ProcessingProgressDisplay
            progress={processingProgress}
            isProcessing={isProcessing}
            compact
          />
          <a
            href="./showcase.html"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[rgba(180,220,255,0.28)] bg-[rgba(120,180,255,0.08)] px-4 py-2.5 text-sm font-semibold text-sky-100 hover:border-sky-200/50 transition-colors no-underline"
          >
            <Sparkles size={16} className="text-sky-200" aria-hidden />
            크리스털 쇼케이스
          </a>
        </div>

        <div className="mbox-tab-bar">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`mbox-tab ${activeTab === "upload" ? "active" : ""}`}
          >
            <Upload size={18} /> 프로세싱
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("postprocess")}
            className={`mbox-tab ${activeTab === "postprocess" ? "active" : ""}`}
          >
            <SlidersHorizontal size={18} /> 후처리
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cube")}
            className={`mbox-tab ${activeTab === "cube" ? "active" : ""}`}
          >
            <Box size={18} /> 3D 큐브
          </button>
        </div>
      </header>

      <main className="space-y-6">
        <EventManagerPanel
          events={events}
          activeEventId={activeEventId}
          imageCount={processedImages.length}
          disabled={isProcessing || !workspaceReady}
          onSelect={handleSelectEvent}
          onCreate={handleCreateEvent}
          onDelete={handleDeleteEvent}
        />

        <WorkflowVideoCompositePanel />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {activeTab === "upload" ? (
          <>
            <div className="lg:col-span-5 space-y-6">
              <UploadPanel
                sourceImages={sourceImages}
                focusTarget={focusTarget}
                preprocessMode={preprocessMode}
                isProcessing={isProcessing}
                status={status}
                processingProgress={processingProgress}
                onFileUpload={handleFileUpload}
                onFocusTargetChange={setFocusTarget}
                onPreprocessModeChange={setPreprocessMode}
                onProcess={handleProcess}
                onProcessAssetBatch={handleProcessAssetBatch}
                showDevAssetBatch={ENABLE_DEV_ASSET_BATCH}
                onClear={() => {
                  setSourceImages([]);
                  setStatus("이미지를 업로드해주세요.");
                }}
              />
              <BackgroundGenerationPanel
                selectedImageLabel={selectedImage?.label ?? null}
                galleryCount={processedImages.length}
                pendingCutoutCount={
                  processedImages.filter((image) => !hasSubjectCutout(image)).length
                }
                templateId={backgroundTemplateId}
                customPrompt={backgroundCustomPrompt}
                isProcessing={isProcessing}
                onTemplateChange={setBackgroundTemplateId}
                onCustomPromptChange={setBackgroundCustomPrompt}
                onApplyRemoval={handleApplyBackgroundRemoval}
                onApplyRemovalBatch={handleApplyBackgroundRemovalBatch}
                onApply={handleApplyBackground}
              />
              <CategoryPanel
                categories={categories}
                processedImages={processedImages}
                selectedImage={selectedImage}
                onAddCategory={handleAddCategory}
                onAssignCategory={handleAssignCategory}
                onApplyAiSuggestedCategory={handleApplyAiSuggestedCategory}
              />
            </div>
            <GalleryPanel
              processedImages={processedImages}
              selectedImageId={selectedImageId}
              onSelectImage={setSelectedImageId}
              enableFocusEditor
              onFocusCenterCommit={handleFocusCenterCommit}
              onApplyAiRecommendedFocus={handleApplyAiRecommendedFocus}
              onCaptionChange={handleCaptionChange}
            />
          </>
        ) : activeTab === "postprocess" ? (
          <>
            <div className="lg:col-span-12">
              <AfterEffectsPanel
                selectedImage={selectedImage}
                settings={postProcessingSettings}
                isProcessing={isProcessing}
                onSettingsChange={setPostProcessingSettings}
                onFocusCenterCommit={(center) => {
                  if (selectedImage) {
                    void handleFocusCenterCommit(selectedImage.id, center);
                  }
                }}
                onApply={handleApplyPostProcessing}
                onApplyAll={handleApplyPostProcessingAll}
                onReset={() => setPostProcessingSettings(DEFAULT_POST_PROCESSING)}
                onRecommend={handleRecommendPostProcessing}
              />
            </div>
            <div className="lg:col-span-5">
              <CategoryPanel
                categories={categories}
                processedImages={processedImages}
                selectedImage={selectedImage}
                onAddCategory={handleAddCategory}
                onAssignCategory={handleAssignCategory}
                onApplyAiSuggestedCategory={handleApplyAiSuggestedCategory}
              />
            </div>
            <GalleryPanel
              processedImages={processedImages}
              selectedImageId={selectedImageId}
              onSelectImage={setSelectedImageId}
              enableFocusEditor
              onFocusCenterCommit={handleFocusCenterCommit}
              onApplyAiRecommendedFocus={handleApplyAiRecommendedFocus}
              onCaptionChange={handleCaptionChange}
            />
          </>
        ) : (
          <Suspense fallback={<p className="text-mbox-muted text-sm">큐브 뷰 로딩 중…</p>}>
            <CubeView
              active={activeTab === "cube"}
              workspaceReady={workspaceReady}
              processedImages={processedImages}
              onProcessedImagesChange={setProcessedImages}
            />
          </Suspense>
        )}
        </div>
      </main>

      <footer className="mt-12 pt-8 border-t border-[rgba(223,179,134,0.12)] flex flex-col md:flex-row justify-between items-center text-mbox-muted text-sm">
        <p>© 2026 mbox. All rights reserved.</p>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="/docs/goals.md" className="mbox-link">
            Documentation
          </a>
          <a
            href={`${API_PUBLIC_URL}/health`}
            target="_blank"
            rel="noreferrer"
            className="mbox-link"
          >
            API Status
          </a>
          <a href="/docs/architecture.md" className="mbox-link">
            Privacy
          </a>
        </div>
      </footer>
    </MboxPageShell>
  );
}

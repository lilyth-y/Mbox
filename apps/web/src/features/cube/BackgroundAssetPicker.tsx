import { useEffect, useMemo, useState } from "react";

import { Film, Loader2, Trash2 } from "lucide-react";

import {

  backgroundAssetKind,

  isUserBackgroundCollection,

  loadBackgroundAssetCatalog,

  resolveBackgroundAssetPublicUrl,

  resolveBackgroundCatalogAssetPath,

  type BackgroundAssetCatalog,

  type BackgroundAssetCollection,

} from "../../shared/lib/backgroundAssetCatalog";



export type BackgroundPickerSource = "mine" | "builtin";



interface BackgroundAssetPickerProps {

  source: BackgroundPickerSource;

  selectedAssetPath: string | null;

  disabled?: boolean;

  reloadToken?: number;

  onSelect: (assetPath: string) => void;

  onDeleteUserFile?: (relativeFile: string) => void | Promise<void>;

}



export function BackgroundAssetPicker({

  source,

  selectedAssetPath,

  disabled = false,

  reloadToken = 0,

  onSelect,

  onDeleteUserFile,

}: BackgroundAssetPickerProps) {

  const [catalog, setCatalog] = useState<BackgroundAssetCatalog | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [collectionId, setCollectionId] = useState<string | null>(null);

  const [deletingFile, setDeletingFile] = useState<string | null>(null);



  useEffect(() => {

    let cancelled = false;

    void loadBackgroundAssetCatalog(true)

      .then((data) => {

        if (!cancelled) {

          setCatalog(data);

          const collections =

            source === "mine"

              ? data.collections.filter((entry) => isUserBackgroundCollection(entry.id))

              : data.collections.filter((entry) => !isUserBackgroundCollection(entry.id));

          setCollectionId(collections[0]?.id ?? null);

        }

      })

      .catch((err) => {

        if (!cancelled) {

          setError(err instanceof Error ? err.message : String(err));

        }

      });

    return () => {

      cancelled = true;

    };

  }, [source, reloadToken]);



  const filteredCollections = useMemo(() => {

    if (!catalog) return [];

    return source === "mine"

      ? catalog.collections.filter((entry) => isUserBackgroundCollection(entry.id))

      : catalog.collections.filter((entry) => !isUserBackgroundCollection(entry.id));

  }, [catalog, source]);



  const activeCollection: BackgroundAssetCollection | undefined =

    source === "mine"

      ? undefined

      : filteredCollections.find((entry) => entry.id === collectionId);



  const mineItems = useMemo(() => {

    if (source !== "mine") return [];

    return filteredCollections.flatMap((collection) =>

      collection.items.map((item) => ({

        item,

        collectionId: collection.id,

        assetPath: resolveBackgroundCatalogAssetPath(collection.id, item.file),

        deletePath: item.file,

      }))

    );

  }, [filteredCollections, source]);



  const handleDelete = async (deletePath: string, assetPath: string) => {

    if (!onDeleteUserFile || disabled) return;

    if (!window.confirm("이 파일을 작업공간에서 삭제할까요?")) return;

    setDeletingFile(deletePath);

    try {

      await onDeleteUserFile(deletePath);

      if (selectedAssetPath === assetPath) {

        onSelect("");

      }

    } finally {

      setDeletingFile(null);

    }

  };



  const renderThumb = (

    assetPath: string,

    itemFile: string,

    isVideo: boolean,

    selected: boolean,

    deletePath?: string

  ) => {

    const thumbUrl = resolveBackgroundAssetPublicUrl(assetPath);

    return (

      <div key={assetPath} className="relative group aspect-square">

        <button

          type="button"

          disabled={disabled}

          title={itemFile}

          onClick={() => onSelect(assetPath)}

          className={`relative h-full w-full overflow-hidden rounded-lg border transition ${

            selected

              ? "border-mbox-gold ring-2 ring-mbox-gold/40"

              : "border-[rgba(223,179,134,0.12)] hover:border-mbox-gold/30"

          }`}

        >

          {isVideo ? (

            <video

              src={thumbUrl}

              muted

              loop

              playsInline

              preload="metadata"

              className="h-full w-full object-cover"

            />

          ) : (

            <img

              src={thumbUrl}

              alt={itemFile}

              loading="lazy"

              className="h-full w-full object-cover"

            />

          )}

          {isVideo ? (

            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 py-0.5 text-[8px] font-bold text-mbox-gold inline-flex items-center gap-0.5">

              <Film size={8} />

              MP4

            </span>

          ) : null}

        </button>

        {deletePath && onDeleteUserFile ? (

          <button

            type="button"

            disabled={disabled || deletingFile === deletePath}

            title="삭제"

            onClick={(event) => {

              event.stopPropagation();

              void handleDelete(deletePath, assetPath);

            }}

            className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-lg bg-[rgba(18,14,24,0.75)]/85 text-white opacity-0 transition hover:bg-mbox-gold/80 group-hover:opacity-100"

          >

            <Trash2 size={12} />

          </button>

        ) : null}

      </div>

    );

  };



  if (error) {

    return <p className="text-[11px] text-amber-300/90 leading-relaxed">{error}</p>;

  }

  if (!catalog) {

    return (

      <p className="text-[11px] text-mbox-subtle inline-flex items-center gap-2">

        <Loader2 size={12} className="animate-spin" />

        배경 목록 불러오는 중…

      </p>

    );

  }



  if (source === "mine" && mineItems.length === 0) {

    return (

      <p className="text-[11px] text-mbox-subtle leading-relaxed">

        아직 내 파일이 없습니다. 아래 영역에 이미지·동영상을 끌어다 놓으세요.

      </p>

    );

  }



  if (source === "builtin" && filteredCollections.length === 0) {

    return <p className="text-[11px] text-mbox-subtle">기본 제공 배경이 없습니다.</p>;

  }



  return (

    <div className="space-y-3">

      {source === "builtin" ? (

        <div className="flex flex-wrap gap-1.5">

          {filteredCollections.map((collection) => {

            const active = collection.id === collectionId;

            return (

              <button

                key={collection.id}

                type="button"

                disabled={disabled}

                onClick={() => setCollectionId(collection.id)}

                className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition ${

                  active

                    ? "border-mbox-gold/50 bg-mbox-gold/10 text-mbox-gold"

                    : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.65)] text-mbox-muted hover:border-[rgba(223,179,134,0.18)]"

                }`}

              >

                {collection.label}

                <span className="ml-1 opacity-60">({collection.items.length})</span>

              </button>

            );

          })}

        </div>

      ) : null}



      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-52 overflow-y-auto pr-1">

        {source === "mine"

          ? mineItems.map(({ item, assetPath, deletePath }) =>

              renderThumb(

                assetPath,

                item.label ?? item.file,

                backgroundAssetKind(item) === "video",

                selectedAssetPath === assetPath,

                deletePath

              )

            )

          : activeCollection?.items.map((item) => {

              const assetPath = resolveBackgroundCatalogAssetPath(activeCollection.id, item.file);

              return renderThumb(

                assetPath,

                item.label ?? item.file,

                backgroundAssetKind(item) === "video",

                selectedAssetPath === assetPath

              );

            })}

      </div>



      {selectedAssetPath ? (

        <p className="text-[10px] text-mbox-gold/80 truncate">선택: {selectedAssetPath}</p>

      ) : source === "builtin" ? (

        <p className="text-[10px] text-mbox-subtle">썸네일을 눌러 큐브 뒤 화면 전체 밑배경을 선택하세요.</p>

      ) : null}

    </div>

  );

}



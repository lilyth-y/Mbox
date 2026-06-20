import { useState } from "react";
import { CalendarDays, FolderPlus, Trash2 } from "lucide-react";
import type { HoloEvent } from "../../shared/types";

interface EventManagerPanelProps {
  events: HoloEvent[];
  activeEventId: string;
  imageCount: number;
  disabled?: boolean;
  onSelect: (eventId: string) => void;
  onCreate: (name: string, description?: string) => void;
  onDelete: (eventId: string) => void;
}

export function EventManagerPanel({
  events,
  activeEventId,
  imageCount,
  disabled = false,
  onSelect,
  onCreate,
  onDelete,
}: EventManagerPanelProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const activeEvent = events.find((event) => event.id === activeEventId) ?? events[0];

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    onCreate(trimmed, newDescription.trim() || undefined);
    setNewName("");
    setNewDescription("");
    setIsCreating(false);
  };

  return (
    <div className="mbox-card p-4 shadow-lg">
      <div className="flex items-center gap-2 text-mbox-gold">
        <CalendarDays size={18} />
        <h2 className="text-sm font-bold uppercase tracking-[0.14em]">이벤트 / 프로젝트</h2>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-mbox-subtle">
        행사·촬영·캠페인 단위로 이미지 보관함을 나눠 관리합니다. 이벤트를 바꾸면 해당 보관함만
        불러옵니다.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-mbox-muted">
            활성 이벤트
          </span>
          <select
            disabled={disabled}
            value={activeEvent?.id ?? ""}
            onChange={(event) => onSelect(event.target.value)}
            className="w-full rounded-xl border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.7)] px-3 py-2.5 text-sm text-mbox-text outline-none transition focus:border-mbox-gold/60"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsCreating((value) => !value)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-mbox-gold/40 bg-mbox-gold/10 px-4 py-2.5 text-sm font-semibold text-mbox-gold transition hover:bg-mbox-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FolderPlus size={16} />
          새 이벤트
        </button>

        {events.length > 1 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!activeEvent) {
                return;
              }
              if (window.confirm(`'${activeEvent.name}' 이벤트와 보관함을 삭제할까요?`)) {
                onDelete(activeEvent.id);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
            삭제
          </button>
        ) : null}
      </div>

      {activeEvent ? (
        <div className="mt-3 rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] px-4 py-3 text-xs text-mbox-muted">
          <p className="font-semibold text-mbox-text">{activeEvent.name}</p>
          {activeEvent.description ? <p className="mt-1">{activeEvent.description}</p> : null}
          <p className="mt-2">
            보관함 {imageCount}장 · 생성{" "}
            {new Date(activeEvent.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
      ) : null}

      {isCreating ? (
        <div className="mt-4 space-y-3 rounded-xl border border-mbox-gold/25 bg-mbox-gold/5 p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-mbox-muted">이벤트 이름</span>
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="예: 2026 봄 촬영, MODA 룩북"
              className="w-full rounded-xl border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.7)] px-3 py-2 text-sm text-mbox-text outline-none focus:border-mbox-gold/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-mbox-muted">설명 (선택)</span>
            <input
              type="text"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="행사 장소, 클라이언트, 메모"
              className="w-full rounded-xl border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.7)] px-3 py-2 text-sm text-mbox-text outline-none focus:border-mbox-gold/60"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={handleCreate}
              className="gold-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              생성
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="rounded-xl border border-[rgba(223,179,134,0.18)] px-4 py-2 text-sm text-mbox-muted transition hover:bg-[rgba(18,14,24,0.85)]"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * useCharacterDrag
 *
 * キャラクターのドラッグ移動を Pointer Events で管理する composable。
 * - pointerdown で開始し、pointermove で dragOffset を更新（ローカル表示のみ）
 * - pointerup で最終座標を setXY に渡してサーバ同期
 * - クランプは既存の updateUserDispLocation に委譲
 *
 * テンプレート側:
 *   左: user.dispX + (draggingId === id ? dragOffset.x : 0)
 *   上: user.dispY + (draggingId === id ? dragOffset.y : 0)
 */
import { ref, type Ref } from "vue";
import { usePointerDragSession } from "./usePointerDragSession";

export interface CharacterDragContext {
  /** ドラッグ中のキャラID (null = ドラッグなし) */
  draggingId: Ref<string | null>;
  /** ドラッグ中の表示オフセット (px) */
  dragOffset: Ref<{ x: number; y: number }>;
  /** ドラッグ中フラグ */
  isDragging: Ref<boolean>;
  /** pointerdown ハンドラ — テンプレートから呼ぶ */
  onPointerDown: (e: PointerEvent, id: string, user: { dispX: number; dispY: number }) => void;
  /** 手動クリーンアップ */
  cleanup: () => void;
}

export function useCharacterDrag(options: {
  /** 自分のキャラかどうか判定 */
  isMine: (id: string) => boolean;
  /** サーバへ座標を送信 */
  setXY: (x: number, y: number) => void;
}): CharacterDragContext {
  const session = usePointerDragSession();

  const draggingId = ref<string | null>(null);
  const dragOffset = ref({ x: 0, y: 0 });

  // ドラッグ開始時の表示座標（dispX/dispY）を保持
  let startDispX = 0;
  let startDispY = 0;
  let startClientX = 0;
  let startClientY = 0;

  function onPointerDown(e: PointerEvent, id: string, user: { dispX: number; dispY: number }) {
    // 自分のキャラ以外はドラッグしない
    if (!options.isMine(id)) return;

    startDispX = user.dispX;
    startDispY = user.dispY;
    startClientX = e.clientX;
    startClientY = e.clientY;
    draggingId.value = id;
    dragOffset.value = { x: 0, y: 0 };

    session.start(e, {
      onMove(moveEvent: PointerEvent) {
        dragOffset.value = {
          x: moveEvent.clientX - startClientX,
          y: moveEvent.clientY - startClientY,
        };
      },
      onEnd() {
        // 最終座標 = 開始時の表示座標 + 累計オフセット
        const finalX = startDispX + dragOffset.value.x;
        const finalY = startDispY + dragOffset.value.y;

        // リセット（setXY の前にやることで、store 更新 → テンプレート再描画時にオフセットが消える）
        const hadDrag = dragOffset.value.x !== 0 || dragOffset.value.y !== 0;
        draggingId.value = null;
        dragOffset.value = { x: 0, y: 0 };

        // サーバ同期（移動があった場合のみ）
        if (hadDrag) {
          options.setXY(finalX, finalY);
        }
      },
    });
  }

  function cleanup() {
    draggingId.value = null;
    dragOffset.value = { x: 0, y: 0 };
    session.cleanup();
  }

  return {
    draggingId,
    dragOffset,
    isDragging: session.isDragging,
    onPointerDown,
    cleanup,
  };
}

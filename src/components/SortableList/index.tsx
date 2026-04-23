import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode } from "react";
import { useUiStore } from "../../store/uiStore";

interface SortableListProps<T extends { id: string }> {
  items: T[];
  onReorder: (newOrder: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  renderFallbackControls?: (
    item: T,
    index: number,
    total: number,
    move: (from: number, to: number) => void,
  ) => ReactNode;
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  renderFallbackControls,
}: SortableListProps<T>) {
  const isAndroid = useUiStore((s) => s.isAndroid);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8px movement before a drag starts. Without this constraint,
      // dnd-kit's onPointerDown handler (spread on the entire row) swallows
      // clicks on nested buttons before they can fire.
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (isAndroid) {
    const move = (from: number, to: number) => {
      const next = arrayMove(items, from, to);
      onReorder(next);
    };
    return (
      <>
        {items.map((item, i) => (
          <div key={item.id}>
            {renderItem(item, i)}
            {renderFallbackControls?.(item, i, items.length, move)}
          </div>
        ))}
      </>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((x) => x.id === active.id);
    const newIndex = items.findIndex((x) => x.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item, i) => (
          <SortableItem key={item.id} id={item.id}>
            {renderItem(item, i)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

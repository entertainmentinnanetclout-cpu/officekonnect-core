import { useEffect, useRef, useState } from "react";
import { Rnd } from "@/components/resizable-draggable";
import { PdfViewer } from "@/components/document/pdf-viewer";
import type { SigningField } from "@/lib/signing";
import { fieldTypeLabel } from "@/lib/signing";
import { cn } from "@/lib/utils";

interface SigningPdfFieldsProps {
  url: string;
  page: number;
  zoom: number;
  fields: SigningField[];
  selectedFieldId?: string | null;
  editable?: boolean;
  onSelectField?: (fieldId: string) => void;
  onFieldGeometryChange?: (
    fieldId: string,
    geometry: Pick<SigningField, "x" | "y" | "w" | "h">,
  ) => void;
  participantLabel?: (participantId: string) => string;
  onLoadPages?: (count: number) => void;
}

function FieldOverlay({
  field,
  selected,
  editable,
  bounds,
  participantLabel,
  onSelect,
  onGeometryChange,
}: {
  field: SigningField;
  selected: boolean;
  editable: boolean;
  bounds: { width: number; height: number };
  participantLabel?: (participantId: string) => string;
  onSelect?: () => void;
  onGeometryChange?: (geometry: Pick<SigningField, "x" | "y" | "w" | "h">) => void;
}) {
  const left = field.x * bounds.width;
  const top = field.y * bounds.height;
  const width = Math.max(44, field.w * bounds.width);
  const height = Math.max(28, field.h * bounds.height);
  const content = (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      className={cn(
        "flex h-full w-full flex-col items-start justify-center overflow-hidden rounded-md border-2 px-2 text-left text-[10px] shadow-sm backdrop-blur-sm",
        selected
          ? "border-violet-600 bg-violet-100/90 text-violet-950"
          : "border-blue-500 bg-blue-50/85 text-blue-900",
      )}
      style={{ transform: `rotate(${field.rotation || 0}deg)` }}
    >
      <span className="font-semibold">{field.label || fieldTypeLabel(field.type)}</span>
      {participantLabel && (
        <span className="max-w-full truncate opacity-70">
          {participantLabel(field.participant_id)}
        </span>
      )}
      {field.required && <span className="absolute right-1 top-0.5 font-bold text-red-500">*</span>}
    </button>
  );

  if (!editable) {
    return (
      <div
        className="absolute"
        style={{ left, top, width, height }}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    );
  }

  return (
    <Rnd
      bounds="parent"
      size={{ width, height }}
      position={{ x: left, y: top }}
      minWidth={44}
      minHeight={28}
      onDragStart={() => onSelect?.()}
      onDragStop={(_, data) =>
        onGeometryChange?.({
          x: data.x / bounds.width,
          y: data.y / bounds.height,
          w: width / bounds.width,
          h: height / bounds.height,
        })
      }
      onResizeStart={() => onSelect?.()}
      onResizeStop={(_, __, ref, ___, position) =>
        onGeometryChange?.({
          x: position.x / bounds.width,
          y: position.y / bounds.height,
          w: ref.offsetWidth / bounds.width,
          h: ref.offsetHeight / bounds.height,
        })
      }
      className="z-20"
    >
      {content}
    </Rnd>
  );
}

export function SigningPdfFields({
  url,
  page,
  zoom,
  fields,
  selectedFieldId,
  editable = false,
  onSelectField,
  onFieldGeometryChange,
  participantLabel,
  onLoadPages,
}: SigningPdfFieldsProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setBounds({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page, zoom, url]);

  const pageFields = fields.filter((field) => field.page === page);
  const overlay = (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      onClick={() => editable && onSelectField?.("")}
    >
      {pageFields.map((field) => (
        <FieldOverlay
          key={field.id}
          field={field}
          selected={selectedFieldId === field.id}
          editable={editable}
          bounds={bounds}
          participantLabel={participantLabel}
          onSelect={() => onSelectField?.(field.id)}
          onGeometryChange={(geometry) => onFieldGeometryChange?.(field.id, geometry)}
        />
      ))}
    </div>
  );

  return (
    <PdfViewer url={url} zoom={zoom} page={page} overlay={overlay} onLoadPages={onLoadPages} />
  );
}

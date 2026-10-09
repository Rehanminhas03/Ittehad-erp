import { useRef } from 'react';
import { Button } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';

/** Reads an image file and scales it down (longest side `max` px) to a PNG data URL, keeping transparency. */
async function shrink(file: File, max: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Not an image'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * An image of the format (the stamp, the Manager's signature): pick a photo or scan, see it, remove it.
 * Scaled down before it is saved; a PNG with a transparent background prints best.
 */
export function ImagePicker({ label, hint, value, onChange }: { label: string; hint?: string; value: string | null; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-24 w-44 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          {value ? <img src={value} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">No image</span>}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
            {value ? 'Change image' : 'Upload image'}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              onChange(await shrink(file, 700));
            } catch {
              toast.error('Choose a PNG or JPEG image');
            }
          }}
        />
      </div>
    </div>
  );
}

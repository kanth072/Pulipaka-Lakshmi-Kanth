import React, { useCallback } from 'react';

interface ImageUploaderProps {
  images: string[];
  isDark: boolean;
  onImagesChange: (images: string[]) => void;
}

export const ImageUploader = React.memo(({ images, isDark, onImagesChange }: ImageUploaderProps) => {
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const readPromises = fileList.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file as Blob);
        })
    );

    Promise.all(readPromises).then((base64Images) => {
      onImagesChange([...images, ...base64Images]);
    });
  }, [images, onImagesChange]);

  const removeImage = useCallback((idx: number) => {
    onImagesChange(images.filter((_, i) => i !== idx));
  }, [images, onImagesChange]);

  return (
    <div className="space-y-4">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Input Gallery</label>
      <div
        className={`p-8 border-2 border-dashed rounded-[2.5rem] transition-colors group flex flex-col items-center justify-center gap-4 cursor-pointer min-h-[160px] ${
          isDark ? 'bg-slate-800/50 border-slate-700 hover:border-red-500' : 'bg-slate-50 border-slate-200 hover:border-red-500'
        }`}
      >
        <div className="relative w-full text-center">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <i className="fas fa-images text-4xl text-slate-300 group-hover:text-red-500 transition-colors"></i>
          <p className="text-[11px] font-black uppercase mt-3 tracking-widest text-slate-500">Upload Product Photos</p>
        </div>
        {images.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3 w-full">
            {images.map((img, idx) => (
              <div key={idx} className="relative aspect-square">
                <img src={img} className="w-full h-full object-cover rounded-xl shadow-md border dark:border-slate-700" alt={`Product preview ${idx + 1}`} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(idx);
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-[10px] flex items-center justify-center shadow-xl hover:scale-110 transition-transform"
                  aria-label={`Remove image ${idx + 1}`}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
ImageUploader.displayName = 'ImageUploader';

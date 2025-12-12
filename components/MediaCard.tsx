import React, { useState, useMemo } from 'react';
import { Item, Category } from '../types';
import { formatFileSize } from '../utils/storage';
import { FileText, Link2, Video, Music, Check, Trash2, ExternalLink, Edit3, HardDrive, UploadCloud, Tag } from 'lucide-react';

interface MediaCardProps {
  item: Item;
  categories?: Category[]; // 允许可选，并设默认值
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
  onRemoveCategory?: (itemId: string, categoryId: string) => void; // 新增：删除分类回调
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  highlightQuery?: string;
  onQuickUpload?: (file: File, targetCategoryIds: string[]) => void;
  batchSelectedIds?: Set<string>;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  categories = [], // 默认空数组，防止 undefined
  onDelete,
  onEdit,
  onRemoveCategory, // 接收删除分类回调
  selectable = false,
  isSelected = false,
  onToggleSelect,
  highlightQuery = '',
  onQuickUpload,
  batchSelectedIds
}) => {
  const [isDragOverFile, setIsDragOverFile] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(item.id);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();

    if (selectable) {
      if (isSelected && batchSelectedIds && batchSelectedIds.size > 0) {
        const idsToDrag = Array.from(batchSelectedIds);
        const jsonStr = JSON.stringify(idsToDrag);
        e.dataTransfer.setData('application/json', jsonStr);
        e.dataTransfer.setData('text/plain', jsonStr);
        e.dataTransfer.effectAllowed = 'copy';

        const el = e.currentTarget as HTMLElement;
        el.style.opacity = '0.5';
      } else {
        e.preventDefault();
      }
      return;
    }

    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'copy';
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
    setIsDragOverFile(false);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOverFile(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOverFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverFile(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onQuickUpload) {
      const file = e.dataTransfer.files[0];
      onQuickUpload(file, item.categoryIds || []);
    }
  };

  const renderHighlightedText = (text: string | undefined) => {
    if (!text) return null;
    if (!highlightQuery.trim()) return text;

    try {
      const parts = text.split(new RegExp(`(${highlightQuery})`, 'gi'));
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === highlightQuery.toLowerCase()
              ? <span key={i} className="bg-nexus-accent text-black font-bold px-0.5 rounded-sm">{part}</span>
              : part
          )}
        </>
      );
    } catch (e) {
      return text; // 正则错误回退
    }
  };

  // 显示所有分类（包括自动添加的父类别）
  const displayCategories = useMemo(() => {
    try {
      // 基础非空检查
      if (!categories || !Array.isArray(categories) || categories.length === 0) return [];
      if (!item.categoryIds || !Array.isArray(item.categoryIds) || item.categoryIds.length === 0) return [];

      // 返回所有在item.categoryIds中的分类
      return categories.filter(c => item.categoryIds.includes(c.id));
    } catch (e) {
      console.warn("Category calc error", e);
      return [];
    }
  }, [item.categoryIds, categories]);

  const renderContent = () => {
    try {
      switch (item.type) {
        case 'image':
          return (
            <div className="w-full h-32 sm:h-48 overflow-hidden rounded-t-sm bg-nexus-850 relative group">
              <img src={item.content} alt="stored" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          );
        case 'video':
          return (
            <div className="w-full h-32 sm:h-48 bg-nexus-850 rounded-t-sm flex items-center justify-center relative group overflow-hidden">
              <video src={item.content} className="w-full h-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Video size={32} className="text-white/70 drop-shadow-lg group-hover:text-nexus-accent transition-colors duration-300" />
              </div>
              <div className="absolute top-2 right-2 text-[10px] bg-black/80 px-2 py-1 rounded text-nexus-accent font-bold flex items-center gap-1 border border-nexus-accent/30">
                <Video size={10} /> HD
              </div>
            </div>
          );
        case 'audio':
          return (
            <div className="w-full h-32 sm:h-48 p-4 bg-nexus-850 rounded-t-sm flex flex-col items-center justify-center gap-3 border-b border-white/5 relative overflow-hidden group-hover:bg-nexus-800 transition-colors">
              <div className="w-12 h-12 rounded-full bg-nexus-800 border border-nexus-accent flex items-center justify-center text-nexus-accent shadow-[0_0_15px_rgba(255,153,0,0.2)] group-hover:shadow-[0_0_20px_rgba(255,153,0,0.5)] transition-shadow duration-300">
                <Music size={24} />
              </div>
              <audio src={item.content} controls className="w-full h-6 max-w-[150px] z-10 opacity-90 hover:opacity-100 transition-opacity" />
            </div>
          );
        case 'url':
          return (
            <div className="w-full h-32 sm:h-48 bg-nexus-850 rounded-t-sm flex flex-col items-center justify-center p-4 border-b border-white/5 hover:bg-nexus-800 transition-colors group">
              <div className="p-3 rounded-full bg-nexus-800 mb-2 group-hover:scale-110 transition-transform duration-300 border border-transparent group-hover:border-nexus-accent/30">
                <Link2 size={24} className="text-nexus-accent" />
              </div>
              <a
                href={item.content}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-nexus-dim hover:text-nexus-accent break-all text-center line-clamp-3 flex items-center gap-1 z-20 font-medium"
              >
                {renderHighlightedText(item.content)} <ExternalLink size={10} />
              </a>
            </div>
          );
        case 'text':
          return (
            <div className="w-full h-32 sm:h-48 overflow-hidden p-4 bg-nexus-850 rounded-t-sm text-xs sm:text-sm text-gray-300 border-b border-white/5 font-mono leading-relaxed hover:bg-nexus-800 transition-colors">
              <div className="line-clamp-6 opacity-90 group-hover:text-white transition-colors">
                {renderHighlightedText(item.content)}
              </div>
            </div>
          );
        default: // Document
          return (
            <div className="w-full h-32 sm:h-48 bg-nexus-850 rounded-t-sm flex flex-col items-center justify-center p-4 border-b border-white/5 hover:bg-nexus-800 transition-colors group">
              <FileText size={32} className="text-nexus-dim mb-2 group-hover:text-nexus-accent transition-colors duration-300" />
              <span className="text-xs text-gray-400 truncate w-full text-center px-2 font-bold group-hover:text-white transition-colors">{renderHighlightedText(item.fileName || 'Unknown File')}</span>
              <a
                href={item.content}
                download={item.fileName || "download"}
                onClick={(e) => e.stopPropagation()}
                className="mt-2 text-[10px] px-3 py-1 bg-nexus-accent text-black font-bold rounded-sm hover:bg-white transition-colors z-20 uppercase tracking-wide transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 duration-300"
              >
                Download
              </a>
            </div>
          );
      }
    } catch (e) {
      return <div className="w-full h-32 flex items-center justify-center text-red-500 text-xs">Content Error</div>;
    }
  };

  return (
    <div
      draggable={selectable ? isSelected : true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleCardClick}
      className={`
        glass-panel rounded-sm flex flex-col transition-all duration-300 group relative bg-nexus-800 border border-nexus-700
        ${selectable ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
        ${isSelected
          ? 'ring-2 ring-nexus-accent shadow-[0_0_20px_rgba(255,153,0,0.4)] transform scale-[1.02] z-10'
          : 'hover:border-nexus-accent hover:shadow-[0_0_15px_rgba(255,153,0,0.15)] hover:scale-[1.02] hover:z-10'}
      `}
    >
      {isDragOverFile && (
        <div className="absolute inset-0 z-50 bg-nexus-accent/90 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 border-2 border-white border-dashed m-1 rounded-sm">
          <UploadCloud size={48} className="text-black mb-2 animate-bounce" />
          <span className="text-black font-black text-lg tracking-widest uppercase">Drop to Upload</span>
          <span className="text-black/70 text-xs font-bold mt-1">+ New Item</span>
        </div>
      )}

      {renderContent()}

      <div className="p-3 flex flex-col flex-grow relative">
        {item.description && (
          <p className="text-xs sm:text-sm text-nexus-dim line-clamp-2 mb-2 group-hover:text-white transition-colors">
            {renderHighlightedText(item.description)}
          </p>
        )}

        <div className="mt-auto">
          {/* Categories with hover delete button */}
          {displayCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {displayCategories.map(cat => (
                <span
                  key={cat.id}
                  className="group/tag flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-nexus-accent/10 text-nexus-glow border border-nexus-accent/20 tracking-wide relative"
                >
                  <Tag size={8} className="mr-1" />
                  {cat.name}
                  {onRemoveCategory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.categoryIds.length <= 1) {
                          alert('条目至少需要一个分类，无法删除最后一个');
                          return;
                        }
                        if (window.confirm(`确定要将此条目从 "${cat.name}" 分类中移除吗？`)) {
                          onRemoveCategory(item.id, cat.id);
                        }
                      }}
                      className="ml-1 opacity-0 group-hover/tag:opacity-100 transition-opacity hover:text-red-500 hover:scale-125 transform duration-200"
                      title={`从 "${cat.name}" 中移除`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-nexus-dim uppercase tracking-wider pt-2 border-t border-white/5">
            <span className="flex items-center gap-2">
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Unknown'}
            </span>
            <div className="flex items-center gap-1">
              {typeof item.size === 'number' && item.size > 0 && (
                <span className="flex items-center gap-1 text-gray-500 mr-2" title="File Size">
                  <HardDrive size={10} /> {formatFileSize(item.size)}
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded bg-black text-nexus-dim font-bold border border-white/10 group-hover:border-nexus-accent/50 group-hover:text-nexus-accent transition-colors">
                {item.type}
              </span>
            </div>
          </div>
        </div>
      </div>

      {selectable && (
        <div className={`absolute top-2 left-2 z-30 w-6 h-6 rounded-sm border flex items-center justify-center transition-all ${isSelected ? 'bg-nexus-accent border-nexus-accent text-black' : 'bg-black/60 border-white/30 text-transparent'}`}>
          <Check size={16} strokeWidth={3} />
        </div>
      )}

      {!selectable && !isDragOverFile && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-10px] group-hover:translate-y-0 z-30">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            className="bg-black/80 hover:bg-nexus-accent hover:text-black text-white w-7 h-7 flex items-center justify-center rounded-sm backdrop-blur-sm transition-colors border border-white/20 shadow-lg"
            title="编辑"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="bg-black/80 hover:bg-red-600 hover:text-white text-white w-7 h-7 flex items-center justify-center rounded-sm backdrop-blur-sm transition-colors border border-white/20 shadow-lg"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
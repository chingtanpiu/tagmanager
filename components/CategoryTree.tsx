import React, { useState, useEffect } from 'react';
import { Category } from '../types';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Trash2, Edit2, ArrowDownToLine, CheckCircle2 } from 'lucide-react';

interface CategoryTreeProps {
  categories: Category[];
  parentId: string | null;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onAdd: (parentId: string | null) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onDropItem: (itemIds: string | string[], categoryId: string) => void;
  level?: number;
}

export const CategoryTree: React.FC<CategoryTreeProps> = ({
  categories,
  parentId,
  selectedIds,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onDropItem,
  level = 0
}) => {
  // Filter categories for this level
  const currentLevelCategories = categories.filter(c => c.parentId === parentId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  
  // Visual feedback states
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropSuccessId, setDropSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (dropSuccessId) {
      const timer = setTimeout(() => setDropSuccessId(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [dropSuccessId]);

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    // Try to get JSON (Batch) first
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
        try {
            const ids = JSON.parse(jsonData);
            if (Array.isArray(ids)) {
                onDropItem(ids, categoryId);
                setDropSuccessId(categoryId);
                return;
            }
        } catch (e) { /* Fallback */ }
    }

    // Fallback to Single Item
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) {
      onDropItem(itemId, categoryId);
      setDropSuccessId(categoryId); 
    }
  };

  if (currentLevelCategories.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {currentLevelCategories.map(category => {
        const isSelected = selectedIds.includes(category.id);
        const hasChildren = categories.some(c => c.parentId === category.id);
        const isExpanded = expanded.has(category.id);
        const isDragOver = dragOverId === category.id;
        const isSuccess = dropSuccessId === category.id;

        return (
          <div key={category.id} className="select-none">
            <div 
              className={`
                group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-all duration-200 border border-transparent
                ${isSelected 
                  ? 'bg-nexus-800 text-nexus-accent border-l-nexus-accent border-l-4' 
                  : 'text-nexus-dim hover:bg-nexus-800 hover:text-white'}
                ${isDragOver ? 'bg-nexus-accent/20 border-nexus-accent shadow-[inset_0_0_10px_rgba(255,153,0,0.2)] scale-[1.02]' : ''}
                ${isSuccess ? 'bg-green-900/30 border-green-500 text-green-400 animate-pulse' : ''}
              `}
              style={{ marginLeft: `${level * 12}px` }}
              onClick={() => onSelect(category.id)}
              onDragOver={(e) => handleDragOver(e, category.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, category.id)}
            >
              <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
                <button 
                  onClick={(e) => { 
                    // Re-enable pointer events for the expand button specifically
                    (e.target as HTMLElement).style.pointerEvents = 'auto'; 
                    toggleExpand(e, category.id);
                  }}
                  className={`pointer-events-auto p-0.5 rounded hover:text-white transition-transform ${!hasChildren && 'opacity-0 cursor-default'}`}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {isSuccess ? (
                   <CheckCircle2 size={16} className="text-green-500 animate-bounce" />
                ) : isDragOver ? (
                   <ArrowDownToLine size={16} className="text-nexus-accent animate-bounce" />
                ) : (
                   isExpanded ? 
                   <FolderOpen size={16} className={isSelected ? "text-nexus-accent" : "text-gray-500 group-hover:text-nexus-accent"} /> : 
                   <Folder size={16} className={isSelected ? "text-nexus-accent" : "text-gray-500 group-hover:text-nexus-accent"} />
                )}
                
                <span className={`truncate text-sm font-bold tracking-wide ${isDragOver ? 'text-nexus-accent' : ''} ${isSuccess ? 'text-green-400' : ''}`}>
                  {category.name}
                  {isDragOver && <span className="ml-2 text-xs opacity-70 text-white bg-nexus-accent/50 px-1 rounded">+ Drop</span>}
                  {isSuccess && <span className="ml-2 text-xs text-green-400">Added!</span>}
                </span>
              </div>

              {/* Action Buttons - Visible on Group Hover */}
              {!isDragOver && !isSuccess && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onAdd(category.id); }}
                    className="p-1 text-gray-500 hover:text-nexus-accent rounded"
                    title="添加子类别"
                  >
                    <Plus size={12} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(category); }}
                    className="p-1 text-gray-500 hover:text-white rounded"
                    title="重命名"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(category); }}
                    className="p-1 text-gray-500 hover:text-red-500 rounded"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Recursion for children */}
            {isExpanded && (
              <CategoryTree 
                categories={categories}
                parentId={category.id}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                onDropItem={onDropItem}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
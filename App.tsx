import React, { useEffect, useState, useMemo, useRef } from 'react';
import { generateId, fileToBase64, formatFileSize } from './utils/storage';
import * as api from './utils/api';
import { Category, Item, AppState, MediaType, AppSettings, Version } from './types';
import { CategoryTree } from './components/CategoryTree';
import { MediaCard } from './components/MediaCard';
import { Button } from './components/Button';
import {
  Plus, Filter, Grid, Layers, Search, X, Tag, Upload, Menu, Settings,
  Download, Upload as UploadIcon, Trash2, CheckSquare, Save, FolderPlus,
  Edit3, FileText, Clock, RotateCcw, History, Eye, AlertTriangle, ArrowLeft
} from 'lucide-react';

function App() {
  // Data State
  const [state, setState] = useState<AppState>({ categories: [], items: [], selectedCategoryIds: [] });
  const [displayItems, setDisplayItems] = useState<Item[]>([]); // 用于显示的条目（从API获取）
  const [settings, setSettings] = useState<AppSettings>({ autoSaveInterval: 5, maxVersions: 20 });
  const [isInit, setIsInit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto Save & Versioning Logic
  const isDirtyRef = useRef(false);
  const [versions, setVersions] = useState<Version[]>([]);

  // Preview Mode State
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);

  // Layout State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false); // Toggle inside Settings

  // Form States
  const [newCategoryName, setNewCategoryName] = useState('');
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Batch Tag States
  const [batchTargetCategoryId, setBatchTargetCategoryId] = useState<string>('');
  const [batchNewCategoryName, setBatchNewCategoryName] = useState('');

  // Batch Edit States
  const [batchEditDesc, setBatchEditDesc] = useState('');
  const [batchEditTargetCategory, setBatchEditTargetCategory] = useState<string>('');

  // Batch Remove Categories States (新增)
  const [showBatchRemoveCategoryModal, setShowBatchRemoveCategoryModal] = useState(false);
  const [batchRemoveCategoryIds, setBatchRemoveCategoryIds] = useState<string[]>([]);

  // 计算选中条目的共同类别
  const commonCategories = useMemo(() => {
    if (!showBatchRemoveCategoryModal || selectedItemIds.size === 0) return [];

    const selectedItems = state.items.filter(item => selectedItemIds.has(item.id));
    if (selectedItems.length === 0) return [];

    let commonIds = new Set(selectedItems[0].categoryIds);
    for (let i = 1; i < selectedItems.length; i++) {
      const itemCategoryIds = new Set(selectedItems[i].categoryIds);
      commonIds = new Set([...commonIds].filter(id => itemCategoryIds.has(id)));
    }

    return state.categories.filter(c => commonIds.has(c.id));
  }, [showBatchRemoveCategoryModal, selectedItemIds, state.items, state.categories]);

  // Undo History (撤销历史栈，最多10步)
  const [history, setHistory] = useState<AppState[]>([]);
  const MAX_HISTORY = 10;

  // Item Form States
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [newItemType, setNewItemType] = useState<MediaType>('text');
  const [newItemContent, setNewItemContent] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemFile, setNewItemFile] = useState<File | null>(null);
  const [tempCategoryIds, setTempCategoryIds] = useState<string[]>([]);

  // --- Initialization & Persistence ---

  // Load data and settings on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [stateData, settingsData] = await Promise.all([
          api.fetchState(),
          api.fetchSettings()
        ]);
        setState(stateData);
        setSettings(settingsData);
        setIsInit(true);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('无法连接到后端服务器。请确保后端服务器已启动。');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Persist main state on change (Immediate Save for current session) - SKIP if in Preview Mode
  useEffect(() => {
    if (isInit && !previewVersion) {
      api.saveState(state).catch(err => console.error('Failed to save state:', err));
    }
  }, [state, isInit, previewVersion]);

  // Auto-Save Backup Timer
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!isInit || settings.autoSaveInterval === 0 || previewVersion) return;

    const timer = setInterval(async () => {
      if (isDirtyRef.current) {
        console.log("Executing auto-save version...");
        try {
          await api.createVersion(stateRef.current, 'Auto-save');
          isDirtyRef.current = false;
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }
    }, settings.autoSaveInterval * 60 * 1000);

    return () => clearInterval(timer);
  }, [isInit, settings.autoSaveInterval, previewVersion]);

  const markDirty = () => {
    if (!previewVersion) {
      isDirtyRef.current = true;
    }
  };

  // --- 从后端获取过滤后的条目 ---
  // 业务逻辑已移到后端，前端只需调用API
  useEffect(() => {
    if (!isInit || previewVersion) return;

    const fetchFilteredItems = async () => {
      try {
        const items = await api.fetchItems(
          state.selectedCategoryIds.length > 0 ? state.selectedCategoryIds : undefined,
          searchQuery || undefined
        );
        setDisplayItems(items);
      } catch (err) {
        console.error('Failed to fetch items:', err);
      }
    };

    fetchFilteredItems();
  }, [state.selectedCategoryIds, searchQuery, state.items, isInit, previewVersion]);

  // Ctrl+Z快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z: 撤销操作
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !previewVersion) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+S: 手动保存版本
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !previewVersion) {
        e.preventDefault();
        handleManualSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, previewVersion]); // 依赖history以获取最新状态


  // --- Version Control Handlers ---

  const handleOpenVersions = async () => {
    try {
      const versionList = await api.fetchVersions();
      setVersions(versionList);
      setShowVersionHistory(true);
    } catch (err) {
      console.error('Failed to load versions:', err);
      alert('加载版本历史失败');
    }
  };

  const handlePreviewVersion = (version: Version) => {
    if (window.confirm("即将进入预览模式。在预览模式下，所有的修改都不会被保存。确定吗？")) {
      setPreviewVersion(version);
      setState(version.data); // Load historical data into state
      setDisplayItems(version.data.items); // 直接设置显示的items
      closeModals();
    }
  };

  const handleRestoreVersion = async (version: Version) => {
    if (window.confirm(`危险操作：确定要将当前应用状态回滚到 "${version.label}" (${new Date(version.timestamp).toLocaleString()}) 吗？\n\n当前未保存的更改将会永久丢失！`)) {
      try {
        setState(version.data); // Set state
        setDisplayItems(version.data.items); // 立即更新显示items
        await api.saveState(version.data); // Persist immediately
        // 不再创建新的版本记录

        setPreviewVersion(null); // Exit preview if active
        closeModals();
        isDirtyRef.current = false;
        alert("版本恢复成功");
      } catch (err) {
        console.error('Failed to restore version:', err);
        alert('版本恢复失败');
      }
    }
  };

  const handleExitPreview = async () => {
    // Reload current active state from API
    try {
      const currentData = await api.fetchState();
      setState(currentData);
      setPreviewVersion(null);
      // 重新获取当前过滤条件的items
      const items = await api.fetchItems(
        currentData.selectedCategoryIds.length > 0 ? currentData.selectedCategoryIds : undefined,
        searchQuery || undefined
      );
      setDisplayItems(items);
    } catch (err) {
      console.error('Failed to reload state:', err);
      alert('重新加载数据失败');
    }
  };

  const handleDeleteVersion = async (id: string) => {
    if (window.confirm("删除此版本记录？")) {
      try {
        await api.deleteVersion(id);
        const updated = await api.fetchVersions();
        setVersions(updated);
      } catch (err) {
        console.error('Failed to delete version:', err);
        alert('删除版本失败');
      }
    }
  };

  const handleManualSave = async () => {
    try {
      // 先从API获取最新的完整state
      const latestState = await api.fetchState();

      // 保存最新state到版本历史
      await api.createVersion(latestState, 'Manual Save');
      alert("当前状态已保存到版本历史。");
      isDirtyRef.current = false;
    } catch (err) {
      console.error('Failed to save version:', err);
      alert('保存版本失败');
    }
  };

  // --- Handlers (Disabled in Preview Mode) ---

  const checkReadOnly = () => {
    if (previewVersion) {
      alert("预览模式下无法修改数据。请退出预览或恢复此版本。");
      return true;
    }
    return false;
  };

  const handleCategorySelect = (id: string) => {
    setState(prev => {
      const newSelected = prev.selectedCategoryIds.includes(id)
        ? prev.selectedCategoryIds.filter(cid => cid !== id)
        : [...prev.selectedCategoryIds, id];
      return { ...prev, selectedCategoryIds: newSelected };
    });
  };

  const handleItemDrop = async (itemIds: string | string[], categoryId: string) => {
    if (checkReadOnly()) return;
    const idList = Array.isArray(itemIds) ? itemIds : [itemIds];

    // 保存当前状态用于回滚
    const previousState = { ...state };
    const previousSelection = new Set(selectedItemIds);

    try {
      // 乐观更新UI
      saveToHistory();

      // 使用toggle API（自动检测添加或移除）
      await api.toggleCategory(idList, categoryId);

      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      markDirty();

      if (selectionMode) {
        setSelectedItemIds(new Set());
        setSelectionMode(false);
      }
    } catch (err) {
      // 失败则回滚
      console.error('Drop failed:', err);
      setState(previousState);
      setSelectedItemIds(previousSelection);
      alert('操作失败');
    }
  };

  const handleQuickUpload = async (file: File, targetCategoryIds: string[]) => {
    if (checkReadOnly()) return;
    try {
      let type: MediaType = 'document';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';
      else if (file.type === 'text/plain') type = 'text';

      const content = await fileToBase64(file);
      const newItem: Item = {
        id: generateId(),
        content,
        description: `Uploaded via drag & drop`,
        type,
        categoryIds: Array.isArray(targetCategoryIds) ? targetCategoryIds : [],
        createdAt: Date.now(),
        fileName: file.name,
        size: file.size
      };

      // 调用上传API
      await api.uploadFile(newItem);
      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      markDirty();
    } catch (e) {
      console.error(e);
      alert("文件上传失败");
    }
  };

  const handleAddCategory = async () => {
    if (checkReadOnly()) return;
    if (!newCategoryName.trim()) return;

    try {
      if (editingCategory) {
        // 编辑分类
        await api.updateCategory(editingCategory.id, { name: newCategoryName });
      } else {
        // 创建新分类
        const newCat: Category = {
          id: generateId(),
          parentId: activeParentId,
          name: newCategoryName,
          createdAt: Date.now()
        };
        await api.createCategory(newCat);
      }

      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      markDirty();
      closeModals();
    } catch (err) {
      console.error('Failed to save category:', err);
      alert('保存分类失败');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (checkReadOnly()) return;
    if (!window.confirm(`确定要删除 "${category.name}" 及其所有子类别?\n\n注意: 属于这些类别的条目也会被删除!`)) return;

    try {
      // 直接删除分类，后端会处理子分类
      await api.deleteCategory(category.id);
      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      markDirty();
    } catch (err) {
      console.error('Failed to delete category:', err);
      alert('删除分类失败');
    }
  };

  const handleSaveItem = async () => {
    if (checkReadOnly()) return;
    if (tempCategoryIds.length === 0) {
      alert("请至少指定一个分类。");
      return;
    }

    let finalContent = newItemContent;
    let finalFileName = editingItem?.fileName;
    let finalSize = editingItem?.size;

    // 处理文件上传
    if (newItemType !== 'text' && newItemType !== 'url') {
      if (newItemFile) {
        try {
          finalContent = await fileToBase64(newItemFile);
          finalFileName = newItemFile.name;
          finalSize = newItemFile.size;
        } catch (e) {
          alert("文件处理失败");
          return;
        }
      } else if (editingItem && editingItem.type === newItemType) {
        finalContent = editingItem.content;
      } else {
        alert("请上传文件");
        return;
      }
    } else {
      if (!newItemContent && !editingItem) {
        alert("请输入内容");
        return;
      }
      finalFileName = undefined;
      finalSize = undefined;
    }

    // 准备条目数据
    const itemData: Item = {
      id: editingItem?.id || generateId(),
      content: finalContent,
      description: newItemDesc,
      type: newItemType,
      categoryIds: Array.isArray(tempCategoryIds) ? tempCategoryIds : [],
      createdAt: editingItem?.createdAt || Date.now(),
      fileName: finalFileName,
      size: finalSize
    };

    try {
      // 调用API，后端会自动验证重名
      if (editingItem) {
        await api.updateItem(editingItem.id, itemData);
      } else {
        await api.createItem(itemData);
      }

      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      markDirty();
      closeModals();
    } catch (err: any) {
      // 后端返回的验证错误
      alert(err.message || '保存失败');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (checkReadOnly()) return;

    // 保存到历史栈以支持Ctrl+Z撤销
    saveToHistory();

    // 乐观更新：立即更新UI
    const previousState = { ...state };
    setState(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id)
    }));

    // 后台调用API
    try {
      await api.deleteItem(id);
      markDirty();
    } catch (err) {
      // 失败则回滚
      console.error('Delete failed:', err);
      setState(previousState);
      alert('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (checkReadOnly()) return;
    if (selectedItemIds.size === 0) return;

    // 保存到历史栈以支持Ctrl+Z撤销
    saveToHistory();

    // 乐观更新：立即更新UI
    const previousState = { ...state };
    const previousSelection = new Set(selectedItemIds);

    setState(prev => ({
      ...prev,
      items: prev.items.filter(i => !selectedItemIds.has(i.id))
    }));
    setSelectedItemIds(new Set());
    setSelectionMode(false);

    // 后台调用API
    try {
      await api.batchDelete(Array.from(previousSelection) as string[]);
      markDirty();
    } catch (err) {
      // 失败则回滚
      console.error('Batch delete failed:', err);
      setState(previousState);
      setSelectedItemIds(previousSelection);
      setSelectionMode(true);
      alert('批量删除失败');
    }
  };

  const handleRemoveCategory = async (itemId: string, categoryId: string) => {
    if (checkReadOnly()) return;

    // 检查条目是否至少有一个其他分类
    const item = state.items.find(i => i.id === itemId);
    if (!item || item.categoryIds.length <= 1) {
      alert('条目至少需要保留一个分类');
      return;
    }

    // 乐观更新：立即更新UI
    const previousState = { ...state };
    setState(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === itemId
          ? { ...i, categoryIds: i.categoryIds.filter(id => id !== categoryId) }
          : i
      )
    }));

    // 后台调用API
    try {
      await api.removeCategoryFromItem(itemId, categoryId);
      markDirty();
    } catch (err: any) {
      // 失败则回滚
      console.error('Remove category failed:', err);
      setState(previousState);
      alert(err.message || '移除分类失败');
    }
  };


  const handleBatchAddTags = async () => {
    if (checkReadOnly()) return;
    let targetId = batchTargetCategoryId;

    // 如果要创建新分类
    if (batchNewCategoryName.trim()) {
      const newCat: Category = {
        id: generateId(),
        parentId: null,
        name: batchNewCategoryName,
        createdAt: Date.now()
      };
      try {
        await api.createCategory(newCat);
        targetId = newCat.id;
      } catch (err) {
        console.error('Failed to create category:', err);
        alert('创建分类失败');
        return;
      }
    } else if (!targetId) {
      alert("请选择现有标签或输入新标签名称");
      return;
    }

    try {
      await api.batchAddTags(Array.from(selectedItemIds), targetId);
      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      closeModals();
      setSelectionMode(false);
      setSelectedItemIds(new Set());
      markDirty();
    } catch (err) {
      console.error('Batch add tags failed:', err);
      alert('批量添加标签失败');
    }
  };

  const handleBatchEdit = async () => {
    if (checkReadOnly()) return;

    try {
      await api.batchEdit(
        Array.from(selectedItemIds),
        batchEditDesc || undefined,
        batchEditTargetCategory || undefined
      );
      // 重新加载状态
      const newState = await api.fetchState();
      setState(newState);
      closeModals();
      setSelectionMode(false);
      setSelectedItemIds(new Set());
      markDirty();
    } catch (err) {
      console.error('Batch edit failed:', err);
      alert('批量编辑失败');
    }
  };

  // 保存当前状态到历史栈
  const saveToHistory = () => {
    setHistory(prev => {
      const newHistory = [{ ...state }, ...prev].slice(0, MAX_HISTORY);
      return newHistory;
    });
  };

  // 撤销操作（Ctrl+Z）
  const handleUndo = async () => {
    if (history.length === 0) {
      alert('没有可撤销的操作');
      return;
    }

    const previousState = history[0];
    try {
      await api.saveState(previousState);
      setState(previousState);
      setHistory(prev => prev.slice(1)); // 移除已恢复的状态
      markDirty();
    } catch (err) {
      console.error('Undo failed:', err);
      alert('撤销失败');
    }
  };


  // 批量删除共同分类
  const handleBatchRemoveCategories = async () => {
    if (checkReadOnly()) return;
    if (batchRemoveCategoryIds.length === 0) {
      alert('请选择要删除的分类');
      return;
    }

    saveToHistory(); // 保存到历史栈

    try {
      await api.batchRemoveCategories(
        Array.from(selectedItemIds),
        batchRemoveCategoryIds
      );
      const newState = await api.fetchState();
      setState(newState);
      closeModals();
      setSelectionMode(false);
      setSelectedItemIds(new Set());
      setBatchRemoveCategoryIds([]);
      markDirty();
    } catch (err: any) {
      console.error('Batch remove categories failed:', err);
      alert(err.message || '批量删除分类失败');
    }
  };


  const toggleItemSelection = (id: string) => {
    const newSet = new Set(selectedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItemIds(newSet);
  };

  const selectAllFiltered = () => {
    const ids = displayItems.map(i => i.id);
    setSelectedItemIds(new Set(ids));
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `nexus_vault_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportMarkdown = () => {
    let mdContent = "# Nexus Vault Export\n\n";
    const getCategoryName = (id: string) => {
      const cat = state.categories.find(c => c.id === id);
      return cat ? cat.name : 'Unknown';
    };
    state.items.forEach((item, index) => {
      // 标题：对于text/url用content的前几个字，对于文件用fileName
      let title = 'Untitled Item';
      if (item.type === 'text' && item.content) {
        title = item.content.substring(0, 50) + (item.content.length > 50 ? '...' : '');
      } else if (item.type === 'url' && item.content) {
        title = item.content;
      } else if (item.fileName) {
        title = item.fileName;
      }

      mdContent += `## ${index + 1}. ${title}\n`;

      // 对于文件类型，显示文件路径而不是type
      if (item.fileName) {
        mdContent += `- **File**: ${item.fileName}\n`;
        if (item.size) {
          mdContent += `- **Size**: ${formatFileSize(item.size)}\n`;
        }
      } else {
        mdContent += `- **Type**: ${item.type}\n`;
      }

      mdContent += `- **Categories**: ${item.categoryIds.map(getCategoryName).join(', ')}\n`;
      mdContent += `- **Created**: ${new Date(item.createdAt).toLocaleString()}\n`;

      // 描述（如果有）
      if (item.description) {
        mdContent += `- **Description**: ${item.description}\n`;
      }

      mdContent += '\n';

      // 内容
      if (item.type === 'text') {
        // 只在文本被截断或有多行时显示引用块
        if (item.content.length > 50 || item.content.includes('\n')) {
          mdContent += `> ${item.content.replace(/\n/g, '\n> ')}\n\n`;
        }
        // 短文本不显示引用块，因为标题已经完整显示了
      } else if (item.type === 'url') {
        mdContent += `[Open Link](${item.content})\n\n`;
      } else {
        mdContent += `*[Binary Content: ${item.fileName || 'File'}]*\n\n`;
      }
      mdContent += "---\n\n";
    });
    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(mdContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `nexus_vault_export_${new Date().toISOString().split('T')[0]}.md`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (checkReadOnly()) return;
    const fileReader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      fileReader.readAsText(event.target.files[0], "UTF-8");
      fileReader.onload = e => {
        try {
          if (e.target?.result) {
            const parsed = JSON.parse(e.target.result as string);
            if (Array.isArray(parsed.categories) && Array.isArray(parsed.items)) {
              if (window.confirm("导入将覆盖当前所有数据，确定继续吗？")) {
                setState(parsed);
                markDirty();
                closeModals();
                alert("数据恢复成功");
              }
            } else {
              alert("文件格式不正确");
            }
          }
        } catch (error) {
          alert("无法解析文件: " + error);
        }
      };
    }
  };

  // UI Controls
  const openAddCategoryModal = (parentId: string | null) => {
    setActiveParentId(parentId);
    setEditingCategory(null);
    setNewCategoryName('');
    setShowCategoryModal(true);
  };
  const openEditCategoryModal = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setShowCategoryModal(true);
  };
  const openAddItemModal = () => {
    setEditingItem(null);
    setNewItemType('text');
    setNewItemContent('');
    setNewItemDesc('');
    setNewItemFile(null);
    setTempCategoryIds([...state.selectedCategoryIds]);
    setShowItemModal(true);
  };
  const openEditItemModal = (item: Item) => {
    setEditingItem(item);
    setNewItemType(item.type);
    setNewItemDesc(item.description || '');
    setNewItemFile(null);
    setTempCategoryIds([...item.categoryIds]);
    if (item.type === 'text' || item.type === 'url') setNewItemContent(item.content);
    else setNewItemContent('');
    setShowItemModal(true);
  };
  const openBatchTagModal = () => {
    setBatchTargetCategoryId('');
    setBatchNewCategoryName('');
    setShowBatchTagModal(true);
  };
  const openBatchEditModal = () => {
    setBatchEditDesc('');
    setBatchEditTargetCategory('');
    setShowBatchEditModal(true);
  };
  const openBatchRemoveCategoryModal = () => {
    // 计算共同类别
    const selectedItems = state.items.filter(item => selectedItemIds.has(item.id));
    if (selectedItems.length === 0) return;

    // 获取第一个item的categories作为初始集合
    let commonCategoryIds = new Set(selectedItems[0].categoryIds);

    // 与后续item的categories取交集
    for (let i = 1; i < selectedItems.length; i++) {
      const itemCategoryIds = new Set(selectedItems[i].categoryIds);
      commonCategoryIds = new Set(
        [...commonCategoryIds].filter(id => itemCategoryIds.has(id))
      );
    }

    if (commonCategoryIds.size === 0) {
      alert("选中的条目没有共同的分类");
      return;
    }

    setBatchRemoveCategoryIds([]); // 重置选择
    setShowBatchRemoveCategoryModal(true);
  };

  const handleBatchRemoveCategoriesConfirm = async () => {
    if (batchRemoveCategoryIds.length === 0) return;

    // 保存当前状态用于撤销和回滚
    const previousState = { ...state };
    const previousSelection = new Set(selectedItemIds);
    saveToHistory();

    // 乐观更新：立即更新UI
    setState(prev => ({
      ...prev,
      items: prev.items.map(item =>
        selectedItemIds.has(item.id)
          ? { ...item, categoryIds: item.categoryIds.filter(id => !batchRemoveCategoryIds.includes(id)) }
          : item
      )
    }));
    setSelectionMode(false);
    setSelectedItemIds(new Set());
    closeModals();

    // 后台调用API
    try {
      await api.batchRemoveCategories(Array.from(previousSelection) as string[], batchRemoveCategoryIds);
      markDirty();
    } catch (err) {
      // 失败则回滚
      console.error('Failed to batch remove categories:', err);
      setState(previousState);
      setSelectedItemIds(previousSelection);
      setSelectionMode(true);
      alert('批量删除分类失败');
    }
  };

  const closeModals = () => {
    setShowCategoryModal(false);
    setShowItemModal(false);
    setShowSettingsModal(false);
    setShowBatchTagModal(false);
    setShowBatchEditModal(false);
    setShowBatchRemoveCategoryModal(false); // 新增
    setShowVersionHistory(false);
    setNewCategoryName('');
    setNewItemContent('');
    setNewItemDesc('');
    setNewItemFile(null);
    setEditingCategory(null);
    setEditingItem(null);
    setBatchTargetCategoryId('');
    setBatchNewCategoryName('');
    setBatchRemoveCategoryIds([]); // 新增
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-nexus-900 text-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-nexus-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-nexus-dim">加载中...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-nexus-900 text-white p-4">
        <div className="glass-panel-trans rounded-sm p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">连接错误</h2>
          <p className="text-nexus-dim mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-nexus-accent text-black font-bold rounded-sm hover:bg-nexus-accent/80 transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen text-white font-sans bg-nexus-900 overflow-hidden selection:bg-nexus-accent selection:text-black">
      {/* Preview Mode Banner */}
      {previewVersion && (
        <div className="fixed top-0 inset-x-0 h-10 bg-nexus-accent text-black font-bold z-50 flex items-center justify-between px-6 shadow-lg animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} />
            <span>预览模式: 正在查看版本 "{previewVersion.label}" ({new Date(previewVersion.timestamp).toLocaleString()})</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleRestoreVersion(previewVersion)} className="px-3 py-0.5 bg-black text-white hover:bg-nexus-800 rounded text-xs uppercase tracking-wider">恢复此版本</button>
            <button onClick={handleExitPreview} className="px-3 py-0.5 bg-transparent border border-black hover:bg-black/10 rounded text-xs uppercase tracking-wider">退出预览</button>
          </div>
        </div>
      )}

      {/* ... (Sidebar and overlay remain same) ... */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/80 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-nexus-850 border-r border-nexus-700 transform transition-transform duration-300 lg:static lg:transform-none flex flex-col shadow-2xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${previewVersion ? 'pt-10' : ''}`}>
        <div className="p-4 h-16 flex items-center justify-between border-b border-nexus-700 shrink-0 bg-black">
          <div className="flex items-center gap-2 text-nexus-accent">
            <div className="bg-nexus-accent text-black font-bold px-1.5 rounded text-lg">NV</div>
            <h1 className="font-bold text-xl tracking-tighter">NEXUS<span className="text-white">VAULT</span></h1>
          </div>
          <div className="flex gap-1">
            <button onClick={() => { setShowSettingsModal(true); setShowVersionHistory(false); }} className="p-1.5 text-nexus-dim hover:text-white rounded-md transition-colors">
              <Settings size={18} />
            </button>
            <button onClick={() => openAddCategoryModal(null)} disabled={!!previewVersion} className="p-1.5 bg-nexus-accent/10 hover:bg-nexus-accent/20 text-nexus-accent rounded-md transition-colors disabled:opacity-50">
              <Plus size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          <CategoryTree categories={state.categories} parentId={null} selectedIds={state.selectedCategoryIds} onSelect={handleCategorySelect} onAdd={openAddCategoryModal} onEdit={openEditCategoryModal} onDelete={handleDeleteCategory} onDropItem={handleItemDrop} />
          {state.categories.length === 0 && <div className="text-center text-nexus-dim mt-10 text-sm px-4">暂无分类结构<br />点击右上角 + 开始构建</div>}
        </div>
        <div className="p-4 border-t border-nexus-700 bg-black shrink-0">
          <div className="text-xs text-nexus-dim flex justify-between items-center">
            <span>筛选器: {state.selectedCategoryIds.length}</span>
            {state.selectedCategoryIds.length > 0 && <button onClick={() => setState(prev => ({ ...prev, selectedCategoryIds: [] }))} className="text-red-500 hover:underline">重置</button>}
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className={`flex-1 flex flex-col w-full relative h-full bg-nexus-900 ${previewVersion ? 'pt-10' : ''}`}>
        {/* Header */}
        <div className="h-16 border-b border-nexus-700 flex items-center justify-between px-4 lg:px-6 bg-nexus-850 z-20 shrink-0 gap-4 shadow-md">
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-nexus-dim hover:text-white"><Menu size={24} /></button>
            <div className="flex items-center gap-2 text-nexus-dim">
              <Grid size={18} className="hidden sm:block" />
              <span className="text-sm font-medium truncate max-w-[80px] sm:max-w-none hidden md:inline text-white">{state.selectedCategoryIds.length > 0 ? '筛选视图' : '资料库'}</span>
              {state.selectedCategoryIds.length > 0 && <span className="hidden sm:flex items-center gap-1 text-xs bg-nexus-accent text-black font-bold px-2 py-1 rounded ml-2 whitespace-nowrap"><Filter size={10} /> {state.selectedCategoryIds.length} ACTIVE</span>}
            </div>
          </div>
          {/* Search Bar */}
          <div className="flex-1 max-w-md relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={14} className="text-gray-500 group-focus-within:text-nexus-accent transition-colors" /></div>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索..." className="w-full bg-black border border-nexus-700 rounded-sm py-2 pl-9 pr-8 text-sm text-white focus:outline-none focus:border-nexus-accent transition-all placeholder-gray-600" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"><X size={14} /></button>}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {selectionMode ? (
              <>
                <span className="text-xs text-gray-400 hidden sm:inline font-bold">已选: <span className="text-nexus-accent">{selectedItemIds.size}</span></span>
                <Button variant="ghost" size="sm" onClick={selectAllFiltered} className="hidden sm:flex">全选</Button>
                <Button variant="primary" size="sm" icon={<Edit3 size={14} />} onClick={openBatchEditModal} disabled={selectedItemIds.size === 0 || !!previewVersion}>编辑</Button>
                <Button variant="secondary" size="sm" icon={<Tag size={14} />} onClick={openBatchTagModal} disabled={selectedItemIds.size === 0 || !!previewVersion}>标签</Button>
                <Button variant="secondary" size="sm" icon={<X size={14} />} onClick={openBatchRemoveCategoryModal} disabled={selectedItemIds.size === 0 || !!previewVersion}>移除标签</Button>
                <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={handleBatchDelete} disabled={selectedItemIds.size === 0 || !!previewVersion}>删除</Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectionMode(false); setSelectedItemIds(new Set()); }}>取消</Button>
              </>
            ) : (
              <>
                <button onClick={() => setSelectionMode(true)} className="p-2 text-nexus-dim hover:text-nexus-accent transition-colors" title="批量操作" disabled={!!previewVersion}><CheckSquare size={20} /></button>
                <Button onClick={openAddItemModal} icon={<Plus size={16} />} className="whitespace-nowrap" disabled={!!previewVersion}><span className="hidden sm:inline">添加条目</span><span className="sm:hidden">添加</span></Button>
              </>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative z-10">
          {displayItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-20">
              {displayItems.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  categories={state.categories}
                  onDelete={handleDeleteItem}
                  onEdit={openEditItemModal}
                  onRemoveCategory={handleRemoveCategory}
                  selectable={selectionMode}
                  isSelected={selectedItemIds.has(item.id)}
                  onToggleSelect={toggleItemSelection}
                  highlightQuery={searchQuery}
                  onQuickUpload={handleQuickUpload}
                  batchSelectedIds={selectedItemIds}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-nexus-dim opacity-50 px-4 text-center">
              <div className="w-20 h-20 bg-nexus-800 rounded-full flex items-center justify-center mb-4"><Search size={40} className="text-nexus-700" /></div>
              <p className="text-lg font-bold text-white">未找到数据</p>
              <p className="text-sm mt-2">{state.selectedCategoryIds.length === 0 ? "请选择左侧分类查看内容" : "当前筛选或搜索条件下无内容"}</p>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal with Version History Support */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="glass-panel-trans w-full max-w-md rounded-sm p-6 shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-2">
                {showVersionHistory && (
                  <button onClick={() => setShowVersionHistory(false)} className="mr-2 text-nexus-dim hover:text-white"><ArrowLeft size={20} /></button>
                )}
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {showVersionHistory ? <History size={20} className="text-nexus-accent" /> : <Settings size={20} className="text-nexus-accent" />}
                  {showVersionHistory ? '版本历史' : '系统设置'}
                </h3>
              </div>
              <button onClick={closeModals}><X size={20} className="text-nexus-dim hover:text-white" /></button>
            </div>

            <div className="overflow-y-auto custom-scrollbar pr-2 flex-1">
              {!showVersionHistory ? (
                /* Main Settings View */
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm text-nexus-accent font-bold mb-2 flex items-center gap-2">
                      <Clock size={16} /> 自动保存配置
                    </label>
                    <p className="text-xs text-nexus-dim mb-3">间隔一定时间检查是否有更改，并创建新的版本记录。</p>
                    <select
                      className="w-full bg-black border border-nexus-700 rounded-sm px-3 py-2 text-white focus:border-nexus-accent focus:outline-none text-sm"
                      value={settings.autoSaveInterval}
                      onChange={async (e) => {
                        const newSettings = { ...settings, autoSaveInterval: Number(e.target.value) };
                        setSettings(newSettings);
                        try {
                          await api.updateSettings(newSettings);
                        } catch (err) {
                          console.error('Failed to save settings:', err);
                        }
                      }}
                    >
                      <option value={0}>关闭自动保存</option>
                      <option value={1}>每 1 分钟</option>
                      <option value={5}>每 5 分钟</option>
                      <option value={15}>每 15 分钟</option>
                      <option value={30}>每 30 分钟</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <h4 className="text-sm font-bold text-white">版本控制</h4>
                    <Button size="sm" variant="secondary" onClick={handleManualSave} className="w-full justify-start" icon={<Save size={14} />}>立即创建版本快照</Button>
                    <Button size="sm" variant="primary" onClick={handleOpenVersions} className="w-full justify-start" icon={<History size={14} />}>查看历史版本</Button>
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <h4 className="text-sm font-bold text-white">数据管理 (本地文件)</h4>
                    <Button size="sm" variant="ghost" onClick={handleExportData} className="w-full justify-start border border-nexus-700" icon={<Download size={14} />}>导出 JSON</Button>
                    <Button size="sm" variant="ghost" onClick={handleExportMarkdown} className="w-full justify-start border border-nexus-700" icon={<FileText size={14} />}>导出 Markdown</Button>
                    <div className="relative">
                      <Button size="sm" variant="ghost" className="w-full justify-start border border-nexus-700" icon={<UploadIcon size={14} />}>导入数据</Button>
                      <input type="file" accept=".json" onChange={handleImportData} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    </div>
                  </div>
                </div>
              ) : (
                /* Version History View */
                <div className="space-y-3">
                  {versions.length === 0 ? (
                    <p className="text-center text-nexus-dim py-8 text-sm">暂无历史版本记录</p>
                  ) : (
                    versions.map((ver, index) => {
                      const isLatestVersion = index === 0; // 第一个版本是最新版本
                      return (
                        <div key={ver.id} className="p-3 bg-black border border-nexus-700 rounded-sm flex flex-col gap-2 hover:border-nexus-accent/50 transition-colors relative">
                          {isLatestVersion && (
                            <div className="absolute -left-2 top-1/2 transform -translate-y-1/2 text-nexus-accent">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </div>
                          )}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                {ver.label}
                                {isLatestVersion && <span className="text-xs bg-nexus-accent/20 text-nexus-accent px-2 py-0.5 rounded border border-nexus-accent/30">当前</span>}
                              </div>
                              <div className="text-xs text-nexus-dim">{new Date(ver.timestamp).toLocaleString()}</div>
                            </div>
                            <div className="text-[10px] bg-nexus-800 px-1.5 py-0.5 rounded text-gray-400">{formatFileSize(ver.size)}</div>
                          </div>
                          <div className="flex gap-2 mt-1">
                            <Button size="sm" variant="secondary" onClick={() => handlePreviewVersion(ver)} className="flex-1 h-7" icon={<Eye size={12} />}>预览</Button>
                            <Button size="sm" variant="danger" onClick={() => handleRestoreVersion(ver)} className="flex-1 h-7" icon={<RotateCcw size={12} />}>恢复</Button>
                            <button onClick={() => handleDeleteVersion(ver.id)} className="p-1 text-nexus-dim hover:text-red-500"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* (Other modals are visually unchanged, just logic updates) */}
      {/* ... (Category Modal, Batch Tag Modal, Batch Edit Modal, Item Modal - same JSX structure as before) ... */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="glass-panel-trans w-full max-w-md rounded-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-4">
              <Layers size={20} className="text-nexus-accent" />
              {editingCategory ? '编辑分类' : '新建分类'}
            </h3>
            <input autoFocus type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="输入分类名称..." className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-nexus-accent transition-colors mb-6" onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={closeModals}>取消</Button>
              <Button onClick={handleAddCategory}>{editingCategory ? '保存修改' : '立即创建'}</Button>
            </div>
          </div>
        </div>
      )}

      {showBatchTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="glass-panel-trans w-full max-w-md rounded-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-4"><Tag size={20} className="text-nexus-accent" /> 批量添加标签</h3>
            <div className="space-y-4 mb-6">
              <div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">选择现有分类</label><select className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-3 text-white focus:border-nexus-accent focus:outline-none appearance-none" value={batchTargetCategoryId} onChange={(e) => { setBatchTargetCategoryId(e.target.value); setBatchNewCategoryName(''); }}><option value="">-- 选择现有分类 --</option>{state.categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
              <div className="flex items-center gap-3"><div className="h-px flex-1 bg-white/10"></div><span className="text-xs text-gray-500">或</span><div className="h-px flex-1 bg-white/10"></div></div>
              <div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">创建新分类</label><div className="flex gap-2"><div className="relative flex-1"><FolderPlus className="absolute left-3 top-3 text-nexus-dim" size={16} /><input type="text" value={batchNewCategoryName} onChange={e => { setBatchNewCategoryName(e.target.value); setBatchTargetCategoryId(''); }} placeholder="输入新名称..." className="w-full bg-black border border-nexus-700 rounded-sm pl-10 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-nexus-accent transition-colors" /></div></div></div>
            </div>
            <div className="flex justify-end gap-3"><Button variant="ghost" onClick={closeModals}>取消</Button><Button onClick={handleBatchAddTags} disabled={!batchTargetCategoryId && !batchNewCategoryName}>确认添加</Button></div>
          </div>
        </div>
      )}

      {showBatchEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="glass-panel-trans w-full max-w-md rounded-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-4"><Edit3 size={20} className="text-nexus-accent" /> 批量编辑 ({selectedItemIds.size} 项)</h3>
            <div className="space-y-6 mb-6">
              <div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">统一修改描述</label><input type="text" className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-3 text-white focus:border-nexus-accent focus:outline-none text-sm" placeholder="输入新的描述..." value={batchEditDesc} onChange={e => setBatchEditDesc(e.target.value)} /></div>
              <div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">追加标签</label><select className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-3 text-white focus:border-nexus-accent focus:outline-none appearance-none" value={batchEditTargetCategory} onChange={(e) => setBatchEditTargetCategory(e.target.value)}><option value="">-- 不添加 --</option>{state.categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
            </div>
            <div className="flex justify-end gap-3"><Button variant="ghost" onClick={closeModals}>取消</Button><Button onClick={handleBatchEdit} disabled={!batchEditDesc && !batchEditTargetCategory}>确认修改</Button></div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="glass-panel-trans w-full max-w-lg rounded-sm p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Tag size={20} className="text-nexus-accent" /> {editingItem ? '编辑条目' : '添加新条目'}</h3>
              <button onClick={closeModals} className="text-nexus-dim hover:text-white"><X size={20} /></button>
            </div>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">{(['text', 'url', 'image', 'video', 'audio', 'document'] as MediaType[]).map(type => (<button key={type} onClick={() => { setNewItemType(type); setNewItemFile(null); if (!editingItem) setNewItemContent(''); }} className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex-shrink-0 border ${newItemType === type ? 'bg-nexus-accent text-black border-nexus-accent' : 'bg-black text-nexus-dim border-nexus-700 hover:border-white'}`}>{type}</button>))}</div>
            <div className="space-y-4">
              {(newItemType === 'text' || newItemType === 'url') ? (<div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">内容 / URL</label>{newItemType === 'text' ? (<textarea rows={4} className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-3 text-white focus:border-nexus-accent focus:outline-none" value={newItemContent} onChange={e => setNewItemContent(e.target.value)} />) : (<input type="url" placeholder="https://..." className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-3 text-white focus:border-nexus-accent focus:outline-none" value={newItemContent} onChange={e => setNewItemContent(e.target.value)} />)}</div>) : (<div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">上传文件</label><div className="relative w-full h-32 border-2 border-dashed border-nexus-700 rounded-sm hover:border-nexus-accent transition-colors flex flex-col items-center justify-center cursor-pointer bg-black group overflow-hidden"><input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" accept={newItemType === 'image' ? 'image/*' : newItemType === 'video' ? 'video/*' : newItemType === 'audio' ? 'audio/*' : '*/*'} onChange={e => setNewItemFile(e.target.files?.[0] || null)} /><Upload size={24} className="text-nexus-dim group-hover:text-nexus-accent mb-2 transition-colors" /><span className="text-xs text-nexus-dim px-4 text-center truncate w-full font-medium">{newItemFile ? newItemFile.name : (editingItem && editingItem.type === newItemType ? '已存在文件 (点击更换)' : `点击上传 ${newItemType}`)}</span></div></div>)}
              <div><label className="block text-xs text-nexus-dim mb-1 uppercase font-bold">备注描述 (可选)</label><input type="text" className="w-full bg-black border border-nexus-700 rounded-sm px-4 py-2 text-white focus:border-nexus-accent focus:outline-none text-sm" value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} /></div>
              <div className="p-3 bg-nexus-800 border border-nexus-700 rounded-sm"><div className="flex justify-between items-center mb-2"><label className="text-xs text-nexus-dim uppercase font-bold flex items-center gap-1"><Layers size={10} /> 归属分类 (必选)</label></div><div className="flex flex-wrap gap-2 mb-2">{tempCategoryIds.length === 0 && <span className="text-xs text-gray-500 italic">暂无分类，请选择...</span>}{tempCategoryIds.map(catId => { const cat = state.categories.find(c => c.id === catId); return cat ? (<span key={catId} className="flex items-center gap-1 bg-nexus-accent/20 text-nexus-glow text-[10px] px-2 py-1 rounded border border-nexus-accent/30">{cat.name}<button onClick={() => setTempCategoryIds(prev => prev.filter(id => id !== catId))} className="hover:text-white"><X size={10} /></button></span>) : null; })}</div><div className="relative"><select className="w-full bg-black border border-nexus-700 rounded-sm px-2 py-1.5 text-xs text-white focus:border-nexus-accent focus:outline-none appearance-none cursor-pointer" onChange={(e) => { const val = e.target.value; if (val && !tempCategoryIds.includes(val)) { setTempCategoryIds(prev => [...prev, val]); } e.target.value = ""; }}><option value="">+ 添加分类...</option>{state.categories.map(c => (<option key={c.id} value={c.id} disabled={tempCategoryIds.includes(c.id)}>{c.name}</option>))}</select></div></div>
              <div className="pt-2"><Button className="w-full" size="lg" onClick={handleSaveItem} icon={<Save size={18} />}>{editingItem ? '更新条目' : '保存条目'}</Button></div>
            </div>
          </div>
        </div>
      )}

      {showBatchRemoveCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="glass-panel-trans w-full max-w-md rounded-sm p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><X size={20} className="text-red-500" /> 批量移除标签</h3>
              <button onClick={closeModals} className="text-nexus-dim hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-nexus-dim">请选择要从选中的 {selectedItemIds.size} 个条目中移除的共同标签：</p>

              {commonCategories.length === 0 ? (
                <div className="p-4 bg-nexus-800 rounded text-center text-nexus-dim text-sm">
                  选中的条目没有共同的标签。
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
                  {commonCategories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-3 p-3 bg-nexus-800 rounded cursor-pointer hover:bg-nexus-700 transition-colors">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-red-500 rounded border-gray-600 bg-black focus:ring-red-500 focus:ring-offset-black"
                        checked={batchRemoveCategoryIds.includes(cat.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBatchRemoveCategoryIds(prev => [...prev, cat.id]);
                          } else {
                            setBatchRemoveCategoryIds(prev => prev.filter(id => id !== cat.id));
                          }
                        }}
                      />
                      <span className="text-white text-sm">{cat.name}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={closeModals}>取消</Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={handleBatchRemoveCategoriesConfirm}
                  disabled={batchRemoveCategoryIds.length === 0}
                >
                  移除选中标签
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
/**
 * 前端API客户端模块
 * 封装所有与后端API的HTTP通信
 */

import { AppState, Category, Item, AppSettings, Version } from '../types';

// API基础URL - 从环境变量读取，默认为localhost:8000
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

/**
 * 通用的fetch封装，处理错误和JSON解析
 */
async function fetchAPI<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// ===== 应用状态API =====

export async function fetchState(): Promise<AppState> {
    return fetchAPI<AppState>('/api/state');
}

export async function saveState(state: AppState): Promise<{ success: boolean }> {
    return fetchAPI('/api/state', {
        method: 'POST',
        body: JSON.stringify(state),
    });
}

// ===== 分类管理API =====

export async function createCategory(category: Category): Promise<Category> {
    return fetchAPI<Category>('/api/categories', {
        method: 'POST',
        body: JSON.stringify(category),
    });
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<Category> {
    return fetchAPI<Category>(`/api/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deleteCategory(id: string): Promise<{ success: boolean }> {
    return fetchAPI(`/api/categories/${id}`, {
        method: 'DELETE',
    });
}

// ===== 条目管理API（含筛选和搜索） =====

/**
 * 获取条目列表（支持筛选和搜索）
 * 业务逻辑现在在后端处理
 */
export async function fetchItems(
    categoryIds?: string[],
    searchQuery?: string
): Promise<Item[]> {
    const params = new URLSearchParams();

    if (categoryIds && categoryIds.length > 0) {
        params.append('categories', categoryIds.join(','));
    }

    if (searchQuery && searchQuery.trim()) {
        params.append('search', searchQuery);
    }

    const queryString = params.toString();
    const url = queryString ? `/api/items?${queryString}` : '/api/items';

    return fetchAPI<Item[]>(url);
}

export async function createItem(item: Item): Promise<Item> {
    // 后端会自动验证重名
    return fetchAPI<Item>('/api/items', {
        method: 'POST',
        body: JSON.stringify(item),
    });
}

export async function updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    // 后端会自动验证重名
    return fetchAPI<Item>(`/api/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deleteItem(id: string): Promise<{ success: boolean }> {
    return fetchAPI(`/api/items/${id}`, {
        method: 'DELETE',
    });
}

export async function uploadFile(item: Item): Promise<Item> {
    return fetchAPI<Item>('/api/upload', {
        method: 'POST',
        body: JSON.stringify(item),
    });
}

// ===== 批量操作API =====

export async function batchAddTags(
    itemIds: string[],
    categoryId: string
): Promise<void> {
    await fetchAPI('/api/batch/add-tags', {
        method: 'POST',
        body: JSON.stringify({ itemIds, categoryId }),
    });
}

export async function batchEdit(
    itemIds: string[],
    description?: string,
    categoryId?: string
): Promise<void> {
    await fetchAPI('/api/batch/edit', {
        method: 'POST',
        body: JSON.stringify({ itemIds, description, categoryId }),
    });
}

export async function batchDelete(itemIds: string[]): Promise<void> {
    await fetchAPI('/api/batch/delete', {
        method: 'POST',
        body: JSON.stringify({ itemIds }),
    });
}

// ===== 版本控制API =====

export async function fetchVersions(): Promise<Version[]> {
    return fetchAPI<Version[]>('/api/versions');
}

export async function createVersion(state: AppState, label: string = 'Manual Save'): Promise<Version> {
    return fetchAPI<Version>('/api/versions', {
        method: 'POST',
        body: JSON.stringify({ state, label }),
    });
}

export async function deleteVersion(id: string): Promise<{ success: boolean }> {
    return fetchAPI(`/api/versions/${id}`, {
        method: 'DELETE',
    });
}

// ===== 设置API =====

export async function fetchSettings(): Promise<AppSettings> {
    return fetchAPI<AppSettings>('/api/settings');
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
    return fetchAPI<AppSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
    });
}

// ===== 数据导入导出API =====

export async function exportData(): Promise<AppState> {
    return fetchAPI<AppState>('/api/export');
}

export async function importData(data: AppState): Promise<{ success: boolean }> {
    return fetchAPI('/api/import', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ===== 分类关联管理API =====

/**
 * 从条目中删除分类关联
 */
export async function removeCategoryFromItem(
    itemId: string,
    categoryId: string
): Promise<Item> {
    return fetchAPI<Item>(`/api/items/${itemId}/remove-category`, {
        method: 'PUT',
        body: JSON.stringify({ categoryId }),
    });
}

/**
 * 批量删除分类关联
 */
export async function batchRemoveCategories(
    itemIds: string[],
    categoryIds: string[]
): Promise<void> {
    await fetchAPI('/api/batch/remove-categories', {
        method: 'POST',
        body: JSON.stringify({ itemIds, categoryIds }),
    });
}

/**
 * Toggle分类关联（拖拽功能）
 */
export async function toggleCategory(
    itemIds: string[],
    categoryId: string
): Promise<void> {
    await fetchAPI('/api/items/toggle-category', {
        method: 'POST',
        body: JSON.stringify({ itemIds, categoryId }),
    });
}

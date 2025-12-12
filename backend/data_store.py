"""
数据持久化模块
负责JSON文件的读写操作，提供数据存储接口
"""

import json
import os
from typing import Dict, List, Any, Optional

# 数据存储目录
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DATA_FILE = os.path.join(DATA_DIR, 'data.json')
VERSIONS_FILE = os.path.join(DATA_DIR, 'versions.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')

# 初始数据
INITIAL_STATE = {
    "categories": [
        {"id": "root_1", "parentId": None, "name": "我的收藏", "createdAt": 0},
        {"id": "root_2", "parentId": None, "name": "工作资料", "createdAt": 0}
    ],
    "items": [],
    "selectedCategoryIds": []
}

INITIAL_SETTINGS = {
    "autoSaveInterval": 5,  # 默认5分钟
    "maxVersions": 20  # 保留最近20个版本
}


def ensure_data_directory():
    """确保数据目录存在"""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)


def atomic_write(file_path: str, data: Any):
    """原子写入JSON文件，先写临时文件再重命名"""
    ensure_data_directory()
    temp_file = file_path + '.tmp'
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        # 原子操作：重命名
        if os.path.exists(file_path):
            os.replace(temp_file, file_path)
        else:
            os.rename(temp_file, file_path)
    except Exception as e:
        # 清理临时文件
        if os.path.exists(temp_file):
            os.remove(temp_file)
        raise e


def load_json_file(file_path: str, default: Any) -> Any:
    """从JSON文件加载数据"""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
    return default


# ===== 应用状态操作 =====

def load_state() -> Dict[str, Any]:
    """加载应用状态"""
    state = load_json_file(DATA_FILE, INITIAL_STATE.copy())
    
    # 数据验证和修复
    if not isinstance(state.get('categories'), list):
        state['categories'] = INITIAL_STATE['categories'].copy()
    if not isinstance(state.get('items'), list):
        state['items'] = []
    if not isinstance(state.get('selectedCategoryIds'), list):
        state['selectedCategoryIds'] = []
    
    # 确保items中的categoryIds是数组
    for item in state['items']:
        if not isinstance(item.get('categoryIds'), list):
            item['categoryIds'] = []
    
    return state


def save_state(state: Dict[str, Any]) -> bool:
    """保存应用状态"""
    try:
        atomic_write(DATA_FILE, state)
        return True
    except Exception as e:
        print(f"Error saving state: {e}")
        return False


# ===== 版本历史操作 =====

def load_versions() -> List[Dict[str, Any]]:
    """加载版本历史"""
    return load_json_file(VERSIONS_FILE, [])


def save_versions(versions: List[Dict[str, Any]]) -> bool:
    """保存版本历史"""
    try:
        atomic_write(VERSIONS_FILE, versions)
        return True
    except Exception as e:
        print(f"Error saving versions: {e}")
        return False


def add_version(state: Dict[str, Any], label: str = 'Auto-save') -> Optional[Dict[str, Any]]:
    """添加新版本到历史"""
    try:
        settings = load_settings()
        versions = load_versions()
        
        # 生成版本ID（时间戳）
        import time
        timestamp = int(time.time() * 1000)
        
        # 计算数据大小
        json_str = json.dumps(state, ensure_ascii=False)
        size = len(json_str.encode('utf-8'))
        
        new_version = {
            "id": f"{timestamp}_{hash(json_str) & 0xFFFFFF:06x}",
            "timestamp": timestamp,
            "label": label,
            "data": state,
            "size": size
        }
        
        # 添加到历史顶部，限制数量
        versions.insert(0, new_version)
        versions = versions[:settings.get('maxVersions', 20)]
        
        if save_versions(versions):
            return new_version
        return None
    except Exception as e:
        print(f"Error adding version: {e}")
        return None


def delete_version(version_id: str) -> bool:
    """删除指定版本"""
    try:
        versions = load_versions()
        versions = [v for v in versions if v.get('id') != version_id]
        return save_versions(versions)
    except Exception as e:
        print(f"Error deleting version: {e}")
        return False


# ===== 设置操作 =====

def load_settings() -> Dict[str, Any]:
    """加载设置"""
    settings = load_json_file(SETTINGS_FILE, INITIAL_SETTINGS.copy())
    # 合并默认设置
    return {**INITIAL_SETTINGS, **settings}


def save_settings(settings: Dict[str, Any]) -> bool:
    """保存设置"""
    try:
        atomic_write(SETTINGS_FILE, settings)
        return True
    except Exception as e:
        print(f"Error saving settings: {e}")
        return False


# 初始化：确保数据目录存在
ensure_data_directory()


# ===== 业务逻辑函数 =====

def get_ancestor_ids(category_id: str, categories: List[Dict[str, Any]]) -> List[str]:
    """
    获取某个分类的所有祖先分类ID（包括自己）
    用于分类层级继承：添加子分类时自动添加所有父分类
    
    示例: 工作资料 → 项目A → 文档
    get_ancestor_ids("文档") 返回 ["文档", "项目A", "工作资料"]
    """
    if not categories or not isinstance(categories, list):
        return [category_id]
    
    ancestors = [category_id]
    current_id = category_id
    
    # 向上遍历，找到所有祖先
    while True:
        category = next((c for c in categories if c.get('id') == current_id), None)
        if not category or not category.get('parentId'):
            break
        ancestors.append(category['parentId'])
        current_id = category['parentId']
    
    return ancestors


def expand_category_ids(category_ids: List[str], categories: List[Dict[str, Any]]) -> List[str]:
    """
    扩展分类ID列表，包含所有祖先分类
    
    示例: 输入 ["文档", "报告"] 
    如果"文档"属于"项目A"属于"工作资料"，"报告"属于"工作资料"
    返回: ["文档", "项目A", "工作资料", "报告"] (去重后)
    """
    expanded = set()
    for cat_id in category_ids:
        # 添加该分类及其所有祖先
        expanded.update(get_ancestor_ids(cat_id, categories))
    return list(expanded)


def get_descendant_ids(root_id: str, categories: List[Dict[str, Any]]) -> List[str]:
    """
    递归获取某个分类的所有子分类ID
    这个函数之前在前端，现在移到后端
    """
    if not categories or not isinstance(categories, list):
        return []
    
    # 找到所有子分类
    children = [c for c in categories if c.get('parentId') == root_id]
    
    # 收集子分类ID
    ids = [c['id'] for c in children]
    
    # 递归获取每个子分类的子分类
    for child in children:
        ids.extend(get_descendant_ids(child['id'], categories))
    
    return ids


def toggle_category_association(
    items: List[Dict[str, Any]],
    item_ids: List[str],
    category_id: str,
    categories: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Toggle条目与分类的关联（拖拽功能）
    
    移除逻辑：
    - 移除父类别 → 移除该父类及所有子类
    - 移除子类别 → 仅移除该子类（保留祖先）
    
    添加逻辑：
    - 添加父类别 → 仅添加该父类（不添加子类）
    - 添加子类别 → 添加该子类及所有祖先
    
    参数：
        items: 所有条目
        item_ids: 要操作的条目ID列表
        category_id: 目标分类ID
        categories: 所有分类列表
    
    返回：
        更新后的条目列表
    """
    # 1. 检查所有选中条目是否都包含该分类
    selected_items = [item for item in items if item['id'] in item_ids]
    all_have_category = all(
        category_id in item.get('categoryIds', [])
        for item in selected_items
    )
    
    # 2. 确定要操作的分类ID集合
    if all_have_category:
        # === 移除操作 ===
        # 获取该分类的所有子类
        descendants = get_descendant_ids(category_id, categories)
        
        if descendants:
            # 如果有子类，说明是父类别 → 移除父类 + 所有子类
            categories_to_remove = set([category_id] + descendants)
        else:
            # 如果没有子类，说明是子类别 → 只移除该子类
            categories_to_remove = set([category_id])
    else:
        # === 添加操作 ===
        # 检查该分类是否有子类
        descendants = get_descendant_ids(category_id, categories)
        
        if descendants:
            # 如果有子类，说明是父类别 → 只添加该父类
            categories_to_add = [category_id]
        else:
            # 如果没有子类，说明是子类别 → 添加该子类 + 所有祖先
            categories_to_add = get_ancestor_ids(category_id, categories)
    
    # 3. 更新条目
    updated_items = []
    for item in items:
        if item['id'] in item_ids:
            item_copy = item.copy()
            current_ids = set(item.get('categoryIds', []))
            
            if all_have_category:
                # 移除操作
                current_ids -= categories_to_remove
            else:
                # 添加操作
                current_ids.update(categories_to_add)
            
            item_copy['categoryIds'] = list(current_ids)
            updated_items.append(item_copy)
        else:
            updated_items.append(item)
    
    return updated_items


def filter_items(items: List[Dict[str, Any]], 
                 categories: List[Dict[str, Any]],
                 selected_category_ids: List[str] = None,
                 search_query: str = None) -> List[Dict[str, Any]]:
    """
    筛选和搜索条目
    这个函数之前在前端的filteredItems中，现在移到后端
    
    参数:
        items: 所有条目
        categories: 所有分类
        selected_category_ids: 选中的分类ID列表（用于筛选）
        search_query: 搜索关键词
    
    返回:
        过滤后的条目列表
    """
    result = items.copy() if items else []
    
    # 1. 按分类筛选（包含子分类）
    if selected_category_ids and len(selected_category_ids) > 0:
        filtered = []
        for item in result:
            item_category_ids = item.get('categoryIds', [])
            if not item_category_ids:
                continue
            
            # 检查是否匹配所有选中的分类（交集逻辑）
            matches_all = True
            for filter_id in selected_category_ids:
                # 获取该分类及其所有子分类的ID
                valid_branch_ids = set([filter_id] + get_descendant_ids(filter_id, categories))
                # 检查条目的分类ID是否在这个分支中
                if not any(cid in valid_branch_ids for cid in item_category_ids):
                    matches_all = False
                    break
            
            if matches_all:
                filtered.append(item)
        
        result = filtered
    
    # 2. 按搜索关键词筛选
    if search_query and search_query.strip():
        query = search_query.lower()
        filtered = []
        
        for item in result:
            # 搜索描述
            matches_desc = (item.get('description') or '').lower().find(query) != -1
            # 搜索文件名
            matches_filename = (item.get('fileName') or '').lower().find(query) != -1
            # 搜索内容（仅文本和URL类型）
            matches_content = False
            if item.get('type') in ['text', 'url']:
                matches_content = (item.get('content') or '').lower().find(query) != -1
            
            if matches_desc or matches_filename or matches_content:
                filtered.append(item)
        
        result = filtered
    
    return result


def validate_item_name(items: List[Dict[str, Any]], 
                       item_name: str,
                       item_type: str,
                       exclude_id: str = None) -> Optional[str]:
    """
    验证条目名称是否重复
    这个函数之前在前端的handleSaveItem中，现在移到后端
    
    参数:
        items: 所有条目
        item_name: 要验证的名称
        item_type: 条目类型
        exclude_id: 排除的条目ID（用于编辑时）
    
    返回:
        如果重复返回错误信息，否则返回None
    """
    if not item_name or not item_name.strip():
        return "名称不能为空"
    
    for item in items:
        # 跳过要排除的条目（编辑时）
        if exclude_id and item.get('id') == exclude_id:
            continue
        
        # 对于文本和URL类型，检查content
        if item_type in ['text', 'url']:
            if item.get('type') in ['text', 'url'] and item.get('content') == item_name:
                return f"已存在同名条目：{item_name}，请修改名称。"
        # 对于文件类型，检查fileName
        else:
            if item.get('type') == item_type and item.get('fileName') == item_name:
                return f"已存在同名文件：{item_name}，请修改文件名或选择其他文件。"
    
    return None


def batch_add_tags(items: List[Dict[str, Any]], 
                   item_ids: List[str],
                   category_id: str,
                   categories: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    批量添加标签（分类）到条目
    
    参数:
        items: 所有条目
        item_ids: 要添加标签的条目ID列表
        category_id: 要添加的分类ID
        categories: 所有分类列表（用于扩展祖先分类）
    
    返回:
        更新后的条目列表
    """
    # 获取要添加的分类ID及其所有祖先
    if categories:
        category_ids_to_add = expand_category_ids([category_id], categories)
    else:
        category_ids_to_add = [category_id]
    
    updated_items = []
    for item in items:
        if item['id'] in item_ids:
            item_copy = item.copy()
            current_ids = set(item.get('categoryIds', []))
            # 添加新分类及其祖先
            current_ids.update(category_ids_to_add)
            item_copy['categoryIds'] = list(current_ids)
            updated_items.append(item_copy)
        else:
            updated_items.append(item)
    
    return updated_items


def batch_edit(items: List[Dict[str, Any]],
               item_ids: List[str],
               description: str = None,
               category_id: str = None) -> List[Dict[str, Any]]:
    """
    批量编辑条目
    
    参数:
        items: 所有条目
        item_ids: 要编辑的条目ID列表
        description: 新的描述（如果提供）
        category_id: 要添加的分类ID（如果提供）
    
    返回:
        更新后的条目列表
    """
    updated_items = []
    for item in items:
        if item['id'] in item_ids:
            item_copy = item.copy()
            # 更新描述
            if description and description.strip():
                item_copy['description'] = description
            # 添加分类
            if category_id and category_id not in item.get('categoryIds', []):
                item_copy['categoryIds'] = item.get('categoryIds', []) + [category_id]
            updated_items.append(item_copy)
        else:
            updated_items.append(item)
    
    return updated_items


def batch_delete(items: List[Dict[str, Any]], item_ids: List[str]) -> List[Dict[str, Any]]:
    """
    批量删除条目
    
    参数:
        items: 所有条目
        item_ids: 要删除的条目ID列表
    
    返回:
        删除后的条目列表
    """
    return [item for item in items if item['id'] not in item_ids]


def remove_category_from_item(items: List[Dict[str, Any]], 
                               item_id: str, 
                               category_id: str) -> tuple[List[Dict[str, Any]], Optional[str]]:
    """
    从指定条目中删除分类关联
    
    参数:
        items: 所有条目
        item_id: 条目ID
        category_id: 要删除的分类ID
    
    返回:
        (更新后的条目列表, 错误信息)
    """
    # 验证条目是否存在
    item_found = False
    updated_items = []
    
    for item in items:
        if item['id'] == item_id:
            item_found = True
            item_copy = item.copy()
            category_ids = item.get('categoryIds', [])
            
            # 验证分类是否在条目中
            if category_id not in category_ids:
                return items, f"条目不包含分类ID: {category_id}"
            
            # 删除分类关联
            new_category_ids = [cid for cid in category_ids if cid != category_id]
            
            # 至少要保留一个分类
            if len(new_category_ids) == 0:
                return items, "条目至少需要一个分类，无法删除最后一个分类"
            
            item_copy['categoryIds'] = new_category_ids
            updated_items.append(item_copy)
        else:
            updated_items.append(item)
    
    if not item_found:
        return items, f"条目不存在: {item_id}"
    
    return updated_items, None


def batch_remove_categories(items: List[Dict[str, Any]],
                            item_ids: List[str],
                            category_ids: List[str]) -> tuple[List[Dict[str, Any]], Optional[str]]:
    """
    批量从条目中删除分类关联
    
    参数:
        items: 所有条目
        item_ids: 条目ID列表
        category_ids: 要删除的分类ID列表
    
    返回:
        (更新后的条目列表, 错误信息)
    """
    if not item_ids:
        return items, "未提供条目ID"
    
    if not category_ids:
        return items, "未提供分类ID"
    
    # 将分类ID转为集合以提高查找效率
    categories_to_remove = set(category_ids)
    updated_items = []
    modified_count = 0
    
    for item in items:
        if item['id'] in item_ids:
            item_copy = item.copy()
            original_category_ids = item.get('categoryIds', [])
            
            # 删除指定的分类
            new_category_ids = [cid for cid in original_category_ids 
                               if cid not in categories_to_remove]
            
            # 至少要保留一个分类
            if len(new_category_ids) == 0:
                # 如果会导致无分类，则保持原样
                updated_items.append(item)
            else:
                item_copy['categoryIds'] = new_category_ids
                updated_items.append(item_copy)
                if len(new_category_ids) != len(original_category_ids):
                    modified_count += 1
        else:
            updated_items.append(item)
    
    if modified_count == 0:
        return items, "没有条目被修改，可能是分类不存在或所有条目都只有一个分类"
    
    return updated_items, None

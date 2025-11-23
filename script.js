let selectedTags = [];
let allTags = [];
let allItems = [];
let selectedItems = new Set(); // 选中的条目
let selectedTagElements = new Set(); // 选中的标签元素

// 框选功能相关变量
let isSelecting = false;
let selectionBox = null;
let startX, startY;

// 连续选择功能相关变量
let lastSelectedItem = null; // 最后一个选中的条目

// 拖拽功能相关变量
let draggedItems = [];
let dragStartTime = 0;

document.addEventListener('DOMContentLoaded', () => {
    // 初始化右键菜单事件
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        hideContextMenu();
        hideMoveSearch();
    });

    document.addEventListener('click', () => {
        hideContextMenu();
        hideMoveSearch();
    });

    // 右键菜单功能
    document.getElementById('delete-selected').addEventListener('click', deleteSelected);
    document.getElementById('move-to-category').addEventListener('click', showMoveSearch);

    // 移动到搜索功能
    document.getElementById('move-search-input').addEventListener('input', handleMoveSearch);

    // 框选功能
    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('.item-card')) {
            // 在条目卡片上开始选择
            const itemElement = e.target.closest('.item-card');
            
            if (e.ctrlKey || e.metaKey) {
                // Ctrl+点击切换选择状态
                toggleItemSelection(itemElement);
            } else if (e.shiftKey && lastSelectedItem) {
                // Shift+点击进行连续选择
                handleShiftSelection(itemElement);
            } else if (!itemElement.classList.contains('selected')) {
                // 清除其他选择，只选择当前
                clearItemSelection();
                selectItem(itemElement);
            }
        } else if (e.target.closest('#items-container')) {
            // 在容器空白处开始框选
            if (!e.ctrlKey && !e.metaKey) {
                clearItemSelection();
            }
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            createSelectionBox(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isSelecting && selectionBox) {
            updateSelectionBox(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isSelecting) {
            finishSelection();
        }
    });

    // 拖拽功能
    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('.item-card') && !e.ctrlKey && !e.metaKey) {
            dragStartTime = Date.now();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (Date.now() - dragStartTime > 500 && e.target.closest('.item-card') && !draggedItems.length) {
            // 长按500ms开始拖拽
            startDrag(e);
        }
    });

    document.addEventListener('mouseup', () => {
        dragStartTime = 0;
        if (draggedItems.length) {
            endDrag();
        }
    });

    initializeApp();
});

function initializeApp() {
    // 加载标签树
    loadTagTree();
    
    // 绑定事件监听器
    document.getElementById('add-category-btn').addEventListener('click', addCategory);
    document.getElementById('add-item-btn').addEventListener('click', addItem);
}

async function loadTagTree() {
    try {
        const response = await fetch('/api/tags');
        const tags = await response.json();
        renderTagTree(tags);
    } catch (error) {
        console.error('加载标签失败:', error);
        // 如果后端没有数据，显示空树
        renderTagTree([]);
    }
}

function renderTagTree(tags) {
    const container = document.getElementById('tag-tree');
    container.innerHTML = '';
    
    const ul = document.createElement('ul');
    tags.forEach(tag => {
        ul.appendChild(createTagNode(tag));
    });
    
    container.appendChild(ul);
    
    // 添加右键菜单事件到所有标签节点
    container.querySelectorAll('.tag-node').forEach(node => {
        node.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, 'tag', node.dataset.id);
        });
    });
}

function createTagNode(tag) {
    const li = document.createElement('li');
    
    const div = document.createElement('div');
    div.className = 'tag-node';
    div.textContent = tag.name;
    div.dataset.id = tag.id;
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTagSelection(div);
    });
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'tag-actions';
    
    const addChildBtn = document.createElement('button');
    addChildBtn.textContent = '+子类';
    addChildBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addChildTag(tag.id);
    });
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTag(tag.id);
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTag(tag.id);
    });
    
    actionsDiv.appendChild(addChildBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    
    div.appendChild(actionsDiv);
    li.appendChild(div);
    
    if (tag.children && tag.children.length > 0) {
        const ul = document.createElement('ul');
        tag.children.forEach(child => {
            ul.appendChild(createTagNode(child));
        });
        li.appendChild(ul);
    }
    
    return li;
}

function toggleTagSelection(element) {
    element.classList.toggle('selected');
    // 这里应该触发重新筛选条目
    filterItems();
}

// 右键菜单相关函数
function showContextMenu(e, type, id) {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.dataset.type = type;
    menu.dataset.id = id;
    e.stopPropagation();
}

function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
}

function deleteSelected() {
    if (selectedItems.size > 0) {
        // 删除选中的条目
        const itemIds = Array.from(selectedItems);
        if (confirm(`确定要删除选中的 ${itemIds.length} 个条目吗？此操作不可撤销。`)) {
            deleteItems(itemIds);
        }
    } else {
        // 删除右键点击的单个条目或标签
        const menu = document.getElementById('context-menu');
        const type = menu.dataset.type;
        const id = menu.dataset.id;
        
        if (type === 'item') {
            if (confirm('确定要删除这个条目吗？此操作不可撤销。')) {
                deleteItems([id]);
            }
        } else if (type === 'tag') {
            if (confirm('确定要删除这个类别吗？这将删除该类别下的所有条目。此操作不可撤销。')) {
                deleteTag(id);
            }
        }
    }
}

async function deleteItems(itemIds) {
    try {
        // 将字符串ID转换为整数
        const intItemIds = itemIds.map(id => parseInt(id));
        const response = await fetch('/api/items', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item_ids: intItemIds })
        });
        
        if (response.ok) {
            selectedItems.clear();
            lastSelectedItem = null;
            await filterItems();
            updateCheckboxVisibility();
            alert(`成功删除 ${itemIds.length} 个条目`);
        } else {
            const error = await response.json();
            alert(`删除失败: ${error.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('删除条目失败:', error);
        alert('删除失败: 网络错误');
    }
}

async function deleteTag(tagId) {
    try {
        const response = await fetch(`/api/tags/${tagId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadTagTree();
            await filterItems();
            alert('类别删除成功');
        } else {
            const error = await response.json();
            alert(`删除类别失败: ${error.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('删除标签失败:', error);
        alert('删除类别失败: 网络错误');
    }
}

// 移动到搜索功能
function showMoveSearch(e) {
    const container = document.getElementById('move-search-container');
    const menu = document.getElementById('context-menu');
    
    container.style.display = 'block';
    container.style.left = menu.style.left;
    container.style.top = (parseInt(menu.style.top) + 60) + 'px';
    
    document.getElementById('move-search-input').focus();
    document.getElementById('move-search-input').value = '';
    document.getElementById('move-search-results').innerHTML = '';
    
    e.stopPropagation();
}

function hideMoveSearch() {
    document.getElementById('move-search-container').style.display = 'none';
}

function handleMoveSearch(e) {
    const query = e.target.value.toLowerCase();
    const results = document.getElementById('move-search-results');
    
    if (!query) {
        results.innerHTML = '';
        return;
    }
    
    const matchedTags = allTags.filter(tag => 
        tag.name.toLowerCase().includes(query) || 
        (tag.parent_name && tag.parent_name.toLowerCase().includes(query))
    );
    
    results.innerHTML = matchedTags.map(tag => `
        <div class="search-result-item" data-tag-id="${tag.id}" data-tag-name="${tag.name}">
            ${tag.name}
            ${tag.parent_name ? `<span class="tag-path">(${tag.parent_name})</span>` : ''}
        </div>
    `).join('');
    
    // 添加点击事件
    results.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const tagId = e.target.closest('.search-result-item').dataset.tagId;
            moveItemsToTag(tagId);
            hideMoveSearch();
        });
    });
}

async function moveItemsToTag(targetTagId) {
    let itemIds = [];
    
    if (selectedItems.size > 0) {
        itemIds = Array.from(selectedItems);
    } else {
        // 移动右键点击的单个条目
        const menu = document.getElementById('context-menu');
        const type = menu.dataset.type;
        const id = menu.dataset.id;
        
        if (type === 'item') {
            itemIds = [id];
        }
    }
    
    if (itemIds.length === 0) {
        alert('请先选择要移动的条目');
        return;
    }
    
    try {
        // 将字符串ID转换为整数
        const intItemIds = itemIds.map(id => parseInt(id));
        const response = await fetch('/api/items/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item_ids: intItemIds,
                target_tag_id: parseInt(targetTagId)
            })
        });
        
        if (response.ok) {
            selectedItems.clear();
            await filterItems();
            alert('移动成功');
        } else {
            alert('移动失败');
        }
    } catch (error) {
        console.error('移动条目失败:', error);
        alert('移动失败');
    }
}

// 框选相关函数
function createSelectionBox(x, y) {
    selectionBox = document.createElement('div');
    selectionBox.className = 'selection-box';
    selectionBox.style.position = 'absolute';
    selectionBox.style.border = '2px dashed #2196F3';
    selectionBox.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
    selectionBox.style.left = x + 'px';
    selectionBox.style.top = y + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.pointerEvents = 'none';
    document.body.appendChild(selectionBox);
}

function updateSelectionBox(currentX, currentY) {
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    
    // 检查哪些条目在框选范围内
    const items = document.querySelectorAll('.item-card');
    items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemCenterX = rect.left + rect.width / 2;
        const itemCenterY = rect.top + rect.height / 2;
        
        if (itemCenterX >= left && itemCenterX <= left + width &&
            itemCenterY >= top && itemCenterY <= top + height) {
            selectItem(item);
        }
    });
}

function finishSelection() {
    isSelecting = false;
    if (selectionBox) {
        document.body.removeChild(selectionBox);
        selectionBox = null;
    }
}

// 选择相关函数
function selectItem(itemElement) {
    itemElement.classList.add('selected');
    selectedItems.add(itemElement.dataset.itemId);
    lastSelectedItem = itemElement;
    updateCheckboxVisibility();
}

function toggleItemSelection(itemElement) {
    if (itemElement.classList.contains('selected')) {
        itemElement.classList.remove('selected');
        selectedItems.delete(itemElement.dataset.itemId);
        if (lastSelectedItem === itemElement) {
            lastSelectedItem = null;
        }
    } else {
        itemElement.classList.add('selected');
        selectedItems.add(itemElement.dataset.itemId);
        lastSelectedItem = itemElement;
    }
    updateCheckboxVisibility();
}

function clearItemSelection() {
    document.querySelectorAll('.item-card.selected').forEach(item => {
        item.classList.remove('selected');
    });
    selectedItems.clear();
    lastSelectedItem = null;
}

// Shift连续选择功能
function handleShiftSelection(targetItem) {
    if (!lastSelectedItem) {
        selectItem(targetItem);
        return;
    }
    
    const allItems = Array.from(document.querySelectorAll('.item-card'));
    const lastIndex = allItems.indexOf(lastSelectedItem);
    const targetIndex = allItems.indexOf(targetItem);
    
    if (lastIndex === -1 || targetIndex === -1) {
        selectItem(targetItem);
        return;
    }
    
    // 确定选择范围
    const startIndex = Math.min(lastIndex, targetIndex);
    const endIndex = Math.max(lastIndex, targetIndex);
    
    // 选择范围内的所有条目
    for (let i = startIndex; i <= endIndex; i++) {
        selectItem(allItems[i]);
    }
}

// 拖拽相关函数
function startDrag(e) {
    const itemElement = e.target.closest('.item-card');
    if (!itemElement) return;
    
    if (selectedItems.size === 0) {
        // 如果没有选中的条目，只拖拽当前条目
        selectItem(itemElement);
    }
    
    draggedItems = Array.from(selectedItems);
    
    // 创建拖拽指示器
    const dragIndicator = document.createElement('div');
    dragIndicator.className = 'drag-indicator';
    dragIndicator.textContent = `移动 ${draggedItems.length} 个条目`;
    dragIndicator.style.position = 'fixed';
    dragIndicator.style.background = '#2196F3';
    dragIndicator.style.color = 'white';
    dragIndicator.style.padding = '8px 12px';
    dragIndicator.style.borderRadius = '4px';
    dragIndicator.style.pointerEvents = 'none';
    dragIndicator.style.zIndex = '1003';
    document.body.appendChild(dragIndicator);
    
    document.addEventListener('mousemove', updateDragIndicator);
    document.addEventListener('mouseup', endDrag);
}

function updateDragIndicator(e) {
    const dragIndicator = document.querySelector('.drag-indicator');
    if (dragIndicator) {
        dragIndicator.style.left = e.clientX + 10 + 'px';
        dragIndicator.style.top = e.clientY + 10 + 'px';
        
        // 检查是否在标签上
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const tagElement = element?.closest('.tag-node');
        
        if (tagElement) {
            tagElement.style.backgroundColor = '#e3f2fd';
        }
        
        // 清除其他标签的高亮
        document.querySelectorAll('.tag-node').forEach(tag => {
            if (tag !== tagElement) {
                tag.style.backgroundColor = '';
            }
        });
    }
}

function endDrag() {
    const dragIndicator = document.querySelector('.drag-indicator');
    if (dragIndicator) {
        document.body.removeChild(dragIndicator);
    }
    
    // 清除标签高亮
    document.querySelectorAll('.tag-node').forEach(tag => {
        tag.style.backgroundColor = '';
    });
    
    if (draggedItems.length > 0) {
        // 获取鼠标位置的标签
        const mouseEvent = window.event;
        const element = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        const tagElement = element?.closest('.tag-node');
        
        if (tagElement) {
            const targetTagId = tagElement.dataset.tagId;
            moveItemsToTag(targetTagId);
        }
    }
    
    draggedItems = [];
    document.removeEventListener('mousemove', updateDragIndicator);
    document.removeEventListener('mouseup', endDrag);
}

// 显示条目
function displayItems(items) {
    const container = document.getElementById('items-container');
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = '<p>没有找到符合条件的条目。</p>';
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'items-grid';
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;
        
        if (selectedItems.has(item.id.toString())) {
            card.classList.add('selected');
        }
        
        card.innerHTML = `
            <h3>${item.title}</h3>
            <p>${item.content || '无描述'}</p>
            <div class="item-meta">
                <span class="media-type">${item.media_type || '文本'}</span>
            </div>
            <div class="item-checkbox" style="display: none;">
                <input type="checkbox" class="item-select-checkbox" data-item-id="${item.id}">
            </div>
        `;
        
        // 添加复选框事件
        const checkbox = card.querySelector('.item-select-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectItem(card);
            } else {
                toggleItemSelection(card);
            }
        });
        
        // 添加右键菜单事件
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, 'item', item.id);
        });
        
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
    
    // 如果有选中的条目，显示复选框
    updateCheckboxVisibility();
}

// 更新复选框显示状态
function updateCheckboxVisibility() {
    const checkboxes = document.querySelectorAll('.item-checkbox');
    const hasSelection = selectedItems.size > 0;
    
    checkboxes.forEach(checkbox => {
        checkbox.style.display = hasSelection ? 'block' : 'none';
        const itemId = checkbox.querySelector('.item-select-checkbox').dataset.itemId;
        checkbox.querySelector('.item-select-checkbox').checked = selectedItems.has(itemId);
    });
}

// 筛选条目
async function filterItems() {
    // 获取所有选中的标签ID
    const selectedTags = Array.from(document.querySelectorAll('.tag-node.selected'))
                              .map(el => parseInt(el.dataset.id));
    
    try {
        // 根据是否有选中标签决定API调用方式
        let url = '/api/items';
        if (selectedTags.length > 0) {
            url += `?tag_ids=${selectedTags.join(',')}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        // 处理可能的响应格式差异
        const items = data.items || data;
        displayItems(items);
    } catch (error) {
        console.error('筛选条目失败:', error);
        displayItems([]);
    }
}

function addCategory() {
    const name = prompt('请输入大类名称:');
    if (name && name.trim()) {
        createTag(name.trim(), null);
    }
}

function addChildTag(parentId) {
    const name = prompt('请输入子类名称:');
    if (name && name.trim()) {
        createTag(name.trim(), parentId);
    }
}

function editTag(tagId) {
    const name = prompt('请输入新的标签名称:');
    if (name && name.trim()) {
        // 这里应该实现编辑标签的API调用
        alert('编辑标签功能待实现');
    }
}

function deleteTag(tagId) {
    if (confirm('确定要删除这个类别吗？这将删除该类别下的所有条目。此操作不可撤销。')) {
        // 调用后端API删除标签
        fetch(`/api/tags/${tagId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (response.ok) {
                loadTagTree();
                filterItems();
                alert('类别删除成功');
            } else {
                response.json().then(error => {
                    alert(`删除类别失败: ${error.error || '未知错误'}`);
                });
            }
        })
        .catch(error => {
            console.error('删除类别失败:', error);
            alert('删除类别失败: 网络错误');
        });
    }
}

async function createTag(name, parentId) {
    try {
        const response = await fetch('/api/tags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                parent_id: parentId
            })
        });
        
        if (response.ok) {
            // 重新加载标签树
            loadTagTree();
        } else {
            alert('创建标签失败');
        }
    } catch (error) {
        console.error('创建标签失败:', error);
        alert('创建标签失败');
    }
}

async function addItem() {
    // 显示添加条目对话框
    await showItemDialog();
}

async function showItemDialog() {
    const dialog = document.createElement('div');
    dialog.id = 'item-dialog';
    dialog.className = 'modal';
    dialog.innerHTML = `
        <div class="modal-content">
            <h3>添加新条目</h3>
            <form id="item-form">
                <div class="form-group">
                    <label>标题:</label>
                    <input type="text" id="item-title" required>
                </div>
                <div class="form-group">
                    <label>内容:</label>
                    <textarea id="item-content" rows="4"></textarea>
                </div>
                <div class="form-group">
                    <label>媒体类型:</label>
                    <select id="media-type">
                        <option value="text">文本</option>
                        <option value="image">图片</option>
                        <option value="video">视频</option>
                        <option value="audio">音频</option>
                        <option value="document">文档</option>
                    </select>
                </div>
                <div class="form-group" id="file-upload-group" style="display:none;">
                    <label>选择文件:</label>
                    <input type="file" id="item-file" accept="*/*">
                    <div id="upload-progress"></div>
                </div>
                <div class="form-group">
                    <label>关联标签:</label>
                    <div id="tag-selection"></div>
                </div>
                <div class="form-actions">
                    <button type="submit">保存</button>
                    <button type="button" onclick="closeItemDialog()">取消</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 绑定事件
    document.getElementById('media-type').addEventListener('change', handleMediaTypeChange);
    document.getElementById('item-form').addEventListener('submit', handleItemSubmit);
    
    // 异步加载标签选择器
    await loadTagSelector();
}

function closeItemDialog() {
    const dialog = document.getElementById('item-dialog');
    if (dialog) {
        document.body.removeChild(dialog);
    }
}

function handleMediaTypeChange(e) {
    const fileGroup = document.getElementById('file-upload-group');
    if (e.target.value === 'text') {
        fileGroup.style.display = 'none';
    } else {
        fileGroup.style.display = 'block';
    }
}

async function handleItemSubmit(e) {
    e.preventDefault();
    
    const title = document.getElementById('item-title').value;
    const content = document.getElementById('item-content').value;
    const mediaType = document.getElementById('media-type').value;
    const fileInput = document.getElementById('item-file');
    const selectedTags = Array.from(document.querySelectorAll('#tag-selection input:checked'))
                              .map(cb => parseInt(cb.value));
    
    if (!title.trim()) {
        alert('请输入标题');
        return;
    }
    
    if (selectedTags.length === 0) {
        alert('请至少选择一个标签');
        return;
    }
    
    let mediaFile = null;
    
    // 如果有文件需要上传
    if (mediaType !== 'text' && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const uploadResult = await uploadFile(file);
        if (!uploadResult.success) {
            alert('文件上传失败');
            return;
        }
        mediaFile = uploadResult.filename;
    }
    
    // 创建条目
    try {
        const response = await fetch('/api/items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: title,
                content: content,
                media_type: mediaType,
                media_file: mediaFile,
                tag_ids: selectedTags
            })
        });
        
        if (response.ok) {
            closeItemDialog();
            filterItems(); // 刷新条目列表
            alert('条目创建成功');
        } else {
            const error = await response.json();
            alert(`创建条目失败: ${error.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('创建条目失败:', error);
        alert('创建条目失败: 网络错误');
    }
}

async function uploadFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        file_data: e.target.result,
                        filename: file.name
                    })
                });
                
                const result = await response.json();
                resolve(result);
            } catch (error) {
                console.error('文件上传失败:', error);
                resolve({ success: false, error: '文件上传失败' });
            }
        };
        reader.readAsDataURL(file);
    });
}

async function loadTagSelector() {
    const container = document.getElementById('tag-selection');
    const selectedTags = Array.from(document.querySelectorAll('.tag-node.selected'))
                              .map(el => parseInt(el.dataset.id));
    
    try {
        // 从后端获取所有标签
        const response = await fetch('/api/tags');
        const tags = await response.json();
        
        // 扁平化标签树，以便在选择器中显示
        const flattenedTags = [];
        function flattenTagTree(tag, prefix = '') {
            const displayName = prefix ? `${prefix} / ${tag.name}` : tag.name;
            flattenedTags.push({id: tag.id, name: displayName});
            
            if (tag.children && tag.children.length > 0) {
                tag.children.forEach(child => flattenTagTree(child, displayName));
            }
        }
        
        tags.forEach(tag => flattenTagTree(tag));
        
        let html = '';
        flattenedTags.forEach(tag => {
            const isSelected = selectedTags.includes(tag.id);
            html += `
                <label>
                    <input type="checkbox" value="${tag.id}" ${isSelected ? 'checked' : ''}>
                    ${tag.name}
                </label>
            `;
        });
        
        if (html === '') {
            html = '<p>暂无可用标签，请先添加标签</p>';
        }
        
        container.innerHTML = html;
    } catch (error) {
        console.error('加载标签选择器失败:', error);
        container.innerHTML = '<p>加载标签失败</p>';
    }
}
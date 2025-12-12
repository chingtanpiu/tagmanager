"""
Nexus Media Manager - 后端API服务器
使用Python标准库实现的HTTP服务器，提供RESTful API
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse
from typing import Dict, Any, Tuple, Optional
import data_store


class APIHandler(BaseHTTPRequestHandler):
    """API请求处理器"""
    
    def _set_headers(self, status_code: int = 200, content_type: str = 'application/json'):
        """设置响应头"""
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        # CORS头 - 允许前端跨域访问
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def _send_json(self, data: Any, status_code: int = 200):
        """发送JSON响应"""
        self._set_headers(status_code)
        response = json.dumps(data, ensure_ascii=False)
        self.wfile.write(response.encode('utf-8'))
    
    def _send_error_json(self, message: str, status_code: int = 400):
        """发送错误响应"""
        self._send_json({"error": message}, status_code)
    
    def _read_body(self) -> Optional[Dict[str, Any]]:
        """读取并解析请求体"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length)
                return json.loads(body.decode('utf-8'))
            return {}
        except Exception as e:
            print(f"Error reading body: {e}")
            return None
    
    def _parse_path(self) -> Tuple[str, Dict[str, str]]:
        """解析路径和查询参数"""
        parsed = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed.query)
        # 将列表值转为单个值
        params = {k: v[0] if v else '' for k, v in query_params.items()}
        return parsed.path, params
    
    def do_OPTIONS(self):
        """处理预检请求"""
        self._set_headers()
    
    def do_GET(self):
        """处理GET请求"""
        path, params = self._parse_path()
        
        if path == '/api/state':
            # 获取应用状态
            state = data_store.load_state()
            self._send_json(state)
        
        elif path == '/api/items':
            # 获取条目（支持筛选和搜索）
            state = data_store.load_state()
            
            # 获取筛选参数
            category_ids_str = params.get('categories', '')
            search_query = params.get('search', '')
            
            # 解析分类ID列表（逗号分隔）
            category_ids = [cid.strip() for cid in category_ids_str.split(',') if cid.strip()] if category_ids_str else None
            
            # 使用业务逻辑函数筛选条目
            filtered_items = data_store.filter_items(
                state['items'],
                state['categories'],
                category_ids,
                search_query if search_query else None
            )
            
            self._send_json(filtered_items)
        
        elif path == '/api/versions':
            # 获取版本历史
            versions = data_store.load_versions()
            self._send_json(versions)
        
        elif path == '/api/settings':
            # 获取设置
            settings = data_store.load_settings()
            self._send_json(settings)
        
        elif path == '/api/export':
            # 导出数据
            state = data_store.load_state()
            self._send_json(state)
        
        elif path == '/':
            # 健康检查
            self._send_json({"status": "ok", "message": "Nexus Vault API Server"})
        
        else:
            self._send_error_json("Not Found", 404)
    
    def do_POST(self):
        """处理POST请求"""
        path, params = self._parse_path()
        body = self._read_body()
        
        if body is None:
            self._send_error_json("Invalid JSON", 400)
            return
        
        if path == '/api/state':
            # 保存应用状态
            if data_store.save_state(body):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to save state", 500)
        
        elif path == '/api/categories':
            # 创建分类
            state = data_store.load_state()
            state['categories'].append(body)
            if data_store.save_state(state):
                self._send_json(body, 201)
            else:
                self._send_error_json("Failed to create category", 500)
        
        elif path == '/api/items':
            # 创建条目（带验证）
            state = data_store.load_state()
            
            # 验证条目名称
            item_type = body.get('type')
            if item_type in ['text', 'url']:
                item_name = body.get('content', '')
            else:
                item_name = body.get('fileName', '')
            
            # 使用业务逻辑函数验证
            error_msg = data_store.validate_item_name(
                state['items'],
                item_name,
                item_type
            )
            
            if error_msg:
                self._send_error_json(error_msg, 400)
                return
            
            # 扩展categoryIds以包含所有祖先分类
            if body.get('categoryIds'):
                original_ids = body['categoryIds'].copy()
                body['categoryIds'] = data_store.expand_category_ids(
                    body['categoryIds'],
                    state['categories']
                )
                print(f"DEBUG: Original categoryIds: {original_ids}")
                print(f"DEBUG: Expanded categoryIds: {body['categoryIds']}")
            
            # 验证通过，添加条目
            state['items'].insert(0, body)  # 添加到开头
            if data_store.save_state(state):
                self._send_json(body, 201)
            else:
                self._send_error_json("Failed to create item", 500)
        
        elif path == '/api/versions':
            # 创建版本快照
            label = body.get('label', 'Manual Save')
            state_data = body.get('state')
            if state_data:
                version = data_store.add_version(state_data, label)
                if version:
                    self._send_json(version, 201)
                else:
                    self._send_error_json("Failed to create version", 500)
            else:
                self._send_error_json("Missing state data", 400)
        
        elif path == '/api/import':
            # 导入数据
            if data_store.save_state(body):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to import data", 500)
        
        elif path == '/api/upload':
            # 文件上传（已在前端转为Base64）
            state = data_store.load_state()
            
            # 扩展categoryIds以包含所有祖先分类
            if body.get('categoryIds'):
                body['categoryIds'] = data_store.expand_category_ids(
                    body['categoryIds'],
                    state['categories']
                )
            
            state['items'].insert(0, body)
            if data_store.save_state(state):
                self._send_json(body, 201)
            else:
                self._send_error_json("Failed to upload file", 500)
        
        elif path == '/api/batch/add-tags':
            # 批量添加标签
            item_ids = body.get('itemIds', [])
            category_id = body.get('categoryId')
            
            if not item_ids or not category_id:
                self._send_error_json("Missing itemIds or categoryId", 400)
                return
            
            state = data_store.load_state()
            state['items'] = data_store.batch_add_tags(
                state['items'], 
                item_ids, 
                category_id,
                state['categories']  # 传入categories以支持祖先扩展
            )
            
            if data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to add tags", 500)
        
        elif path == '/api/batch/edit':
            # 批量编辑
            item_ids = body.get('itemIds', [])
            description = body.get('description')
            category_id = body.get('categoryId')
            
            if not item_ids:
                self._send_error_json("Missing itemIds", 400)
                return
            
            state = data_store.load_state()
            state['items'] = data_store.batch_edit(state['items'], item_ids, description, category_id)
            
            if data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to batch edit", 500)
        
        elif path == '/api/batch/delete':
            # 批量删除
            item_ids = body.get('itemIds', [])
            
            if not item_ids:
                self._send_error_json("Missing itemIds", 400)
                return
            
            state = data_store.load_state()
            state['items'] = data_store.batch_delete(state['items'], item_ids)
            
            if data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to batch delete", 500)
        
        elif path == '/api/batch/remove-categories':
            # 批量删除分类关联
            item_ids = body.get('itemIds', [])
            category_ids = body.get('categoryIds', [])
            
            if not item_ids or not category_ids:
                self._send_error_json("Missing itemIds or categoryIds", 400)
                return
            
            state = data_store.load_state()
            updated_items, error = data_store.batch_remove_categories(
                state['items'], item_ids, category_ids
            )
            
            if error:
                self._send_error_json(error, 400)
                return
            
            state['items'] = updated_items
            if data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to remove categories", 500)
        
        elif path == '/api/items/toggle-category':
            # Toggle分类关联（拖拽功能）
            item_ids = body.get('itemIds', [])
            category_id = body.get('categoryId')
            
            if not item_ids or not category_id:
                self._send_error_json("Missing itemIds or categoryId", 400)
                return
            
            state = data_store.load_state()
            state['items'] = data_store.toggle_category_association(
                state['items'],
                item_ids,
                category_id,
                state['categories']
            )
            
            if data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Failed to toggle category", 500)
        
        else:
            self._send_error_json("Not Found", 404)
    
    def do_PUT(self):
        """处理PUT请求"""
        path, params = self._parse_path()
        body = self._read_body()
        
        if body is None:
            self._send_error_json("Invalid JSON", 400)
            return
        
        # 解析路径中的ID
        parts = path.split('/')
        
        if path.startswith('/api/categories/') and len(parts) == 4:
            # 更新分类
            category_id = parts[3]
            state = data_store.load_state()
            updated = False
            for i, cat in enumerate(state['categories']):
                if cat['id'] == category_id:
                    state['categories'][i] = {**cat, **body}
                    updated = True
                    break
            
            if updated and data_store.save_state(state):
                self._send_json(state['categories'][i])
            else:
                self._send_error_json("Category not found or update failed", 404)
        
        elif path.startswith('/api/items/') and len(parts) == 4:
            # 更新条目（带验证）
            item_id = parts[3]
            state = data_store.load_state()
            
            # 验证条目名称
            item_type = body.get('type')
            if item_type in ['text', 'url']:
                item_name = body.get('content', '')
            else:
                item_name = body.get('fileName', '')
            
            # 使用业务逻辑函数验证（排除当前条目）
            error_msg = data_store.validate_item_name(
                state['items'],
                item_name,
                item_type,
                exclude_id=item_id
            )
            
            if error_msg:
                self._send_error_json(error_msg, 400)
                return
            
            # 验证通过，扩展categoryIds以包含所有祖先分类
            if body.get('categoryIds'):
                body['categoryIds'] = data_store.expand_category_ids(
                    body['categoryIds'],
                    state['categories']
                )
            
            # 更新条目
            updated = False
            updated_item = None
            for i, item in enumerate(state['items']):
                if item['id'] == item_id:
                    state['items'][i] = {**item, **body}
                    updated_item = state['items'][i]
                    updated = True
                    break
            
            if updated and data_store.save_state(state):
                self._send_json(updated_item)
            else:
                self._send_error_json("Item not found or update failed", 404)
        
        elif path.startswith('/api/items/') and path.endswith('/remove-category') and len(parts) == 5:
            # 删除条目的分类关联
            item_id = parts[3]
            category_id = body.get('categoryId')
            
            if not category_id:
                self._send_error_json("Missing categoryId", 400)
                return
            
            state = data_store.load_state()
            updated_items, error = data_store.remove_category_from_item(
                state['items'], item_id, category_id
            )
            
            if error:
                self._send_error_json(error, 400)
                return
            
            state['items'] = updated_items
            if data_store.save_state(state):
                # 返回更新后的条目
                updated_item = next((item for item in updated_items if item['id'] == item_id), None)
                self._send_json(updated_item)
            else:
                self._send_error_json("Failed to remove category", 500)
        
        elif path == '/api/settings':
            # 更新设置
            if data_store.save_settings(body):
                self._send_json(body)
            else:
                self._send_error_json("Failed to update settings", 500)
        
        else:
            self._send_error_json("Not Found", 404)
    
    def do_DELETE(self):
        """处理DELETE请求"""
        path, params = self._parse_path()
        parts = path.split('/')
        
        if path.startswith('/api/categories/') and len(parts) == 4:
            # 删除分类
            category_id = parts[3]
            state = data_store.load_state()
            original_count = len(state['categories'])
            state['categories'] = [c for c in state['categories'] if c['id'] != category_id]
            
            if len(state['categories']) < original_count and data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Category not found or delete failed", 404)
        
        elif path.startswith('/api/items/') and len(parts) == 4:
            # 删除条目
            item_id = parts[3]
            state = data_store.load_state()
            original_count = len(state['items'])
            state['items'] = [i for i in state['items'] if i['id'] != item_id]
            
            if len(state['items']) < original_count and data_store.save_state(state):
                self._send_json({"success": True})
            else:
                self._send_error_json("Item not found or delete failed", 404)
        
        elif path.startswith('/api/versions/') and len(parts) == 4:
            # 删除版本
            version_id = parts[3]
            if data_store.delete_version(version_id):
                self._send_json({"success": True})
            else:
                self._send_error_json("Version not found or delete failed", 404)
        
        else:
            self._send_error_json("Not Found", 404)
    
    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server(port: int = 8000):
    """启动服务器"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, APIHandler)
    print(f"=" * 60)
    print(f"Nexus Media Manager - 后端API服务器")
    print(f"=" * 60)
    print(f"服务器运行在: http://localhost:{port}")
    print(f"数据存储目录: {data_store.DATA_DIR}")
    print(f"按 Ctrl+C 停止服务器")
    print(f"=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n正在关闭服务器...")
        httpd.shutdown()
        print("服务器已停止")


if __name__ == '__main__':
    run_server()

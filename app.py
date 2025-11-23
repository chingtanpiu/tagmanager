import http.server
import socketserver
import json
import sqlite3
import os
import traceback

# 导入配置和日志模块
from config import SERVER_CONFIG, DATABASE_CONFIG, UPLOAD_CONFIG, TAG_CONFIG, ITEM_CONFIG, ERROR_MESSAGES, SUCCESS_MESSAGES
from logger import logger, log_operation, log_error, log_database_operation

class TagServer(http.server.SimpleHTTPRequestHandler):
    # 重写send_error方法以支持中文错误消息
    def send_error(self, code, message=None):
        """发送错误响应，支持中文消息"""
        self.error_message_format = "<html><head><title>Error</title></head><body><h1>%(code)d %(message)s</h1></body></html>"
        self.error_content_type = "text/html; charset=utf-8"
        
        # 使用英文占位符，实际消息通过JSON响应发送
        super().send_error(code, message="Error")
    def do_GET(self):
        if self.path == '/':
            self.serve_file('index.html')
        elif self.path.startswith('/api/tags'):
            self.handle_get_tags()
        elif self.path.startswith('/api/items'):
            self.handle_get_items()
        else:
            # 处理静态文件
            filename = self.path[1:]
            if os.path.exists(filename):
                self.serve_file(filename)
            else:
                self.send_error(404)
    
    def do_POST(self):
        if self.path == '/api/tags':
            self.handle_create_tag()
        elif self.path == '/api/items':
            self.handle_create_item()
        elif self.path == '/api/upload':
            self.handle_file_upload()
        else:
            self.send_error(404)
    
    def handle_delete_tag(self, tag_id):
        try:
            logger.info(f"开始删除标签：{tag_id}")
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            # 首先删除该标签与条目的关联
            cursor.execute('DELETE FROM item_tags WHERE tag_id = ?', (tag_id,))
            deleted_associations = cursor.rowcount
            
            # 然后删除该标签
            cursor.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
            deleted_tags = cursor.rowcount
            
            conn.commit()
            conn.close()
            
            logger.info(f"标签删除成功：删除了 {deleted_tags} 个标签，{deleted_associations} 个关联")
            
            self.send_json_response({'success': True})
            
        except Exception as e:
            logger.error(f"删除标签失败：{str(e)}\n{traceback.format_exc()}")
            self.send_error(500, ERROR_MESSAGES['DATABASE_ERROR'])
    
    def handle_delete_items(self):
        """删除条目（带事务删除）"""
        conn = None
        cursor = None
        
        try:
            logger.info("开始删除条目")
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            item_ids = data.get('item_ids', [])
            
            if not item_ids:
                logger.warning("删除条目失败：未提供条目ID")
                self.send_json_response({
                    'success': False,
                    'error': ERROR_MESSAGES['ITEM_IDS_REQUIRED']
                }, status=400)
                return
            
            # 验证item_ids是否为列表且包含有效ID
            if not isinstance(item_ids, list) or not all(isinstance(id, int) for id in item_ids):
                logger.warning(f"删除条目失败：无效的条目ID格式 - {item_ids}")
                self.send_json_response({
                    'success': False,
                    'error': ERROR_MESSAGES['INVALID_ITEM_IDS_FORMAT']
                }, status=400)
                return
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            # 开始事务
            conn.execute('BEGIN TRANSACTION')
            
            # 先查询需要删除的条目信息
            placeholders = ','.join('?' * len(item_ids))
            cursor.execute(f'SELECT id, title FROM items WHERE id IN ({placeholders})', item_ids)
            items_to_delete = cursor.fetchall()
            
            logger.info(f"准备删除条目：{item_ids}，找到 {len(items_to_delete)} 个条目")
            
            # 记录数据库操作
            for item_id, title in items_to_delete:
                log_database_operation('DELETE', 'items', item_id, {'title': title}, None)
            
            # 删除指定的条目与标签的关联
            cursor.execute(f'DELETE FROM item_tags WHERE item_id IN ({placeholders})', item_ids)
            deleted_tags_count = cursor.rowcount
            logger.info(f"删除条目标签关联：{deleted_tags_count} 条记录")
            
            # 删除指定的条目
            cursor.execute(f'DELETE FROM items WHERE id IN ({placeholders})', item_ids)
            deleted_items_count = cursor.rowcount
            logger.info(f"删除条目：{deleted_items_count} 条记录")
            
            conn.commit()
            
            logger.info(f"条目删除成功：删除了 {deleted_items_count} 个条目，{deleted_tags_count} 个标签关联")
            
            self.send_json_response({
                'success': True,
                'message': f'成功删除 {deleted_items_count} 个条目',
                'data': {
                    'deleted_items': deleted_items_count,
                    'deleted_tags_associations': deleted_tags_count
                }
            })
            
        except json.JSONDecodeError as e:
            logger.error(f"删除条目失败：JSON解析错误 - {str(e)}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['INVALID_JSON']
            }, status=400)
        except sqlite3.Error as e:
            logger.error(f"删除条目失败：数据库错误 - {str(e)}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['DATABASE_ERROR']
            }, status=500)
        except Exception as e:
            logger.error(f"删除条目失败：{str(e)}\n{traceback.format_exc()}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['INTERNAL_ERROR']
            }, status=500)
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    def handle_move_items(self):
        try:
            logger.info("开始移动条目到新标签")
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            item_ids = data.get('item_ids', [])
            target_tag_id = data.get('target_tag_id')
            
            if not item_ids or not target_tag_id:
                logger.warning(f"移动条目失败：缺少必要参数 - item_ids: {item_ids}, target_tag_id: {target_tag_id}")
                self.send_json_response({
                    'success': False,
                    'error': '缺少必要参数：item_ids 或 target_tag_id'
                }, status=400)
                return
            
            # 验证参数格式
            if not isinstance(item_ids, list) or not all(isinstance(id, int) for id in item_ids):
                logger.warning(f"移动条目失败：无效的条目ID格式 - {item_ids}")
                self.send_json_response({
                    'success': False,
                    'error': '条目ID格式无效'
                }, status=400)
                return
            
            if not isinstance(target_tag_id, int):
                logger.warning(f"移动条目失败：无效的目标标签ID格式 - {target_tag_id}")
                self.send_json_response({
                    'success': False,
                    'error': '目标标签ID格式无效'
                }, status=400)
                return
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            # 开始事务
            conn.execute('BEGIN TRANSACTION')
            
            # 先删除旧的关联
            placeholders = ','.join('?' * len(item_ids))
            cursor.execute(f'DELETE FROM item_tags WHERE item_id IN ({placeholders})', item_ids)
            deleted_associations = cursor.rowcount
            
            # 再插入新的关联
            for item_id in item_ids:
                cursor.execute('INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)', (item_id, target_tag_id))
            inserted_associations = cursor.rowcount
            
            conn.commit()
            conn.close()
            
            logger.info(f"条目移动成功：移动了 {len(item_ids)} 个条目，删除 {deleted_associations} 个旧关联，插入 {inserted_associations} 个新关联")
            
            self.send_json_response({
                'success': True,
                'message': f'成功移动 {len(item_ids)} 个条目到新标签',
                'data': {
                    'moved_items': len(item_ids),
                    'deleted_associations': deleted_associations,
                    'inserted_associations': inserted_associations
                }
            })
            
        except json.JSONDecodeError as e:
            logger.error(f"移动条目失败：JSON解析错误 - {str(e)}")
            self.send_json_response({
                'success': False,
                'error': '请求数据格式错误'
            }, status=400)
        except sqlite3.Error as e:
            logger.error(f"移动条目失败：数据库错误 - {str(e)}")
            # 回滚事务
            if 'conn' in locals():
                try:
                    conn.rollback()
                except:
                    pass
                conn.close()
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['DATABASE_ERROR']
            }, status=500)
        except Exception as e:
            logger.error(f"移动条目失败：{str(e)}\n{traceback.format_exc()}")
            # 回滚事务
            if 'conn' in locals():
                try:
                    conn.rollback()
                except:
                    pass
                conn.close()
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['INTERNAL_ERROR']
            }, status=500)

    def do_DELETE(self):
        if self.path.startswith('/api/tags/'):
            tag_id = self.path.split('/')[-1]
            self.handle_delete_tag(tag_id)
        elif self.path == '/api/items':
            self.handle_delete_items()
        else:
            self.send_error(404)
    
    def do_PATCH(self):
        if self.path == '/api/items/move':
            self.handle_move_items()
        else:
            self.send_error(404)
    
    def serve_file(self, filename):
        try:
            with open(filename, 'rb') as f:
                content = f.read()
            
            content_type = 'text/html'
            if filename.endswith('.css'):
                content_type = 'text/css'
            elif filename.endswith('.js'):
                content_type = 'application/javascript'
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404)
    
    def handle_get_tags(self):
        """获取所有标签"""
        conn = None
        cursor = None
        try:
            logger.info("开始获取标签列表")
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            cursor.execute('SELECT id, name, parent_id FROM tags')
            tags = cursor.fetchall()
            
            # 构建树形结构
            tag_dict = {tag[0]: {"id": tag[0], "name": tag[1], "parent_id": tag[2], "children": []} for tag in tags}
            
            root_tags = []
            for tag in tag_dict.values():
                if tag["parent_id"] is None:
                    root_tags.append(tag)
                else:
                    if tag["parent_id"] in tag_dict:
                        tag_dict[tag["parent_id"]]["children"].append(tag)
            
            logger.info(f"成功获取 {len(tags)} 个标签，其中 {len(root_tags)} 个顶级标签")
            
            self.send_json_response(root_tags)
            
        except sqlite3.Error as e:
            logger.error(f"获取标签列表失败：数据库错误 - {str(e)}")
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['DATABASE_ERROR']
            }, status=500)
        except Exception as e:
            logger.error(f"获取标签列表失败：{str(e)}\n{traceback.format_exc()}")
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['INTERNAL_ERROR']
            }, status=500)
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    def handle_get_items(self):
        """获取条目列表"""
        conn = None
        cursor = None
        try:
            logger.info("开始获取条目列表")
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            # 解析查询参数
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            tag_ids = query_params.get('tag_ids', [[]])[0].split(',') if query_params.get('tag_ids') else []
            
            # 根据是否有tag_ids参数构建SQL查询
            if tag_ids and len(tag_ids) > 0 and tag_ids[0] != '':
                # 确保所有tag_ids都是有效的整数
                tag_ids = [int(tag_id) for tag_id in tag_ids if tag_id.isdigit()]
                if tag_ids:
                    cursor.execute('''
                        SELECT i.id, i.title, i.content, i.media_type, i.version, i.created_at,
                               GROUP_CONCAT(t.name, ', ') as tags
                        FROM items i
                        JOIN item_tags it ON i.id = it.item_id
                        JOIN tags t ON it.tag_id = t.id
                        WHERE t.id IN ({})
                        GROUP BY i.id
                        HAVING COUNT(DISTINCT t.id) = {}
                        ORDER BY i.created_at DESC
                    '''.format(','.join('?' * len(tag_ids)), len(tag_ids)), tag_ids)
                else:
                    cursor.execute('''
                        SELECT i.id, i.title, i.content, i.media_type, i.version, i.created_at,
                               GROUP_CONCAT(t.name, ', ') as tags
                        FROM items i
                        LEFT JOIN item_tags it ON i.id = it.item_id
                        LEFT JOIN tags t ON it.tag_id = t.id
                        GROUP BY i.id
                        ORDER BY i.created_at DESC
                    ''')
            else:
                # 没有tag_ids参数时，返回所有条目
                cursor.execute('''
                    SELECT i.id, i.title, i.content, i.media_type, i.version, i.created_at,
                           GROUP_CONCAT(t.name, ', ') as tags
                    FROM items i
                    LEFT JOIN item_tags it ON i.id = it.item_id
                    LEFT JOIN tags t ON it.tag_id = t.id
                    GROUP BY i.id
                    ORDER BY i.created_at DESC
                ''')
            
            items = []
            for row in cursor.fetchall():
                items.append({
                    'id': row[0],
                    'title': row[1],
                    'content': row[2],
                    'media_type': row[3],
                    'version': row[4],
                    'created_at': row[5],
                    'tags': row[6] if row[6] else ''
                })
            
            logger.info(f"成功获取 {len(items)} 个条目")
            
            # 使用统一的响应格式
            self.send_json_response(items)
        except Exception as e:
            logger.error(f"获取条目列表失败：{str(e)}\n{traceback.format_exc()}")
            self.send_json_response({'success': False, 'error': ERROR_MESSAGES['DATABASE_ERROR']}, 500)
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    def handle_create_tag(self):
        """创建新标签"""
        conn = None
        cursor = None
        try:
            logger.info("开始创建新标签")
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            name = data.get('name', '').strip()
            parent_id = data.get('parent_id')
            
            # 验证标签名称
            if not name:
                logger.warning(f"创建标签失败：标签名称为空")
                self.send_json_response({
                    'success': False,
                    'error': ERROR_MESSAGES['TAG_NAME_EMPTY']
                }, status=400)
                return
            
            if len(name) > TAG_CONFIG['MAX_NAME_LENGTH']:
                logger.warning(f"创建标签失败：标签名称过长 - {name}")
                self.send_json_response({
                    'success': False,
                    'error': ERROR_MESSAGES['TAG_NAME_TOO_LONG']
                }, status=400)
                return
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            # 检查标签名称是否已存在
            cursor.execute('SELECT id FROM tags WHERE name = ?', (name,))
            existing_tag = cursor.fetchone()
            if existing_tag:
                logger.warning(f"创建标签失败：标签名称已存在 - {name}")
                self.send_json_response({
                    'success': False,
                    'error': ERROR_MESSAGES['TAG_NAME_DUPLICATE']
                }, status=400)
                return
            
            # 检查父标签是否存在
            if parent_id:
                cursor.execute('SELECT id FROM tags WHERE id = ?', (parent_id,))
                parent_tag = cursor.fetchone()
                if not parent_tag:
                    logger.warning(f"创建标签失败：父标签不存在 - parent_id: {parent_id}")
                    self.send_json_response({
                        'success': False,
                        'error': ERROR_MESSAGES['TAG_PARENT_NOT_FOUND']
                    }, status=400)
                    return
            
            # 开始事务
            conn.execute('BEGIN TRANSACTION')
            
            cursor.execute('INSERT INTO tags (name, parent_id) VALUES (?, ?)', (name, parent_id))
            tag_id = cursor.lastrowid
            
            # 记录数据库操作
            log_database_operation('CREATE', 'tags', tag_id, None, {'name': name, 'parent_id': parent_id})
            
            conn.commit()
            
            logger.info(f"标签创建成功：{name} (ID: {tag_id})")
            
            response_data = {
                "success": True,
                "message": SUCCESS_MESSAGES['TAG_CREATED'],
                "data": {"id": tag_id, "name": name, "parent_id": parent_id}
            }
            self.send_json_response(response_data, status=201)
            
        except json.JSONDecodeError as e:
            logger.error(f"创建标签失败：JSON解析错误 - {str(e)}")
            if conn:
                conn.rollback()
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['INVALID_JSON']
            }, status=400)
        except sqlite3.Error as e:
            logger.error(f"创建标签失败：数据库错误 - {str(e)}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['DATABASE_ERROR']
            }, status=500)
        except Exception as e:
            logger.error(f"创建标签失败：{str(e)}\n{traceback.format_exc()}")
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES['INTERNAL_ERROR']
            }, status=500)
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    def handle_file_upload(self):
        """处理文件上传"""
        try:
            logger.info("开始处理文件上传")
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # 根据Content-Type决定处理方式
            content_type = self.headers.get('Content-Type', '')
            
            if 'application/json' in content_type:
                # 处理JSON格式上传（与script.js中的uploadFile函数匹配）
                try:
                    data = json.loads(post_data.decode('utf-8'))
                    file_data = data.get('file_data')
                    filename = data.get('filename')
                    
                    if not file_data or not filename:
                        logger.warning("文件上传失败：缺少file_data或filename参数")
                        self.send_json_response({
                            'success': False,
                            'error': ERROR_MESSAGES.get('MISSING_UPLOAD_PARAMS', '缺少必要的上传参数')
                        }, status=400)
                        return
                    
                    # 使用upload_handler模块处理文件保存
                    from upload_handler import save_uploaded_file
                    result = save_uploaded_file(file_data, filename)
                    
                    if result['success']:
                        # 返回成功响应
                        self.send_json_response({
                            'success': True,
                            'filename': result['filename'],
                            'original_name': result['original_name'],
                            'path': result['path'],
                            'size': result['size']
                        })
                    else:
                        # 返回错误响应
                        self.send_json_response({
                            'success': False,
                            'error': result['error']
                        }, status=400)
                        return
                        
                except json.JSONDecodeError as e:
                    logger.error(f"文件上传失败：JSON格式错误 - {str(e)}")
                    self.send_json_response({
                        'success': False,
                        'error': ERROR_MESSAGES.get('INVALID_JSON', '请求数据格式错误')
                    }, status=400)
                    return
            else:
                # 处理multipart/form-data格式上传（备用方式）
                logger.warning("收到非JSON格式的文件上传请求，推荐使用JSON格式")
                self.send_json_response({
                    'success': False,
                    'error': "请使用JSON格式上传文件"
                }, status=415)
                return
                
        except ValueError as e:
            logger.error(f"文件上传参数错误：{str(e)}")
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES.get('INVALID_INPUT', '参数错误')
            }, status=400)
        except OSError as e:
            logger.error(f"文件系统错误：{str(e)}\n{traceback.format_exc()}")
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES.get('FILE_WRITE_ERROR', '文件保存失败')
            }, status=500)
        except Exception as e:
            logger.error(f"文件上传失败：{str(e)}\n{traceback.format_exc()}")
            self.send_json_response({
                'success': False,
                'error': ERROR_MESSAGES.get('FILE_UPLOAD_ERROR', '文件上传失败')
            }, status=500)
    
    def handle_create_item(self):
        """创建新条目"""
        try:
            logger.info("开始创建新条目")
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            title = data.get('title', '')
            content = data.get('content', '')
            media_type = data.get('media_type', 'text')
            tag_ids = data.get('tag_ids', [])
            
            # 输入验证
            if not title or not title.strip():
                logger.warning("创建条目失败：标题为空")
                self.send_json_response({'success': False, 'error': ERROR_MESSAGES['INVALID_INPUT'].format("标题")}, 400)
                return
            
            if len(title) > ITEM_CONFIG['MAX_TITLE_LENGTH']:
                logger.warning(f"创建条目失败：标题过长 - {len(title)} 字符")
                self.send_json_response({'success': False, 'error': f"标题长度不能超过 {ITEM_CONFIG['MAX_TITLE_LENGTH']} 个字符"}, 400)
                return
            
            if not media_type or media_type not in ITEM_CONFIG['ALLOWED_MEDIA_TYPES']:
                logger.warning(f"创建条目失败：无效的媒体类型 - {media_type}")
                self.send_json_response({'success': False, 'error': f"媒体类型必须是以下之一：{', '.join(ITEM_CONFIG['ALLOWED_MEDIA_TYPES'])}"}, 400)
                return
            
            # 验证标签ID
            if tag_ids and not isinstance(tag_ids, list):
                logger.warning("创建条目失败：标签ID格式错误")
                self.send_json_response({'success': False, 'error': "标签ID必须是数组格式"}, 400)
                return
            
            conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
            cursor = conn.cursor()
            
            try:
                # 开始事务
                conn.execute('BEGIN')
                
                # 验证标签是否存在
                if tag_ids:
                    cursor.execute('SELECT id FROM tags WHERE id IN ({})'.format(','.join('?' * len(tag_ids))), tag_ids)
                    existing_tags = cursor.fetchall()
                    if len(existing_tags) != len(tag_ids):
                        logger.warning(f"创建条目失败：部分标签不存在 - 请求标签: {tag_ids}, 存在标签: {[t[0] for t in existing_tags]}")
                        conn.rollback()
                        self.send_json_response({'success': False, 'error': "部分标签不存在"}, 400)
                        return
                
                # 检查是否存在标题重复的条目
                cursor.execute('''
                    SELECT id FROM items 
                    WHERE title = ?
                ''', (title.strip(),))
                
                existing_item = cursor.fetchone()
                if existing_item:
                    logger.warning(f"创建条目失败：标题重复 - 标题: {title}")
                    conn.rollback()
                    self.send_json_response({'success': False, 'error': ERROR_MESSAGES['ITEM_DUPLICATE']}, 400)
                    return
                
                # 创建条目
                cursor.execute('''
                    INSERT INTO items (title, content, media_type, version, created_at)
                    VALUES (?, ?, ?, 1, datetime('now'))
                ''', (title.strip(), content.strip() if content else '', media_type))
                
                item_id = cursor.lastrowid
                logger.info(f"成功创建条目：{title} (ID: {item_id})")
                
                # 添加标签关联
                if tag_ids:
                    for tag_id in tag_ids:
                        cursor.execute('''
                            INSERT INTO item_tags (item_id, tag_id)
                            VALUES (?, ?)
                        ''', (item_id, tag_id))
                    logger.info(f"为条目 {item_id} 添加标签：{tag_ids}")
                
                # 提交事务
                conn.commit()
                logger.info(f"条目创建完成：{title} (ID: {item_id})")
                
                # 返回与前端filterItems期望的格式一致的响应
                self.send_json_response({'success': True, 'item_id': item_id}, 201)
                
            except Exception as e:
                    conn.rollback()
                    logger.error(f"创建条目事务失败：{str(e)}\n{traceback.format_exc()}")
                    self.send_json_response({'success': False, 'error': ERROR_MESSAGES['DATABASE_ERROR']}, 500)
                    return
            finally:
                conn.close()
                
        except json.JSONDecodeError as e:
            logger.error(f"创建条目失败：JSON解析错误 - {str(e)}")
            self.send_json_response({'success': False, 'error': ERROR_MESSAGES['JSON_PARSE_ERROR']}, 400)
        except ValueError as e:
            logger.error(f"创建条目参数错误：{str(e)}")
            self.send_json_response({'success': False, 'error': ERROR_MESSAGES['INVALID_INPUT'].format("参数")}, 400)
        except Exception as e:
            logger.error(f"创建条目失败：{str(e)}\n{traceback.format_exc()}")
            self.send_json_response({'success': False, 'error': ERROR_MESSAGES['DATABASE_ERROR']}, 500)
    
    def send_json_response(self, data, status=200):
        json_data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(json_data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json_data)

def init_db():
    """初始化数据库"""
    logger.info("开始初始化数据库")
    conn = sqlite3.connect(DATABASE_CONFIG['PATH'])
    cursor = conn.cursor()
    
    # 创建标签表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER,
            FOREIGN KEY (parent_id) REFERENCES tags (id)
        )
    ''')
    
    # 创建条目表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            media_type TEXT,
            version INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 创建条目标签关联表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS item_tags (
            item_id INTEGER,
            tag_id INTEGER,
            FOREIGN KEY (item_id) REFERENCES items (id),
            FOREIGN KEY (tag_id) REFERENCES tags (id),
            PRIMARY KEY (item_id, tag_id)
        )
    ''')
    
    # 创建版本历史表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS version_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            record_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            old_data TEXT,
            new_data TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("数据库初始化完成")

if __name__ == '__main__':
    logger.info("启动标签管理系统服务器")
    
    try:
        init_db()
        logger.info(f"服务器将在 {SERVER_CONFIG['HOST']}:{SERVER_CONFIG['PORT']} 启动")
        
        with socketserver.TCPServer(("", SERVER_CONFIG['PORT']), TagServer) as httpd:
            logger.info(f"服务器运行在 http://localhost:{SERVER_CONFIG['PORT']}")
            logger.info("按 Ctrl+C 停止服务器")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                logger.info("服务器正在停止...")
                print("\n服务器已停止")
                logger.info("服务器已停止")
    except Exception as e:
        logger.error(f"服务器启动失败：{str(e)}\n{traceback.format_exc()}")
        print(f"服务器启动失败：{str(e)}")
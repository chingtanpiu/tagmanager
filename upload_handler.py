import os
import base64
from datetime import datetime

# 导入配置和日志模块
from config import UPLOAD_CONFIG, ERROR_MESSAGES
from logger import logger, log_operation, log_error

# 使用配置文件中的上传目录
UPLOAD_DIR = UPLOAD_CONFIG['DIRECTORY']

# 确保上传目录存在
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)
    logger.info(f"创建上传目录：{UPLOAD_DIR}")

def save_uploaded_file(file_data, filename):
    """保存上传的文件"""
    try:
        logger.info(f"开始处理文件上传：{filename}")
        
        # 验证文件名
        if not filename or not filename.strip():
            logger.warning("文件上传失败：文件名为空")
            return {
                'success': False,
                'error': ERROR_MESSAGES.get('FILE_NAME_EMPTY', '文件名为空')
            }
        
        # 生成唯一文件名
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        name, ext = os.path.splitext(filename)
        
        # 验证文件扩展名
        if ext and ext.lower() not in UPLOAD_CONFIG['ALLOWED_EXTENSIONS']:
            logger.warning(f"文件上传失败：不支持的文件扩展名 - {ext}")
            return {
                'success': False,
                'error': ERROR_MESSAGES.get('FILE_EXTENSION_NOT_ALLOWED', '不支持的文件类型')
            }
        
        unique_filename = f"{name}_{timestamp}{ext}"
        filepath = os.path.join(UPLOAD_DIR, unique_filename)
        
        try:
            # 解码base64数据
            if ',' in file_data:
                # 处理data URL格式
                header, data = file_data.split(',', 1)
                file_content = base64.b64decode(data)
            else:
                # 处理纯base64数据
                file_content = base64.b64decode(file_data)
            
            # 验证文件大小
            if len(file_content) > UPLOAD_CONFIG['MAX_FILE_SIZE']:
                logger.warning(f"文件上传失败：文件大小超过限制 - {len(file_content)} 字节")
                return {
                    'success': False,
                    'error': ERROR_MESSAGES.get('FILE_TOO_LARGE', f'文件大小不能超过{UPLOAD_CONFIG["MAX_FILE_SIZE"] / 1024 / 1024:.1f}MB')
                }
            
            # 保存文件
            with open(filepath, 'wb') as f:
                f.write(file_content)
            
            file_size = len(file_content)
            logger.info(f"文件上传成功：{unique_filename} ({file_size} 字节)")
            
            return {
                'success': True,
                'filename': unique_filename,
                'original_name': filename,
                'path': filepath,
                'size': file_size
            }
        except base64.binascii.Error as e:
            logger.error(f"文件上传失败：Base64解码错误 - {str(e)}")
            return {
                'success': False,
                'error': ERROR_MESSAGES.get('INVALID_FILE_DATA', '无效的文件数据')
            }
        except OSError as e:
            logger.error(f"文件上传失败：文件写入错误 - {str(e)}")
            return {
                'success': False,
                'error': ERROR_MESSAGES.get('FILE_WRITE_ERROR', '文件保存失败')
            }
    except Exception as e:
        logger.error(f"文件上传失败：未知错误 - {str(e)}")
        return {
            'success': False,
            'error': ERROR_MESSAGES.get('FILE_UPLOAD_ERROR', '文件上传失败')
        }

def get_file_info(filename):
    """获取文件信息"""
    try:
        logger.info(f"获取文件信息：{filename}")
        filepath = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(filepath):
            stat = os.stat(filepath)
            file_info = {
                'filename': filename,
                'size': stat.st_size,
                'created': datetime.fromtimestamp(stat.st_ctime).isoformat()
            }
            logger.info(f"成功获取文件信息：{filename}")
            return file_info
        logger.warning(f"文件不存在：{filename}")
        return None
    except Exception as e:
        logger.error(f"获取文件信息失败：{str(e)}")
        return None

def delete_file(filename):
    """删除文件"""
    try:
        logger.info(f"尝试删除文件：{filename}")
        filepath = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"文件删除成功：{filename}")
            return True
        logger.warning(f"文件不存在，无需删除：{filename}")
        return False
    except OSError as e:
        logger.error(f"文件删除失败：{filename} - {str(e)}")
        return False
    except Exception as e:
        logger.error(f"文件删除过程中发生未知错误：{filename} - {str(e)}")
        return False
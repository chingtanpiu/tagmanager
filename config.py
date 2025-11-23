"""
系统配置文件
集中管理所有配置项，避免硬编码
"""

import os

# 服务器配置
SERVER_CONFIG = {
    'PORT': int(os.environ.get('SERVER_PORT', 8080)),
    'HOST': os.environ.get('SERVER_HOST', 'localhost'),
    'DEBUG': os.environ.get('DEBUG', 'False').lower() == 'true'
}

# 数据库配置
DATABASE_CONFIG = {
    'NAME': os.environ.get('DATABASE_NAME', 'tags.db'),
    'PATH': os.path.join(os.path.dirname(__file__), os.environ.get('DATABASE_NAME', 'tags.db'))
}

# 文件上传配置
UPLOAD_CONFIG = {
    'DIRECTORY': os.environ.get('UPLOAD_DIR', 'uploads'),
    'MAX_FILE_SIZE': int(os.environ.get('MAX_FILE_SIZE', 10 * 1024 * 1024)),  # 10MB
    'ALLOWED_EXTENSIONS': ['.jpg', '.jpeg', '.png', '.gif', '.mp3', '.mp4', '.wav', '.pdf', '.txt', '.doc', '.docx']
}

# 日志配置
LOGGING_CONFIG = {
    'LEVEL': os.environ.get('LOG_LEVEL', 'INFO'),
    'FORMAT': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    'FILE': os.environ.get('LOG_FILE', 'app.log'),
    'MAX_BYTES': int(os.environ.get('LOG_MAX_BYTES', 10 * 1024 * 1024)),  # 10MB
    'BACKUP_COUNT': int(os.environ.get('LOG_BACKUP_COUNT', 5))
}

# 标签配置
TAG_CONFIG = {
    'MAX_NAME_LENGTH': int(os.environ.get('TAG_MAX_NAME_LENGTH', 50)),
    'MIN_NAME_LENGTH': int(os.environ.get('TAG_MIN_NAME_LENGTH', 1)),
    'ALLOW_EMPTY': os.environ.get('TAG_ALLOW_EMPTY', 'False').lower() == 'true'
}

# 条目配置
ITEM_CONFIG = {
    'MAX_TITLE_LENGTH': int(os.environ.get('ITEM_MAX_TITLE_LENGTH', 100)),
    'MIN_TITLE_LENGTH': int(os.environ.get('ITEM_MIN_TITLE_LENGTH', 1)),
    'MAX_CONTENT_LENGTH': int(os.environ.get('ITEM_MAX_CONTENT_LENGTH', 10000)),
    'ALLOW_EMPTY_TITLE': os.environ.get('ITEM_ALLOW_EMPTY_TITLE', 'False').lower() == 'true',
    'ALLOWED_MEDIA_TYPES': ['text', 'image', 'video', 'audio', 'document']
}

# 错误消息配置
ERROR_MESSAGES = {
    'TAG_NAME_EMPTY': '标签名称不能为空',
    'TAG_NAME_TOO_LONG': '标签名称长度不能超过{}个字符'.format(TAG_CONFIG['MAX_NAME_LENGTH']),
    'TAG_NAME_DUPLICATE': '标签名称已存在',
    'TAG_NOT_FOUND': '标签不存在',
    'TAG_PARENT_NOT_FOUND': '父标签不存在',
    'ITEM_NOT_FOUND': '条目不存在',
    'ITEM_IDS_REQUIRED': '未提供条目ID',
    'INVALID_ITEM_IDS_FORMAT': '条目ID格式无效',
    'INVALID_REQUEST': '请求参数无效',
    'INVALID_JSON': '请求数据格式错误',
    'FILE_UPLOAD_ERROR': '文件上传失败',
    'MISSING_UPLOAD_PARAMS': '缺少必要的文件上传参数',
    'INVALID_FILE_TYPE': '不支持的文件类型',
    'FILE_TOO_LARGE': '文件大小超过限制（最大{}MB）'.format(UPLOAD_CONFIG['MAX_FILE_SIZE'] // (1024 * 1024)),
    'FILE_SAVE_ERROR': '文件保存失败',
    'INVALID_FILENAME': '无效的文件名',
    'INVALID_FILE_DATA': '无效的文件数据',
    'FILE_NOT_FOUND': '文件不存在',
    'INVALID_INPUT': '参数错误',
    'DATABASE_ERROR': '数据库操作失败',
    'INTERNAL_ERROR': '服务器内部错误',
    'ITEM_DUPLICATE': '该条目已存在，请勿重复添加'
}

# 成功消息配置
SUCCESS_MESSAGES = {
    'TAG_CREATED': '标签创建成功',
    'TAG_UPDATED': '标签更新成功',
    'TAG_DELETED': '标签删除成功',
    'ITEM_CREATED': '条目创建成功',
    'ITEM_UPDATED': '条目更新成功',
    'ITEM_DELETED': '条目删除成功',
    'FILE_UPLOADED': '文件上传成功'
}
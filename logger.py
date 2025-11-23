"""
日志模块
提供统一的日志记录功能
"""

import logging
import logging.handlers
import os
from config import LOGGING_CONFIG

def setup_logger(name=None):
    """设置日志记录器"""
    logger = logging.getLogger(name or __name__)
    
    # 如果已经设置过handler，直接返回
    if logger.handlers:
        return logger
    
    # 设置日志级别
    logger.setLevel(getattr(logging, LOGGING_CONFIG['LEVEL'].upper()))
    
    # 创建日志目录
    log_dir = os.path.dirname(LOGGING_CONFIG['FILE'])
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # 创建文件处理器（支持日志轮转）
    file_handler = logging.handlers.RotatingFileHandler(
        LOGGING_CONFIG['FILE'],
        maxBytes=LOGGING_CONFIG['MAX_BYTES'],
        backupCount=LOGGING_CONFIG['BACKUP_COUNT'],
        encoding='utf-8'
    )
    
    # 创建控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # 设置日志格式
    formatter = logging.Formatter(LOGGING_CONFIG['FORMAT'])
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    # 添加处理器到日志记录器
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

# 创建全局日志记录器
logger = setup_logger()

def log_operation(operation, user_id=None, details=None, level='info'):
    """记录操作日志"""
    log_data = {
        'operation': operation,
        'user_id': user_id,
        'details': details
    }
    
    log_func = getattr(logger, level.lower())
    log_func(f"Operation: {operation}, Data: {log_data}")

def log_error(error_type, error_message, stack_trace=None):
    """记录错误日志"""
    logger.error(f"Error Type: {error_type}, Message: {error_message}")
    if stack_trace:
        logger.error(f"Stack Trace: {stack_trace}")

def log_database_operation(operation, table, record_id=None, old_data=None, new_data=None):
    """记录数据库操作"""
    logger.info(f"Database Operation: {operation}")
    logger.info(f"Table: {table}, Record ID: {record_id}")
    if old_data:
        logger.info(f"Old Data: {old_data}")
    if new_data:
        logger.info(f"New Data: {new_data}")
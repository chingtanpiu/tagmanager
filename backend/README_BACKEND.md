# Nexus Media Manager - 后端服务器

## 简介

使用Python标准库实现的HTTP API服务器，为Nexus Media Manager提供数据持久化服务。

## 启动方式

```bash
# 进入项目目录
cd c:\Users\cheng\Desktop\3

# 启动后端服务器
python backend/server.py
```

服务器将在 `http://localhost:8000` 上运行。

## API端点

### 应用状态
- `GET /api/state` - 获取应用状态（分类、条目、选中的分类）
- `POST /api/state` - 保存应用状态

### 分类管理
- `POST /api/categories` - 创建分类
- `PUT /api/categories/{id}` - 更新分类
- `DELETE /api/categories/{id}` - 删除分类

### 条目管理
- `POST /api/items` - 创建条目
- `PUT /api/items/{id}` - 更新条目
- `DELETE /api/items/{id}` - 删除条目
- `POST /api/upload` - 上传文件（Base64编码）

### 版本控制
- `GET /api/versions` - 获取版本历史
- `POST /api/versions` - 创建版本快照
- `DELETE /api/versions/{id}` - 删除版本

### 设置
- `GET /api/settings` - 获取设置
- `PUT /api/settings` - 更新设置

### 数据导入导出
- `GET /api/export` - 导出数据（JSON格式）
- `POST /api/import` - 导入数据

## 数据存储

所有数据存储在 `backend/data/` 目录下：
- `data.json` - 应用状态（分类和条目）
- `versions.json` - 版本历史
- `settings.json` - 应用设置

## 技术特性

- ✅ 使用Python标准库，无需安装第三方依赖
- ✅ RESTful API设计
- ✅ CORS支持，允许前端跨域访问
- ✅ 原子写入操作，确保数据安全
- ✅ JSON文件存储，易于备份和迁移

## 系统要求

- Python 3.7+

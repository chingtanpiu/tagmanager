# 📚 Nexus Media Manager

一个现代化的媒体内容管理应用，支持多种媒体类型的组织、分类和版本控制。

## ✨ 功能特性

### 📁 媒体管理
- **多类型支持**: 文本、URL、图片、视频、音频、文档
- **拖拽上传**: 支持文件拖拽到指定分类
- **批量操作**: 批量添加标签、批量编辑描述
- **智能搜索**: 支持按内容、文件名、描述搜索

### 🏷️ 分类系统
- **树形结构**: 支持多级分类和子分类
- **灵活组织**: 一个条目可以属于多个分类
- **分类筛选**: 支持多选分类进行交集筛选

### 🔄 版本控制
- **自动保存**: 可配置的自动保存间隔（1-30分钟）
- **版本历史**: 完整的版本历史记录
- **版本预览**: 预览历史版本而不影响当前数据
- **版本恢复**: 一键恢复到任意历史版本
- **当前版本标识**: 清晰的当前版本指示器

### 🎨 界面特性
- **响应式设计**: 适配桌面端和移动端
- **现代UI**: 深色主题，玻璃态效果
- **流畅动画**: 优雅的过渡效果和交互反馈
- **键盘友好**: 支持键盘快捷键操作

## 🚀 快速开始

### 环境要求
- **前端**: Node.js 18+ 
- **后端**: Python 3.7+
- npm 或 yarn

### 安装运行

> [!IMPORTANT]
> 本项目采用前后端分离架构，需要**同时启动后端和前端服务器**才能正常使用。

```bash
# 克隆项目
git clone <your-repo-url>
cd 3

# 安装前端依赖
npm install
```

**步骤1：启动后端服务器**（终端1）
```bash
# 进入项目目录
cd c:\Users\cheng\Desktop\3

# 启动Python后端
python backend/server.py
```
后端将在 `http://localhost:8000` 上运行

**步骤2：启动前端开发服务器**（终端2）
```bash
# 在另一个终端窗口
cd c:\Users\cheng\Desktop\3

# 启动前端
npm run dev
```
前端将在 `http://localhost:5173` 上运行

### 构建部署
```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## 📋 使用说明

### 基本操作
1. **添加分类**: 点击左侧"+"按钮创建新分类
2. **添加条目**: 点击右上角"添加条目"按钮
3. **文件上传**: 支持拖拽文件到分类区域
4. **搜索筛选**: 使用顶部搜索框或分类选择

### 版本管理
1. **手动保存**: 在设置中点击"立即创建版本快照"
2. **查看历史**: 点击"查看历史版本"进入版本列表
3. **预览版本**: 点击"预览"查看历史版本内容
4. **恢复版本**: 点击"恢复"将数据回滚到指定版本

### 批量操作
1. **选择模式**: 点击选择模式按钮进入批量选择
2. **多选条目**: 勾选需要操作的条目
3. **批量标签**: 为选中的条目添加分类标签
4. **批量编辑**: 统一修改描述或追加标签

## 🛠️ 技术栈

### 前端
- **框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **样式方案**: Tailwind CSS + 自定义CSS变量
- **图标库**: Lucide React
- **状态管理**: React Hooks + useState/useEffect
- **HTTP客户端**: Fetch API

### 后端
- **语言**: Python 3.7+
- **HTTP服务器**: http.server (标准库)
- **数据存储**: JSON文件
- **API设计**: RESTful API
- **特性**: 无第三方依赖，纯标准库实现

## 📁 项目结构

```
3/
├── backend/            # Python后端
│   ├── server.py       # HTTP服务器和API路由
│   ├── data_store.py   # 数据持久化模块
│   ├── data/           # JSON数据存储目录
│   └── README_BACKEND.md
├── components/         # React组件
│   ├── Button.tsx      # 按钮组件
│   ├── CategoryTree.tsx # 分类树组件
│   └── MediaCard.tsx   # 媒体卡片组件
├── utils/              # 工具函数
│   ├── api.ts          # API客户端
│   └── storage.ts      # 本地工具函数
├── types.ts            # TypeScript类型定义
├── App.tsx             # 主应用组件
├── index.tsx           # 应用入口
└── index.html          # HTML模板
```

## ⚙️ 配置选项

### 自动保存配置
- 关闭自动保存
- 每1分钟
- 每5分钟  
- 每15分钟
- 每30分钟

### 版本控制
- 最大版本数量限制
- 版本标签自定义
- 版本大小显示

## 🔧 开发指南

### 代码规范
- 使用TypeScript进行类型检查
- 遵循React Hooks最佳实践
- 组件化开发，保持单一职责

### 状态管理
- 使用React内置Hooks管理状态
- 复杂状态使用useReducer优化
- 避免不必要的重渲染

### 性能优化
- 使用useMemo优化计算密集型操作
- 实现虚拟滚动处理大量数据
- 图片懒加载和压缩处理

## 📱 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

## 📝 许可证

此项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如遇到问题或有功能建议，请在 Issues 中提交反馈。

---

**享受使用 Nexus Media Manager 管理您的媒体内容！** 📸🎬🎵

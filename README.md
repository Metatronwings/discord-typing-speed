# discord-typing-speed

Discord (Vencord) 插件，发送消息时在末尾自动附加打字统计，模仿大模型输出风格。

效果示例：

```
你好，这是一条测试消息
-# ⌨️ Out: 12t | Time: 4.32s | 2.8 t/s | TTFT: 1.10s
```

| 字段 | 含义 |
|------|------|
| `Out` | 消息字符数 |
| `Time` | 从开始打字到发送的时长 |
| `t/s` | 打字速度（字符/秒） |
| `TTFT` | 聚焦输入框到开始打字的延迟（Time to First Token） |

## 安装

需要自己 build Vencord 源码。

### 1. 环境准备

```bash
npm install -g pnpm
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install
```

### 2. 放入插件

```bash
mkdir -p src/userplugins/typingSpeed
cp /path/to/discord-typing-speed/index.ts src/userplugins/typingSpeed/index.ts
```

### 3. Build

```bash
pnpm buildWeb
```

产物在 `dist/chromium-unpacked/`（Chrome）或 `dist/firefox-unpacked/`（Firefox）。

### 4. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择 `dist/chromium-unpacked/` 目录

WSL 用户可以直接填路径：
```
\\wsl$\Debian\home\<user>\Vencord\dist\chromium-unpacked
```

### 5. 启用插件

打开 Discord 网页版 → Vencord 设置 → Plugins → 搜索 `TypingSpeed` → 开启。

## 更新插件

修改 `index.ts` 后：

```bash
cp index.ts ~/Vencord/src/userplugins/typingSpeed/index.ts
cd ~/Vencord && pnpm buildWeb
```

然后在 `chrome://extensions/` 点击刷新按钮，再硬刷新 Discord（`Ctrl+Shift+R`）。

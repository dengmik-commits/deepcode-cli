# feat: markdown 表格闭合边框渲染 + CJK/emoji 宽度适配

## 概述

当前深 code-cli 的 markdown 表格仅原样输出 `| col1 | col2 |` 分隔符，排版简陋、宽度溢出时自动被 Ink 断行导致错乱。本次改动增加了闭合边框表格渲染、CJK 宽字符和 emoji 视觉宽度计算、单元格内自动换行，以及表格与普通文本分离渲染。

## 效果

![表格渲染效果](Screenshot%202026-05-23%20195028.png)

## 变更

### `src/ui/components/MessageView/markdown.ts`

- 新增 `visualWidth(text)` — 按终端列宽计算字符视觉宽度（CJK 字符、全角、emoji = 2 列，ASCII = 1 列）
- 新增 `splitTableBlocks(text)` — 从文本中检测和解析 markdown 表格（`| col | col |` + `---|---`）
- 新增 `renderTableBorder(rows, maxWidth)` — 渲染闭合边框表格：
  - 基于视觉宽度的列宽计算
  - 列宽分配：窄列（`#`、状态、评论、日期）优先压缩，内容列保有最少 12 字符
  - 单元格内逐字符自动换行，满格时在最后一个空格处截断
- 新增 `renderMarkdownSegments(text, maxWidth)` — 将文本拆分为 `text`/`table`/`code` 分段
- `renderMarkdown()` 委托给 `renderMarkdownSegments()`（向后兼容）

### `src/ui/components/MessageView/index.tsx`

- 内容渲染改用 `renderMarkdownSegments()` 返回的分段数组
- **表格** 用 `<Text wrap="truncate-end">` 渲染，彻底杜绝 Ink 在单元格空格处断行
- **普通文本** 用 `<Text>` 默认 wrap，保持正常折行

### `src/ui/index.ts`

- 导出 `renderMarkdownSegments`

## 验证

```
npm run typecheck    # ✅ 零错误
npm run bundle       # ✅ dist/cli.js
```

启动 deepcode-cli，让 LLM 输出一个表格，确认：
1. 表格有闭合边框（┌─┬─┐）
2. 过长单元格自动折成多行
3. CJK 和 emoji 宽度正确，竖线对齐
4. 窄终端下表格自动等比压缩

export const SAMPLE_DOCUMENTS = [
  {
    title: "JavaScript 核心概念详解",
    cat: "JavaScript",
    source: "MDN 整理",
    content: `# JavaScript 核心概念

## 1. 变量提升（Hoisting）

JavaScript 引擎在执行代码前，会先将变量和函数声明提升到作用域顶部。

\`\`\`js
console.log(a); // undefined，而非报错
var a = 1;
\`\`\`

**let 和 const 不会被提升**，存在"暂时性死区"（TDZ）。

\`\`\`js
console.log(b); // ReferenceError
let b = 1;
\`\`\`

## 2. 闭包（Closure）

闭包是指"函数 + 其词法环境的引用"。内部函数即使在外层函数执行完毕后，仍能访问外层函数的变量。

\`\`\`js
function createCounter() {
  let count = 0;
  return function() {
    count++;
    return count;
  };
}
const counter = createCounter();
console.log(counter()); // 1
console.log(counter()); // 2
\`\`\`

### 常见应用场景
- **数据私有化**：封装私有变量
- **柯里化**：固定部分参数
- **防抖节流**：保留定时器引用

## 3. 事件循环（Event Loop）

JavaScript 是单线程语言，通过事件循环机制处理异步操作。

### 执行顺序
1. **同步代码** — 立即执行
2. **微任务**（microtask）— Promise.then、MutationObserver
3. **宏任务**（macrotask）— setTimeout、setInterval、I/O

\`\`\`js
console.log("1"); // 同步
setTimeout(() => console.log("2"), 0); // 宏任务
Promise.resolve().then(() => console.log("3")); // 微任务
console.log("4"); // 同步
// 输出: 1 → 4 → 3 → 2
\`\`\`

## 4. this 指向

this 的指向在函数调用时确定，而非定义时：

| 调用方式 | this 指向 |
|---------|----------|
| 普通函数调用 | window/globalThis |
| 对象方法调用 | 该对象 |
| 箭头函数 | 外层词法作用域 |
| call/apply/bind | 指定的第一个参数 |
| new 调用 | 新创建的实例 |

> **箭头函数没有自己的 this**，它会捕获外层函数的 this。`,
  },
  {
    title: "React 核心原理",
    cat: "React",
    source: "React 文档整理",
    content: `# React 核心原理

## 1. Virtual DOM

Virtual DOM 是真实 DOM 的轻量级 JavaScript 对象表示。

### 工作流程

\`\`\`
状态变化 → 生成新 VDOM → Diff → 计算最小更新 → 批量操作真实 DOM
\`\`\`

## 2. 组件生命周期

### Class 组件
- \`componentDidMount\` — 挂载后
- \`componentDidUpdate\` — 更新后
- \`componentWillUnmount\` — 卸载前

### Hooks 对应
- \`useEffect(() => {}, [])\` — componentDidMount
- \`useEffect(() => {})\` — 每次渲染后
- \`useEffect(() => () => {})\` — 带清理的副作用

## 3. useState 原理

\`\`\`jsx
const [state, setState] = useState(initialValue);
\`\`\`

- **初始渲染**：使用初始值
- **更新**：\`setState\` 触发重渲染
- **性能**：多个 \`setState\` 批量合并

## 4. useEffect 详解

\`\`\`jsx
// 每次渲染后执行
useEffect(() => { /* ... */ });

// 仅挂载时执行
useEffect(() => { /* ... */ }, []);

// 依赖变化时执行
useEffect(() => { /* ... */ }, [dep1, dep2]);
\`\`\`

## 5. React 性能优化

- \`React.memo\` — 组件记忆化
- \`useMemo\` — 值记忆化
- \`useCallback\` — 函数记忆化
- \`key\` — 列表 diff 优化
- 懒加载 \`React.lazy\` + \`Suspense\``,
  },
  {
    title: "CSS 布局完全指南",
    cat: "CSS",
    source: "前端面试整理",
    content: `# CSS 布局完全指南

## 1. Flexbox 布局

一维布局模型，适用于行或列方向。

### 容器属性
\`\`\`css
display: flex;
flex-direction: row | column;
justify-content: center | space-between | flex-start;
align-items: center | stretch;
flex-wrap: wrap;
\`\`\`

### 项目属性
\`\`\`css
flex: 1; /* flex-grow: 1, flex-shrink: 1, flex-basis: 0 */
align-self: center;
order: -1;
\`\`\`

## 2. Grid 布局

二维布局模型，同时控制行和列。

### 基础用法
\`\`\`css
display: grid;
grid-template-columns: 1fr 1fr 1fr;
grid-template-rows: auto;
gap: 16px;
\`\`\`

### 区域命名
\`\`\`css
grid-template-areas:
  "header header header"
  "sidebar main main"
  "footer footer footer";
\`\`\`

## 3. 定位

| 类型 | 参考系 | 特点 |
|-----|-------|-----|
| relative | 自身原位置 | 不影响其他元素布局 |
| absolute | 最近非 static 父级 | 脱离文档流 |
| fixed | 视口 | 固定不滚动 |
| sticky | 父容器+视口 | 滚动到阈值固定 |

## 4. 响应式设计

\`\`\`css
@media (max-width: 768px) { /* 移动端 */ }
@media (min-width: 769px) and (max-width: 1024px) { /* 平板 */ }
@media (min-width: 1025px) { /* 桌面 */ }
\`\`\`

> **原则**：Mobile First，从小屏到大屏渐进增强。`,
  },
];

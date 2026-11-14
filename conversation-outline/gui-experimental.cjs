"use strict"

/**
 * Conversation Outline — 对话大纲
 *
 * OpenCode Desktop GUI 插件（`./gui-experimental`，CommonJS 单文件，无需构建）。
 *
 * - 侧边栏面板：列出"当前会话"里的每一轮用户提问。
 * - 点击任意一轮：滚动（reveal）到时间线里的那条消息。
 * - 顶部搜索框：按提问内容过滤。
 *
 * 数据全部来自 server API（message.list），不复制、不存储对话内容。
 */

const { Plugin, Panel, Command, MenuItem, Slot } = require("@opencode/plugin/gui")

const TAB_ID = "outline"
const ICON = "bullet-list"

const MAX_PROMPTS = 200
const REFRESH_MS = 4000
const SCAN_STEPS = 120
const SCAN_DELAY_MS = 60
const SETTLE_MS = 120
const LATEST_ICON = "arrow-down-to-line"
const QUOTE_ICON = "outline-quote"

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

const STRINGS = {
  en: {
    "panel.title": "Conversation outline",
    "command.open": "Open conversation outline",
    "command.open.description": "List the turns of this conversation and jump to any of them",
    "command.group": "Conversation",
    "menu.open": "Conversation outline",
    "menu.description": "Jump to any turn",
    "header.button.title": "Open the conversation outline",
    "search.placeholder": "Search this conversation…",
    // 复数：App 按 ctx.plural 选择 .one / .other
    "count.turns.one": "{{count}} turn",
    "count.turns.other": "{{count}} turns",
    "count.turns": "{{count}} turns",
    "state.loading": "Loading…",
    "state.empty": "No turns yet",
    "state.noresults": "Nothing matches",
    "state.error": "Could not load this conversation",
    "state.retry": "Retry",
    "action.refresh": "Refresh",
    "action.latest": "Jump to the latest message",
    "action.quote": "Quote this turn in the prompt",
    "action.jump": "Jump to this message",
    "footer.hint": "Click a turn to jump to that message",
    "footer.locating": "Finding that message…",
    "toast.jump.failed": "Could not reach that message yet. Try again in a moment.",
    "toast.quote.failed": "The prompt cannot take a quote right now.",
    "quote.source": "Conversation outline",
    "quote.subject": "an earlier turn of this conversation",
  },
  zh: {
    "panel.title": "对话大纲",
    "command.open": "打开对话大纲",
    "command.open.description": "列出当前对话的每一轮提问，点击即可跳转",
    "command.group": "对话",
    "menu.open": "对话大纲",
    "menu.description": "跳到任意一轮提问",
    "header.button.title": "打开对话大纲",
    "search.placeholder": "搜索这轮对话…",
    "count.turns.one": "{{count}} 轮",
    "count.turns.other": "{{count}} 轮",
    "count.turns": "{{count}} 轮",
    "state.loading": "加载中…",
    "state.empty": "这个对话还没有提问",
    "state.noresults": "没有匹配的提问",
    "state.error": "这个对话载入失败",
    "state.retry": "重试",
    "action.refresh": "刷新",
    "action.latest": "跳到最新消息",
    "action.quote": "引用这一轮到输入框",
    "action.jump": "跳转到这条消息",
    "footer.hint": "点击任意一轮，跳到那条消息",
    "footer.locating": "正在定位这条消息…",
    "toast.jump.failed": "这条消息还没加载出来，请稍后再点一次",
    "toast.quote.failed": "现在不能引用（输入框不可用或正在执行命令）。",
    "quote.source": "对话大纲",
    "quote.subject": "这段对话里的一轮提问",
  },
  // App 的繁体中文 locale id 是 zht（zh-Hant）
  zht: {
    "panel.title": "對話大綱",
    "command.open": "開啟對話大綱",
    "command.open.description": "列出目前對話的每一輪提問，點一下即可跳轉",
    "command.group": "對話",
    "menu.open": "對話大綱",
    "menu.description": "跳到任意一輪提問",
    "header.button.title": "開啟對話大綱",
    "search.placeholder": "搜尋這輪對話…",
    "count.turns.one": "{{count}} 輪",
    "count.turns.other": "{{count}} 輪",
    "count.turns": "{{count}} 輪",
    "state.loading": "載入中…",
    "state.empty": "這個對話還沒有提問",
    "state.noresults": "沒有符合的提問",
    "state.error": "這個對話載入失敗",
    "state.retry": "重試",
    "action.refresh": "重新整理",
    "action.latest": "跳到最新訊息",
    "action.quote": "引用這一輪到輸入框",
    "action.jump": "跳到這則訊息",
    "footer.hint": "點一下任意一輪，跳到那則訊息",
    "footer.locating": "正在定位這則訊息…",
    "toast.jump.failed": "這則訊息還沒載入出來，請稍後再點一次",
    "toast.quote.failed": "現在無法引用（輸入框不可用或正在執行命令）。",
    "quote.source": "對話大綱",
    "quote.subject": "這段對話裡的一輪提問",
  },
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const S = {
  root: "display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;font-size:12px;line-height:1.45;color:var(--text-base,inherit);",
  header:
    "display:flex;align-items:center;gap:8px;padding:10px 12px 8px;flex:none;border-bottom:1px solid var(--border-weak-base,rgba(127,127,127,.18));",
  title: "font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  count: "color:var(--text-weak,#8a8a8a);font-size:11px;margin-left:auto;white-space:nowrap;",
  iconButton:
    "appearance:none;border:0;background:transparent;color:var(--text-weak,#8a8a8a);cursor:pointer;font-size:13px;line-height:1;padding:4px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;",
  searchWrap: "padding:8px 12px;flex:none;",
  search:
    "width:100%;box-sizing:border-box;appearance:none;font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--border-weak-base,rgba(127,127,127,.28));background:var(--surface-base,transparent);color:inherit;outline:none;",
  list: "flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 8px 16px;",
  row: "display:flex;gap:8px;align-items:baseline;padding:6px 8px;border-radius:6px;cursor:pointer;user-select:none;outline:none;",
  index:
    "flex:none;min-width:18px;text-align:right;color:var(--text-weak,#8a8a8a);font-size:10px;font-variant-numeric:tabular-nums;line-height:19px;",
  body: "flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;",
  actions: "flex:none;display:flex;align-items:center;gap:2px;opacity:.55;transition:opacity .12s ease;",
  actionButton:
    "appearance:none;border:0;background:transparent;color:var(--text-weak,#8a8a8a);cursor:pointer;padding:3px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;",
  text: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  time: "color:var(--text-weak,#8a8a8a);font-size:10px;font-variant-numeric:tabular-nums;",
  note: "padding:8px 10px;color:var(--text-weak,#8a8a8a);font-size:11px;",
  footer:
    "flex:none;padding:6px 12px;border-top:1px solid var(--border-weak-base,rgba(127,127,127,.18));color:var(--text-weak,#8a8a8a);font-size:10px;",
  error: "padding:10px;color:var(--text-critical-base,#d05050);font-size:11px;word-break:break-word;",
}

/* ------------------------------------------------------------------ */
/* Small DOM helpers (no JSX / no build step)                          */
/* ------------------------------------------------------------------ */

function h(tag, style, text) {
  const node = document.createElement(tag)
  if (style) node.style.cssText = style
  if (text !== undefined && text !== null) node.textContent = String(text)
  return node
}

function icon(name, size) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", String(size || 16))
  svg.setAttribute("height", String(size || 16))
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("fill", "none")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("data-slot", "icon-svg")
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use")
  use.setAttribute("href", `#opencode-v2-icon-${name}`)
  svg.appendChild(use)
  return svg
}

function clean(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------------ */
/* Timeline helpers (the panel and the timeline share one document)   */
/* ------------------------------------------------------------------ */

/** The timeline's scroll container: the tallest vertical scroller on screen. */
function timelineScroller() {
  let best = null
  let bestHeight = 0
  for (const node of Array.from(document.querySelectorAll("div,main,section"))) {
    const style = window.getComputedStyle(node)
    if (!/(auto|scroll)/.test(style.overflowY)) continue
    const overflow = node.scrollHeight - node.clientHeight
    if (overflow < 24) continue
    // Prefer a scroller that actually contains timeline rows.
    const timeline = node.querySelector("[data-timeline-row],[data-message-id]") ? 1 : 0
    const score = overflow + timeline * 100000
    if (score > bestHeight) {
      best = node
      bestHeight = score
    }
  }
  return best
}

/** The app only pages history in when it believes the user scrolled up. */
function detachFollow(scroller) {
  try {
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -48, bubbles: true, cancelable: true }))
  } catch (error) {}
}

/** The app's own "jump to latest" button, ignoring our panel's copy. */
function appLatestButton(panelRoot) {
  for (const button of Array.from(document.querySelectorAll("button"))) {
    if (panelRoot && panelRoot.contains(button)) continue
    // 桌面版这个按钮的图标是内联 path，而不是 sprite。
    if (button.querySelector('svg path[d^="M12.3333 8.66665"]')) return button
  }
  const nodes = document.querySelectorAll('svg use[href="#opencode-v2-icon-' + LATEST_ICON + '"]')
  for (const use of Array.from(nodes)) {
    if (panelRoot && panelRoot.contains(use)) continue
    const button = use.closest("button")
    if (button) return button
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Time formatting                                                     */
/* ------------------------------------------------------------------ */

function clock(timestamp) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp)
  } catch (error) {
    const date = new Date(timestamp)
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  }
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

function createView(ctx, props) {
  const root = h("div", S.root)
  root.dataset.conversationOutline = "1"

  const header = h("div", S.header)
  const titleEl = h("div", S.title, ctx.t("panel.title"))
  titleEl.prepend(icon(ICON, 14))
  titleEl.style.display = "inline-flex"
  titleEl.style.alignItems = "center"
  titleEl.style.gap = "6px"
  const countEl = h("div", S.count, "")
  const latestEl = h("button", S.iconButton)
  latestEl.type = "button"
  latestEl.title = ctx.t("action.latest")
  latestEl.setAttribute("aria-label", ctx.t("action.latest"))
  latestEl.append(icon(LATEST_ICON, 14))
  const refreshEl = h("button", S.iconButton)
  refreshEl.type = "button"
  refreshEl.title = ctx.t("action.refresh")
  refreshEl.setAttribute("aria-label", ctx.t("action.refresh"))
  refreshEl.append(icon("refresh", 14))
  header.append(titleEl, countEl, latestEl, refreshEl)

  const searchWrap = h("div", S.searchWrap)
  const searchEl = h("input", S.search)
  searchEl.type = "search"
  searchEl.placeholder = ctx.t("search.placeholder")
  searchWrap.append(searchEl)

  const listEl = h("div", S.list)
  const footerEl = h("div", S.footer, ctx.t("footer.hint"))

  root.append(header, searchWrap, listEl, footerEl)

  const state = {
    sessionID: "",
    items: [],
    status: "idle", // idle | loading | ready | error
    error: "",
    query: "",
    active: "",
    locating: "",
    hydrating: false,
    pending: false,
  }

  // 记住已经成功定位过的轮次，之后点同一轮可以一次跳到位。
  const jumpCache = new Map()

  let frame = 0
  function schedule() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      paint()
    })
  }

  /* -------------------------- data -------------------------- */

  async function listPrompts(sessionID) {
    const api = ctx.client
    if (!api || !api.message || !api.message.list) throw new Error("server client is not ready")

    const items = []
    let cursor = ""
    for (let page = 0; page < 10; page++) {
      const res = await api.message.list({
        sessionID,
        type: "user",
        limit: String(MAX_PROMPTS),
        ...(cursor ? { cursor } : { order: "asc" }),
      })
      const rows = res && res.data ? res.data : res
      const list = Array.isArray(rows) ? rows : []
      for (const message of list) {
        const meta = message.metadata || {}
        items.push({
          id: message.id,
          text: clean(meta.displayText || message.text || ""),
          created: (message.time && message.time.created) || 0,
        })
      }
      const next = res && res.cursor && res.cursor.next
      if (!next || !list.length) break
      cursor = next
    }
    return items
  }

  async function refresh(options) {
    const opts = options || {}
    const session = props.session
    if (!session || !session.id) return

    const switched = state.sessionID !== session.id
    state.sessionID = session.id
    if (switched) {
      state.active = ""
      state.items = []
    }
    if (state.hydrating && !opts.force) {
      state.pending = true
      return
    }

    state.hydrating = true
    state.pending = false
    if (!opts.silent || state.status !== "ready") {
      state.status = state.items.length ? "refreshing" : "loading"
      schedule()
    }

    try {
      const items = await listPrompts(session.id)
      // 会话可能在请求期间被切走，丢弃过期结果。
      if (state.sessionID !== session.id) return
      state.items = items
      state.status = "ready"
      state.error = ""
    } catch (error) {
      if (state.sessionID !== session.id) return
      state.status = "error"
      state.error = String((error && error.message) || error)
    } finally {
      state.hydrating = false
      schedule()
      if (state.pending) {
        state.pending = false
        void refresh({ silent: true })
      }
    }
  }

  /* -------------------------- jump -------------------------- */

  function rowsFor(messageID) {
    const out = []
    const direct = document.getElementById(`message-${messageID}`)
    if (direct) out.push(direct)
    const escaped = String(messageID).replace(/"/g, '\\"')
    for (const row of Array.from(document.querySelectorAll(`[data-message-id="${escaped}"]`))) {
      if (!out.includes(row)) out.push(row)
    }
    return out
  }

  /** 只认“用户提问”那一行，保证落点就是那一轮的问题。 */
  function findUserRow(messageID) {
    for (const row of rowsFor(messageID)) {
      if (row.querySelector('[data-component="user-message"]')) return row
    }
    return null
  }

  function findAnyRow(messageID) {
    const rows = rowsFor(messageID)
    return rows.length ? rows[0] : null
  }

  function flash(element) {
    if (!element) return
    const previous = {
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      borderRadius: element.style.borderRadius,
      transition: element.style.transition,
    }
    element.style.transition = "outline-color .2s ease"
    element.style.outline = "2px solid var(--border-strong-base,#78a9ff)"
    element.style.outlineOffset = "4px"
    element.style.borderRadius = "6px"
    setTimeout(() => {
      element.style.outline = previous.outline
      element.style.outlineOffset = previous.outlineOffset
      element.style.borderRadius = previous.borderRadius
      element.style.transition = previous.transition
    }, 1400)
  }

  /** 行在滚动内容里的绝对位置（与 scrollTop 同一坐标系，正序/倒序都适用）。 */
  function contentTop(node, scroller) {
    return node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  }

  /** 把某一行对齐到视口顶部附近；已经完整可见时不打扰。 */
  function place(node, scroller, offset) {
    const rect = node.getBoundingClientRect()
    const viewport = scroller.clientHeight
    if (rect.top >= 24 && rect.bottom <= viewport - 16) return false
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const next = Math.max(0, Math.min(max, Math.round(contentTop(node, scroller) - (offset === undefined ? 72 : offset))))
    if (Math.abs(next - scroller.scrollTop) < 2) return false
    scroller.scrollTop = next
    return true
  }

  function nudge(messageID, withFlash) {
    const scroller = timelineScroller()
    const row = scroller ? findUserRow(messageID) : null
    if (!row) return false
    place(row, scroller, 72)
    if (withFlash) flash(row)
    return true
  }

  let nativeNext = ""
  let nativePrevious = ""

  function runNativeCommand(direction) {
    const commands = ctx.commands
    if (!commands || !commands.run) return false
    const cached = direction > 0 ? nativeNext : nativePrevious
    if (cached && commands.run(cached)) {
      return true
    }
    const candidates =
      direction > 0
        ? ["message.next", "session.message.next", "command.message.next"]
        : ["message.previous", "session.message.previous", "command.message.previous"]
    for (const id of candidates) {
      if (!commands.run(id)) continue
      if (direction > 0) nativeNext = id
      else nativePrevious = id
      return true
    }
    return false
  }

  /** 当前视口最上方的轮次（与 App 自己的“上一条/下一条消息”判断一致，任意回复行也算）。 */
  function topVisibleUserIndex(scroller) {
    const box = scroller.getBoundingClientRect()
    const anchor = box.top + 100
    let best = null
    for (const row of Array.from(document.querySelectorAll("[data-message-id]"))) {
      const rect = row.getBoundingClientRect()
      if (rect.bottom < box.top || rect.top > box.bottom) continue
      const id = row.getAttribute("data-message-id")
      const index = state.items.findIndex((item) => item.id === id)
      if (index < 0) continue
      const distance = Math.abs(rect.top - anchor)
      if (!best || distance < best.distance) best = { index, distance }
    }
    return best ? best.index : -1
  }

  /**
   * 用 App 自带的“上一条 / 下一条消息”命令来定位。
   * 只有真正把提问行带进视口才算成功；只看到回复就交给滚动兜底。
   */
  async function nudgeNative(messageID, token) {
    const target = state.items.findIndex((item) => item.id === messageID)
    if (target < 0) return false
    const hasUser = () => !!findUserRow(messageID)
    const hasAny = () => !!findAnyRow(messageID)
    if (hasUser()) return true

    // 这一轮已经挂载、但提问在视口上方：先退到上一轮，再进入这一轮，
    // App 会把这一轮的提问精确顶到视口顶部。
    if (hasAny() && target > 0) {
      if (runNativeCommand(-1)) {
        await sleep(120)
        if (token !== jumpToken) return false
        if (runNativeCommand(1)) {
          await sleep(180)
          if (token !== jumpToken) return false
          if (hasUser()) return true
          // 落到了这一轮但只露出回复，交给下面的滚动二分去找提问。
          if (hasAny()) return false
        }
      }
    }

    for (let step = 0; step < 12; step++) {
      if (token !== jumpToken) return false
      if (hasUser()) return true
      if (hasAny()) return false
      const scroller = timelineScroller()
      if (!scroller) return false
      const current = topVisibleUserIndex(scroller)
      if (current < 0) return false
      const delta = target - current
      if (delta === 0) return false
      if (!runNativeCommand(delta > 0 ? 1 : -1)) return false
      await sleep(100)
    }
    return hasUser()
  }

  let jumpToken = 0

  function toast(message, variant) {
    try {
      if (ctx.toast && ctx.toast.show) {
        ctx.toast.show({ title: ctx.t("panel.title"), message, variant: variant || "warning" })
      }
    } catch (error) {}
  }

  function mountedPoints(scroller) {
    const mounted = new Map()
    for (const node of Array.from(document.querySelectorAll("[data-message-id]"))) {
      const id = node.getAttribute("data-message-id")
      if (!id) continue
      const existing = mounted.get(id)
      if (!existing || (!existing.querySelector('[data-component="user-message"]') && node.querySelector('[data-component="user-message"]'))) {
        mounted.set(id, node)
      }
    }
    const points = []
    for (let i = 0; i < state.items.length; i++) {
      const node = mounted.get(state.items[i].id)
      if (node) points.push({ index: i, top: contentTop(node, scroller) })
    }
    points.sort((a, b) => a.index - b.index)
    return points
  }

  /** 用已经测量到的轮次位置，估计目标轮次在滚动内容里的位置。 */
  function estimateTop(samples, target, scroller) {
    const max = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
    const lastIndex = state.items.length - 1
    // 两端是最常见的点击目标，直接指向内容边缘，省掉好几步猜测。
    if (target <= 0) return 0
    if (target >= lastIndex) return max
    const list = Array.from(samples.entries()).sort((a, b) => a[0] - b[0])
    if (!list.length) {
      const ratio = state.items.length > 1 ? target / (state.items.length - 1) : 1
      return ratio * max
    }
    const first = list[0]
    const last = list[list.length - 1]
    if (target <= first[0]) {
      if (list.length < 2) return first[1]
      const per = (list[1][1] - first[1]) / (list[1][0] - first[0])
      return first[1] + (target - first[0]) * per
    }
    if (target >= last[0]) {
      if (list.length < 2) return last[1]
      const prev = list[list.length - 2]
      const per = (last[1] - prev[1]) / (last[0] - prev[0])
      return last[1] + (target - last[0]) * per
    }
    for (let i = 1; i < list.length; i++) {
      const right = list[i]
      const left = list[i - 1]
      if (target > right[0]) continue
      return left[1] + ((right[1] - left[1]) * (target - left[0])) / (right[0] - left[0])
    }
    return last[1]
  }

  async function scrollTopTo(scroller, value, token, delay) {
    const clamp = Math.max(0, Math.min(scroller.scrollHeight, Math.round(value)))
    const current = scroller.scrollTop
    if (Math.abs(clamp - current) <= 1) {
      // 位置没变时才抖 1px 触发 scroll 事件；正常移动不要抖，避免视觉抖动。
      scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight, clamp + (clamp <= 0 ? 1 : -1)))
      await sleep(16)
      if (token !== jumpToken) return
      scroller.scrollTop = clamp
    } else {
      scroller.scrollTop = clamp
    }
    await sleep(delay === undefined ? SCAN_DELAY_MS : delay)
  }

  async function seekByScrolling(messageID, token) {
    const target = state.items.findIndex((item) => item.id === messageID)
    if (target < 0) return false
    const scroller = timelineScroller()
    if (!scroller) return false
    // 先让 App 退出“跟随最新消息”，否则它会一直把视口拉回底部。
    detachFollow(scroller)

    const viewport = Math.max(1, scroller.clientHeight)
    const samples = new Map()
    let low = null
    let high = null
    let idle = 0
    let probes = 0
    let lastHeight = scroller.scrollHeight

    for (let step = 0; step < SCAN_STEPS; step++) {
      if (token !== jumpToken) return false

      // 历史分页是往上“插入”内容，所有坐标都会整体移动；高度变了就丢弃旧样本。
      if (Math.abs(scroller.scrollHeight - lastHeight) > 64) {
        samples.clear()
        low = null
        high = null
        idle = 0
      }
      lastHeight = scroller.scrollHeight

      // 提问那一行已经挂载：直接对齐，不再滚动。
      const userRow = findUserRow(messageID)
      if (userRow) {
        place(userRow, scroller, 72)
        return true
      }

      const points = mountedPoints(scroller)
      for (const point of points) samples.set(point.index, point.top)

      // 这一轮已挂载但只露出回复：在“上一轮起点”和“这一轮当前行”之间二分。
      const anyRow = findAnyRow(messageID)
      if (anyRow) {
        const top = contentTop(anyRow, scroller)
        high = high === null ? top : Math.min(high, top)
        if (low === null) low = samples.has(target - 1) ? samples.get(target - 1) : 0

        if (high - low > viewport * 0.5 && probes < 18) {
          probes++
          await scrollTopTo(scroller, low + (high - low) / 2 - viewport / 2, token)
          if (token !== jumpToken) return false
          continue
        }

        // 区间已经很小（或二分次数用尽）：把回复开头放到偏下位置，提问就在其上方。
        await scrollTopTo(scroller, high - viewport * 0.65, token)
        if (token !== jumpToken) return false
        return true
      }

      // 探针落在目标轮次上方：抬高二分下界。
      if (high !== null) {
        const below = scroller.scrollTop + viewport
        if (low === null || below > low) low = below
        if (low < high - viewport * 0.25 && probes < 18) {
          probes++
          await scrollTopTo(scroller, low + (high - low) / 2 - viewport / 2, token)
          if (token !== jumpToken) return false
          continue
        }
        high = null
        low = null
      }

      const before = scroller.scrollTop
      const beforeHeight = scroller.scrollHeight
      const next = estimateTop(samples, target, scroller) - viewport / 3
      await scrollTopTo(scroller, next, token)
      if (token !== jumpToken) return false

      const moved = Math.abs(scroller.scrollTop - before) > 1 || scroller.scrollHeight !== beforeHeight
      idle = moved ? 0 : idle + 1
      if (idle >= 10) break
    }
    return false
  }

  async function jump(messageID) {
    if (!messageID) return
    const token = ++jumpToken
    state.active = messageID
    state.locating = messageID
    schedule()

    // 之前定位过且内容高度没变：一次设置到位。
    const scroller = timelineScroller()
    const cached = scroller ? jumpCache.get(messageID) : undefined
    if (scroller && cached && Math.abs(scroller.scrollHeight - cached.height) <= 64) {
      scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight, Math.round(cached.top - 72)))
      await sleep(60)
      if (token !== jumpToken) return
    }

    // 已经渲染出来时直接跳；否则优先用 App 自带的上一条/下一条消息命令精确定位。
    let landed = false
    if (nudge(messageID, false)) {
      landed = true
    } else if (await nudgeNative(messageID, token)) {
      landed = true
    } else if (await seekByScrolling(messageID, token)) {
      landed = true
    }
    if (token !== jumpToken) return

    if (!landed) {
      state.locating = ""
      schedule()
      toast(ctx.t("toast.jump.failed"), "warning")
      return
    }

    state.locating = ""
    schedule()
    // 只描边一次；只有目标被测量过程挤出视口时才补一次位置调整，避免可见的二次抖动。
    await sleep(SETTLE_MS)
    if (token !== jumpToken) return
    const frame = timelineScroller()
    if (!frame) return
    const row = findUserRow(messageID) || findAnyRow(messageID)
    if (!row) return
    const rect = row.getBoundingClientRect()
    if (rect.bottom < 24 || rect.top > frame.clientHeight - 24) {
      place(row, frame, 72)
    }
    jumpCache.set(messageID, { top: contentTop(row, frame), height: frame.scrollHeight })
    flash(row)
  }

  /* -------------------------- latest / quote -------------------------- */

  async function jumpToLatest() {
    const button = appLatestButton(root)
    if (button) {
      button.click()
    } else {
      const scroller = timelineScroller()
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight
        await sleep(60)
        scroller.scrollTop = scroller.scrollHeight
      }
    }
    jumpToken += 1
    state.active = ""
    state.locating = ""
    schedule()
    await sleep(240)
    const screen = ctx.screen && ctx.screen.current ? ctx.screen.current() : undefined
    const composer = screen && screen.composer
    if (composer) composer.focus()
  }

  function quoteItem(item) {
    const screen = ctx.screen && ctx.screen.current ? ctx.screen.current() : undefined
    const composer = screen && screen.composer
    if (!composer || !composer.quotable || !composer.quotable()) {
      toast(ctx.t("toast.quote.failed"), "warning")
      return
    }
    const commentID =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `quote-${Date.now()}`
    composer.attach({
      type: "quote",
      commentID,
      text: item.text,
      source: {
        label: ctx.t("quote.source"),
        icon: ICON,
        subject: ctx.t("quote.subject"),
      },
    })
    composer.focus(commentID)
  }

  /* -------------------------- paint -------------------------- */

  function setBackground(node, active) {
    node.style.background = active ? "var(--surface-base-hover,rgba(127,127,127,.14))" : "transparent"
  }

  function markActive(node, active) {
    node.dataset.active = active ? "1" : "0"
    setBackground(node, active)
  }

  function hoverable(node, actions) {
    const show = () => {
      if (node.dataset.active !== "1") node.style.background = "var(--surface-base-hover,rgba(127,127,127,.1))"
      if (actions) actions.style.opacity = "1"
    }
    const hide = () => {
      if (node.dataset.active !== "1") node.style.background = "transparent"
      if (actions) actions.style.opacity = ""
    }
    node.addEventListener("mouseenter", show)
    node.addEventListener("mouseleave", hide)
    node.addEventListener("focus", show)
    node.addEventListener("blur", hide)
  }

  function turnRow(item, index) {
    const row = h("div", S.row)
    row.tabIndex = 0
    row.setAttribute("role", "button")
    row.title = ctx.t("action.jump")

    const badge = h("span", S.index, String(index))
    const body = h("div", S.body)
    const text = h("div", S.text, item.text || item.id)
    if (item.text) text.title = item.text
    body.append(text)
    if (item.created) {
      const time = h("div", S.time, clock(item.created))
      body.append(time)
      row.setAttribute("aria-label", `${index}. ${item.text} · ${clock(item.created)}`)
    } else {
      row.setAttribute("aria-label", `${index}. ${item.text}`)
    }

    const actions = h("div", S.actions)
    const quoteEl = h("button", S.actionButton)
    quoteEl.type = "button"
    quoteEl.title = ctx.t("action.quote")
    quoteEl.setAttribute("aria-label", ctx.t("action.quote"))
    quoteEl.append(icon(QUOTE_ICON, 13))
    quoteEl.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      quoteItem(item)
    })
    quoteEl.addEventListener("keydown", (event) => event.stopPropagation())
    actions.append(quoteEl)

    row.append(badge, body, actions)
    markActive(row, state.active === item.id)
    hoverable(row, actions)

    const run = (event) => {
      event.preventDefault()
      event.stopPropagation()
      void jump(item.id)
    }
    row.addEventListener("click", run)
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") run(event)
    })

    return row
  }

  let lastPaintKey = ""

  // 轮次数量：优先用 App 的复数选择（ctx.plural），旧版没有该 API 时退回 ctx.t。
  function turnCount(total) {
    if (typeof ctx.plural === "function") {
      try {
        return ctx.plural("count.turns", total)
      } catch {}
    }
    return ctx.t("count.turns", { count: total })
  }

  function paint() {
    const total = state.items.length
    countEl.textContent =
      state.status === "loading" && !total ? ctx.t("state.loading") : turnCount(total)
    footerEl.textContent = state.locating ? ctx.t("footer.locating") : ctx.t("footer.hint")

    // 数据没变就不重建 DOM：避免每 4 秒的静默刷新在用户点击的瞬间替换掉行。
    const key = JSON.stringify([
      state.status,
      state.error,
      state.query,
      state.active,
      state.items.map((item) => item.id),
    ])
    if (key === lastPaintKey && listEl.firstChild) return
    lastPaintKey = key

    const scrollTop = listEl.scrollTop
    listEl.replaceChildren()

    if (state.status === "error" && !total) {
      const wrap = h("div", S.error)
      wrap.append(h("div", "", ctx.t("state.error")))
      wrap.append(h("div", "", state.error))
      const retry = h("button", S.iconButton, ctx.t("state.retry"))
      retry.type = "button"
      retry.style.marginTop = "6px"
      retry.style.fontSize = "11px"
      retry.addEventListener("click", () => void refresh({ force: true }))
      wrap.append(retry)
      listEl.append(wrap)
      return
    }

    if ((state.status === "loading" || state.status === "idle") && !total) {
      listEl.append(h("div", S.note, ctx.t("state.loading")))
      return
    }

    if (!total) {
      listEl.append(h("div", S.note, ctx.t("state.empty")))
      return
    }

    const query = clean(state.query).toLowerCase()
    const items = query
      ? state.items
          .map((item, index) => ({ item, index: index + 1 }))
          .filter((entry) => entry.item.text.toLowerCase().includes(query))
      : state.items.map((item, index) => ({ item, index: index + 1 }))

    if (!items.length) {
      listEl.append(h("div", S.note, ctx.t("state.noresults")))
      return
    }

    const wrap = document.createDocumentFragment()
    items.forEach((entry) => wrap.append(turnRow(entry.item, entry.index)))
    listEl.append(wrap)
    listEl.scrollTop = scrollTop
  }

  /* -------------------------- wiring -------------------------- */

  let inputTimer = 0
  searchEl.addEventListener("input", () => {
    clearTimeout(inputTimer)
    inputTimer = setTimeout(() => {
      state.query = searchEl.value || ""
      schedule()
    }, 120)
  })

  searchEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && searchEl.value) {
      searchEl.value = ""
      state.query = ""
      schedule()
    }
  })

  refreshEl.addEventListener("click", () => {
    refreshEl.style.opacity = "0.5"
    void refresh({ force: true }).finally(() => {
      refreshEl.style.opacity = ""
    })
  })

  latestEl.addEventListener("click", () => {
    latestEl.style.opacity = "0.5"
    void jumpToLatest().finally(() => {
      latestEl.style.opacity = ""
    })
  })

  void refresh({ force: true })

  const timer = setInterval(() => {
    if (!root.isConnected) {
      clearInterval(timer)
      return
    }
    if (document.visibilityState !== "visible") return
    if (!root.getClientRects().length) return

    const session = props.session
    if (!session || !session.id) return
    if (session.id !== state.sessionID) {
      void refresh({ force: true })
      return
    }
    void refresh({ silent: true })
  }, REFRESH_MS)

  root.__conversationOutlineRefresh = () => {
    void refresh({ force: true })
  }

  root.__conversationOutlineDispose = () => {
    clearInterval(timer)
    clearTimeout(inputTimer)
  }

  return root
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

module.exports = Plugin.define({
  i18n: STRINGS,

  setup(ctx) {
    const key = `${ctx.id}:${TAB_ID}`
    const views = new Map()

    const tab = {
      id: TAB_ID,
      get title() {
        return ctx.t("panel.title")
      },
      label: () => icon(ICON, 14),
      closable: "compact",
    }

    function openPanel(session) {
      if (!session) return
      ctx.layout.open(key, session, { tab: "select" })
    }

    /* 命令面板里的入口 */
    ctx.add(Command, () => ({
      id: "open",
      title: ctx.t("command.open"),
      description: ctx.t("command.open.description"),
      keywords: "outline turns prompts history jump 对话 大纲 提问 历史 跳转",
      group: ctx.t("command.group"),
      section: "navigation",
      suggested: true,
      enabled: !!ctx.sessions.current(),
      run: () => openPanel(ctx.sessions.current()),
    }))

    /* 侧边栏 “+” 菜单里的启动项 */
    ctx.add(MenuItem, () => {
      const session = ctx.sessions.current()
      return {
        menu: "session.panel",
        id: "open",
        title: ctx.t("menu.open"),
        description: ctx.t("menu.description"),
        icon: ICON,
        order: 40,
        opened: !!session && ctx.layout.state(key, session) !== "closed",
        run: () => openPanel(ctx.sessions.current()),
      }
    })

    /* 会话标题栏上的图标按钮，一键开关 */
    ctx.add(Slot, {
      at: "session.header",
      order: 60,
      render: () => {
        const button = h("button", S.iconButton)
        button.type = "button"
        button.title = ctx.t("header.button.title")
        button.setAttribute("aria-label", ctx.t("header.button.title"))
        button.append(icon(ICON, 16))
        button.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          const session = ctx.sessions.current()
          if (session) ctx.layout.toggle(key, session)
        })
        return button
      },
    })

    /* 面板本体：当前会话的每一轮提问 */
    ctx.add(Panel, {
      id: TAB_ID,
      region: "side",
      width: 320,
      mobile: {
        get title() {
          return ctx.t("panel.title")
        },
        order: 60,
        kind: "menu",
        icon: ICON,
      },
      list: (input) => (input.open.includes(TAB_ID) ? [tab] : []),
      render: (input) => {
        const view = createView(ctx, input)
        const viewKey = `${input.session.server.id}\n${input.session.id}`
        views.set(viewKey, view)
        return view
      },
      focus: (input) => {
        const view = views.get(`${input.session.server.id}\n${input.session.id}`)
        if (view && view.__conversationOutlineRefresh) view.__conversationOutlineRefresh()
      },
      close: (input) => {
        const viewKey = `${input.session.server.id}\n${input.session.id}`
        const view = views.get(viewKey)
        if (view && view.__conversationOutlineDispose) view.__conversationOutlineDispose()
        views.delete(viewKey)
      },
    })
  },
})

const API = "/api/records";
const LOCAL_KEY = "lp_student_renewal_records_v2";

const state = {
  records: [],
  mode: "cloud",
  search: "",
  continent: "",
  renewType: ""
};

const els = {
  sync: document.getElementById("syncState"),
  form: document.getElementById("recordForm"),
  submitBtn: document.getElementById("submitBtn"),
  rows: document.getElementById("recordRows"),
  search: document.getElementById("searchBox"),
  continentFilter: document.getElementById("continentFilter"),
  typeFilter: document.getElementById("typeFilter"),
  metricRow: document.getElementById("metricRow"),
  analysisMetricRow: document.getElementById("analysisMetricRow"),
  typeRank: document.getElementById("typeRank"),
  lpRank: document.getElementById("lpRank"),
  continentStats: document.getElementById("continentStats"),
  topRenewRecords: document.getElementById("topRenewRecords"),
  toast: document.getElementById("toast")
};

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    document.getElementById(`tab-${button.dataset.tab}`).classList.add("is-active");
    if (button.dataset.tab !== "form") loadRecords(false);
  });
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.form).entries());
  data.newPackageTotal = toNumber(data.newPackageTotal);
  data.newLessonPrice = toNumber(data.newLessonPrice);
  data.newBeans = toNumber(data.newBeans);
  data.renewPackageTotal = toNumber(data.renewPackageTotal);
  data.renewLessonPrice = toNumber(data.renewLessonPrice);
  data.extraGiftLessons = toNumber(data.extraGiftLessons);

  try {
    setSync("Saving");
    const result = await saveRecord(data);
    state.records = result.records;
    resetForm();
    renderAll();
    toast(data.id ? "Record updated" : "Record saved");
  } catch (error) {
    toast(error.message || "Save failed", true);
  } finally {
    setSync(state.mode === "cloud" ? `Synced ${formatTime(new Date())}` : "Local preview mode");
  }
});

document.getElementById("resetForm").addEventListener("click", resetForm);
document.getElementById("refreshData").addEventListener("click", () => loadRecords(true));
document.getElementById("clearAll").addEventListener("click", async () => {
  if (!confirm("Clear all records?")) return;
  try {
    setSync("Clearing");
    const result = await clearAllRecords();
    state.records = result.records;
    renderAll();
    toast("All records cleared");
  } catch (error) {
    toast(error.message || "Clear failed", true);
  } finally {
    setSync(state.mode === "cloud" ? `Synced ${formatTime(new Date())}` : "Local preview mode");
  }
});

document.getElementById("exportCsv").addEventListener("click", exportCsv);

els.search.addEventListener("input", () => {
  state.search = els.search.value.trim().toLowerCase();
  renderSummary();
});

els.continentFilter.addEventListener("change", () => {
  state.continent = els.continentFilter.value;
  renderSummary();
});

els.typeFilter.addEventListener("change", () => {
  state.renewType = els.typeFilter.value;
  renderSummary();
});

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function loadRecords(showMessage) {
  try {
    setSync("Syncing");
    const result = await request(API);
    state.mode = "cloud";
    state.records = Array.isArray(result.records) ? result.records : [];
    renderAll();
    setSync(`Synced ${formatTime(new Date())}`);
    if (showMessage) toast("Data refreshed");
  } catch {
    state.mode = "local";
    state.records = readLocal();
    renderAll();
    setSync("Local preview mode. Cloud sync works after Netlify deploy.");
    if (showMessage) toast("Local preview mode");
  }
}

async function saveRecord(data) {
  if (state.mode === "cloud") {
    return await request(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  const record = normalizeLocal(data);
  const index = state.records.findIndex((item) => item.id === record.id);
  const records = [...state.records];
  if (index >= 0) records[index] = record;
  else records.unshift(record);
  writeLocal(records);
  return { records };
}

async function deleteRecord(id) {
  if (state.mode === "cloud") {
    return await request(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  const records = state.records.filter((item) => item.id !== id);
  writeLocal(records);
  return { records };
}

async function clearAllRecords() {
  if (state.mode === "cloud") {
    return await request(`${API}?all=1`, { method: "DELETE" });
  }
  writeLocal([]);
  return { records: [] };
}

function normalizeLocal(data) {
  return {
    ...data,
    id: data.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString()
  };
}

function readLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocal(records) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
}

function resetForm() {
  els.form.reset();
  els.form.id.value = "";
  els.form.extraGiftLessons.value = "0";
  els.submitBtn.textContent = "提交记录";
}

function renderAll() {
  renderSummary();
  renderAnalytics();
}

function getFiltered() {
  return state.records.filter((item) => {
    const text = [item.studentId, item.lp, item.newSignChannel, item.continent, item.renewType, item.note].join(" ").toLowerCase();
    const matchesText = !state.search || text.includes(state.search);
    const matchesContinent = !state.continent || item.continent === state.continent;
    const matchesType = !state.renewType || item.renewType === state.renewType;
    return matchesText && matchesContinent && matchesType;
  });
}

function renderSummary() {
  const records = getFiltered();
  els.metricRow.innerHTML = [
    metric("记录数", records.length),
    metric("申请续费总额", money(sumBy(records, "renewPackageTotal"))),
    metric("新签总额", money(sumBy(records, "newPackageTotal"))),
    metric("额外赠课合计", plainNumber(sumBy(records, "extraGiftLessons")))
  ].join("");

  if (!records.length) {
    els.rows.innerHTML = `<tr><td colspan="14"><div class="empty">暂无数据</div></td></tr>`;
    return;
  }

  els.rows.innerHTML = records.map((item) => `
    <tr>
      <td>${escapeHtml(item.studentId)}</td>
      <td>${escapeHtml(item.lp)}</td>
      <td>${escapeHtml(item.newSignChannel || "")}</td>
      <td>${escapeHtml(item.continent)}</td>
      <td><span class="status" data-type="${escapeHtml(item.renewType)}">${escapeHtml(item.renewType)}</span></td>
      <td>${money(item.newPackageTotal)}</td>
      <td>${money(item.newLessonPrice)}</td>
      <td>${plainNumber(item.newBeans)}</td>
      <td>${money(item.renewPackageTotal)}</td>
      <td>${money(item.renewLessonPrice)}</td>
      <td>${plainNumber(item.extraGiftLessons)}</td>
      <td class="note-cell">${escapeHtml(item.note || "")}</td>
      <td>${formatDate(item.updatedAt)}</td>
      <td>
        <div class="row-actions">
          <button type="button" data-edit="${item.id}">编辑</button>
          <button class="danger" type="button" data-delete="${item.id}">删除</button>
        </div>
      </td>
    </tr>
  `).join("");

  els.rows.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editRecord(button.dataset.edit));
  });
  els.rows.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => removeRecord(button.dataset.delete));
  });
}

function renderAnalytics() {
  const records = state.records;
  const renewTotal = sumBy(records, "renewPackageTotal");
  const newTotal = sumBy(records, "newPackageTotal");
  els.analysisMetricRow.innerHTML = [
    metric("平均续费金额", money(avgBy(records, "renewPackageTotal"))),
    metric("平均续费课单价", money(avgBy(records, "renewLessonPrice"))),
    metric("赠送豌豆币合计", plainNumber(sumBy(records, "newBeans"))),
    metric("续费与新签差额", money(renewTotal - newTotal))
  ].join("");

  renderRank(els.typeRank, countBy(records, "renewType"), "人");
  renderRank(els.lpRank, amountBy(records, "lp", "renewPackageTotal"), "", money);
  renderContinentStats(records);
  renderTopRenew(records);
}

function renderContinentStats(records) {
  const grouped = groupBy(records, "continent");
  const rows = Object.entries(grouped)
    .map(([continent, list]) => ({
      continent,
      count: list.length,
      renewTotal: sumBy(list, "renewPackageTotal"),
      avgRenew: avgBy(list, "renewPackageTotal"),
      avgLesson: avgBy(list, "renewLessonPrice"),
      gift: sumBy(list, "extraGiftLessons")
    }))
    .sort((a, b) => b.renewTotal - a.renewTotal);

  els.continentStats.innerHTML = rows.length
    ? rows.map((item) => `
        <tr>
          <td>${escapeHtml(item.continent)}</td>
          <td>${plainNumber(item.count)}</td>
          <td>${money(item.renewTotal)}</td>
          <td>${money(item.avgRenew)}</td>
          <td>${money(item.avgLesson)}</td>
          <td>${plainNumber(item.gift)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="6"><div class="empty">暂无数据</div></td></tr>`;
}

function renderTopRenew(records) {
  const top = [...records]
    .sort((a, b) => Number(b.renewPackageTotal || 0) - Number(a.renewPackageTotal || 0))
    .slice(0, 6);

  els.topRenewRecords.innerHTML = top.length
    ? top.map((item) => `
        <div class="highlight">
          <strong>${escapeHtml(item.studentId)} · ${money(item.renewPackageTotal)}</strong>
          <span>${escapeHtml(item.lp)} / ${escapeHtml(item.continent)} / ${escapeHtml(item.renewType)} / 赠课 ${plainNumber(item.extraGiftLessons)}</span>
        </div>
      `).join("")
    : `<div class="empty">暂无数据</div>`;
}

function renderRank(container, data, unit, formatter = plainNumber) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  if (!entries.length) {
    container.innerHTML = `<div class="empty">暂无数据</div>`;
    return;
  }
  const max = Math.max(...entries.map((item) => item[1]), 1);
  container.innerHTML = entries.map(([name, count]) => `
    <div class="bar">
      <div class="bar-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max((count / max) * 100, 4)}%"></div></div>
      <div class="bar-value">${formatter(count)}${unit}</div>
    </div>
  `).join("");
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  Object.entries(record).forEach(([key, value]) => {
    if (els.form.elements[key]) els.form.elements[key].value = value ?? "";
  });
  els.submitBtn.textContent = "更新记录";
  document.querySelector('[data-tab="form"]').click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function removeRecord(id) {
  if (!confirm("删除这条记录？")) return;
  try {
    setSync("Deleting");
    const result = await deleteRecord(id);
    state.records = result.records;
    renderAll();
    toast("Record deleted");
  } catch (error) {
    toast(error.message || "Delete failed", true);
  } finally {
    setSync(state.mode === "cloud" ? `Synced ${formatTime(new Date())}` : "Local preview mode");
  }
}

function exportCsv() {
  const rows = [
    ["学员ID", "学员归属LP", "新签渠道", "归属大洲", "一续or多续", "新签课包总价", "新签课包课单价", "新签课包赠送豌豆币数量", "申请续费课包总价", "续费课包课单价", "额外加码赠课", "备注情况说明", "更新时间"]
  ];
  getFiltered().forEach((item) => {
    rows.push([
      item.studentId, item.lp, item.newSignChannel, item.continent, item.renewType,
      item.newPackageTotal, item.newLessonPrice, item.newBeans,
      item.renewPackageTotal, item.renewLessonPrice, item.extraGiftLessons,
      item.note, formatDate(item.updatedAt)
    ]);
  });
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `student-renewal-stats_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function setSync(text) {
  els.sync.textContent = text;
}

function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.style.background = isError ? "#b42318" : "#101828";
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function toNumber(value) {
  return Number(value || 0);
}

function sumBy(records, key) {
  return records.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function avgBy(records, key) {
  return records.length ? sumBy(records, key) / records.length : 0;
}

function groupBy(records, key) {
  return records.reduce((map, item) => {
    const label = item[key] || "未填写";
    map[label] ||= [];
    map[label].push(item);
    return map;
  }, {});
}

function countBy(records, key) {
  return records.reduce((map, item) => {
    const label = item[key] || "未填写";
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
}

function amountBy(records, groupKey, amountKey) {
  return records.reduce((map, item) => {
    const label = item[groupKey] || "未填写";
    map[label] = (map[label] || 0) + Number(item[amountKey] || 0);
    return map;
  }, {});
}

function money(value) {
  return Number(value || 0).toLocaleString("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  });
}

function plainNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatTime(value) {
  return value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

loadRecords(false);

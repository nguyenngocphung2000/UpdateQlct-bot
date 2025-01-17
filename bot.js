function doPost(e) {
  const { message } = JSON.parse(e.postData.contents);
  const chatId = message.chat.id;
  const text = message.text;

  if (text.startsWith("/start")) {
    sendMessage(
      chatId,
      `Chào bạn nha @@!\n\nHướng dẫn sử dụng:\n\n1. Thêm giao dịch:\n   Nhập theo cú pháp: <số tiền> <thu/chi> <mô tả>.\n\n2. Xem báo cáo:\n   - /report: Báo cáo tổng.\n   - /report mm/yyyy: Báo cáo tháng.\n   - /report dd/mm/yyyy: Báo cáo tuần (hiển thị tuần có ngày được chọn).\n   - Thêm "az" hoặc "za" sau lệnh để sắp xếp:\n     Ví dụ: /report az hoặc /report mm/yyyy za.\n\n3. Hủy giao dịch gần nhất:\n   - /undo: Xóa giao dịch gần nhất.\n\n4. Xóa toàn bộ dữ liệu:\n   - /reset: Xóa tất cả dữ liệu trên bảng tính.\n`
    );
  } else if (text.startsWith("/report")) {
    handleReport(chatId, text);
  } else if (text.startsWith("/reset")) {
    resetSheet(chatId);
  } else if (text.startsWith("/undo")) {
    undoLast(chatId);
  } else {
    handleTransaction(chatId, text);
  }
}

function handleTransaction(chatId, text) {
  const [amount, type, ...desc] = text.split(" ");
  if (!isValidAmount(amount) || !["thu", "chi"].includes(type.toLowerCase())) {
    sendMessage(chatId, "Lỗi: Nhập đúng cú pháp <số tiền> <thu/chi> <mô tả>.");
    return;
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  sheet.appendRow([
    new Date(),
    type.toLowerCase(),
    parseAmount(amount),
    desc.join(" ") || "Không có mô tả",
  ]);
  sendMessage(chatId, `Đã thêm giao dịch:\nSố tiền: ${amount}\nLoại: ${type}\nMô tả: ${desc.join(" ")}`);
}

function handleReport(chatId, text) {
  const dateRegex = /\d{2}\/\d{4}|\d{2}\/\d{2}\/\d{4}/;
  const dateParam = text.match(dateRegex)?.[0];
  let filter = "all";
  let sortOrder = null;

  if (text.includes("az")) {
    sortOrder = "az";
  } else if (text.includes("za")) {
    sortOrder = "za";
  }

  if (dateParam) {
    filter = dateParam.length === 7 ? "month" : "week";
  }

  generateReport(chatId, filter, dateParam, sortOrder);
}

function generateReport(chatId, filter, dateParam, sortOrder) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  const data = sheet.getDataRange().getValues().slice(1);

  if (!data.length) {
    sendMessage(chatId, "Không có dữ liệu.");
    return;
  }

  const now = parseDate(filter, dateParam);
  const filteredData = data.filter(([date]) =>
    isValidDate(new Date(date), filter, now)
  );

  if (sortOrder) {
    filteredData.sort((a, b) => {
      const amountA = a[2];
      const amountB = b[2];
      return sortOrder === "az" ? amountA - amountB : amountB - amountA;
    });
  }

  const incomeTransactions = [];
  const expenseTransactions = [];
  let [income, expense] = [0, 0];

  filteredData.forEach(([date, type, amount, desc]) => {
    const formattedReportDate = new Date(date).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
    });

    const transaction = `${formatCurrency(amount)}: ${desc || "Không có mô tả"} (${formattedReportDate})`;

    if (type === "thu") {
      income += amount;
      incomeTransactions.push(`+ ${transaction}`);
    } else if (type === "chi") {
      expense += amount;
      expenseTransactions.push(`- ${transaction}`);
    }
  });

  if (!filteredData.length) {
    const range = filter === "week" ? "tuần" : "tháng";
    sendMessage(chatId, `Không có giao dịch cho ${range} được yêu cầu.`);
    return;
  }

  const weekInfo =
    filter === "week"
      ? ` (tuần từ ${now.startOfWeek.toLocaleDateString("vi-VN")} đến ${now.endOfWeek.toLocaleDateString("vi-VN")})`
      : "";

  const report = [
    `Báo cáo (${filter === "all" ? "tổng" : filter}${weekInfo}):`,
    `Tổng thu: ${formatCurrency(income)}`,
    `Tổng chi: ${formatCurrency(expense)}`,
    `Cân đối: ${formatCurrency(income - expense)}`,
    "",
    "Giao dịch thu nhập cụ thể:",
    incomeTransactions.length ? incomeTransactions.join("\n") : "Không có giao dịch thu nhập.",
    "",
    "Giao dịch chi tiêu cụ thể:",
    expenseTransactions.length ? expenseTransactions.join("\n") : "Không có giao dịch chi tiêu.",
  ].join("\n");

  sendMessage(chatId, report);
}

function resetSheet(chatId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  sheet.clear();
  sheet.appendRow(["Thời gian", "Loại", "Số tiền", "Mô tả"]);
  sendMessage(chatId, "Đã xóa toàn bộ dữ liệu.");
}

function undoLast(chatId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRow(lastRow);
    sendMessage(chatId, "Đã xóa giao dịch gần nhất.");
  } else {
    sendMessage(chatId, "Không có giao dịch nào để xóa.");
  }
}

function isValidDate(date, filter, now) {
  if (filter === "month") {
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  }
  if (filter === "week") {
    const { startOfWeek, endOfWeek } = now;
    return date >= startOfWeek && date <= endOfWeek;
  }
  return true;
}

function parseDate(filter, dateParam) {
  if (!dateParam) return new Date();
  const parts = dateParam.split("/");
  if (filter === "month" && parts.length === 2) {
    return new Date(parts[1], parts[0] - 1);
  }
  if (filter === "week" && parts.length === 3) {
    const date = new Date(parts[2], parts[1] - 1, parts[0]);
    const dayOfWeek = date.getDay() || 7;
    date.startOfWeek = new Date(date);
    date.startOfWeek.setDate(date.getDate() - dayOfWeek + 1);
    date.endOfWeek = new Date(date.startOfWeek);
    date.endOfWeek.setDate(date.startOfWeek.getDate() + 6);
    return date;
  }
  return new Date();
}

function isValidAmount(amount) {
  return /^[0-9]+(k|tr)?$/.test(amount);
}

function parseAmount(amount) {
  return parseFloat(amount.replace("tr", "000000").replace("k", "000")) || 0;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

function sendMessage(chatId, text) {
  UrlFetchApp.fetch(`${API_URL}/sendMessage`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text }),
  });
}
}

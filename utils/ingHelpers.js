const { ING_BANK_ID } = require("./constants");

const TYPE_INCOME = "income";
const TYPE_EXPENSE = "expense";

const ING_UNWANTED_STUFF_START = "ING Bank N.V. Amsterdam";
const ING_UNWANTED_STUFF_START_ARRAY = ["Sold iniţial", "Sold initial"];
const ING_UNWANTED_STUFF_END = "DebitCreditDetalii tranzactieData";
const ING_COUNTERPARTY_KEYWORDS = ["Ordonator:", "Beneficiar:", "Terminal:"];
const ING_REFERENCE_KEYWORDS = [
  "Referinţă:",
  "Referinta:",
  "Numar autorizare:",
  "Autorizare:",
];


// To-do: Make sure amounts are normalized to a consistent format
// To-do: Make sure dates are parsed correctly and normalized

function ingIdentifyBank(text) {
  if (text.includes("RB-PJS-40 024/18.02.99")) {
    return ING_BANK_ID;
  }
  return null;
}

function ingExtractInitialBalance(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].startsWith(ING_UNWANTED_STUFF_START_ARRAY[0]) ||
      lines[i].startsWith(ING_UNWANTED_STUFF_START_ARRAY[1])
    ) {
      const match = lines[i].match(
        /Sold (?:iniţial|initial)\s*(\d{1,3}(?:\.\d{3})*,\d{2})/
      );
      if (match) {
        return match[1];
      } else {
        return lines[i+1];
      }
    }
  }

  return null;
}

function ingExtractFinalBalance(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Sold final")) {
      return lines[i+1];
    }
  }

  return null;
}

function ingExtractCurrency(text) {
  // List of expected currencies
  const validCurrencies = ["RON", "EUR", "USD"];

  // Regular expression to match any of the valid currencies possibly followed by more text
  const currencyRegex = new RegExp(
    `(${validCurrencies.join("|")})([A-Z]*\\d*|[A-Z]+\\d*)`,
    "g"
  );
  let matches;
  let foundCurrencies = [];

  while ((matches = currencyRegex.exec(text)) !== null) {
    foundCurrencies.push(matches[1]);
  }

  // Return the first valid currency found or null if none
  return foundCurrencies.length > 0 ? foundCurrencies[0] : null;
}

function ingExtractStatementDates(text) {
  const regex = /(\d{2})\/(\d{2})\/(\d{4})-(\d{2})\/(\d{2})\/(\d{4})/;
  const match = text.match(regex);

  if (!match) return null;

  const [, d1, m1, y1, d2, m2, y2] = match;

  const format = (y, m, d) =>
    `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

  return {
    startDate: format(y1, m1, d1),
    endDate: format(y2, m2, d2),
  };
}

function parseTransactionHeaderLine(line) {
  const romanianMonths = [
    "ianuarie",
    "februarie",
    "martie",
    "aprilie",
    "mai",
    "iunie",
    "iulie",
    "august",
    "septembrie",
    "octombrie",
    "noiembrie",
    "decembrie",
  ];

  // Match date pattern at the end of the string
  const datePattern = new RegExp(
    `(\\d{2})\\s+(${romanianMonths.join("|")})\\s+(\\d{4})$`,
    "i"
  );

  const dateMatch = line.match(datePattern);

  if (!dateMatch) {
    return null; // 1. No valid date at end
  }

  // Extract date parts
  const [fullDate, day, month, year] = dateMatch;
  const date = `${day} ${month} ${year}`;

  // Remove the date part from the original string
  const textWithoutDate = line.replace(datePattern, "").trim();

  // Match amount (format: number,decimal)
  const amountPattern = /^(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const amountMatch = textWithoutDate.match(amountPattern);

  if (amountMatch) {
    const rawAmount = amountMatch[1];
    const name = textWithoutDate.replace(rawAmount, "").trim();

    return {
      date,
      amount: rawAmount,
      name,
      type: TYPE_EXPENSE,
    };
  } else {
    return {
      date,
      amount: null,
      name: textWithoutDate,
      type: TYPE_INCOME,
    };
  }
}

function checkDetailsForAmount(transaction) {
  if (transaction.amount) return transaction;

  for (const line of transaction.details) {
    const amountRegex = /^(\d{1,3}(?:\.\d{3})*,\d{2})$/;
    if (amountRegex.test(line.trim())) {
      transaction.details = transaction.details.filter((l) => l !== line);
      transaction.amount = line.trim();
      return transaction;
    }
  }
  return transaction;
}
function checkDetailsForCounterparty(transaction) {
  for (const line of transaction.details) {
    for (const keyword of ING_COUNTERPARTY_KEYWORDS) {
      if (line.startsWith(keyword)) {
        transaction.details = transaction.details.filter((l) => l !== line);
        transaction.location = line.replace(keyword, "").trim();
        return transaction;
      }
    }
  }
  return transaction;
}
function checkDetailsForReference(transaction) {
  for (const line of transaction.details) {
    for (const keyword of ING_REFERENCE_KEYWORDS) {
      if (line.includes(keyword)) {
        transaction.details = transaction.details.filter((l) => l !== line);
        const lineElements = line.split(":");
        transaction.reference = lineElements
          ? lineElements[lineElements.length - 1].trim()
          : "";
        return transaction;
      }
    }
  }
  return transaction;
}

function ingStatementParse(text, currency = "RON") {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const transactions = [];
  let current = null;
  let skipLines = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (
      line.startsWith(ING_UNWANTED_STUFF_START_ARRAY[0]) ||
      line.startsWith(ING_UNWANTED_STUFF_START_ARRAY[1]) ||
      (lines[i + 2] && lines[i + 2].startsWith(ING_UNWANTED_STUFF_START))
    ) {
      skipLines = true;

      if (current) {
        current = checkDetailsForAmount(current);
        current = checkDetailsForCounterparty(current);
        current = checkDetailsForReference(current);
        transactions.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith(ING_UNWANTED_STUFF_END)) {
      skipLines = false;
      continue;
    }

    if (skipLines) {
      continue;
    }

    const headerLine = parseTransactionHeaderLine(line);
    if (headerLine) {
      if (current) {
        current = checkDetailsForAmount(current);
        current = checkDetailsForCounterparty(current);
        current = checkDetailsForReference(current);
        transactions.push(current);
        current = null;
      }

      current = {
        name: headerLine.name,
        date: headerLine.date,
        amount: headerLine.amount,
        currency: currency,
        type: headerLine.type,
        details: [],
        reference: null,
        location: "",
      };

      continue;
    }

    if (!headerLine && current) {
      current.details.push(lines[i]);
    }
  }

  if (current) {
    current = checkDetailsForAmount(current);
    current = checkDetailsForCounterparty(current);
    current = checkDetailsForReference(current);
    transactions.push(current);
    current = null;
  }

  return transactions;
}

module.exports = {
  ingExtractInitialBalance,
  ingExtractFinalBalance,
  ingStatementParse,
  ingIdentifyBank,
  ingExtractCurrency,
  ingExtractStatementDates,
};

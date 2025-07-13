const { REV_BANK_ID, ROMANIAM_MONTHS, TYPE_INCOME, TYPE_EXPENSE } = require("./constants");
const { parseLocaleNumber } = require("./numbersHelpers");

const REV_END_LOOP_KEYWORDS = ["Înapoiate din", "Tranzacții din Buzunare"];
const REV_UNWANTED_STUFF_START_1 = "IBAN";
const REV_UNWANTED_STUFF_START_2 = "Extras RON";
const REV_UNWANTED_STUFF_END = "DatăDescriereSume retraseSume adăugateSold";
const INCOME_KEYWORDS = ["De la:"];
const REV_EXCHANGE_KEYWORDS = ["Schimbat în", "To"];

function revIdentifyBank(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Revolut Bank UAB")) {
      return REV_BANK_ID;
    }
  }

  return null;
}

function revExtractCurrency(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Extras ")) {
      return lines[i].split(" ")[1].trim().toUpperCase();
    }
  }

  return null;
}

function revExtractStatementDates(text) {
  const dateRangeRegex =
    /Tranzacții din cont de la (\d{1,2}) (\w+) (\d{4}) până la (\d{1,2}) (\w+) (\d{4})/i;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let startDate = [];
  let endDate = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(dateRangeRegex);
    if (!match) continue;

    const [, d1, m1, y1, d2, m2, y2] = match;
    const month1 = ROMANIAM_MONTHS[m1.toLowerCase()];
    const month2 = ROMANIAM_MONTHS[m2.toLowerCase()];
    if (!month1 || !month2) return null;

    // Pad month/day to 2 digits
    const format = (y, m, d) =>
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    startDate.push(format(y1, month1, d1));
    endDate.push(format(y2, month2, d2));
  }

  return {
    startDate: startDate[0],
    endDate: endDate[endDate.length - 1],
  };
}

function getTrailingAmountRegex(currency) {
  // gets the regex for the trailing amount in a line, the last amount in the line
  switch (currency) {
    case "RON":
      return new RegExp(
        `(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}$`
      );
    case "EUR":
      return new RegExp(`€\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))$`);
    case "USD":
      return new RegExp(`\\$\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))$`);
    default:
      throw new Error(
        `Unsupported currency: ${currency}. Supported currencies are RON, EUR, USD.`
      );
  }
}

function getAmountRegexByCurrency(currency, flags = "") {
  switch (currency) {
    case "RON":
      return new RegExp(
        `(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}`,
        flags
      );
    case "EUR":
      return new RegExp(`€\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, flags);
    case "USD":
      return new RegExp(
        `\\$\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`,
        flags
      );
    default:
      // Fallback: match either symbol prefix or currency suffix
      throw new Error(
        `Unsupported currency: ${currency}. Supported currencies are RON, EUR, USD.`
      );
  }
}

function extractAmountStrings(line, currency = "RON") {
  const regex = getAmountRegexByCurrency(currency, "gi");
  const matches = [];
  let match;
  while ((match = regex.exec(line)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function revExtractInitialBalance(text, currency = "RON") {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const matches = extractAmountStrings(lines[i], currency);
    if (matches.length === 4) {
      return parseLocaleNumber(matches[0]).toFixed(2);
    }
  }

  return null;
}

function revExtractFinalBalance(text, currency = "RON") {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let foundMatches = [];
  for (let i = 0; i < lines.length; i++) {
    const matches = extractAmountStrings(lines[i], currency);
    if (matches.length === 4) {
      foundMatches.push(matches[3]);
    }
  }

  if (foundMatches.length > 0) {
    return parseLocaleNumber(foundMatches[foundMatches.length - 1]).toFixed(2);
  }
  return null;
}

function parseDateTransactionLine(line, currency = "RON") {
  const dateRegex =
    /^(\d{1,2}) (ian|feb|mar|apr|mai|iun|iul|aug|sep|oct|nov|dec)\. (\d{4})/i;
  const monthMap = {
    ian: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    mai: "05",
    iun: "06",
    iul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const matchDate = line.match(dateRegex);
  if (!matchDate) return null;

  const [rawDate, day, roMonth, year] = matchDate;
  const date = `${year}-${monthMap[roMonth.toLowerCase()]}-${day.padStart(
    2,
    "0"
  )}`;
  let rest = line.slice(rawDate.length).trim();

  // Remove trailing balance amount
  const trailingAmountRegex = getTrailingAmountRegex(currency);
  rest = rest.replace(trailingAmountRegex, "").trim();

  const knownCounterpartyRegexes = [
    /Top-Up by \*\d{4}/i,
    /Transfer către [A-Z\- ]+/i,
    // Add more patterns here
  ];

  let counterparty = "";
  let amount = null;

  // 1. Try known counterparties
  for (const regex of knownCounterpartyRegexes) {
    const match = rest.match(regex);
    if (match) {
      counterparty = match[0];

      // Find amount after the known counterparty
      const restAfterCounterparty = rest
        .slice(match.index + match[0].length)
        .trim();
      const amountRegex = getAmountRegexByCurrency(currency, "i");
      const amountMatch = restAfterCounterparty.match(amountRegex);
      if (amountMatch) {
        amount = amountMatch[1];
      }

      return { date, counterparty, amount };
    }
  }

  // 2. Fallback: generic counterparty extraction
  const amountRegex = getTrailingAmountRegex(currency);
  const amountMatch = rest.match(amountRegex);
  if (amountMatch) {
    amount = amountMatch[1];
    counterparty = rest.slice(0, amountMatch.index).trim();
  } else {
    counterparty = rest; // fallback to entire rest if no amount found
  }

  return { date, counterparty, amount };
}

function checkDetailsForIncome(transaction) {
  for (const line of transaction.details) {
    for (const keyword of INCOME_KEYWORDS) {
      if (line.includes(keyword)) {
        return TYPE_INCOME;
      }
    }
  }

  for (const keyword of REV_EXCHANGE_KEYWORDS) {
    if (transaction.location.startsWith(keyword)) {
      if (transaction.location === keyword + " " + transaction.currency) {
        return TYPE_INCOME; // Exchanges of same currency  as the account is considered income
      }
    }
  }

  return TYPE_EXPENSE;
}

function extractRevolutIban(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase() === "iban") {
      // Check next 1-2 lines for IBAN match
      for (let j = 1; j <= 2; j++) {
        const possibleIban = lines[i + j];
        if (isValidIban(possibleIban)) {
          return possibleIban.toUpperCase().replace(/\s+/g, "");
        }
      }
    }
  }

  return null;
}

// Helper to validate IBAN format
function isValidIban(str) {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{12,30}$/.test(
    str.replace(/\s+/g, "").toUpperCase()
  );
}

function revStatementParse(text, currency = "RON") {
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
      line.startsWith(REV_UNWANTED_STUFF_START_1) ||
      line.startsWith(REV_UNWANTED_STUFF_START_2)
    ) {
      skipLines = true;
      if (current) {
        current.type = checkDetailsForIncome(current);
        transactions.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith(REV_UNWANTED_STUFF_END)) {
      skipLines = false;
      continue;
    }

    if (skipLines) {
      continue;
    }

    if (line.startsWith(REV_END_LOOP_KEYWORDS[0])) {
      if (current) {
        current.type = checkDetailsForIncome(current);
        transactions.push(current);
        current = null;
      }
      break;
    }

    const headerLine = parseDateTransactionLine(lines[i], currency);
    if (headerLine) {
      if (current) {
        current.type = checkDetailsForIncome(current);
        transactions.push(current);
        current = null;
      }

      current = {
        name: "revolut transaction",
        date: headerLine.date,
        amount: headerLine.amount,
        currency: currency,
        type: "",
        details: [],
        reference: null,
        location: headerLine.counterparty,
      };

      continue;
    }

    if (!headerLine && current) {
      // If the line is a reference, we can set it
      if (line.startsWith("Referință:")) {
        current.reference = line.slice(10).trim();
        continue;
      }

      current.details.push(lines[i]);
    }
  }

  if (current) {
    current.type = checkDetailsForIncome(current);
    transactions.push(current);
    current = null;
  }

  return transactions;
}

module.exports = {
  revIdentifyBank,
  revExtractCurrency,
  revExtractStatementDates,
  revExtractInitialBalance,
  revExtractFinalBalance,
  revStatementParse,
  extractRevolutIban,
};

const ROMANIAM_MONTHS = {
  ianuarie: 1,
  februarie: 2,
  martie: 3,
  aprilie: 4,
  mai: 5,
  iunie: 6,
  iulie: 7,
  august: 8,
  septembrie: 9,
  octombrie: 10,
  noiembrie: 11,
  decembrie: 12,
};

function revIdentifyBank(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Revolut Bank UAB Vilnius")) {
      return "REV";
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

function revExtractStatementDate(text) {
  const dateRangeRegex =
    /de la (\d{1,2}) (\w+) (\d{4}) până la (\d{1,2}) (\w+) (\d{4})/i;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let startDate = null;
  let endDate = null;

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

    startDate = format(y1, month1, d1);
    endDate = format(y2, month2, d2);

    break;
  }

  return {
    startDate,
    endDate,
  };
}

function extractAmountStrings(line, currency = "RON") {
  const regex = new RegExp(
    `(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}`,
    "g"
  );
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
      return matches[0];
    }
  }

  return null;
}

function revExtractFinalBalance(text, currency = "RON") {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const matches = extractAmountStrings(lines[i], currency);
    if (matches.length === 4) {
      return matches[3];
    }
  }

  return null;
}

const REV_UNWANTED_STUFF_START_1 = "IBAN";
const REV_UNWANTED_STUFF_START_2 = "Extras RON";
const REV_UNWANTED_STUFF_END = "DatăDescriereSume retraseSume adăugateSold";

function getAmountRegexByCurrency(currency) {
  switch (currency) {
    case 'RON':
      return new RegExp(`(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}`, 'gi');
    case 'EUR':
      return new RegExp(`€\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, 'gi');
    case 'USD':
      return new RegExp(`\\$\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, 'gi');
    default:
      // Fallback: match either symbol prefix or currency suffix
      return new RegExp(`(?:€|\\$)?\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*(?:${currency})?`, 'gi');
  }
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
  const trailingAmountRegex = new RegExp(
    `(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}$`
  );
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
      const amountRegex = new RegExp(
        `(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}`,
        "i"
      );
      const amountMatch = restAfterCounterparty.match(amountRegex);
      if (amountMatch) {
        amount = amountMatch[1];
      }

      return { date, counterparty, amount };
    }
  }

  // 2. Fallback: generic counterparty extraction
  const amountRegex = new RegExp(
    `(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))\\s*${currency}`,
    "i"
  );
  const amountMatch = rest.match(amountRegex);
  if (amountMatch) {
    amount = amountMatch[1];
    counterparty = rest.slice(0, amountMatch.index).trim();
  } else {
    counterparty = rest; // fallback to entire rest if no amount found
  }

  return { date, counterparty, amount };
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

    const headerLine = parseDateTransactionLine(lines[i], currency);
    if (headerLine) {
      if (current) {
        transactions.push(current);
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

  return transactions;
}

module.exports = {
  revIdentifyBank,
  revExtractCurrency,
  revExtractStatementDate,
  revExtractInitialBalance,
  revExtractFinalBalance,
  revStatementParse,
};

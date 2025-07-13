const path = require("path");
const fs = require("fs/promises");
const pdf = require("pdf-parse");
const {
  btStatementParse,
  btExtractStatementDates,
  btIdentifyBank,
  btExtractCurrency,
  btExtractInitialBalance,
  btExtractFinalBalance,
} = require("./btHelpers");
const {
  ingStatementParse,
  ingIdentifyBank,
  ingExtractInitialBalance,
  ingExtractFinalBalance,
  ingExtractCurrency,
  ingExtractStatementDates,
} = require("./ingHelpers");
const {
  revIdentifyBank,
  revExtractCurrency,
  revExtractStatementDates,
  revExtractInitialBalance,
  revExtractFinalBalance,
  revStatementParse,
  extractRevolutIban,
} = require("./revHelpers");

const { REV_BANK_ID, BT_BANK_ID, ING_BANK_ID } = require("./constants");

function getStatementBank(data) {
  if (ingIdentifyBank(data)) {
    return ING_BANK_ID;
  }
  if (btIdentifyBank(data)) {
    return BT_BANK_ID;
  }
  if (revIdentifyBank(data)) {
    return REV_BANK_ID;
  }
  return null;
}

function extractStatementDates(text, bank) {
  switch (bank) {
    case ING_BANK_ID:
      return ingExtractStatementDates(text);
    case BT_BANK_ID:
      return btExtractStatementDates(text);
    case REV_BANK_ID:
      return revExtractStatementDates(text);
    default:
      return "Unknown bank";
  }
}

function extractCurrency(text, bank) {
  switch (bank) {
    case ING_BANK_ID:
      return ingExtractCurrency(text);
    case BT_BANK_ID:
      return btExtractCurrency(text);
    case REV_BANK_ID:
      return revExtractCurrency(text);
    default:
      return "Unknown bank";
      break;
  }
}

function extractInitialBalance(text, bank, currency) {
  switch (bank) {
    case ING_BANK_ID:
      return ingExtractInitialBalance(text);
    case BT_BANK_ID:
      return btExtractInitialBalance(text);
    case REV_BANK_ID:
      return revExtractInitialBalance(text, currency);

    default:
      return null;
  }
}

function extractFinalBalance(text, bank, currency) {
  switch (bank) {
    case ING_BANK_ID:
      return ingExtractFinalBalance(text);
    case BT_BANK_ID:
      return btExtractFinalBalance(text);
    case REV_BANK_ID:
      return revExtractFinalBalance(text, currency);

    default:
      return null;
  }
}

function extractIban(text, bank) {
  if (bank === REV_BANK_ID) {
    return extractRevolutIban(text);
  }

  // Enhanced regular expression to match an IBAN, including those with longer alphanumeric sequences
  const ibanRegex = /[A-Z]{2}\d{2}[A-Z0-9]{12,30}/;
  const match = text.match(ibanRegex);
  if (match) {
    return match[0];
  }
  return null;
}

function parseTransactions(data, bank, currency = "RON", numpages = 1) {
  switch (bank) {
    case ING_BANK_ID:
      return ingStatementParse(data, currency);
    case BT_BANK_ID:
      return btStatementParse(data, currency);
    case REV_BANK_ID:
      return revStatementParse(data, currency);

    default:
      return false;
      break;
  }
}

function mergeMetaArray(metaArray) {
  if (!Array.isArray(metaArray) || metaArray.length === 0) return null;

  // Sort by startDate ascending
  const sorted = metaArray
    .slice()
    .sort((a, b) => new Date(a.dates.startDate) - new Date(b.dates.startDate));

  return {
    bank: sorted[0].bank,
    currency: sorted[0].currency,
    dates: {
      startDate: sorted[0].dates.startDate,
      endDate: sorted[sorted.length - 1].dates.endDate,
    },
    initialBalance: sorted[0].initialBalance,
    finalBalance: sorted[sorted.length - 1].finalBalance,
  };
}

const parseStatement = async (filePath, fileName) => {
  let dataBuffer = await fs.readFile(filePath);
  const fileData = await pdf(dataBuffer);

  await fs.writeFile("logs/" + fileName + "_log.txt", fileData.text, "utf8");

  const statementBank = getStatementBank(fileData.text);
  const statementIBAN = extractIban(fileData.text, statementBank);
  const statementDates = extractStatementDates(fileData.text, statementBank);
  const statementCurrency = extractCurrency(fileData.text, statementBank);
  const statementInitialBalance = extractInitialBalance(
    fileData.text,
    statementBank,
    statementCurrency
  );
  const statementFinalBalance = extractFinalBalance(
    fileData.text,
    statementBank,
    statementCurrency
  );

  const transactions = parseTransactions(
    fileData.text,
    statementBank,
    statementCurrency,
    fileData.numpages
  );

  console.log(
    JSON.stringify({
      statementBank,
      statementCurrency,
      statementDates,
      statementInitialBalance,
      statementFinalBalance,
      statementIBAN,
      // transactions
    })
  );

  let out = {};
  out[statementIBAN] = {
    meta: {
      bank: statementBank,
      currency: statementCurrency,
      dates: statementDates,
      initialBalance: statementInitialBalance,
      finalBalance: statementFinalBalance,
    },
    transactions: transactions,
  };

  return out;
};

const analyzeFolder = async (folderPath) => {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const pdfFiles = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")
    )
    .map((entry) => path.join(folderPath, entry.name));

  const results = {};

  for (const file of pdfFiles) {
    try {
      const fileResult = await parseStatement(file, "folder_file");

      // Merge results into the main results object
      for (const [iban, data] of Object.entries(fileResult)) {
        if (!results[iban]) {
          results[iban] = {
            meta: {},
            meta_array: [],
            transactions: [],
          };
        }
        results[iban].meta_array.push(data.meta);
        results[iban].transactions.push(...data.transactions);
        results[iban].meta = mergeMetaArray(results[iban].meta_array);
      }

      console.log(`Parsed: ${file}`);
    } catch (err) {
      console.error(`Error parsing ${file}: ${err.message}`);
    }
  }

  return results;
};

module.exports = {
  parseStatement,
  analyzeFolder,
};

const path = require("path");
const fs = require("fs/promises");
const pdf = require("pdf-parse");
const { randomUUID } = require("crypto");
const { parseLocaleNumber } = require("./numbersHelpers");
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
const { normalizeCounterparty } = require("./counterpartiesHelpers");

function formatTrasactionObject(transaction, RULES) {
  const counterpartyId = normalizeCounterparty(transaction, RULES);
  const tag = counterpartyId ? RULES.find(rule => rule.name === counterpartyId)?.tag || "" : "";

  return {
    proprietaryBankTransactionCode: transaction.name || "Unknown",
    bookingDate: transaction.date || "Unknown",
    transactionAmount: formatTransactionAmount({ ...transaction }),
    details: transaction.details || [],
    transactionId: transaction.reference || null,
    counterparty: {
      id: counterpartyId,
      description: !counterpartyId ? transaction.location || "" : "",
    },
    tag: tag,
    internalTransactionId: randomUUID(),
  };
}

function formatTransactionAmount(transaction) {
  if (!transaction || !transaction.type || !transaction.amount) {
    console.warn("Invalid transaction data:", transaction);
    return {
      amount: 0,
      currency: transaction.currency || "RON",
    };
  }

  let amount = parseLocaleNumber(transaction.amount);
  if (transaction.type === "expense") {
    amount = -1 * amount;
  }
  return {
    amount: amount.toFixed(2),
    currency: transaction.currency || "RON",
  };
}

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

function calculateTagsStats(transactions, RULES) {
  const tagsStats = {};

  for (const transaction of transactions) {
    if (!transaction.counterparty || !transaction.counterparty.id) {
      continue; // Skip transactions without a counterparty
    }

    const counterpartyId = transaction.counterparty.id;
    const rule = RULES.find(rule => rule.name === counterpartyId);

    if (rule && rule.tags) {
      for (const tag of rule.tags) {
        if (!tagsStats[tag]) {
          tagsStats[tag] = { name: tag, count: 0, amount: 0, ids: [] };
        }
        if (!tagsStats[tag].ids.includes(transaction.internalTransactionId)) {
          tagsStats[tag].ids.push(transaction.internalTransactionId);
        }
        tagsStats[tag].count += 1;
        tagsStats[tag].amount += parseLocaleNumber(transaction.transactionAmount.amount);
      }
    }
  }

  return Object.entries(tagsStats).map(([name, data]) => ({
    name,
    count: data.count,
    total: data.amount.toFixed(2),
    ids: data.ids,
  }));
}

function calculateCounterpartiesStats(transactions) {
  const counterpartyDict = {};
  const unknownCounterparty = {
    name: "Unknown",
    count: 0,
    amount: 0,
  };

  for (const transaction of transactions) {
    if (!transaction.counterparty || !transaction.counterparty.id) {
      unknownCounterparty.count += 1;
      unknownCounterparty.amount += parseLocaleNumber(transaction.transactionAmount.amount);
      continue;
    }

    const counterpartyId = transaction.counterparty.id;
    if (!counterpartyDict[counterpartyId]) {
      counterpartyDict[counterpartyId] = {
        name: counterpartyId,
        count: 0,
        amount: 0,
      };
    }
    counterpartyDict[counterpartyId].count += 1;
    counterpartyDict[counterpartyId].amount += parseLocaleNumber(transaction.transactionAmount.amount);
  }

  let out = [...Object.values(counterpartyDict)]
  .map(counterparty => ({
    name: counterparty.name,
    count: counterparty.count,
    total: counterparty.amount.toFixed(2),
  }))
  .sort((a, b) => {
    return b.count - a.count;
  });

  return out;
}

function validateTransactionsCheckSum(finalBalance, initialBalance, transactions) {
  const balanceDiff = (finalBalance || 0) - (initialBalance || 0);
  let transactionsSum = 0;
  for (const transaction of transactions) {
    transactionsSum += parseLocaleNumber(transaction.transactionAmount.amount);
  }

  return Math.abs(balanceDiff - transactionsSum) < 0.001; // Allowing a small tolerance for floating point errors
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
  const RULES = JSON.parse(
    await fs.readFile(path.join(__dirname, "../rules/counterpartyRules.json"))
  );

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

  let transactions = parseTransactions(
    fileData.text,
    statementBank,
    statementCurrency,
    fileData.numpages
  );

  transactions = transactions.map((transaction) =>
    formatTrasactionObject(transaction, RULES)
  );

  // console.log(
  //   JSON.stringify({
  //     statementBank,
  //     statementCurrency,
  //     statementDates,
  //     statementInitialBalance,
  //     statementFinalBalance,
  //     statementIBAN,
  //     // transactions
  //   })
  // );

  const stats = {
    income: {
      name: "Income",
      count: transactions.filter(transaction => transaction.transactionAmount.amount > 0).length,
      total: transactions.filter(transaction => transaction.transactionAmount.amount > 0).reduce((acc, transaction) => acc + parseLocaleNumber(transaction.transactionAmount.amount), 0).toFixed(2),
    },
    expense: {
      name: "Expense",
      count: transactions.filter(transaction => transaction.transactionAmount.amount < 0).length,
      total: transactions.filter(transaction => transaction.transactionAmount.amount < 0).reduce((acc, transaction) => acc + parseLocaleNumber(transaction.transactionAmount.amount), 0).toFixed(2),
    },
    // counterparties: calculateCounterpartiesStats(transactions),
    // tags: calculateTagsStats(transactions, RULES),
  };

  let out = {};
  out[statementIBAN] = {
    meta: {
      bank: statementBank,
      currency: statementCurrency,
      dates: statementDates,
      initialBalance: statementInitialBalance,
      finalBalance: statementFinalBalance,
      validCheckSumBalance: validateTransactionsCheckSum(statementFinalBalance, statementInitialBalance, transactions),
      // transactionsCount: transactions.length,
    },
    // stats: stats,
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

const getStatementOutputFileName = (statementJson) => {
  let iban = Object.keys(statementJson)[0];
  if (!iban) {
    throw new Error("No IBAN found in the statement JSON");
  }

  let dateElements = statementJson[iban].meta.dates.endDate.split("-");
  let bank = statementJson[iban].meta.bank;
  let currency = statementJson[iban].meta.currency;

  return `${dateElements[0]}_${dateElements[1]}_${bank}_${currency}_${iban}.json`;
};

module.exports = {
  parseStatement,
  analyzeFolder,
  getStatementOutputFileName
};
